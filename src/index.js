// Worker for latentpublics.com.
//
// Everything except /urban-currents*, /api/* and the IR deck videos
// (/ir/*/assets/*.mp4|webm) is served straight from the ./public asset
// directory and never reaches this code — see run_worker_first in
// wrangler.jsonc. That is deliberate: assets served by the platform keep the
// security headers declared in public/_headers, which do NOT apply to
// responses a Worker builds itself.
//
// The IR videos come through here only because the platform answers a Range
// request with a full 200, and iOS Safari will not play a <video> without
// byte ranges. See serveIrVideo below.
//
// /urban-currents/ is published by a separate repository
// (latentpublics/urban-currents) onto GitHub Pages. GitHub Pages used to serve
// it at latentpublics.com/urban-currents/ automatically, because an org site
// with a custom domain also serves that org's project sites underneath it.
// Cloudflare has no equivalent, so we fetch the upstream copy and pass it
// through unchanged. Same URL, same bytes, different delivery path.

const UPSTREAM_ORIGIN = "https://latentpublics.github.io";

// Redirects back to either of these are rewritten onto the requesting host, so
// a visitor never gets bounced off latentpublics.com mid-navigation.
const OWN_HOSTS = new Set(["latentpublics.github.io", "latentpublics.com"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === "/api/contact") {
      if (request.method === "POST") return handleContact(request, env);
      return new Response(null, { status: 405, headers: { Allow: "POST", ...SECURITY_HEADERS } });
    }
    if (pathname === "/urban-currents" || pathname.startsWith("/urban-currents/")) {
      return proxyDigest(request, url);
    }
    if (IR_VIDEO_PATH.test(pathname)) {
      return serveIrVideo(request, env);
    }
    return new Response("Not found", { status: 404 });
  },
};

// ---------------------------------------------------------------------------
// IR deck videos — /ir/<deck>/assets/<name>.mp4|webm
//
// The platform serves these files without byte-range support (always a full
// 200, no Accept-Ranges). Desktop browsers cope; iOS Safari refuses to play.
// So these paths alone run through the Worker: the file is read from the
// asset binding and the requested range is cut out of it here. The videos are
// a few MB at most, so slicing in memory is fine.
// ---------------------------------------------------------------------------

// Must stay in step with the two video patterns in run_worker_first.
const IR_VIDEO_PATH = /^\/ir\/[^/]+\/assets\/[^/]+\.(?:mp4|webm)$/;

// Copy of the /ir/* block in public/_headers (the /* rules with /ir/*'s CSP and
// Referrer-Policy overrides). The platform does not apply that file to
// responses built here, so the headers are set by hand. Keep the two in sync.
const IR_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy": "default-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data:; media-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://cloudflareinsights.com https://challenges.cloudflare.com; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
};

// Carried over from the asset response when present.
const PASSTHROUGH_HEADERS = ["Content-Type", "ETag", "Last-Modified", "Cache-Control"];

async function serveIrVideo(request, env) {
  const isHead = request.method === "HEAD";
  if (request.method !== "GET" && !isHead) {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", ...IR_SECURITY_HEADERS } });
  }

  // Always ask for the whole file, unconditionally: ranges and revalidation
  // are answered here, against the full bytes.
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: "GET" }));
  const headers = new Headers(IR_SECURITY_HEADERS);
  for (const name of PASSTHROUGH_HEADERS) {
    const value = asset.headers.get(name);
    if (value) headers.set(name, value);
  }

  if (!asset.ok) {
    return new Response(isHead ? null : asset.body, { status: asset.status, headers });
  }

  const body = await asset.arrayBuffer();
  const total = body.byteLength;
  headers.set("Accept-Ranges", "bytes");

  const etag = asset.headers.get("ETag");
  if (etag && request.headers.get("If-None-Match") === etag) {
    headers.delete("Content-Type");
    return new Response(null, { status: 304, headers });
  }

  // If-Range with a stale validator means "send the whole thing".
  const ifRange = request.headers.get("If-Range");
  const rangeHeader = ifRange && ifRange !== etag ? null : request.headers.get("Range");
  const range = rangeHeader === null ? null : parseRange(rangeHeader, total);

  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${total}`);
    headers.delete("Content-Type");
    return new Response(null, { status: 416, headers });
  }

  if (range === null) {
    headers.set("Content-Length", String(total));
    return new Response(isHead ? null : body, { status: 200, headers });
  }

  const { start, end } = range;
  headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(isHead ? null : body.slice(start, end + 1), { status: 206, headers });
}

// Returns {start, end} (inclusive), "unsatisfiable", or null to ignore the
// header and send the full file. Only a single bytes range is honoured;
// multiple ranges and other units are ignored, which RFC 9110 permits.
function parseRange(header, total) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return header.trim().startsWith("bytes=") && !header.includes(",") ? "unsatisfiable" : null;
  const [, first, last] = m;
  if (first === "" && last === "") return "unsatisfiable";
  if (first === "") {
    // bytes=-n: the last n bytes
    const n = Number(last);
    if (n === 0 || total === 0) return "unsatisfiable";
    return { start: Math.max(0, total - n), end: total - 1 };
  }
  const start = Number(first);
  const end = last === "" ? total - 1 : Math.min(Number(last), total - 1);
  if (start >= total || start > end) return "unsatisfiable";
  return { start, end };
}

async function proxyDigest(request, url) {
  // The digest is a set of static documents. Nothing else is meaningful.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse("Method not allowed\n", 405, { Allow: "GET, HEAD" });
  }

  const target = UPSTREAM_ORIGIN + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("authorization");
  headers.delete("host");

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      // Never follow automatically: while the upstream repo still has a CNAME
      // file it redirects back here, and following that is an infinite loop.
      redirect: "manual",
      // The digest changes about once a day, so a short edge cache is safe and
      // keeps traffic off GitHub. cacheEverything strips ETag before the
      // response reaches this code, but Last-Modified survives, so conditional
      // requests still revalidate.
      cf: { cacheEverything: true, cacheTtl: 300 },
    });
  } catch (err) {
    console.error(`urban-currents proxy: fetch failed for ${target}: ${err}`);
    return badGateway();
  }

  if (upstream.status >= 500) {
    console.error(`urban-currents proxy: upstream ${upstream.status} for ${target}`);
    return badGateway();
  }

  // Carries Content-Type and Last-Modified through as-is. ETag and
  // Content-Length do not arrive here — see the cacheEverything note above.
  const responseHeaders = new Headers(upstream.headers);

  if (upstream.status >= 300 && upstream.status < 400) {
    const location = responseHeaders.get("location");
    if (location) {
      const rewritten = rewriteLocation(location, target, url);
      if (rewritten !== null) responseHeaders.set("location", rewritten);
    }
  }

  // public/_headers does not apply to Worker-generated responses, so the
  // security headers have to be set here. No CSP: we do not control what the
  // digest pages load, and a wrong policy would break someone else's page.
  applySecurityHeaders(responseHeaders);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

// Returns the rewritten Location, or null to leave the upstream value alone.
function rewriteLocation(location, target, requestUrl) {
  let destination;
  try {
    destination = new URL(location, target);
  } catch {
    return null;
  }
  // Redirects off to somebody else's host are forwarded untouched.
  if (!OWN_HOSTS.has(destination.hostname)) return null;
  destination.protocol = requestUrl.protocol;
  destination.host = requestUrl.host;
  return destination.toString();
}

function applySecurityHeaders(headers) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
}

function textResponse(body, status, extraHeaders = {}) {
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8", ...extraHeaders });
  applySecurityHeaders(headers);
  return new Response(body, { status, headers });
}

// A dead upstream must not take the whole Worker down with a 500.
function badGateway() {
  return textResponse("Urban Currents is temporarily unavailable.\n", 502);
}

// ---------------------------------------------------------------------------
// Contact intake — POST /api/contact
//
// Ported from the production Deep Urban implementation. The intake logic
// (validation order, honeypot, Turnstile siteverify, HTML escaping, error
// codes) is carried over unchanged; only the site-specific values differ.
// ---------------------------------------------------------------------------

const MAX = { name: 100, email: 254, org: 120, message: 2000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Allow-list of topics, matching public/contact.js. Blocks arbitrary strings.
const TOPICS = new Set([
  "Research collaboration",
  "Urban Currents",
  "Speaking & media",
  "Method or data inquiry",
  "Other"
]);

const DEFAULT_TO = "contact@latentpublics.com";
const DEFAULT_FROM = "noreply@send.latentpublics.com";
// Used in the auto-reply only. It is the address already published on the site,
// and plays a different role from env.CONTACT_TO (the internal inbox) — the two
// are never mixed, so the internal address cannot leak to the person writing in.
const PUBLIC_CONTACT = "contact@latentpublics.com";

// public/_headers applies to static assets only. Responses the Worker builds
// get these here.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store"
};

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS }
  });

const ok = () => json({ ok: true }, 200);
const err = (code, status) => json({ ok: false, error: code }, status);

const str = (v) => (typeof v === "string" ? v.trim() : "");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function utcNow() {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

async function handleContact(request, env) {
  /* 1. Content-Type check + JSON parse */
  const ctype = request.headers.get("Content-Type") || "";
  if (!ctype.toLowerCase().includes("application/json")) {
    return err("bad_content_type", 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return err("bad_json", 400);
  }
  if (!body || typeof body !== "object") return err("bad_json", 400);

  /* 2. Field validation */
  const data = {
    name: str(body.name),
    email: str(body.email),
    org: str(body.org),
    topic: str(body.topic),
    message: str(body.message)
  };

  if (!data.name || !data.email || !data.topic || !data.message) {
    return err("missing_field", 400);
  }
  if (!EMAIL_RE.test(data.email)) return err("bad_email", 400);
  for (const key of Object.keys(MAX)) {
    if (data[key].length > MAX[key]) return err("too_long", 400);
  }

  /* 3. Honeypot — if filled, return success quietly and send nothing. */
  if (str(body.website)) return ok();

  /* 4. Turnstile verification */
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[contact] TURNSTILE_SECRET_KEY is not set. Set it in Workers & Pages > latentpublics-site > Settings > Variables and secrets (runtime).");
    return err("server_misconfigured", 500);
  }

  const token = str(body["cf-turnstile-response"]);
  const verifyForm = new FormData();
  verifyForm.append("secret", secret);
  verifyForm.append("response", token);
  const remoteip = request.headers.get("CF-Connecting-IP");
  if (remoteip) verifyForm.append("remoteip", remoteip);

  let verdict;
  try {
    const vres = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: verifyForm
    });
    verdict = await vres.json();
  } catch (e) {
    console.error("[contact] Turnstile siteverify call failed:", e && e.message);
    return err("captcha_unavailable", 503);
  }
  if (verdict.success !== true) {
    console.error("[contact] Turnstile verification failed:", JSON.stringify(verdict["error-codes"] || []));
    return err("captcha_failed", 403);
  }

  /* 5. Topic allow-list */
  if (!TOPICS.has(data.topic)) return err("bad_topic", 400);

  /* 6. Send two emails through Resend */
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[contact] RESEND_API_KEY is not set. Set it in Workers & Pages > latentpublics-site > Settings > Variables and secrets (runtime).");
    return err("server_misconfigured", 500);
  }
  const to = env.CONTACT_TO || DEFAULT_TO;
  const from = env.CONTACT_FROM || DEFAULT_FROM;
  const dryRun = env.DRY_RUN === "1";

  const meta = {
    at: utcNow(),
    country: request.headers.get("CF-IPCountry") || "-"
  };

  /* Admin notification — a failure here is a 500. An enquiry must not be lost. */
  try {
    await sendEmail(apiKey, adminEmail({ data, meta, to, from }), dryRun);
  } catch (e) {
    console.error("[contact] admin notification failed to send:", e && e.message);
    return err("send_failed", 500);
  }

  /* Auto confirmation reply — a failure here is still a 200. The enquiry is in. */
  try {
    await sendEmail(apiKey, autoReply({ data, from }), dryRun);
  } catch (e) {
    console.error("[contact] auto confirmation failed to send (enquiry was received):", e && e.message);
  }

  return ok();
}

async function sendEmail(apiKey, payload, dryRun) {
  if (dryRun) {
    console.log("[contact] DRY_RUN — printing the payload instead of sending:\n" + JSON.stringify(payload, null, 2));
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}

function adminEmail({ data, meta, to, from }) {
  const rows = [
    ["Name", data.name],
    ["Email", data.email],
    ["Affiliation", data.org || "-"],
    ["Topic", data.topic],
    ["Received", meta.at],
    ["Country", meta.country]
  ];

  const text =
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    "\n\nMessage:\n" +
    data.message +
    "\n";

  const html =
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:15px;line-height:1.7;color:#171717">' +
    "<table cellpadding='0' cellspacing='0' style='border-collapse:collapse'>" +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:2px 16px 2px 0;color:#5c5c5c;white-space:nowrap">${escapeHtml(k)}</td>` +
          `<td style="padding:2px 0">${escapeHtml(v)}</td></tr>`
      )
      .join("") +
    "</table>" +
    '<p style="margin:20px 0 6px;color:#5c5c5c">Message</p>' +
    `<div style="white-space:pre-wrap;border-left:2px solid #d9d9d9;padding-left:12px">${escapeHtml(data.message)}</div>` +
    "</div>";

  return {
    from: `Institute for Latent Publics <${from}>`,
    to: [to],
    reply_to: data.email,
    subject: `[Contact] ${data.topic} — ${data.name}`,
    text,
    html
  };
}

/* This mail goes to the person who wrote in. The internal address
   (env.CONTACT_TO) must appear neither in the body nor in the headers — which
   is why this function takes no `to` argument. */
function autoReply({ data, from }) {
  const text = `Hello, ${data.name}.

We have received your message. We will review it and reply to you.

Topic: ${data.topic}
Message:
${data.message}

Institute for Latent Publics
`;

  const html =
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:15px;line-height:1.7;color:#171717;white-space:pre-wrap">' +
    escapeHtml(text) +
    "</div>";

  return {
    from: `Institute for Latent Publics <${from}>`,
    to: [data.email],
    reply_to: PUBLIC_CONTACT,
    subject: "[Institute for Latent Publics] We received your message",
    text,
    html
  };
}

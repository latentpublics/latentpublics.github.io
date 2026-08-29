// Worker for latentpublics.com.
//
// Everything except /urban-currents* is served straight from the ./public
// asset directory and never reaches this code — see run_worker_first in
// wrangler.jsonc. That is deliberate: assets served by the platform keep the
// security headers declared in public/_headers, which do NOT apply to
// responses a Worker builds itself.
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
    if (url.pathname === "/urban-currents" || url.pathname.startsWith("/urban-currents/")) {
      return proxyDigest(request, url);
    }
    return new Response("Not found", { status: 404 });
  },
};

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

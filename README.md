# latentpublics.github.io

Landing page for [latentpublics.com](https://latentpublics.com) — the
Institute for Latent Publics. Served by a Cloudflare Worker
(`latentpublics-site`) with static assets.

## Structure

```
public/         the asset directory — only what is in here reaches latentpublics.com
  index.html    /
  404.html
  robots.txt    for latentpublics.com — allows crawling
  sitemap.xml
  favicon.svg
  _headers      security headers for asset responses
ko/             Korean page — kept, NOT published (see below)
src/index.js    the Worker: proxies /urban-currents/* only
wrangler.jsonc  Worker + assets configuration
_config.yml     for GitHub Pages, NOT Cloudflare — do not delete (see below)
robots.txt      for latentpublics.github.io — blocks crawling
```

There is no build step for the pages themselves: plain static HTML with the
CSS inlined and no JavaScript of their own.

## Two hosts, and why both stay alive

`latentpublics.com` is served by Cloudflare. But `latentpublics.github.io`
must keep working too, because the Worker proxies `/urban-currents/*` to
`https://latentpublics.github.io/urban-currents/`.

**Do not turn off GitHub Pages for this repository.** It is the origin the
Worker fetches from. `/urban-currents/` itself is built and published by a
separate repository, `latentpublics/urban-currents`, on a daily schedule —
never edit that repository from here, and never create an `urban-currents/`
directory in this one.

Because GitHub Pages keeps building this repo, it would otherwise expose a
second copy of the site at `latentpublics.github.io`. Two files prevent that,
and **Cloudflare ignores both of them**:

- `_config.yml` — its `exclude` list keeps the landing page, the Korean page
  and the Worker source out of the GitHub Pages build.
- `robots.txt` (repository root) — `Disallow: /`, so the github.io mirror is
  not indexed. This is a different file from `public/robots.txt`, which serves
  `latentpublics.com` and allows crawling. The digest that visitors see is
  `latentpublics.com/urban-currents/`, governed by the permissive one, so
  blocking github.io costs nothing in indexing.

## The Korean page is shelved

`ko/index.html` stays in the repository but is not served: it sits outside
`public/`, so Cloudflare never deploys it, and `_config.yml` excludes it from
the GitHub Pages build. To publish it again: move the folder to `public/ko/`,
remove `ko` from the `exclude` list in `_config.yml`, and restore the language
link in `public/index.html` plus the `/ko/` entry in `public/sitemap.xml`.

## Deployment

Cloudflare builds from `main`. Build command is empty; the deploy command is
`npx wrangler deploy`.

`package-lock.json` is deliberately **not** committed. npm omits some esbuild
platform packages when it writes the lockfile, which makes `npm ci` refuse to
install; with no lockfile Cloudflare runs `npm install` instead. The only
dependency is wrangler, pinned by `package.json`.

To work on it locally:

```sh
npm install
npx wrangler dev      # serves public/ and runs the Worker
```

## Contact form

`public/contact.js` builds a slide-out panel; `POST /api/contact` in
`src/index.js` validates the submission, checks Turnstile, and sends two mails
through Resend — an admin notification and an auto-confirmation to the sender.
The panel is the site's only client-side JavaScript: without it every text and
the `contact@latentpublics.com` mailto link still read normally.

### Turnstile site key

`TURNSTILE_SITE_KEY` at the top of `public/contact.js` is `"REPLACE_ME"`.
Issue a widget under Turnstile in the Cloudflare dashboard and paste the site
key over that string — it is a public value and belongs in the repository. On
localhost the file automatically substitutes Cloudflare's always-passing test
key, so local development needs no key of its own.

### Environment variables

Set these in **Workers & Pages → `latentpublics-site` → Settings → Variables
and secrets**, in the **runtime** section. There is a separate build-time
section with the same name; values placed there are not visible to the running
Worker.

| Name | Kind | Default if unset |
|---|---|---|
| `RESEND_API_KEY` | Secret | — (required) |
| `TURNSTILE_SECRET_KEY` | Secret | — (required) |
| `CONTACT_TO` | Secret | `contact@latentpublics.com` |
| `CONTACT_FROM` | Variable | `noreply@send.latentpublics.com` |

**After saving values, go to Deployments and Promote a new version.** Saved
variables do not reach the running Worker until a version is promoted.

Setting `DRY_RUN=1` makes the Worker log the Resend payloads instead of
sending them.

For local development, put the same names in `.dev.vars` (gitignored).

## Caching of the proxied digest

The Worker's subrequest uses `cacheEverything` with a 300s TTL, which keeps
traffic off GitHub for a digest that changes once a day. The trade-off:
`cacheEverything` strips `ETag`, but `Last-Modified` survives, so conditional
requests still revalidate.

## Analytics

Cloudflare Web Analytics is injected automatically into Worker responses, so
there is no beacon script in the HTML — adding one would double-count. The CSP
in `public/_headers` allows the injected script.

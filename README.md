# latentpublics.github.io

Landing page for [latentpublics.com](https://latentpublics.com) — the
Institute for Latent Publics. Served by a Cloudflare Worker
(`latentpublics-site`) with static assets, not by GitHub Pages.

The repository keeps its `<org>.github.io` name for historical reasons; the
name no longer determines how the site is served.

## Structure

```
public/         the asset directory — only what is in here reaches the web
  index.html    /
  404.html
  robots.txt    governs the whole domain — the only robots.txt crawlers read
  sitemap.xml
  favicon.svg
  _headers      security headers for asset responses
ko/             Korean page — kept, NOT published (see below)
src/index.js    the Worker: proxies /urban-currents/* only
wrangler.jsonc  Worker + assets configuration
```

There is no build step. The pages are plain static HTML with their CSS inlined
and no JavaScript of their own.

## `/urban-currents/` is a different repository

`latentpublics.com/urban-currents/` is built and published by
`latentpublics/urban-currents` onto GitHub Pages, on a daily schedule. **Do not
edit that repository from here, and never create an `urban-currents/`
directory in this one.**

GitHub Pages used to serve it at `latentpublics.com/urban-currents/`
automatically, because an org site with a custom domain also serves that org's
project sites underneath it. Cloudflare has no equivalent. So `src/index.js`
fetches `https://latentpublics.github.io/urban-currents/...` and returns it
unchanged — same URL and same content for the visitor, only the delivery path
differs. Publishing is untouched.

The Worker handles `/urban-currents*` and nothing else (`run_worker_first` in
`wrangler.jsonc`). Every other path is served directly from `public/`, which is
what keeps the `_headers` security headers on those responses — they do not
apply to responses a Worker builds itself.

## The Korean page is shelved

`ko/index.html` stays in the repository but is not served: it sits outside
`public/`, so it is not part of the deployed asset directory. To publish it
again, move the folder to `public/ko/`, and restore the language link in
`public/index.html` plus the `/ko/` entry in `public/sitemap.xml`. The `.lang`
CSS is still in both pages, so nothing needs restyling.

## Deployment

Cloudflare builds from `main`. Build command is empty; the deploy command is
`npx wrangler deploy`.

To work on it locally:

```sh
npm install
npx wrangler dev      # serves public/ and runs the Worker
```

## Analytics

Cloudflare Web Analytics is injected automatically into Worker responses, so
there is no beacon script in the HTML — adding one would double-count. The CSP
in `public/_headers` allows the injected script.

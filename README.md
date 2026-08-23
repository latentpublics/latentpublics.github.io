# latentpublics.github.io

Landing page for [latentpublics.com](https://latentpublics.com) — the
Institute for Latent Publics. Two pages: `/` (English) and `/ko/` (Korean),
plus `404.html`.

## Structure

```
index.html      /
ko/index.html   /ko/
404.html
robots.txt      governs the whole domain — the only robots.txt crawlers read
sitemap.xml
favicon.svg
CNAME           latentpublics.com — do not edit or delete
```

## `/urban-currents/` is not in this repo

`latentpublics.com/urban-currents/` is served by a separate repository,
`latentpublics/urban-currents`. GitHub Pages serves a project site of the same
organisation at `<custom domain>/<repo name>/` automatically, so **never create
an `urban-currents/` directory here** — it would shadow that site.

For the same reason, do not delete or modify `CNAME` (one line:
`latentpublics.com`), and do not rename this repository: the name
`<org>.github.io` is what makes it the organisation site.

## Deployment

No build step. Pure static HTML; the CSS is inlined in each page. Pushing to
`main` publishes via GitHub Pages.

To preview locally:

```sh
python3 -m http.server
```

## Analytics

Off by default. Each of the three pages carries a commented-out Cloudflare Web
Analytics beacon just before `</body>`. Issue a token in the Cloudflare
dashboard, replace `REPLACE_WITH_TOKEN`, and uncomment the block.

That beacon is the single exception to this site's zero-JavaScript rule.

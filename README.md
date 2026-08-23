# latentpublics.github.io

Landing page for [latentpublics.com](https://latentpublics.com) — the
Institute for Latent Publics. One published page, `/`, plus `404.html`.

## Structure

```
index.html      /
ko/index.html   Korean page — kept, NOT published (see below)
404.html
robots.txt      governs the whole domain — the only robots.txt crawlers read
sitemap.xml
_config.yml     excludes ko/ from the Jekyll build
favicon.svg
CNAME           latentpublics.com — do not edit or delete
```

## The Korean page is shelved

`ko/index.html` stays in the repository but is not served: `_config.yml`
excludes `ko` from the Jekyll build, so `/ko/` returns 404. To publish it
again, delete the `exclude` entry in `_config.yml`, restore the language link
in `index.html`'s `<header class="site">` and its `hreflang="ko"` alternate,
and add `/ko/` back to `sitemap.xml`. The `.lang` CSS is still in both pages,
so nothing needs restyling.

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

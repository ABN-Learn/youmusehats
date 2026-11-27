# Maintaining search discovery

After updating `data/products.json` or publishing article HTML, run:

```sh
python generate-seo-files.py
python scripts/refresh-search-metadata.py
```

Review the diff before committing. The refresh command preserves existing page
layouts, adds the first 16 published product cards to each category's HTML, checks
that published products have detail pages, aligns absolute production URLs with
Cloudflare Pages' extensionless routes, and refreshes homepage brand metadata.
Dynamic category filtering and pagination remain in `assets/js/product-catalog.js`.
If the JSON request fails, existing static cards stay available.

The sitemap generator excludes admin, preview and template directories, the
product template index, and pages marked `noindex`. Sitemap dates are retained;
the refresh command updates dates only for pages whose generated output changes.

Do not run `build-product-catalogue.py` over customized product pages without
reviewing its output: it uses a basic product template. Generate or edit detail
pages with the intended template before refreshing discovery metadata.

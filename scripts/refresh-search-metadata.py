#!/usr/bin/env python3
"""Refresh search metadata and static catalogue cards without replacing page layouts.

Run after publishing product data or editing pages:
    python scripts/refresh-search-metadata.py
Only published products with an existing detail page enter a category grid.
Cloudflare Pages serves HTML at extensionless URLs, which are used for discovery.
"""
import html
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlsplit
from xml.etree import ElementTree as XML

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://youmusehats.com"
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
TODAY = datetime.now().strftime("%Y-%m-%d")


def clean_url(url):
    if not url.startswith(BASE + "/"):
        return url
    url = re.sub(r"/index\.html(?=[?#]|$)", "/", url)
    return re.sub(r"\.html(?=[?#]|$)", "", url)


def page_for(url):
    path = urlsplit(url).path.lstrip("/")
    if not path or path.endswith("/"):
        return ROOT / path / "index.html"
    return ROOT / (path if path.endswith(".html") else path + ".html")


def card(product, category):
    title = html.escape(str(product.get("catalogName") or product["name"]), quote=True)
    image = str(product.get("image") or "")
    if image and not image.startswith(("https://", "http://", "/", "data:")):
        image = "../" + image
    picture = (f'<img src="{html.escape(image, quote=True)}" alt="{title}" loading="lazy">'
               if image else '<div class="catalog-no-image">Image coming soon</div>')
    url = f"/products/{quote(category)}/{quote(product['slug'])}"
    attrs = {"search": " ".join(str(product.get(k, "")) for k in
                              ("name", "description", "slug", "techniques", "materials", "applications")),
             "technique": "|".join(product.get("techniques") or []),
             "material": "|".join(product.get("materials") or []),
             "scene": "|".join(product.get("applications") or [])}
    attributes = " ".join(f'data-{key}="{html.escape(value, quote=True)}"' for key, value in attrs.items())
    return (f'<article class="capvora-product-card" data-product-card {attributes}>'
            f'<a href="{url}" aria-label="View {title}"><div class="capvora-product-image">{picture}</div>'
            f'<h2 class="capvora-product-name">{title}</h2>'
            '<span class="capvora-read-more">READ MORE <span>→</span></span></a></article>')


def main():
    sitemap_file = ROOT / "sitemap.xml"
    previous = XML.fromstring(sitemap_file.read_text(encoding="utf-8"))
    entries = {}
    for entry in previous:
        url = entry.findtext("s:loc", "", NS)
        if url.startswith(BASE + "/") and page_for(url).is_file():
            entries[clean_url(url)] = entry.findtext("s:lastmod", "", NS)

    data = json.loads((ROOT / "data/products.json").read_text(encoding="utf-8"))
    changed = set()
    card_count = 0
    for category, products in data["categories"].items():
        published = [p for p in products if p.get("status") == "published" and p.get("slug") and p.get("name")]
        for product in published:
            url = f"{BASE}/products/{category}/{product['slug']}"
            if not page_for(url).is_file():
                raise ValueError(f"Published product detail page is missing: {url}")
            entries.setdefault(url, "")
        category_page = ROOT / "hat-styles" / (category + ".html")
        source = category_page.read_text(encoding="utf-8")
        pattern = r'(<div\b[^>]*\bdata-capvora-product-grid\b[^>]*>)[\s\S]*?(</div>\s*<nav\b[^>]*\bdata-catalog-pagination\b)'
        cards = "\n".join(card(p, category) for p in published[:data.get("pageSize", 16)])
        result, count = re.subn(pattern, lambda m: m[1] + "\n" + cards + "\n" + m[2], source, count=1)
        if count != 1:
            raise ValueError(f"Category grid marker missing: {category_page}")
        result = re.sub(r'(<span\b[^>]*\bdata-results-count[^>]*>)[\s\S]*?</span>',
                        lambda m: m[1] + f"{len(published)} products shown</span>", result, count=1)
        if result != source:
            category_page.write_text(result, encoding="utf-8")
            changed.add(category_page)
        card_count += min(len(published), data.get("pageSize", 16))

    # Keep canonical, social URL and existing structured-data URL signals aligned.
    pages = {page_for(url) for url in entries}
    absolute = re.compile(re.escape(BASE) + r'/[^\s"\'<>\\]*')
    for page in sorted(pages):
        source = page.read_text(encoding="utf-8")
        result = absolute.sub(lambda m: clean_url(m[0]), source)
        if page == ROOT / "index.html":
            description = "Custom hat manufacturer for brands, teams and events. Explore embroidery, patches, fabrics and private labels. Small orders welcome. Request samples and a quote."
            result = re.sub(r'<meta\b(?=[^>]*\bname="description")[^>]*>',
                            '<meta name="description" content="' + description + '">', result, count=1)
            result = re.sub(r'<meta\b(?=[^>]*\bproperty="og:description")[^>]*>',
                            '<meta property="og:description" content="' + description + '">', result, count=1)
            metadata = {"@context": "https://schema.org", "@graph": [
                {"@type": "Organization", "@id": BASE + "/#organization", "name": "YOUMUSE",
                 "url": BASE + "/", "logo": BASE + "/assets/youmuse-silver-logo.webp",
                 "email": "info@youmusehats.com", "telephone": "+86-18316659831",
                 "description": "Custom hat manufacturer offering logo decoration and private-label headwear for brands, teams and events."},
                {"@type": "WebSite", "@id": BASE + "/#website", "url": BASE + "/", "name": "YOUMUSE",
                 "inLanguage": "en", "publisher": {"@id": BASE + "/#organization"}}]}
            tag = '<script id="youmuse-site-schema" type="application/ld+json">' + json.dumps(metadata, ensure_ascii=False).replace("<", "\\u003c") + '</script>'
            result = re.sub(r'<script id="youmuse-site-schema"[^>]*>[\s\S]*?</script>\s*', '', result)
            result = result.replace("</head>", tag + "\n</head>")
        if result != source:
            page.write_text(result, encoding="utf-8")
            changed.add(page)

    sitemap = XML.Element("urlset", xmlns=NS["s"])
    for url, lastmod in sorted(entries.items()):
        entry = XML.SubElement(sitemap, "url")
        XML.SubElement(entry, "loc").text = url
        if page_for(url) in changed:
            lastmod = TODAY
        if lastmod:
            XML.SubElement(entry, "lastmod").text = lastmod
    XML.indent(sitemap)
    sitemap_file.write_bytes(XML.tostring(sitemap, encoding="utf-8", xml_declaration=True) + b"\n")
    print(f"Updated {len(changed)} pages, {card_count} static product cards and {len(entries)} sitemap URLs.")


if __name__ == "__main__":
    main()

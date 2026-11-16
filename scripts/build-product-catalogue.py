#!/usr/bin/env python3
"""Generate published YOUMUSE product pages and update sitemap.xml."""
import html
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://youmusehats.com"
DATA = ROOT / "data" / "products.json"
SITEMAP = ROOT / "sitemap.xml"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

catalogue = json.loads(DATA.read_text(encoding="utf-8"))
published_urls = []

for category, products in catalogue.get("categories", {}).items():
    if not SLUG_RE.fullmatch(category):
        raise ValueError(f"Invalid category key: {category}")
    output_dir = ROOT / "products" / category
    output_dir.mkdir(parents=True, exist_ok=True)
    for product in products:
        if product.get("status") != "published":
            continue
        slug = product.get("slug", "")
        name = product.get("name", "").strip()
        if not SLUG_RE.fullmatch(slug) or not name:
            raise ValueError(f"Published product in {category} needs a valid slug and name")

        description = str(product.get("description") or "Custom headwear made to your specifications.")
        image = str(product.get("image") or "")
        gallery = product.get("gallery") or []

        def image_path(path):
            path = str(path or "")
            if not path:
                return ""
            if path.startswith(("https://", "http://", "/")):
                return path
            return "../../" + path.lstrip("./")

        images = [image_path(x) for x in [image] + gallery]
        images = [x for x in images if x]
        if images:
            main_image = f'<img src="{html.escape(images[0], quote=True)}" alt="{html.escape(name, quote=True)}">'
        else:
            main_image = '<div class="no-image">Product image coming soon</div>'
        thumbs = "".join(
            f'<img src="{html.escape(src, quote=True)}" alt="{html.escape(name, quote=True)} detail">'
            for src in images[1:]
        )
        techniques = product.get("techniques") or []
        materials = product.get("materials") or []
        tags = "".join(f"<span>{html.escape(str(x))}</span>" for x in techniques + materials)
        specifications = [
            ("Category", category.replace("-", " ").title()),
            ("Logo techniques", ", ".join(map(str, techniques)) or "Available on request"),
            ("Materials", ", ".join(map(str, materials)) or "Available on request"),
            ("Applications", ", ".join(map(str, product.get("applications") or [])) or "Available on request"),
            ("Customization", str(product.get("customization") or "Available on request")),
        ]
        spec_html = "".join(
            f"<div><b>{html.escape(label)}</b><span>{html.escape(value)}</span></div>"
            for label, value in specifications
        )
        canonical = f"{BASE}/products/{category}/{slug}.html"
        title = f"{name} | YOUMUSE Custom Headwear"
        whatsapp_text = quote(f"Hello YOUMUSE, I am interested in {name}. Please send me a quotation.")
        page = f'''<!-- YOUMUSE GENERATED PRODUCT PAGE -->
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><meta name="description" content="{html.escape(description, quote=True)}">
<link rel="canonical" href="{canonical}"><meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{html.escape(description, quote=True)}"><meta property="og:type" content="product">
<style>
*{{box-sizing:border-box}}body{{margin:0;font:15px/1.65 Arial,Helvetica,sans-serif;color:#111;background:#fff}}a{{color:inherit;text-decoration:none}}
.wrap{{max-width:1180px;margin:auto;padding:28px 24px}}.crumb{{font-size:13px;color:#777;margin-bottom:24px}}
.layout{{display:grid;grid-template-columns:1fr 1fr;gap:54px;align-items:start}}.main-image{{aspect-ratio:1/1;background:#f5f5f5;display:grid;place-items:center;overflow:hidden}}
.main-image img{{width:100%;height:100%;object-fit:contain;background:#fff}}.no-image{{padding:50px;color:#777}}.thumbs{{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}}
.thumbs img{{width:76px;height:76px;object-fit:cover;border:1px solid #ddd}}.eyebrow{{font-size:11px;letter-spacing:.15em;color:#777;font-weight:800}}
.info h1{{font-size:clamp(28px,4vw,42px);line-height:1.15;margin:10px 0 16px}}.intro{{color:#666;line-height:1.8}}
.tags{{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}}.tags span{{border:1px solid #ddd;padding:6px 10px;font-size:12px}}
.btn{{display:inline-block;background:#080808;color:white;padding:13px 22px;border-radius:999px;font-weight:700}}
.specs{{margin-top:32px;border-top:1px solid #ddd}}.specs div{{display:grid;grid-template-columns:150px 1fr;padding:12px 0;border-bottom:1px solid #eee;gap:16px}}
.specs b{{font-size:13px}}.specs span{{color:#666;font-size:13px}}
@media(max-width:700px){{.layout{{grid-template-columns:1fr;gap:28px}}.wrap{{padding:20px 16px}}.specs div{{grid-template-columns:110px 1fr}}}}
</style></head><body><main class="wrap">
<div class="crumb"><a href="../../index.html">Home</a> / <a href="../../products.html">Products</a> / <a href="../../hat-styles/{category}.html">{category.replace('-', ' ').title()}</a> / {html.escape(name)}</div>
<div class="layout"><section><div class="main-image">{main_image}</div><div class="thumbs">{thumbs}</div></section>
<section class="info"><div class="eyebrow">YOUMUSE CUSTOM HEADWEAR</div><h1>{html.escape(name)}</h1><p class="intro">{html.escape(description)}</p>
<div class="tags">{tags}</div><a class="btn" href="https://wa.me/8618316659831?text={whatsapp_text}">Request a Quote →</a>
<div class="specs">{spec_html}</div></section></div></main></body></html>'''
        (output_dir / f"{slug}.html").write_text(page, encoding="utf-8")
        published_urls.append(canonical)

# Remove stale pages generated by this script if their products were unpublished/deleted.
for old_page in (ROOT / "products").glob("*/*.html"):
    content = old_page.read_text(encoding="utf-8", errors="ignore")
    if "<!-- YOUMUSE GENERATED PRODUCT PAGE -->" in content:
        url = f"{BASE}/products/{old_page.parent.name}/{old_page.stem}.html"
        if url not in published_urls:
            old_page.unlink()

existing_urls = re.findall(r"<loc>(.*?)</loc>", SITEMAP.read_text(encoding="utf-8"))
existing_urls = [u for u in existing_urls if not re.search(r"/products/[^/]+/[^/]+\.html$", u)]
all_urls = sorted(set(existing_urls + published_urls))
xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
xml += "".join(f"  <url><loc>{u}</loc></url>\n" for u in all_urls)
xml += "</urlset>\n"
SITEMAP.write_text(xml, encoding="utf-8")
print(f"Built {len(published_urls)} published product pages and updated sitemap.xml")

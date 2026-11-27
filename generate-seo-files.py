#!/usr/bin/env python3
"""Generate public discovery files without rewriting page templates."""
from pathlib import Path
from urllib.parse import quote, urlsplit
from xml.etree import ElementTree as XML
import json
import re

ROOT = Path(__file__).resolve().parent
base = json.loads((ROOT / "site-config.json").read_text(encoding="utf-8"))["site_url"].rstrip("/")
origin = urlsplit(base)
if origin.scheme != "https" or not origin.hostname or origin.path or origin.query or origin.fragment:
    raise SystemExit("Set site_url to the HTTPS production origin.")

excluded = {"admin", "admin-preview", "preview", "templates"}
previous = {}
if (ROOT / "sitemap.xml").is_file():
    for entry in XML.fromstring((ROOT / "sitemap.xml").read_text(encoding="utf-8")):
        loc = entry.findtext("{http://www.sitemaps.org/schemas/sitemap/0.9}loc", "")
        previous[loc] = entry.findtext("{http://www.sitemaps.org/schemas/sitemap/0.9}lastmod", "")
paths = set()
for page in ROOT.rglob("*.html"):
    relative = page.relative_to(ROOT)
    if relative.parts[0] in excluded or any(part.startswith(".") for part in relative.parts):
        continue
    if relative.name in {"404.html", "PRODUCT-TEMPLATE-INDEX.html"}:
        continue
    if re.search(r'<meta\b[^>]*\bcontent=[\"\'][^\"\']*noindex', page.read_text(encoding="utf-8"), re.I):
        continue
    path = quote(relative.as_posix())
    path = re.sub(r"(?:^|/)index\.html$", "/", path)
    if path.endswith(".html"):
        path = path[:-5]
    paths.add("/" + path.lstrip("/"))

sitemap = XML.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
for path in sorted(paths):
    entry = XML.SubElement(sitemap, "url")
    XML.SubElement(entry, "loc").text = base + path
    if previous.get(base + path):
        XML.SubElement(entry, "lastmod").text = previous[base + path]
XML.indent(sitemap)
(ROOT / "sitemap.xml").write_bytes(XML.tostring(sitemap, encoding="utf-8", xml_declaration=True) + b"\n")
(ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n", encoding="utf-8")
print(f"Generated discovery files for {len(paths)} pages.")

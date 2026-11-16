#!/usr/bin/env python3
"""Generate public discovery files without rewriting page templates."""
from pathlib import Path
from urllib.parse import quote, urlsplit
from xml.etree import ElementTree as XML
import json

ROOT = Path(__file__).resolve().parent
base = json.loads((ROOT / "site-config.json").read_text(encoding="utf-8"))["site_url"].rstrip("/")
origin = urlsplit(base)
if origin.scheme != "https" or not origin.hostname or origin.path or origin.query or origin.fragment:
    raise SystemExit("Set site_url to the HTTPS production origin.")

excluded = {"admin", "admin-preview", "preview"}
paths = set()
for page in ROOT.rglob("*.html"):
    relative = page.relative_to(ROOT)
    if relative.parts[0] in excluded or any(part.startswith(".") for part in relative.parts):
        continue
    if relative.name == "404.html":
        continue
    paths.add("/" if relative.as_posix() == "index.html" else "/" + quote(relative.as_posix()))

sitemap = XML.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
for path in sorted(paths):
    XML.SubElement(XML.SubElement(sitemap, "url"), "loc").text = base + path
XML.indent(sitemap)
(ROOT / "sitemap.xml").write_bytes(XML.tostring(sitemap, encoding="utf-8", xml_declaration=True) + b"\n")
(ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n", encoding="utf-8")
print(f"Generated discovery files for {len(paths)} pages.")

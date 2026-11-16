#!/usr/bin/env python3
"""Generate sitemap.xml and robots.txt after setting site-config.json site_url."""
from pathlib import Path
from urllib.parse import urljoin
import json, re
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parent
cfg=json.loads((ROOT/"site-config.json").read_text(encoding="utf-8"))
base=cfg["site_url"].rstrip("/")
if "YOUR-CONFIRMED-DOMAIN" in base or not base.startswith("https://"):
    raise SystemExit("Set site-config.json site_url to the confirmed HTTPS production domain first.")
urls=[]
for p in ROOT.rglob("*.html"):
    if any(part.startswith(".") for part in p.parts): continue
    rel=p.relative_to(ROOT).as_posix()
    if rel.startswith(("admin-preview/","preview/")): continue
    path="/" if rel=="index.html" else "/"+rel
    urls.append(base+path)
xml=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in sorted(set(urls)): xml.append(f"  <url><loc>{u}</loc></url>")
xml.append("</urlset>")
(ROOT/"sitemap.xml").write_text("\\n".join(xml),encoding="utf-8")
(ROOT/"robots.txt").write_text("User-agent: *\\nAllow: /\\nSitemap: "+base+"/sitemap.xml\\n",encoding="utf-8")
# Inject canonical into each page using its final public URL
for p in ROOT.rglob("*.html"):
    if "admin-preview" in p.parts: continue
    soup=BeautifulSoup(p.read_text(encoding="utf-8"),"html.parser")
    if not soup.head: continue
    rel=p.relative_to(ROOT).as_posix()
    url=base+("/" if rel=="index.html" else "/"+rel)
    link=soup.head.find("link",rel="canonical")
    if link is None:
        link=soup.new_tag("link",rel="canonical")
        soup.head.append(link)
    link["href"]=url
    p.write_text("<!doctype html>\\n"+str(soup),encoding="utf-8")
print(f"Generated sitemap.xml and robots.txt for {len(urls)} pages.")

#!/usr/bin/env python3
"""Render a preview or update an existing YOUMUSE article from JSON on stdin."""
import argparse
from html import escape
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def replace_once(html, pattern, replacement):
    matches = list(re.finditer(pattern, html, re.DOTALL))
    if len(matches) != 1:
        raise ValueError(f"Expected one article template field matching {pattern}")
    match = matches[0]
    return html[:match.start()] + replacement + html[match.end():]


def render(html, fields):
    keys = {"title", "seo_title", "description", "canonical", "body"}
    if not isinstance(fields, dict) or not fields or fields.keys() - keys:
        raise ValueError("Supply at least one supported article field")
    for key, value in fields.items():
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{key} requires non-empty text")
    if "title" in fields:
        title = escape(fields["title"])
        html = replace_once(html, r"<h1>[^<]*</h1>", f"<h1>{title}</h1>")
    if "seo_title" in fields:
        title = escape(fields["seo_title"])
        html = replace_once(html, r"<title>[^<]*</title>", f"<title>{title}</title>")
    if "description" in fields:
        description = escape(fields["description"], quote=True)
        html = replace_once(html, r'<meta\b(?=[^>]*\bname="description")[^>]*>',
                            f'<meta name="description" content="{description}">')
    if "canonical" in fields:
        url = urlsplit(fields["canonical"])
        if url.scheme != "https" or url.netloc != "youmusehats.com" or url.fragment or url.query:
            raise ValueError("Canonical requires an HTTPS URL on youmusehats.com without a fragment or query")
        canonical = escape(fields["canonical"], quote=True)
        html = replace_once(html, r'<link\b(?=[^>]*\brel="canonical")[^>]*>',
                            f'<link rel="canonical" href="{canonical}">')
    if "body" in fields:
        paragraphs = re.split(r"\n\s*\n", fields["body"].strip())
        content = "\n".join(f"<p>{escape(paragraph)}</p>" for paragraph in paragraphs)
        opening = '<article class="editorial-body blog-article-body">'
        html = replace_once(html, re.escape(opening) + r".*?</article>",
                            opening + "\n" + content + "\n</article>")
    return html


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug")
    parser.add_argument("--apply", action="store_true", help="Update the source HTML")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.slug):
        parser.error("Invalid article slug")
    article = ROOT / "articles" / (args.slug + ".html")
    try:
        with article.open(encoding="utf-8", newline="") as source:
            result = render(source.read(), json.load(sys.stdin))
        if args.apply:
            temp = article.with_suffix(".html.tmp")
            temp.write_text(result, encoding="utf-8", newline="")
            temp.replace(article)
        else:
            sys.stdout.write(result)
    except (OSError, ValueError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Run the Chinese editorial draft editor on localhost."""
import importlib.util
import json
from html import escape
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qs, quote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DRAFTS = Path.home() / ".youmuse-editor" / "drafts"
SPEC = importlib.util.spec_from_file_location("edit_article", ROOT / "scripts/edit-article.py")
editor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(editor)
FIELDS = {"title": "文章标题", "seo_title": "SEO 标题", "description": "SEO 描述",
          "canonical": "Canonical", "body": "正文（空行分段）"}
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
ORIGIN = "http://127.0.0.1:8765"


class Admin(BaseHTTPRequestHandler):
    def reply(self, body, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body.encode())

    def page(self, body, status=200):
        self.reply("""<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YOUMUSE 文章管理</title><style>
body{margin:0;background:#f0f3f8;color:#14213d;font:16px/1.55 system-ui}
main{max-width:760px;margin:36px auto;padding:28px;background:white;border:1px solid #dce3ed;border-radius:12px}
label{display:block;margin-top:16px}input,textarea{box-sizing:border-box;width:100%;font:inherit;padding:10px;border:1px solid #8996ab;border-radius:6px}
textarea{min-height:160px}button{font:inherit;padding:8px 16px;margin:16px 8px 0 0;color:white;background:#183969;border:0;border-radius:6px}a{color:#184582}
</style><main><h1>YOUMUSE 文章管理</h1>""" + body + "</main></html>", status)

    def do_GET(self):
        target = urlsplit(self.path)
        if target.path != "/" or self.headers.get("Host") != "127.0.0.1:8765":
            return self.page("页面不存在", 404)
        slug = parse_qs(target.query).get("slug", [""])[0]
        if slug and not SLUG.fullmatch(slug):
            return self.page("网址标识无效", 400)
        draft = DRAFTS / (slug + ".json")
        values = json.loads(draft.read_text(encoding="utf-8")) if slug and draft.exists() else {}
        if not slug:
            existing = {p.stem for p in (ROOT / "articles").glob("*.html")}
            drafts = {p.stem for p in DRAFTS.glob("*.json")}
            items = "".join(f'<li><a href="/?slug={quote(s)}">{escape(s)}</a>'
                            f'{" · 有草稿" if s in drafts else ""}</li>' for s in sorted(existing | drafts))
        else:
            items = ""
        fields = "".join(f'<label>{label}<textarea name="{key}">{escape(values.get(key, ""))}</textarea></label>'
                         if key == "body" else f'<label>{label}<input name="{key}" value="{escape(values.get(key, ""))}"></label>'
                         for key, label in FIELDS.items())
        self.page(f'<p><a href="/">文章列表／新建草稿</a></p><ul>{items}</ul>'
                  '<p>仅保存本机草稿。编辑现有文章时，留空的字段不会被覆盖。</p>'
                  f'<form method="post"><label>网址标识<input name="slug" required value="{escape(slug)}"></label>{fields}'
                  '<button name="action" value="save">保存草稿</button>'
                  '<button name="action" value="preview">预览</button></form>')

    def do_POST(self):
        if self.path != "/" or self.headers.get("Origin") != ORIGIN or self.headers.get("Host") != "127.0.0.1:8765":
            return self.page("请求来源无效", 403)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 512_000:
                raise ValueError("草稿大小超出限制")
            form = parse_qs(self.rfile.read(size).decode())
            slug = form.get("slug", [""])[0]
            if not SLUG.fullmatch(slug):
                raise ValueError("网址标识须由小写英文字母、数字和连字符组成")
            fields = {key: form[key][0] for key in FIELDS if key in form and form[key][0].strip()}
            action = form.get("action", [""])[0]
            if action == "preview":
                source = ROOT / "articles" / (slug + ".html")
                if source.exists():
                    return self.reply(editor.render(source.read_text(encoding="utf-8"), fields))
                if not fields.get("title") or not fields.get("body"):
                    raise ValueError("新文章预览需要标题和正文")
                body = "<p>" + "</p><p>".join(escape(p) for p in fields["body"].split("\n\n")) + "</p>"
                return self.page("<h2>" + escape(fields["title"]) + "</h2>" + body)
            if action != "save" or not fields:
                raise ValueError("请输入草稿内容")
            DRAFTS.mkdir(mode=0o700, parents=True, exist_ok=True)
            with NamedTemporaryFile(mode="w", encoding="utf-8", dir=DRAFTS, delete=False) as draft:
                json.dump(fields, draft, ensure_ascii=False)
            Path(draft.name).replace(DRAFTS / (slug + ".json"))
            self.page(f'<p>草稿已保存。</p><a href="/?slug={quote(slug)}">继续编辑</a>')
        except (OSError, ValueError) as error:
            self.page(escape(str(error)), 400)


if __name__ == "__main__":
    print(ORIGIN, flush=True)
    HTTPServer(("127.0.0.1", 8765), Admin).serve_forever()

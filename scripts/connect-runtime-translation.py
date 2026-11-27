#!/usr/bin/env python3
"""Install the shared runtime language switcher without creating translated pages."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = '<link rel="stylesheet" href="/assets/css/site-translation.css?v=20261127"><script src="/assets/js/site-translation.js?v=20261127" defer></script>'
LANGUAGES = [('en','🇬🇧 English'),('es','🇪🇸 Español'),('fr','🇫🇷 Français'),('de','🇩🇪 Deutsch'),('pt','🇵🇹 Português'),('ar','🇸🇦 العربية'),('it','🇮🇹 Italiano'),('ja','🇯🇵 日本語'),('ko','🇰🇷 한국어'),('nl','🇳🇱 Nederlands')]
SELECTOR = '<div class="cap-lang" translate="no"><label for="capLocale">🌐</label><select id="capLocale" aria-label="Choose language">' + ''.join(f'<option value="{code}">{name}</option>' for code,name in LANGUAGES) + '</select></div>'

changed = []
for path in ROOT.rglob('*.html'):
    relative = path.relative_to(ROOT)
    if relative.parts[0] in ['admin','admin-preview']:
        continue
    before = path.read_text()
    if not re.search(r'<header\b', before):
        continue
    def remove_demo(match):
        script = match.group(1)
        return '' if all(word in script for word in ['capLocale','setLocale','const dict']) else match.group()
    after = re.sub(r'<script\b[^>]*>(.*?)</script>',remove_demo,before,flags=re.S|re.I)
    if 'id="capLocale"' not in after:
        end = after.index('</header>')
        after = after[:end] + SELECTOR + after[end:]
    if ASSETS not in after:
        after = after.replace('</head>',ASSETS+'</head>',1)
    if after != before:
        path.write_text(after)
        changed.append(str(relative))
print(f'Connected shared runtime translation on {len(changed)} public pages and templates')

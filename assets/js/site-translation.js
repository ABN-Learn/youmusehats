/* Runtime page translation. English remains the only authored content. */
(() => {
  'use strict';
  const picker = document.getElementById('capLocale');
  if (!picker) return;
  const languages = ['en', 'es', 'fr', 'de', 'pt', 'ar', 'it', 'ja', 'ko', 'nl'];
  const normalize = value => value.replace(/\s+/gu, ' ').trim();
  const skip = 'script,style,noscript,textarea,input,select,option,svg,code,pre,[translate="no"],.notranslate,.brand,.foot-brand-name,.cap-lang,#ym-translation-status,.locale-demo-note,a[href^="mailto:"],a[href^="tel:"],a[href*="wa.me/"]';
  const records = new Set();
  const textRecords = new WeakMap();
  const attributeRecords = new WeakMap();
  const memory = new Map();
  let active = 'en', revision = 0, timer, busy = false, dirty = false, status;
  const messages = {
    en: ['Translating…', 'Translation is temporarily unavailable. The English page is still available.'],
    es: ['Traduciendo…', 'La traducción no está disponible temporalmente. Puede consultar la página en inglés.'],
    fr: ['Traduction…', 'La traduction est temporairement indisponible. La page en anglais reste disponible.'],
    de: ['Wird übersetzt…', 'Die Übersetzung ist vorübergehend nicht verfügbar. Die englische Seite bleibt verfügbar.'],
    pt: ['Traduzindo…', 'A tradução está temporariamente indisponível. A página em inglês continua disponível.'],
    ar: ['جارٍ الترجمة…', 'الترجمة غير متاحة مؤقتًا. لا تزال الصفحة الإنجليزية متاحة.'],
    it: ['Traduzione…', 'La traduzione è temporaneamente non disponibile. La pagina in inglese resta disponibile.'],
    ja: ['翻訳中…', '現在、翻訳を利用できません。英語のページをご覧いただけます。'],
    ko: ['번역 중…', '현재 번역을 사용할 수 없습니다. 영어 페이지는 계속 이용할 수 있습니다.'],
    nl: ['Vertalen…', 'Vertaling is tijdelijk niet beschikbaar. De Engelse pagina blijft beschikbaar.']
  };
  function notify(lang, error = false) {
    if (!status) {
      status = document.createElement('div'); status.id = 'ym-translation-status';
      status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      status.setAttribute('translate', 'no'); document.body.append(status);
    }
    status.hidden = false; status.textContent = (messages[lang] || messages.en)[error ? 1 : 0];
    if (error) setTimeout(() => { status.hidden = true; }, 10000);
  }
  function source(record) {
    const current = record.attr ? record.node.getAttribute(record.attr) : record.node.nodeValue;
    if (current !== record.last && current !== record.source) record.source = current;
    return record.source || '';
  }
  function collect() {
    const title = document.querySelector('title')?.firstChild;
    if (title && !textRecords.has(title)) { const record = { node: title, source: title.nodeValue }; textRecords.set(title, record); records.add(record); }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      const value = normalize(node.nodeValue || '');
      return node.parentElement && !node.parentElement.closest(skip) && value.length <= 6000 && /[a-zA-Z]/.test(value) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    } });
    let node;
    while ((node = walker.nextNode())) {
      if (!textRecords.has(node)) { const record = { node, source: node.nodeValue }; textRecords.set(node, record); records.add(record); }
    }
    for (const element of document.querySelectorAll('[placeholder],[title],[aria-label],img[alt]')) {
      if (element.closest('script,style,svg,select,option,[translate="no"],.notranslate,.brand,.cap-lang,#ym-translation-status')) continue;
      let map = attributeRecords.get(element);
      if (!map) { map = new Map(); attributeRecords.set(element, map); }
      for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) {
        const value = element.getAttribute(attr);
        if (value && value.length <= 6000 && /[a-zA-Z]/.test(value) && !map.has(attr)) {
          const record = { node: element, attr, source: value }; map.set(attr, record); records.add(record);
        }
      }
    }
    for (const record of records) if (!record.node.isConnected) records.delete(record);
    return [...records];
  }
  function restore() {
    observer.disconnect();
    for (const record of records) {
      const value = source(record);
      if (record.attr) record.node.setAttribute(record.attr, value); else record.node.nodeValue = value;
      record.last = value;
    }
    observe(); document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr';
  }
  function apply(list, lang) {
    observer.disconnect();
    for (const record of list) {
      const original = source(record), translated = memory.get(lang + '\n' + normalize(original));
      if (typeof translated !== 'string' || !record.node.isConnected) continue;
      const value = record.attr ? translated : (original.match(/^\s*/u)?.[0] || '') + translated + (original.match(/\s*$/u)?.[0] || '');
      if (record.attr) record.node.setAttribute(record.attr, value); else record.node.nodeValue = value;
      record.last = value;
    }
    observe(); document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
  async function translate(lang, remember = true) {
    if (!languages.includes(lang)) lang = 'en';
    const token = ++revision; active = lang;
    clearTimeout(timer);
    if (remember) { try { localStorage.setItem('youmuse-language', lang); } catch {} }
    restore(); picker.value = lang;
    if (lang === 'en') { busy = false; if (status) status.hidden = true; return; }
    busy = true; notify(lang);
    try {
      const list = collect();
      const strings = [...new Set(list.map(record => normalize(source(record))).filter(Boolean))];
      const missing = strings.filter(text => !memory.has(lang + '\n' + text));
      const batches = []; let batch = [], size = 0;
      for (const text of missing) {
        if (batch.length >= 20 || size + text.length > 11000) { batches.push(batch); batch = []; size = 0; }
        batch.push(text); size += text.length;
      }
      if (batch.length) batches.push(batch);
      for (const texts of batches) {
        if (token !== revision) return;
        const response = await fetch('/api/translate', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: lang, page: location.pathname, texts }), signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error('unavailable');
        const result = await response.json();
        if (!Array.isArray(result.translations) || result.translations.length !== texts.length) throw new Error('unavailable');
        result.translations.forEach((text, i) => { if (typeof text !== 'string') throw new Error('unavailable'); memory.set(lang + '\n' + texts[i], text); });
      }
      if (token !== revision) return;
      apply(list, lang); if (status) status.hidden = true;
    } catch {
      if (token !== revision) return;
      restore(); active = 'en'; picker.value = 'en'; notify(lang, true);
      try { localStorage.removeItem('youmuse-language'); } catch {}
    } finally {
      if (token === revision) {
        busy = false;
        if (dirty && active !== 'en') { dirty = false; clearTimeout(timer); timer = setTimeout(() => translate(active, false), 250); }
      }
    }
  }
  const observer = new MutationObserver(changes => {
    if (active === 'en') return;
    if (!changes.some(change => !((change.target.nodeType === 1 ? change.target : change.target.parentElement)?.closest('#ym-translation-status,.cap-lang,script,style,svg')))) return;
    if (busy) { dirty = true; return; }
    clearTimeout(timer);
    timer = setTimeout(() => { if (!busy) translate(active, false); }, 250);
  });
  function observe() { observer.observe(document.body, { subtree: true, childList: true, characterData: true }); }
  picker.addEventListener('change', () => translate(picker.value));
  document.querySelectorAll('.locale-demo-note').forEach(node => node.remove());
  observe();
  let saved = 'en'; try { saved = localStorage.getItem('youmuse-language') || 'en'; } catch {}
  if (saved !== 'en' && languages.includes(saved)) translate(saved, false);
})();

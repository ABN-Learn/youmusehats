/* Translate only the website's public English content. The Azure key stays server-side. */
export const LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'ar', 'it', 'ja', 'ko', 'nl'];
const normalize = value => value.replace(/\s+/gu, ' ').trim();
const pending = new Map();
const TTL = 30 * 24 * 60 * 60;

function reply(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function decode(value) {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
    const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity]);
}
const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const protectBrand = value => escape(value).replace(/YOUMUSE/g, '<span class="notranslate" translate="no">YOUMUSE</span>');
const plain = value => decode(value.replace(/<[^>]*>/g, ''));
async function hash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
}
function pagePath(input) {
  if (typeof input !== 'string' || !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*(?:\.html)?\/?$/.test(input)) return null;
  if (/^\/(?:api|admin|admin-preview|functions|templates)(?:\/|$)/.test(input)) return null;
  return input;
}
async function publicText(context, page) {
  if (!context.env.ASSETS?.fetch) throw new Error('assets_unavailable');
  const origin = new URL(context.request.url).origin;
  const fetchAsset = async path => {
    path = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    const response = await context.env.ASSETS.fetch(new Request(origin + path));
    if (!response.ok) throw new Error('page_unavailable');
    return response.text();
  };
  const html = await fetchAsset(page);
  // Plain DOM text, attributes and dynamically rendered catalogue names are public sources.
  let pool = normalize(decode(html)) + ' ' + normalize(decode(html.replace(/<[^>]*>/g, ' ')));
  if (/data-capvora-product-grid/.test(html)) {
    const catalogue = JSON.parse(await fetchAsset('/data/products.json'));
    const collect = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(collect) : [];
    pool += ' ' + collect(catalogue).map(normalize).join(' ');
    for (const products of Object.values(catalogue.categories || {})) {
      for (const product of products) pool += ' View ' + (product.catalogName || product.name);
      for (let i = 0; i <= products.length; i++) pool += ' ' + i + (i === 1 ? ' product shown' : ' products shown');
    }
    pool += ' READ MORE →';
  }
  return pool;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'GET') return reply({ enabled: Boolean(env.AZURE_TRANSLATOR_KEY), languages: LANGUAGES });
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin || ['cross-site', 'same-site'].includes(request.headers.get('Sec-Fetch-Site'))) return reply({ error: 'invalid_origin' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({ error: 'invalid_content_type' }, 415);
  if (!env.AZURE_TRANSLATOR_KEY) return reply({ error: 'translation_unavailable' }, 503);
  let input;
  try {
    const body = await request.text();
    if (body.length > 80000) return reply({ error: 'request_too_large' }, 413);
    input = JSON.parse(body);
  } catch { return reply({ error: 'invalid_json' }, 400); }
  const page = pagePath(input.page);
  if (!page || !LANGUAGES.includes(input.to) || !Array.isArray(input.texts) || !input.texts.length || input.texts.length > 20 || input.texts.some(s => typeof s !== 'string' || !normalize(s) || s.length > 6000)) return reply({ error: 'invalid_request' }, 400);
  const texts = input.texts.map(normalize);
  if (texts.reduce((n, s) => n + Array.from(s).length, 0) > 12000) return reply({ error: 'request_too_large' }, 413);
  try {
    const pool = await publicText(context, page);
    if (input.to === 'en') return reply({ translations: texts });
    const cache = globalThis.caches?.default;
    const keys = await Promise.all(texts.map(async text => new Request(origin + '/__translation-cache/v1/' + input.to + '/' + await hash(text))));
    const translations = await Promise.all(keys.map(async (key, i) => {
      // Never forward form entries or other text that isn't on the public website.
      if (!pool.includes(texts[i])) return texts[i];
      const hit = cache && await cache.match(key);
      return hit ? (await hit.json()).text : null;
    }));
    const missing = [...new Set(texts.filter((_, i) => translations[i] === null))];
    if (missing.length) {
      // Coalesce concurrent identical requests; cache hits never call Azure again.
      const group = await hash(JSON.stringify([input.to, missing]));
      let work = pending.get(group);
      if (!work) {
        work = (async () => {
          const headers = { 'Content-Type': 'application/json; charset=UTF-8', 'Ocp-Apim-Subscription-Key': env.AZURE_TRANSLATOR_KEY };
          if (env.AZURE_TRANSLATOR_REGION) headers['Ocp-Apim-Subscription-Region'] = env.AZURE_TRANSLATOR_REGION;
          const target = new URL('https://api.cognitive.microsofttranslator.com/translate');
          target.search = new URLSearchParams({ 'api-version': '3.0', from: 'en', to: input.to, textType: 'html' });
          const response = await fetch(target, { method: 'POST', headers, body: JSON.stringify(missing.map(Text => ({ Text: protectBrand(Text) }))), signal: AbortSignal.timeout(15000) });
          if (!response.ok) { const error = new Error(response.status === 429 || response.status === 403 ? 'translation_limit' : 'translation_unavailable'); error.status = response.status === 429 || response.status === 403 ? 429 : 503; throw error; }
          const output = await response.json();
          if (!Array.isArray(output) || output.length !== missing.length || output.some(item => typeof item.translations?.[0]?.text !== 'string')) throw new Error('translation_unavailable');
          const found = new Map(missing.map((text, i) => [text, plain(output[i].translations[0].text)]));
          // Never cache an upstream error or overwrite the original English assets.
          if (cache) await Promise.all([...found].map(async ([source, text]) => {
            const key = new Request(origin + '/__translation-cache/v1/' + input.to + '/' + await hash(source));
            await cache.put(key, Response.json({ text }, { headers: { 'Cache-Control': 'public, max-age=' + TTL } }));
          }));
          return found;
        })();
        pending.set(group, work);
        work.finally(() => pending.delete(group)).catch(() => {});
      }
      const found = await work;
      texts.forEach((text, i) => { if (translations[i] === null) translations[i] = found.get(text); });
    }
    return reply({ translations });
  } catch (error) {
    return reply({ error: error.message === 'content_changed' ? 'content_changed' : error.message === 'translation_limit' ? 'translation_limit' : 'translation_unavailable' }, error.status || 503);
  }
}

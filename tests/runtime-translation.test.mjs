import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const code = await readFile(new URL('../functions/api/translate.js', import.meta.url), 'utf8');
const { onRequest } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const upstream = globalThis.fetch;
const site = 'https://youmusehats.com';
function context(texts, options = {}) {
  return {
    request: new Request(site + '/api/translate', {
      method: options.method || 'POST',
      headers: { 'Content-Type': 'application/json', Origin: options.origin || site },
      ...(options.method === 'GET' ? {} : { body: JSON.stringify({ to: options.to || 'fr', page: options.page || '/products', texts }) })
    }),
    env: {
      AZURE_TRANSLATOR_KEY: 'test-key', AZURE_TRANSLATOR_REGION: 'westeurope',
      ASSETS: { fetch: async request => new Response(options.html || '<h1>Custom Hats</h1><p>YOUMUSE makes hats.</p>') },
      ...options.env
    }
  };
}
test('unconfigured endpoint reports availability without exposing keys', async () => {
  const res = await onRequest(context([], { method: 'GET', env: { AZURE_TRANSLATOR_KEY: '' } }));
  assert.equal((await res.json()).enabled, false);
  const post = await onRequest(context(['Custom Hats'], { env: { AZURE_TRANSLATOR_KEY: '' } }));
  assert.equal(post.status, 503);
});
test('rejects cross-origin requests and private page paths', async () => {
  assert.equal((await onRequest(context(['Custom Hats'], { origin: 'https://other.example' }))).status, 403);
  assert.equal((await onRequest(context(['Custom Hats'], { page: '/admin/index.html' }))).status, 400);
  assert.equal((await onRequest(context(['Custom Hats'], { page: '//other.example/' }))).status, 400);
});
test('does not send unknown content or user-entered private text to Azure', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not be called'); };
  try {
    const res = await onRequest(context(['My private enquiry']));
    assert.deepEqual((await res.json()).translations, ['My private enquiry']);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = upstream; }
});
test('sends only public source text, protects brand, strips markup in responses', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url.hostname, 'api.cognitive.microsofttranslator.com');
    assert.equal(init.headers['Ocp-Apim-Subscription-Key'], 'test-key');
    assert.equal(init.headers['Ocp-Apim-Subscription-Region'], 'westeurope');
    assert.match(JSON.parse(init.body)[1].Text, /class="notranslate"/);
    return Response.json([{ translations: [{ text: 'Chapeaux personnalisés' }] }, { translations: [{ text: '<span>YOUMUSE</span> fabrique des chapeaux &amp; accessoires.' }] }]);
  };
  try {
    const res = await onRequest(context(['Custom Hats', 'YOUMUSE makes hats.']));
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).translations, ['Chapeaux personnalisés', 'YOUMUSE fabrique des chapeaux & accessoires.']);
  } finally { globalThis.fetch = upstream; }
});
test('updated English is translated from current assets and old text is not forwarded', async () => {
  let sent;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return Response.json([{ translations: [{ text: 'Nouveaux chapeaux' }] }]); };
  try {
    const res = await onRequest(context(['New Hats', 'Old Hats'], { html: '<h1>New Hats</h1>' }));
    assert.deepEqual((await res.json()).translations, ['Nouveaux chapeaux', 'Old Hats']);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].Text, 'New Hats');
  } finally { globalThis.fetch = upstream; }
});
test('quota exhaustion returns a controlled failure without upgrading or charging', async () => {
  globalThis.fetch = async () => new Response('quota exceeded', { status: 429 });
  try {
    const res = await onRequest(context(['Custom Hats']));
    assert.equal(res.status, 429);
    assert.equal((await res.json()).error, 'translation_limit');
  } finally { globalThis.fetch = upstream; }
});
test('rejects excessive batches before sending requests', async () => {
  assert.equal((await onRequest(context(Array(65).fill('Custom Hats')))).status, 400);
  assert.equal((await onRequest(context(['x'.repeat(6001)]))).status, 400);
});
test('cache reuse avoids another provider call and changed text uses a new cache key', async () => {
  const previous = globalThis.caches;
  const entries = new Map(); let calls = 0;
  globalThis.caches = { default: {
    match: async key => entries.has(key.url) ? entries.get(key.url).clone() : undefined,
    put: async (key, response) => { entries.set(key.url, response.clone()); }
  } };
  globalThis.fetch = async (url, init) => { calls++; return Response.json(JSON.parse(init.body).map(item => ({ translations: [{ text: 'translated:' + item.Text }] }))); };
  try {
    await onRequest(context(['Custom Hats']));
    await onRequest(context(['Custom Hats']));
    assert.equal(calls, 1);
    await onRequest(context(['New Hats'], { html: '<h1>New Hats</h1>' }));
    assert.equal(calls, 2);
  } finally { globalThis.fetch = upstream; globalThis.caches = previous; }
});
test('catalogue cards and counts are checked against live product data', async () => {
  const ctx = context(['View Blue Hat', '1 product shown']);
  ctx.env.ASSETS.fetch = async request => new URL(request.url).pathname === '/data/products.json'
    ? Response.json({ categories: { 'fedora-hats': [{ name: 'Blue Hat' }] } })
    : new Response('<div data-capvora-product-grid></div>');
  let sent;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return Response.json(sent.map(item => ({ translations: [{ text: 'translated:' + item.Text }] }))); };
  try {
    const res = await onRequest(ctx);
    assert.equal(res.status, 200); assert.equal(sent.length, 2);
  } finally { globalThis.fetch = upstream; }
});

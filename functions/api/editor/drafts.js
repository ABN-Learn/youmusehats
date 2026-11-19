const fields = ["title", "seo_title", "description", "canonical", "body"];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const prefix = "article:";

function json(value, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

async function matchesSecret(provided, expected) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([provided, expected].map(async value =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))
  ));
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function onRequest({ request, env }) {
  if (!env.EDITOR_PASSWORD || !env.EDITOR_DRAFTS) {
    return json({ error: "编辑器尚未配置线上存储或登录" }, 503);
  }
  const authorization = request.headers.get("Authorization") || "";
  const expected = "Basic " + btoa(String.fromCharCode(...new TextEncoder().encode("editor:" + env.EDITOR_PASSWORD)));
  if (!(await matchesSecret(authorization, expected))) {
    return json({ error: "密码错误或尚未登录" }, 401);
  }
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (slug !== null && (slug.length > 120 || !slugPattern.test(slug))) {
    return json({ error: "文章标识格式无效" }, 400);
  }
  if (request.method === "GET") {
    if (slug) {
      const draft = await env.EDITOR_DRAFTS.get(prefix + slug, { type: "json" });
      return draft ? json(draft) : json({ error: "草稿不存在" }, 404);
    }
    const cursor = url.searchParams.get("cursor");
    const list = await env.EDITOR_DRAFTS.list(cursor ? { prefix, cursor } : { prefix });
    return json({
      slugs: list.keys.map(key => key.name.slice(prefix.length)),
      cursor: list.list_complete ? null : list.cursor
    });
  }
  if (!["PUT", "DELETE"].includes(request.method)) {
    return json({ error: "不支持此请求" }, 405);
  }
  if (request.headers.get("Origin") !== url.origin || request.headers.get("X-YOUMUSE-Editor") !== "1") {
    return json({ error: "请求来源无效" }, 403);
  }
  if (!slug) return json({ error: "缺少文章标识" }, 400);
  if (request.method === "DELETE") {
    await env.EDITOR_DRAFTS.delete(prefix + slug);
    return json({ deleted: true });
  }
  let input;
  try {
    const payload = await request.text();
    if (payload.length > 200_000) return json({ error: "草稿太长" }, 413);
    input = JSON.parse(payload);
  } catch {
    return json({ error: "草稿格式无效" }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.entries(input).some(([key, value]) => !fields.includes(key) || typeof value !== "string")) {
    return json({ error: "草稿字段无效" }, 400);
  }
  const draft = { fields: input, updatedAt: new Date().toISOString() };
  await env.EDITOR_DRAFTS.put(prefix + slug, JSON.stringify(draft));
  return json(draft);
}

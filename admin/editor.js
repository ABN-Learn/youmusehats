const form = document.querySelector("#editor");
const status = document.querySelector("#status");
let busy = false;
let authorization = "";
const loginForm = document.querySelector("#login");
function report(message) { status.textContent = message; }
async function api(method, slug, body) {
  const response = await fetch("/api/editor/drafts" + (slug ? "?slug=" + encodeURIComponent(slug) : ""), {
    method, credentials: "same-origin", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", "X-YOUMUSE-Editor": "1", Authorization: authorization },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let result;
  try { result = await response.json(); } catch { throw new Error("登录失败或服务器响应异常，请重新打开后台。"); }
  if (!response.ok) throw new Error(result.error || "操作失败，请重试");
  return result;
}
async function task(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach(button => button.disabled = true);
  try { await action(); } catch (error) { report(error.message); }
  finally {
    busy = false;
    document.querySelectorAll("button").forEach(button => button.disabled = false);
  }
}
async function list() {
  const container = document.querySelector("#list");
  const slugs = [];
  let cursor;
  do {
    const response = await fetch("/api/editor/drafts" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { credentials: "same-origin", headers: { Authorization: authorization }, signal: AbortSignal.timeout(15000) });
    let result;
    try { result = await response.json(); } catch { throw new Error("请完成后台登录后刷新页面。"); }
    if (!response.ok) throw new Error(result.error || "读取草稿失败");
    slugs.push(...result.slugs);
    cursor = result.cursor;
  } while (cursor);
  container.replaceChildren();
  for (const slug of slugs.sort()) {
    const button = document.createElement("button");
    button.textContent = slug;
    button.onclick = () => task(async () => {
      if (!confirm("打开这份草稿？当前未保存的输入会被替换。")) return;
      const draft = await api("GET", slug);
      form.reset();
      form.elements.slug.value = slug;
      for (const [key, value] of Object.entries(draft.fields)) form.elements[key].value = value;
      report("已打开线上草稿");
    });
    container.append(button);
  }
  if (!slugs.length) container.textContent = "暂无草稿";
}
form.onsubmit = event => {
  event.preventDefault();
  task(async () => {
    const data = Object.fromEntries(new FormData(form));
    const slug = data.slug;
    delete data.slug;
    await api("PUT", slug, data);
    await list();
    report("线上草稿已保存。正式文章发布功能尚待接通。");
  });
};
document.querySelector("#new").onclick = () => {
  if (!confirm("新建草稿？请先保存当前编辑内容。")) return;
  form.reset();
  report("填写文章后保存线上草稿");
};
document.querySelector("#delete").onclick = () => task(async () => {
  const slug = form.elements.slug.value;
  if (!slug) throw new Error("请先打开一份草稿");
  if (!confirm("确认删除草稿 " + slug + "？")) return;
  await api("DELETE", slug);
  form.reset();
  await list();
  report("草稿已删除");
});
document.querySelector("#preview").onclick = () => {
  const article = document.querySelector("#previewContent");
  article.replaceChildren();
  const heading = document.createElement("h1");
  heading.textContent = form.elements.title.value;
  article.append(heading);
  for (const paragraph of form.elements.body.value.split(/\n\s*\n/)) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    article.append(p);
  }
  document.querySelector("#previewDialog").showModal();
};
document.querySelector("#close").onclick = () => document.querySelector("#previewDialog").close();
loginForm.onsubmit = event => {
  event.preventDefault();
  task(async () => {
    const bytes = new TextEncoder().encode("editor:" + loginForm.elements.password.value);
    authorization = "Basic " + btoa(String.fromCharCode(...bytes));
    loginForm.elements.password.value = "";
    try {
      await list();
      report("已登录，已连接线上草稿存储");
      loginForm.hidden = true;
    } catch (error) {
      authorization = "";
      throw error;
    }
  });
};
report("请先输入后台密码登录");

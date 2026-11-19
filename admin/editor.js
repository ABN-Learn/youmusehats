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

let publishedHead = "";
let themeHead = "";
let themeConfig = {themes:{}};
async function repositoryRequest(endpoint, method = "GET", data, slug = "") {
  if (!authorization) throw new Error("请先登录");
  const response = await fetch("/api/editor/" + endpoint + (slug ? "?slug=" + encodeURIComponent(slug) : ""), {
    method, headers: {Authorization:authorization,"Content-Type":"application/json","X-YOUMUSE-Editor":"1"},
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(120000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "操作失败");
  return result;
}
async function loadPublished() {
  const result = await repositoryRequest("articles");
  publishedHead = result.head;
  const container = document.querySelector("#published");
  container.replaceChildren();
  for (const slug of result.slugs.sort()) {
    const button = document.createElement("button");
    button.textContent = slug;
    button.onclick = () => task(async () => {
      if (!confirm("读取正式文章？请先保存当前草稿。")) return;
      const article = await repositoryRequest("articles","GET",undefined,slug);
      publishedHead = article.head;
      form.reset();
      form.elements.slug.value = slug;
      for (const [key,value] of Object.entries(article.fields)) form.elements[key].value = value;
      report("已读取正式文章。编辑后保存草稿，确认后发布。");
    });
    container.append(button);
  }
}
document.querySelector("#loadPublished").onclick = () => task(async () => {
  await loadPublished();
  report("正式文章列表已更新");
});
for (const [id,action,label] of [
  ["publish","publish","发布文章到正式网站"],
  ["withdraw","withdraw","从正式网站撤回文章并保留为草稿"],
  ["deletePublished","delete","移除正式文章及列表链接，保留草稿和 GitHub 历史"]
]) {
  document.querySelector("#"+id).onclick = () => task(async () => {
    if (!form.reportValidity()) return;
    if (!publishedHead) throw new Error("请先点击读取正式文章，取得网站最新版本");
    const fields = Object.fromEntries(new FormData(form));
    const slug = fields.slug;
    delete fields.slug;
    if (!confirm("确认"+label+"？文章标识 "+slug)) return;
    const result = await repositoryRequest("articles","POST",{action,fields,head:publishedHead},slug);
    publishedHead = "";
    report(result.message+"，提交 "+result.sha.slice(0,7));
  });
}
const themeForm = document.querySelector("#themeForm");
const themeSelect = document.querySelector("#themes");
async function loadThemes() {
  themeConfig = await repositoryRequest("themes");
  themeHead = themeConfig.head;
  themeSelect.replaceChildren(new Option("新建主题",""));
  for(const [id,theme] of Object.entries(themeConfig.themes)) {
    themeSelect.add(new Option(theme.name+(themeConfig.active===id?"（使用中）":""),id));
  }
}
document.querySelector("#loadThemes").onclick = () => task(async()=>{
  await loadThemes(); report("主题列表已更新");
});
themeSelect.onchange = () => {
  themeForm.reset();
  themeForm.elements.id.value=themeSelect.value;
  const theme=themeConfig.themes[themeSelect.value];
  if(theme) for(const [key,value] of Object.entries(theme)) themeForm.elements[key].value=value;
};
async function changeTheme(action) {
  if(!themeHead) throw new Error("请先读取主题");
  if(action==="save" && !themeForm.reportValidity()) return;
  const theme=Object.fromEntries(new FormData(themeForm));
  const id=theme.id;
  delete theme.id;
  if(!confirm("确认提交主题操作？应用主题会更新正式网站的颜色、字体和按钮。")) return;
  const result=await repositoryRequest("themes","POST",{action,id,theme,head:themeHead});
  themeHead="";
  report(result.message+"，提交 "+result.sha.slice(0,7));
}
themeForm.onsubmit = event => {event.preventDefault(); task(()=>changeTheme("save"));};
document.querySelector("#activateTheme").onclick=()=>task(()=>changeTheme("activate"));
document.querySelector("#removeTheme").onclick=()=>task(()=>changeTheme("delete"));
document.querySelector("#resetTheme").onclick=()=>task(()=>changeTheme("reset"));

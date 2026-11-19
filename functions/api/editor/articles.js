import { authorize } from "../../_editor/auth.js";
import { github } from "../../_editor/github.js";
import { articleFields, renderArticle, updateListings, updateSitemap, refillHomeArticles } from "../../_editor/render.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export async function onRequest({ request, env }) {
  const denied = await authorize(request, env, request.method !== "GET");
  if (denied) return denied;
  if (!env.EDITOR_GITHUB_TOKEN) return json({error:"尚未配置 GitHub 发布令牌 EDITOR_GITHUB_TOKEN"},503);
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (slug !== null && (slug.length > 120 || !slugPattern.test(slug))) return json({error:"文章标识格式无效"},400);
  if (!["GET","POST"].includes(request.method)) return json({error:"请求方法无效"},405);
  try {
    const git = github(env);
    const snapshot = await git.snapshot();
    const files = snapshot.files.filter(file => /^articles\/[a-z0-9-]+\.html$/.test(file.path));
    if (request.method === "GET") {
      if (!slug) return json({head:snapshot.head, slugs:files.map(file=>file.path.slice(9,-5))});
      const html = await git.read("articles/" + slug + ".html",snapshot);
      return html ? json({head:snapshot.head,fields:articleFields(html,slug)}) : json({error:"正式文章不存在"},404);
    }
    if (!slug) return json({error:"缺少文章标识"},400);
    const payload = await request.text();
    if (payload.length > 200_000) return json({error:"文章内容太长"},413);
    const input = JSON.parse(payload);
    if (!["publish","withdraw","delete"].includes(input.action)) return json({error:"操作无效"},400);
    if (!input.head || input.head !== snapshot.head) return json({error:"网站版本已更新，请先刷新正式文章列表"},409);
    const path = "articles/" + slug + ".html";
    const original = await git.read(path,snapshot);
    const remove = input.action !== "publish";
    let fields;
    if (remove) {
      if (!original) return json({error:"正式文章不存在"},404);
      if (!env.EDITOR_DRAFTS) return json({error:"请先配置草稿存储以保留撤回内容"},503);
      fields = articleFields(original,slug);
      await env.EDITOR_DRAFTS.put("article:" + slug,JSON.stringify({fields,updatedAt:new Date().toISOString()}));
    } else {
      fields = input.fields;
      if (!fields || Object.values(fields).some(value=>typeof value !== "string") ||
          Object.keys(fields).some(key=>!["title","seo_title","description","canonical","body"].includes(key)) ||
          !fields.title?.trim() || !fields.body?.trim()) return json({error:"文章标题、正文或字段格式无效"},400);
      fields = {...fields,canonical:fields.canonical || "https://youmusehats.com/" + path};
      const canonical = new URL(fields.canonical);
      if(canonical.origin !== "https://youmusehats.com" || canonical.search || canonical.hash) return json({error:"Canonical 必须是正式站的 HTTPS 地址"},400);
    }
    const changes = {};
    if (remove) {
      changes[path] = null;
    } else {
      const template = original || await git.read("articles/choose-custom-hat-style.html",snapshot);
      if (!template) throw new Error("文章模板缺失");
      changes[path] = renderArticle(template,fields,original ? articleFields(original,slug) : null);
    }
    const listingPaths = ["index.html","blog.html",...snapshot.files.filter(file=>/^blog-categories\/[^/]+\.html$/.test(file.path)).map(file=>file.path)];
    const listings = await Promise.all(listingPaths.map(async listing=>[listing,await git.read(listing,snapshot)]));
    for(const [listing,html] of listings) {
      if (!html) continue;
      const result = updateListings(html,slug,fields,remove,listing==="index.html",listing.startsWith("blog-categories/") ? "../" : "");
      if(result!==html) changes[listing]=result;
    }
    if (remove) {
      const home = changes['index.html'] ?? listings.find(([path]) => path === 'index.html')?.[1];
      const blog = changes['blog.html'] ?? listings.find(([path]) => path === 'blog.html')?.[1];
      if (home && blog) changes['index.html'] = refillHomeArticles(home, blog);
    }
    const sitemap = await git.read("sitemap.xml",snapshot);
    if(!sitemap) throw new Error("站点地图缺失");
    changes["sitemap.xml"] = updateSitemap(sitemap,slug,remove);
    const redirects = await git.read("_redirects",snapshot) || "";
    const routes = redirects.split("\n").filter(line=>!line.trim().startsWith("/" + path + " "));
    if(remove) routes.unshift("/" + path + " /blog.html 302");
    if(routes.join("\n") !== redirects) changes["_redirects"] = routes.join("\n");

    const sha = await git.commit(snapshot,changes,"Editor: " + input.action + " article " + slug);
    return json({sha,action:input.action,url:"https://youmusehats.com/" + path,message:"已提交 GitHub，等待 Cloudflare 部署"});
  } catch(error) {
    return json({error:error instanceof SyntaxError ? "文章数据格式无效" : error.message},error.status || 500);
  }
}

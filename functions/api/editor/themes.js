import { authorize } from "../../_editor/auth.js";
import { github } from "../../_editor/github.js";
import { validateTheme, applyTheme } from "../../_editor/themes.js";
const configPath = "data/editor-themes.json";
function json(body,status=200) {return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}
export async function onRequest({request,env}) {
  const denied = await authorize(request,env,request.method!=="GET");
  if(denied) return denied;
  if(!env.EDITOR_GITHUB_TOKEN) return json({error:"尚未配置 GitHub 发布令牌 EDITOR_GITHUB_TOKEN"},503);
  if(!["GET","POST"].includes(request.method)) return json({error:"请求方法无效"},405);
  try {
    const git=github(env);
    const snapshot=await git.snapshot();
    const stored=await git.read(configPath,snapshot);
    const config=stored ? JSON.parse(stored) : {active:null,themes:{}};
    if(request.method==="GET") return json({...config,head:snapshot.head});
    const payload=await request.text();
    if(payload.length>30_000) return json({error:"主题数据过大"},413);
    const input=JSON.parse(payload);
    if(input.head!==snapshot.head) return json({error:"网站版本已有更新，请重新读取"},409);
    if(!["save","activate","delete","reset"].includes(input.action)) return json({error:"主题操作无效"},400);
    if(input.action!=="reset" && !/^[a-z0-9-]{1,80}$/.test(input.id || "")) return json({error:"主题标识格式无效"},400);
    const changes={};
    if(input.action==="save") config.themes[input.id]=validateTheme(input.theme);
    if(input.action==="delete") {
      if(config.active===input.id) return json({error:"请先切换其他主题或恢复原主题，再删除当前主题"},400);
      delete config.themes[input.id];
    }
    if(input.action==="activate") {
      if(!config.themes[input.id]) return json({error:"主题不存在"},404);
      config.active=input.id;
    }
    if(input.action==="reset") config.active=null;
    if(["activate","reset"].includes(input.action) || (input.action==="save" && config.active===input.id)) {
      const pages=snapshot.files.filter(file=>file.type==="blob" && file.path.endsWith(".html") && !/^(admin|admin-preview|preview)\//.test(file.path));
      const pagesText=await git.readMany(pages.map(file=>file.path),snapshot);
      for(const [path,before] of pagesText) {
        const html=applyTheme(before,config.active ? config.themes[config.active] : null);
        if(html!==before) changes[path]=html;
      }
    }
    changes[configPath]=JSON.stringify(config,null,2)+"\n";
    const sha=await git.commit(snapshot,changes,"Editor: "+input.action+" theme "+(input.id || "original"));
    return json({sha,message:"主题已提交 GitHub，等待自动部署"});
  } catch(error) {return json({error:error.message},error.status || 400);}
}

const repository = "jiajia-code-cp/youmusehats";
export function github(env) {
  async function call(path, method = "GET", body) {
    const response = await fetch("https://api.github.com/repos/" + repository + "/" + path, {
      method,
      headers: {
        Authorization: "Bearer " + env.EDITOR_GITHUB_TOKEN,
        Accept: "application/vnd.github+json",
        "User-Agent": "YOUMUSE-Editor",
        "Content-Type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const error = new Error(response.status === 422 ? "发布冲突，请重新载入最新版本再提交" : "GitHub 请求失败，请检查发布令牌及仓库权限");
      error.status = response.status === 422 ? 409 : 502;
      throw error;
    }
    return response.json();
  }
  async function snapshot() {
    const branch = await call("branches/main");
    const tree = await call("git/trees/" + branch.commit.commit.tree.sha + "?recursive=1");
    if (tree.truncated) throw new Error("仓库文件过多，无法完整读取");
    return { head: branch.commit.sha, tree: branch.commit.commit.tree.sha, files: tree.tree };
  }
  async function read(path, snapshot) {
    const entry = snapshot.files.find(file => file.path === path && file.type === "blob");
    if (!entry) return null;
    const blob = await call("git/blobs/" + entry.sha);
    const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, "")), character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  async function readMany(paths, snapshot) {
    const entries = paths.map(path => snapshot.files.find(file=>file.path===path && file.type==="blob"));
    if(entries.some(entry=>!entry)) throw new Error("页面文件缺失");
    const query = "{repository(owner:\"jiajia-code-cp\",name:\"youmusehats\"){" +
      entries.map((entry,index)=>"f"+index+":object(oid:"+JSON.stringify(entry.sha)+"){... on Blob{text}}").join(" ") + "}}";
    const response = await fetch("https://api.github.com/graphql", {
      method:"POST",
      headers:{Authorization:"Bearer "+env.EDITOR_GITHUB_TOKEN,"Content-Type":"application/json","User-Agent":"YOUMUSE-Editor"},
      body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)
    });
    const result = await response.json();
    if(!response.ok || result.errors || !result.data?.repository) throw new Error("批量读取网站页面失败，请检查发布令牌");
    return paths.map((path,index)=>{
      const text=result.data.repository["f"+index]?.text;
      if(typeof text!=="string") throw new Error("无法读取页面 "+path);
      return [path,text];
    });
  }
  async function commit(snapshot, changes, message) {
    const head = await call("branches/main");
    if (head.commit.sha !== snapshot.head) {
      const error = new Error("网站已有新版本，请重新载入后再发布");
      error.status = 409;
      throw error;
    }
    const entries = Object.entries(changes).map(([path, content]) => content === null
      ? { path, mode: "100644", type: "blob", sha: null }
      : { path, mode: "100644", type: "blob", content });
    const tree = await call("git/trees", "POST", { base_tree: snapshot.tree, tree: entries });
    const commit = await call("git/commits", "POST", { message, tree: tree.sha, parents: [snapshot.head] });
    await call("git/refs/heads/main", "PATCH", { sha: commit.sha, force: false });
    return commit.sha;
  }
  return { snapshot, read, readMany, commit };
}

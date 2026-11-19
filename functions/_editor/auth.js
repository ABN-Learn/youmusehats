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


export async function authorize(request, env, write = false) {
  if (!env.EDITOR_PASSWORD) return Response.json({error:"后台密码尚未配置"}, {status:503});
  const provided = request.headers.get("Authorization") || "";
  const expected = "Basic " + btoa(String.fromCharCode(...new TextEncoder().encode("editor:" + env.EDITOR_PASSWORD)));
  if (!(await matchesSecret(provided, expected))) return Response.json({error:"密码错误或尚未登录"}, {status:401});
  if (write && (request.headers.get("Origin") !== new URL(request.url).origin ||
    request.headers.get("X-YOUMUSE-Editor") !== "1")) {
    return Response.json({error:"请求来源无效"}, {status:403});
  }
  return null;
}

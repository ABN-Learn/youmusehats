export const defaultTheme = {
  name:"YOUMUSE 自定义主题", primary:"#183b56", text:"#111111", background:"#ffffff",
  buttonText:"#ffffff", font:"Arial", radius:"6"
};
const fonts = ["Arial","Georgia","Verdana","Tahoma"];
export function validateTheme(theme) {
  if (!theme || typeof theme.name !== "string" || !theme.name.trim() || theme.name.length > 80) throw new Error("请输入主题名称");
  for(const key of ["primary","text","background","buttonText"]) {
    if(!/^#[0-9a-f]{6}$/i.test(theme[key])) throw new Error("颜色须使用六位十六进制格式");
  }
  if(!fonts.includes(theme.font) || !/^([0-9]|[12][0-9]|30)$/.test(String(theme.radius))) throw new Error("字体或圆角值无效");
  return Object.fromEntries(Object.keys(defaultTheme).map(key=>[key,theme[key]]));
}
export function themeStyle(theme) {
  validateTheme(theme);
  return '<style id="youmuse-managed-theme">:root{--gold:'+theme.primary+'!important;--navy:'+theme.primary+'!important;--ink:'+theme.text+'!important}body{background:'+theme.background+'!important;color:'+theme.text+'!important;font-family:"'+theme.font+'",sans-serif!important}button,.btn,.btn-primary{border-radius:'+theme.radius+'px!important}button:not(.nav-toggle):not(.submenu-toggle),.btn-primary{background-color:'+theme.primary+'!important;color:'+theme.buttonText+'!important}</style>';
}
export function applyTheme(html,theme) {
  html=html.replace(/<style id="youmuse-managed-theme">[\s\S]*?<\/style>/g,"");
  if(!theme) return html;
  if(!html.includes("</head>")) throw new Error("页面缺少 head 标签");
  return html.replace("</head>",themeStyle(theme)+"</head>");
}

export const escapeHtml = value => String(value || "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
export function plainText(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/p>|<\/h[1-6]>|<\/li>/gi, "\n\n").replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").trim();
}
export function articleFields(html, slug) {
  const title = plainText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const descriptionTag = html.match(/<meta\b(?=[^>]*name="description")[^>]*>/i)?.[0] || "";
  const body = html.match(/<article class="editorial-body blog-article-body">([\s\S]*?)<\/article>/)?.[1] || "";
  return {
    title,
    seo_title: plainText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || title),
    description: plainText(descriptionTag.match(/content="([^"]*)"/)?.[1] || ""),
    canonical: "https://youmusehats.com/articles/" + slug + ".html",
    body: plainText(body)
  };
}
function replaceRequired(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error("页面模板字段缺失，请检查文章模板");
  return html.replace(pattern, () => replacement);
}
export function renderArticle(template, fields, originalFields) {
  let html = replaceRequired(template, /<h1[^>]*>[\s\S]*?<\/h1>/, "<h1>" + escapeHtml(fields.title) + "</h1>");
  html = replaceRequired(html, /<title>[\s\S]*?<\/title>/,
    "<title>" + escapeHtml(fields.seo_title || fields.title + " | YOUMUSE") + "</title>");
  html = replaceRequired(html, /<meta\b(?=[^>]*name="description")[^>]*>/,
    '<meta name="description" content="' + escapeHtml(fields.description) + '">');
  html = replaceRequired(html, /<link\b(?=[^>]*rel="canonical")[^>]*>/,
    '<link rel="canonical" href="' + escapeHtml(fields.canonical) + '">');
  for (const [property, value] of Object.entries({
    "og:title": fields.seo_title || fields.title,
    "og:description": fields.description
  })) {
    html = html.replace(new RegExp('<meta\\b(?=[^>]*property="' + property + '")[^>]*>', "g"),
      () => '<meta property="' + property + '" content="' + escapeHtml(value) + '">');
  }
  if (!originalFields || fields.body !== originalFields.body) {
    const body = fields.body.split(/\n\s*\n/).map(text => "<p>" + escapeHtml(text).replace(/\n/g, "<br>") + "</p>").join("\n");
    html = replaceRequired(html, /<article class="editorial-body blog-article-body">[\s\S]*?<\/article>/,
      '<article class="editorial-body blog-article-body">' + body + "</article>");
  }
  html = html.replace(/(<p class="editorial-lead">)[\s\S]*?(<\/p>)/,
    (_, start, end) => start + escapeHtml(fields.description) + end);
  html = html.replace(/(<div class="editorial-breadcrumb">)[\s\S]*?(<\/div>)/,
    (_, start, end) => start + '<a href="../index.html">Home</a> › <a href="../blog.html">Blog</a> › ' + escapeHtml(fields.title) + end);
  // Old article-specific structured data is replaced with truthful basic metadata.
  html = html.replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, "");
  const structured = JSON.stringify({ "@context": "https://schema.org", "@type": "Article",
    headline: fields.title, description: fields.description, mainEntityOfPage: fields.canonical
  }).replace(/</g, "\\u003c");
  return html.replace("</head>", '<script type="application/ld+json">' + structured + "</script></head>");
}
export function updateListings(html, slug, fields, remove, home = false, relative = "") {
  const target = "articles/" + slug + ".html";
  const pattern = /<a class="blog-preview-card"[\s\S]*?<\/a>|<article class="journal-card"[\s\S]*?<\/article>/g;
  let found = false;
  html = html.replace(pattern, card => {
    if (!card.includes(target)) return card;
    found = true;
    if (remove) return "";
    return card.replace(/<h[23][^>]*>[\s\S]*?<\/h[23]>/,
      match => match.replace(/>[\s\S]*</, () => ">" + escapeHtml(fields.title) + "<"))
      .replace(/<p>[\s\S]*?<\/p>/, () => "<p>" + escapeHtml(fields.description) + "</p>")
      .replace(/alt="[^"]*"/g, () => 'alt="' + escapeHtml(fields.title) + '"');
  });
  if (!found && !remove && home) {
    const card = '<a class="blog-preview-card" href="' + target + '"><span class="blog-preview-category">Know-how</span><h3>' +
      escapeHtml(fields.title) + '</h3><p>' + escapeHtml(fields.description) + '</p><span class="blog-preview-read">Read Article →</span></a>';
    html = replaceRequired(html, /<div class="blog-preview-grid">/, '<div class="blog-preview-grid">' + card);
    let count = 0;
    return html.replace(/<a class="blog-preview-card"[\s\S]*?<\/a>/g, card => ++count <= 3 ? card : "");
  }
  if (found || remove || relative) return html;
  const card = '<article class="journal-card" data-category="Know-how"><div class="journal-card-body"><div class="journal-meta"><span>Know-how</span></div><h2>' +
    escapeHtml(fields.title) + "</h2><p>" + escapeHtml(fields.description) + '</p><a class="journal-read" href="' + target + '">Read Article →</a></div></article>';
  return replaceRequired(html, /(<div[^>]*class="[^"]*journal-grid[^"]*"[^>]*>)/, cardMarker(html) + card);
}
function cardMarker(html) {
  const marker = html.match(/<div[^>]*class="[^"]*journal-grid[^"]*"[^>]*>/);
  if (!marker) throw new Error("博客列表模板缺失");
  return marker[0];
}
export function updateSitemap(xml, slug, remove) {
  const url = "https://youmusehats.com/articles/" + slug + ".html";
  xml = xml.replace(/<url>[\s\S]*?<\/url>/g, entry => entry.includes("<loc>" + url + "</loc>") ? "" : entry);
  return remove ? xml : xml.replace("</urlset>", "  <url><loc>" + escapeHtml(url) + "</loc></url>\n</urlset>");
}

export function refillHomeArticles(home, blog) {
  let cards = home.match(/<a class="blog-preview-card"[\s\S]*?<\/a>/g) || [];
  if (cards.length >= 3) return home;
  const additions = [];
  for (const card of blog.match(/<article class="journal-card"[\s\S]*?<\/article>/g) || []) {
    const href = card.match(/href="(articles\/[^"#]+)"/)?.[1];
    if (!href || cards.some(existing => existing.includes('href="' + href + '"'))) continue;
    const title = card.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] || '';
    const description = card.match(/<p>([\s\S]*?)<\/p>/)?.[1] || '';
    const image = card.match(/<img\b[^>]*>/)?.[0] || '';
    const category = card.match(/data-category="([^"]*)"/)?.[1] || 'Know-how';
    const preview = '<a class="blog-preview-card" href="' + href + '">' + (image ? '<div class="blog-preview-image">' + image + '</div>' : '') + '<span class="blog-preview-category">' + category + '</span><h3>' + title + '</h3><p>' + description + '</p><span class="blog-preview-read">Read Article →</span></a>';
    cards.push(preview); additions.push(preview);
    if (cards.length === 3) break;
  }
  if (!home.includes('<a class="blog-preview-card"')) return home.replace('<div class="blog-preview-grid">', '<div class="blog-preview-grid">' + additions.join(''));
  return home.replace(/(<a class="blog-preview-card"[\s\S]*?<\/a>)(?![\s\S]*<a class="blog-preview-card")/, '$1' + additions.join(''));
}

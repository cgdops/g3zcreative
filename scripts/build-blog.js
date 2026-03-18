#!/usr/bin/env node
/**
 * Blog Build Script — G3Z Creative
 *
 * Reads markdown posts from _posts/, generates static HTML blog pages
 * that match the existing Webflow site design.
 *
 * Run: node scripts/build-blog.js
 */

const fs   = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const ROOT      = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, '_posts');
const BLOG_DIR  = path.join(ROOT, 'blog');
const INDEX_HTML = path.join(ROOT, 'index.html');

// ── Extract <header class="nav"> and <footer> from index.html ──────────────

function extractSection(html, openPattern, tagName) {
  const start = html.indexOf(openPattern);
  if (start === -1) throw new Error(`Could not find "${openPattern}" in index.html`);

  let depth = 0, i = start;
  const open  = `<${tagName}`;
  const close = `</${tagName}>`;

  while (i < html.length) {
    if (html.startsWith(open,  i)) depth++;
    if (html.startsWith(close, i)) {
      depth--;
      if (depth === 0) return html.slice(start, i + close.length);
    }
    i++;
  }
  throw new Error(`No closing </${tagName}> found for "${openPattern}"`);
}

// Make relative hrefs/srcs absolute so they work inside /blog/* subdirs
function fixPaths(html) {
  return html
    .replace(/href="index\.html"/g, 'href="/"')
    .replace(/href="(?!https?:\/\/|\/|#|mailto:|tel:)([^"]+)"/g, 'href="/$1"')
    .replace(/src="(?!https?:\/\/|\/|data:)([^"]+)"/g, 'src="/$1"');
}

const indexHtml = fs.readFileSync(INDEX_HTML, 'utf8');
const nav    = fixPaths(extractSection(indexHtml, '<header class="nav">', 'header'));
const footer = fixPaths(extractSection(indexHtml, '<footer', 'footer'));

// ── Shared <head> assets ───────────────────────────────────────────────────

const sharedHead = `
  <meta content="width=device-width, initial-scale=1" name="viewport">
  <link href="/css/normalize.css" rel="stylesheet" type="text/css">
  <link href="/css/webflow.css" rel="stylesheet" type="text/css">
  <link href="/css/g3zc.webflow.css" rel="stylesheet" type="text/css">
  <link href="/blog/blog.css" rel="stylesheet" type="text/css">
  <link href="https://fonts.googleapis.com" rel="preconnect">
  <link href="https://fonts.gstatic.com" rel="preconnect" crossorigin="anonymous">
  <script src="https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js"></script>
  <script>WebFont.load({ google: { families: ["Figtree:regular","Young Serif:regular"] } });</script>
  <link href="/images/favicon.png" rel="shortcut icon" type="image/x-icon">
  <link href="/images/webclip.png" rel="apple-touch-icon">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-3L9H02HJMV"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-3L9H02HJMV');</script>`;

const sharedScripts = `
  <script src="https://d3e54v103j8qbb.cloudfront.net/js/jquery-3.5.1.min.dc5e7f18c8.js?site=6837ae7e314e91dd48e1e240" type="text/javascript" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0=" crossorigin="anonymous"></script>
  <script src="/js/webflow.js" type="text/javascript"></script>
  <script type="text/javascript" id="hs-script-loader" async defer src="https://js-na2.hs-scripts.com/244013468.js"></script>`;

// ── Read & parse posts ─────────────────────────────────────────────────────

if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
if (!fs.existsSync(BLOG_DIR))  fs.mkdirSync(BLOG_DIR,  { recursive: true });

const postFiles = fs.readdirSync(POSTS_DIR)
  .filter(f => f.endsWith('.md'))
  .sort()
  .reverse(); // newest first

const posts = postFiles.map(filename => {
  const raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf8');
  const { data, content } = matter(raw);

  const date    = data.date ? new Date(data.date) : new Date();
  const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Clean excerpt: first non-heading paragraph, stripped of markdown syntax
  const excerpt = content.split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('!') && !l.startsWith('```'))
    .join(' ')
    .replace(/[*_`\[\]]/g, '')
    .trim()
    .slice(0, 160);

  return {
    title:           data.title           || 'Untitled',
    slug:            data.slug            || filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''),
    date,
    dateStr,
    meta_description: data.meta_description || '',
    tags:            data.tags            || [],
    author:          data.author          || 'G3Z Creative',
    featured_image:  data.featured_image  || '',
    html:            marked.parse(content),
    excerpt,
  };
});

console.log(`\nBuilding blog — ${posts.length} post(s) found\n`);

// ── Generate individual post pages ─────────────────────────────────────────

for (const post of posts) {
  const postDir = path.join(BLOG_DIR, post.slug);
  if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });

  const tagsHtml = post.tags.map(t => `<span class="blog-tag">${t}</span>`).join('');

  const featuredImg = post.featured_image
    ? `<div class="container"><div class="blog-featured-image-wrapper">
        <img src="${post.featured_image}" alt="${post.title}" class="blog-featured-image" loading="lazy">
       </div></div>`
    : '';

  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${post.title} | G3Z Creative Blog</title>
  <meta content="${post.meta_description}" name="description">
  <meta property="og:title" content="${post.title}">
  <meta property="og:description" content="${post.meta_description}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://g3zcreative.com/blog/${post.slug}/">
  ${post.featured_image ? `<meta property="og:image" content="${post.featured_image}">` : ''}
  <link rel="canonical" href="https://g3zcreative.com/blog/${post.slug}/">
  ${sharedHead}
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "${post.title.replace(/"/g, '\\"')}",
    "description": "${post.meta_description.replace(/"/g, '\\"')}",
    "datePublished": "${post.date.toISOString()}",
    "author": { "@type": "Organization", "name": "${post.author}" },
    "publisher": { "@type": "Organization", "name": "G3Z Creative", "url": "https://www.g3zcreative.com" }
    ${post.featured_image ? `, "image": "${post.featured_image}"` : ''}
  }
  </script>
</head>
<body>
${nav}

<section class="blog-post-hero section">
  <div class="container">
    <div class="blog-post-meta">
      <a href="/blog/" class="eyebrow blog-back-link">← All Posts</a>
      ${tagsHtml ? `<div class="blog-tags">${tagsHtml}</div>` : ''}
    </div>
    <h1 class="blog-post-title">${post.title}</h1>
    <div class="blog-post-byline">
      <span>${post.author}</span>
      <span class="blog-post-separator">·</span>
      <span>${post.dateStr}</span>
    </div>
  </div>
</section>

${featuredImg}

<section class="section">
  <div class="container">
    <div class="blog-post-body">
      ${post.html}
    </div>
  </div>
</section>

<section class="section inverse-section">
  <div class="container">
    <div class="flex-vertical flex-gap-sm blog-cta">
      <div class="eyebrow">Ready to grow?</div>
      <h2>Let's take your business to the next level</h2>
      <p class="paragraph-lg">G3Z Creative helps South Florida businesses get found online, generate leads, and convert customers.</p>
      <div class="button-group">
        <a href="https://meetings-na2.hubspot.com/christian-gomez" target="_blank" class="button">Book a free call</a>
        <a href="/" class="button secondary-button">Learn more</a>
      </div>
    </div>
  </div>
</section>

${footer}
${sharedScripts}
</body>
</html>`;

  fs.writeFileSync(path.join(postDir, 'index.html'), page, 'utf8');
  console.log(`  ✓  blog/${post.slug}/index.html`);
}

// ── Generate blog index page ───────────────────────────────────────────────

const postCardsHtml = posts.map(post => {
  const tagsHtml = post.tags.slice(0, 3).map(t => `<span class="blog-tag">${t}</span>`).join('');
  const imgHtml  = post.featured_image
    ? `<div class="blog-card-image"><img src="${post.featured_image}" alt="${post.title}" loading="lazy"></div>`
    : '';

  return `<li class="w-dyn-item">
    <a href="/blog/${post.slug}/" class="card-link w-inline-block blog-card">
      ${imgHtml}
      <div class="card-body">
        ${tagsHtml ? `<div class="blog-tags">${tagsHtml}</div>` : ''}
        <h3 class="h4-heading">${post.title}</h3>
        <p class="paragraph-sm utility-text-secondary">${post.excerpt}${post.excerpt.length >= 160 ? '…' : ''}</p>
        <div class="blog-card-footer">
          <span class="paragraph-sm utility-text-secondary">${post.dateStr}</span>
          <div class="text-button">
            <span>Read more</span>
            <div class="button-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8H14.5M14.5 8L8.5 2M14.5 8L8.5 14" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></div>
          </div>
        </div>
      </div>
    </a>
  </li>`;
}).join('\n');

const emptyState = posts.length === 0
  ? `<div class="flex-vertical flex-gap-sm" style="align-items:center;text-align:center;padding:4rem 0;">
       <p class="paragraph-lg utility-text-secondary">No posts yet — check back soon!</p>
     </div>`
  : '';

const blogIndex = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Blog | G3Z Creative — Digital Marketing Tips &amp; Insights</title>
  <meta content="Marketing tips, SEO strategies, and business growth insights from G3Z Creative — your South Florida digital marketing partner." name="description">
  <meta property="og:title" content="Blog | G3Z Creative">
  <meta property="og:description" content="Marketing tips, SEO strategies, and business growth insights from G3Z Creative.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://g3zcreative.com/blog/">
  <link rel="canonical" href="https://g3zcreative.com/blog/">
  ${sharedHead}
</head>
<body>
${nav}

<header class="section">
  <div class="container">
    <div class="flex-vertical flex-gap-xs">
      <div class="eyebrow">Insights</div>
      <h1>The G3Z Creative Blog</h1>
      <p class="subheading">Marketing tips, SEO strategies, and growth insights for South Florida businesses.</p>
    </div>
  </div>
</header>

<section class="section">
  <div class="container">
    ${emptyState}
    <ul role="list" class="grid-layout desktop-3-column tablet-2-column mobile-landscape-1-column grid-gap-md w-dyn-items w-list-unstyled">
      ${postCardsHtml}
    </ul>
  </div>
</section>

${footer}
${sharedScripts}
</body>
</html>`;

fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), blogIndex, 'utf8');
console.log(`  ✓  blog/index.html`);
console.log(`\nDone. ${posts.length} post(s) built.\n`);
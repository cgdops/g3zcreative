#!/usr/bin/env node
/**
 * Programmatic SEO Build Script — G3Z Creative
 *
 * Reads local city-niche data from data/pseo-data.json, parses templates/pseo-template.html,
 * extracts headers/footers from index.html, and builds static localized landing pages.
 *
 * Run: node scripts/build-pseo.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.join(__dirname, '..');
const DATA_FILE    = path.join(ROOT, 'data', 'pseo-data.json');
const TEMPLATE_FILE = path.join(ROOT, 'templates', 'pseo-template.html');
const INDEX_HTML   = path.join(ROOT, 'index.html');
const OUTPUT_DIR   = path.join(ROOT, 'marketing-for');

// ── Helper: Extract section tags from index.html ──────────────────────────

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

// Convert relative hrefs/srcs to absolute root-relative so they work from any subfolder depth
function fixPaths(html) {
  return html
    .replace(/href="index\.html"/g, 'href="/"')
    // matches local paths like "pricing.html", "roi-calculator.html", "services/seo.html", "marketing-for/roofers.html"
    .replace(/href="(?!https?:\/\/|\/|#|mailto:|tel:)([^"]+)"/g, 'href="/$1"')
    .replace(/src="(?!https?:\/\/|\/data:)([^"]+)"/g, 'src="/$1"');
}

// ── Initial Setup ─────────────────────────────────────────────────────────

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  console.error(`Error: Data file not found at ${DATA_FILE}. Please run generate-pseo-data.js first.`);
  process.exit(1);
}

if (!fs.existsSync(TEMPLATE_FILE)) {
  console.error(`Error: Template file not found at ${TEMPLATE_FILE}.`);
  process.exit(1);
}

// ── Read Assets ───────────────────────────────────────────────────────────

const indexHtml = fs.readFileSync(INDEX_HTML, 'utf8');
const template  = fs.readFileSync(TEMPLATE_FILE, 'utf8');

const nav    = fixPaths(extractSection(indexHtml, '<header class="nav">', 'header'));
const footer = fixPaths(extractSection(indexHtml, '<footer', 'footer'));

const sharedHead = `
  <meta content="width=device-width, initial-scale=1" name="viewport">
  <link href="/css/normalize.css" rel="stylesheet" type="text/css">
  <link href="/css/webflow.css" rel="stylesheet" type="text/css">
  <link href="/css/g3zc.webflow.css" rel="stylesheet" type="text/css">
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

const dataset = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

console.log(`\nCompiling Programmatic SEO Pages: ${dataset.length} pages found\n`);

// ── Compilation Loop ──────────────────────────────────────────────────────

let count = 0;
for (const row of dataset) {
  let pageContent = template;

  // Replace static script/nav elements
  pageContent = pageContent.replace(/\{\{nav\}\}/g, nav);
  pageContent = pageContent.replace(/\{\{footer\}\}/g, footer);
  pageContent = pageContent.replace(/\{\{sharedHead\}\}/g, sharedHead);
  pageContent = pageContent.replace(/\{\{sharedScripts\}\}/g, sharedScripts);

  // Replace dynamic row tokens
  const tokens = [
    'slug', 'title', 'metaDescription', 'city', 'cityName',
    'state', 'stateAbbr', 'county', 'nicheName', 'nicheSingular',
    'nicheSlug', 'serviceType', 'description', 'localDetails',
    'landmark', 'painPoints'
  ];

  for (const token of tokens) {
    const regex = new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, 'g');
    pageContent = pageContent.replace(regex, row[token] || '');
  }

  const outputFile = path.join(OUTPUT_DIR, `${row.slug}.html`);
  fs.writeFileSync(outputFile, pageContent, 'utf8');
  count++;
}

console.log(`Successfully compiled ${count} programmatic pages in marketing-for/\n`);

/**
 * Sitemap generator — the single source of truth for sitemap.xml.
 *
 * Auto-discovers .html files so new directories (blog/, etc.) are picked up
 * without editing this file, then applies an explicit exclusion list.
 *
 * Run in CI (see .github/workflows/sitemap-generator.yml) before build-only
 * files are stripped. Previously CI used a filesystem-crawling action that
 * ignored this script entirely, which submitted gated and partial pages.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const BASE_URL = 'https://g3zcreative.com';
const TODAY = new Date().toISOString().split('T')[0];

/* Directories never crawled: build inputs, assets, server code, partials. */
const SKIP_DIRS = new Set([
  '.git', '.github', '.wrangler', 'node_modules',
  'scripts', 'templates', 'migrations', 'functions', 'src',
  'css', 'js', 'images', 'videos', 'data', 'content-strategy'
]);

/* Individual pages that must never be indexed.
   Gated, transactional, or internal — submitting these invites thin-content
   and duplicate-content flags, and exposes private surfaces. */
const SKIP_FILES = new Set([
  'clients.html',            // passcode-gated client portal
  'crm.html',                // internal CRM
  'success.html',            // post-submit thank-you page
  'lead.html',               // bare lead-capture form
  'deck-media-mesh.html'     // one-off pitch deck
]);

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, found);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      if (SKIP_FILES.has(rel)) continue;
      found.push(rel);
    }
  }
  return found;
}

/* Last commit date per file, so lastmod reflects real change rather than
   stamping every URL with today's date on every build. */
function lastModifiedMap() {
  const map = new Map();
  try {
    const log = execSync('git log --name-only --format=%x00%cI --diff-filter=AMR', {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
    });
    for (const block of log.split('\x00')) {
      const lines = block.split('\n').filter(Boolean);
      if (!lines.length) continue;
      const date = lines[0].split('T')[0];
      for (const file of lines.slice(1)) {
        if (!map.has(file)) map.set(file, date);
      }
    }
  } catch {
    /* Shallow clone or no git — fall back to today for everything. */
  }
  return map;
}

function toLoc(rel) {
  if (rel === 'index.html') return `${BASE_URL}/`;
  if (rel.endsWith('/index.html')) return `${BASE_URL}/${rel.slice(0, -'index.html'.length)}`;
  return `${BASE_URL}/${rel}`;
}

const files = walk(ROOT).sort();
const modified = lastModifiedMap();

let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
for (const rel of files) {
  xml += `<url>\n<loc>${toLoc(rel)}</loc>\n<lastmod>${modified.get(rel) || TODAY}</lastmod>\n</url>\n`;
}
xml += `</urlset>\n`;

fs.writeFileSync(SITEMAP_PATH, xml, 'utf8');
console.log(`✓ Sitemap regenerated with ${files.length} URLs at ${SITEMAP_PATH}`);

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NAV_TEMPLATE_PATH = path.join(ROOT, 'templates', 'nav.html');
const FOOTER_TEMPLATE_PATH = path.join(ROOT, 'templates', 'footer.html');
const AUTHOR_TEMPLATE_PATH = path.join(ROOT, 'templates', 'author-bio.html');

if (!fs.existsSync(NAV_TEMPLATE_PATH)) {
  console.error(`Error: Nav template not found at ${NAV_TEMPLATE_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(FOOTER_TEMPLATE_PATH)) {
  console.error(`Error: Footer template not found at ${FOOTER_TEMPLATE_PATH}`);
  process.exit(1);
}

// Trimmed: the templates end in a newline, and re-inserting it on every run
// appended a blank line per template per file — ~230 files showed as changed
// on every build without any real change.
const rawNavTemplate = fs.readFileSync(NAV_TEMPLATE_PATH, 'utf8').trim();
const rawFooterTemplate = fs.readFileSync(FOOTER_TEMPLATE_PATH, 'utf8').trim();

/* Author bio is opt-in rather than tag-matched: nav and footer exist on every
   page and can be found by tag, but only some pages carry a byline. A page
   opts in by including the marker pair below, and the region between the
   markers is replaced on each sync. Pages without the markers are untouched. */
const rawAuthorTemplate = fs.existsSync(AUTHOR_TEMPLATE_PATH)
  ? fs.readFileSync(AUTHOR_TEMPLATE_PATH, 'utf8').trim()
  : null;
const AUTHOR_REGION = /<!-- AUTHOR-BIO:START -->[\s\S]*?<!-- AUTHOR-BIO:END -->/i;

function getPrefix(filePath) {
  const rel = path.relative(ROOT, filePath);
  const depth = rel.split(path.sep).length - 1;
  return depth > 0 ? '../'.repeat(depth) : '';
}

function processHtmlFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const prefix = getPrefix(filePath);

  const navHtml = rawNavTemplate.replace(/\{\{prefix\}\}/g, prefix);
  const footerHtml = rawFooterTemplate.replace(/\{\{prefix\}\}/g, prefix);

  const original = content;

  // Replace Header
  const headerRegex = /<header class="nav">[\s\S]*?<\/header>/i;
  if (headerRegex.test(content)) {
    content = content.replace(headerRegex, navHtml);
  }

  // Replace Footer
  const footerRegex = /<footer[\s\S]*?<\/footer>/i;
  if (footerRegex.test(content)) {
    content = content.replace(footerRegex, footerHtml);
  }

  // Replace Author Bio (opt-in — only pages carrying the markers)
  if (rawAuthorTemplate && AUTHOR_REGION.test(content)) {
    const authorHtml = rawAuthorTemplate.replace(/\{\{prefix\}\}/g, prefix);
    content = content.replace(AUTHOR_REGION, authorHtml);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function scanAndSync(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.claude' && entry.name !== 'templates') {
        count += scanAndSync(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'crm.html' && entry.name !== 'privacy-policy.html') {
      if (processHtmlFile(fullPath)) {
        count++;
      }
    }
  }
  return count;
}

console.log('🔄 Synchronizing templates/nav.html and templates/footer.html across site...');
const totalUpdated = scanAndSync(ROOT);
console.log(`✅ Synced header & footer templates across ${totalUpdated} HTML files.`);

// Rebuild pSEO and Sitemap
console.log('\n🚀 Rebuilding Programmatic SEO pages & Sitemap...');
try {
  execSync('node scripts/build-pseo.js', { stdio: 'inherit', cwd: ROOT });
  execSync('node scripts/build-sitemap.js', { stdio: 'inherit', cwd: ROOT });
  execSync('node scripts/validate-nav-links.js', { stdio: 'inherit', cwd: ROOT });
  console.log('\n🎉 Entire site navigation & layout successfully synchronized!');
} catch (err) {
  console.error('Error during build steps:', err);
}

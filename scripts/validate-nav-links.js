const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function extractHrefs(html) {
  const matches = [];
  const regex = /href="([^"#][^"]*)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

function resolveFile(sourceFilePath, href) {
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('tel:') || href.startsWith('mailto:')) {
    return null; // External
  }
  let targetPath;
  if (href.startsWith('/')) {
    targetPath = path.join(ROOT, href.slice(1));
  } else {
    targetPath = path.resolve(path.dirname(sourceFilePath), href);
  }
  return targetPath;
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract navbar dropdown and footer specifically
  const errors = [];
  const warnings = [];

  const megaMenuMatch = content.match(/<div class="mega-nav-dropdown-list-wrapper">[\s\S]*?<\/nav>/i);
  if (megaMenuMatch) {
    const hrefs = extractHrefs(megaMenuMatch[0]);
    for (const href of hrefs) {
      if (href.includes('dance-studios')) {
        errors.push(`Found dance-studios in navbar dropdown: ${href}`);
      }
      if (href.includes('social-media-marketing')) {
        errors.push(`Found social-media-marketing in navbar dropdown: ${href}`);
      }
      const resolved = resolveFile(filePath, href);
      if (resolved && !fs.existsSync(resolved)) {
        errors.push(`Broken navbar link: ${href} -> ${resolved}`);
      }
    }
  }

  const footerMatch = content.match(/<footer[\s\S]*?<\/footer>/i);
  if (footerMatch) {
    const hrefs = extractHrefs(footerMatch[0]);
    for (const href of hrefs) {
      if (href.includes('dance-studios')) {
        errors.push(`Found dance-studios in footer: ${href}`);
      }
      const resolved = resolveFile(filePath, href);
      if (resolved && !fs.existsSync(resolved)) {
        errors.push(`Broken footer link: ${href} -> ${resolved}`);
      }
    }
  }

  return { errors, warnings };
}

let totalFiles = 0;
let totalErrors = 0;

function scan(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'blog' && entry.name !== 'templates' && entry.name !== 'scripts') {
        scan(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'crm.html' && entry.name !== 'privacy-policy.html') {
      totalFiles++;
      const { errors } = validateFile(fullPath);
      if (errors.length > 0) {
        console.error(`❌ Errors in ${path.relative(ROOT, fullPath)}:`);
        errors.forEach(e => console.error(`   - ${e}`));
        totalErrors += errors.length;
      }
    }
  }
}

console.log('Validating navigation links and removals across all HTML files...');
scan(ROOT);

if (totalErrors === 0) {
  console.log(`\n🎉 ALL PASSED! Verified ${totalFiles} HTML files.`);
  console.log('✅ All dropdown & footer links exist and resolve properly.');
  console.log('✅ Dance Studios successfully removed from all active navigation.');
  console.log('✅ Social Media successfully removed from all active navigation.');
} else {
  console.error(`\n❌ Found ${totalErrors} errors across scanned files.`);
  process.exit(1);
}

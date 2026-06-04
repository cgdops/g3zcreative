const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function getRelativePrefix(filePath) {
  const relative = path.relative(ROOT, filePath);
  const depth = relative.split(path.sep).length - 1;
  return depth > 0 ? '../'.repeat(depth) : '';
}

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const prefix = getRelativePrefix(filePath);

  // 1. Patch header nav: Find the dropdown end and insert Pricing / ROI Calculator / active Blog links
  const dropdownClosePattern = /(<\/div>\s*<\/li>)\s*<li class="nav-menu-list-item[^"]*">\s*<a href="[^"]*"\s*(?:class="[^"]*")?>\s*<div>Blog<\/div>\s*<\/a>\s*<\/li>/gi;
  
  if (dropdownClosePattern.test(content)) {
    content = content.replace(dropdownClosePattern, (match, p1) => {
      return `${p1}
            <li class="nav-menu-list-item">
              <a href="${prefix}pricing.html" class="nav-link w-inline-block">
                <div>Pricing</div>
              </a>
            </li>
            <li class="nav-menu-list-item">
              <a href="${prefix}roi-calculator.html" class="nav-link w-inline-block">
                <div>ROI Calculator</div>
              </a>
            </li>
            <li class="nav-menu-list-item">
              <a href="${prefix}blog/" class="nav-link w-inline-block">
                <div>Blog</div>
              </a>
            </li>`;
    });
    console.log(`Patched header nav for: ${path.relative(ROOT, filePath)}`);
  }

  // 2. Patch footer: Find the services list and append Pricing & ROI Calculator links
  // We match the bottom of the Services list in the footer
  const servicesFooterPattern = /(<a href="[^"]*services\/local-marketing\.html"[^>]*>\s*<div>Local Marketing<\/div>\s*<\/a>\s*<\/li>)/gi;
  if (servicesFooterPattern.test(content)) {
    content = content.replace(servicesFooterPattern, (match, p1) => {
      return `${p1}
          <li>
            <a href="${prefix}pricing.html" class="footer-link w-inline-block">
              <div>Pricing</div>
            </a>
          </li>
          <li>
            <a href="${prefix}roi-calculator.html" class="footer-link w-inline-block">
              <div>ROI Calculator</div>
            </a>
          </li>`;
    });
    console.log(`Patched footer nav for: ${path.relative(ROOT, filePath)}`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'blog' && entry.name !== '.git') {
        scanDir(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'privacy-policy.html') {
      patchFile(fullPath);
    }
  }
}

console.log('Starting navigation patching...');
scanDir(ROOT);
console.log('Navigation patching completed.');

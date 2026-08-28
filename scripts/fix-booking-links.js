const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const OUTLOOK_REGEX = /href="https:\/\/outlook\.office\.com\/bookwithme\/[^"]*"/gi;

function scanAndFix(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        count += scanAndFix(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (OUTLOOK_REGEX.test(content)) {
        content = content.replace(OUTLOOK_REGEX, 'href="tel:+17869673699" data-open-inquiry="true"');
        // Remove target="_blank" on inquiry triggers if next to it
        content = content.replace(/data-open-inquiry="true" target="_blank"/g, 'data-open-inquiry="true"');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`✓ Fixed booking link in: ${path.relative(ROOT, fullPath)}`);
        count++;
      }
    }
  }
  return count;
}

console.log('Fixing all Microsoft booking links to point to internal CRM modal...');
const total = scanAndFix(ROOT);
console.log(`Total files updated: ${total}`);

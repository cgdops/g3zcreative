const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');
const files = fs.readdirSync(servicesDir).filter(f => f.endsWith('.html'));

files.forEach(f => {
  const content = fs.readFileSync(path.join(servicesDir, f), 'utf8');
  const canonicalMatch = content.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  const canonical = canonicalMatch ? (canonicalMatch[1] || canonicalMatch[2]) : 'MISSING';
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : 'MISSING';
  console.log(`${f.padEnd(38)} | canonical: ${canonical.padEnd(55)} | title: ${title}`);
});

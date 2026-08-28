const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const BASE_URL = 'https://g3zcreative.com';
const TODAY = new Date().toISOString().split('T')[0];

const staticPages = [
  '',
  'pricing.html',
  'roi-calculator.html',
  'toronto.html',
  'privacy-policy.html'
];

const serviceFiles = fs.readdirSync(path.join(ROOT, 'services')).filter(f => f.endsWith('.html'));
const marketingFiles = fs.readdirSync(path.join(ROOT, 'marketing-for')).filter(f => f.endsWith('.html'));

let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

for (const page of staticPages) {
  const loc = page === '' ? `${BASE_URL}/` : `${BASE_URL}/${page}`;
  xml += `<url>\n<loc>${loc}</loc>\n<lastmod>${TODAY}</lastmod>\n</url>\n`;
}

for (const f of serviceFiles) {
  xml += `<url>\n<loc>${BASE_URL}/services/${f}</loc>\n<lastmod>${TODAY}</lastmod>\n</url>\n`;
}

for (const f of marketingFiles) {
  xml += `<url>\n<loc>${BASE_URL}/marketing-for/${f}</loc>\n<lastmod>${TODAY}</lastmod>\n</url>\n`;
}

xml += `</urlset>\n`;

fs.writeFileSync(SITEMAP_PATH, xml, 'utf8');
console.log(`✓ Sitemap regenerated with ${staticPages.length + serviceFiles.length + marketingFiles.length} URLs at ${SITEMAP_PATH}`);

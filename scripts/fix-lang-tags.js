const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const filesToFix = [
  'index.html',
  'pricing.html',
  'privacy-policy.html',
  'services/branding.html',
  'services/local-marketing.html',
  'services/seo.html',
  'services/social-media-marketing.html',
  'services/website-development-miramar.html',
  'marketing-for/dance-studios.html',
  'marketing-for/home-service-providers.html',
  'marketing-for/roofers.html'
];

console.log('Fixing language tags from "es" to "en"...');

filesToFix.forEach(relPath => {
  const absPath = path.join(ROOT, relPath);
  if (fs.existsSync(absPath)) {
    let content = fs.readFileSync(absPath, 'utf8');
    if (content.includes('lang="es"')) {
      content = content.replace('lang="es"', 'lang="en"');
      fs.writeFileSync(absPath, content, 'utf8');
      console.log(`✓ Fixed lang tag in ${relPath}`);
    } else {
      console.log(`- Already fixed or no lang="es" tag in ${relPath}`);
    }
  } else {
    console.warn(`File not found: ${relPath}`);
  }
});

console.log('Done.');

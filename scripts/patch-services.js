const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '..', 'services');
if (fs.existsSync(servicesDir)) {
  const files = fs.readdirSync(servicesDir).filter(f => f.endsWith('.html'));

  files.forEach(file => {
    const filePath = path.join(servicesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace HubSpot links
    content = content.replace(/https:\/\/meetings-na2\.hubspot\.com\/christian-gomez/g, 'tel:+17869673699');
    content = content.replace(/Book a Free Consultation/g, 'Start Free Consultation');

    // Add quick-connect.js before </body> if not present
    if (!content.includes('quick-connect.js')) {
      content = content.replace('</body>', '  <script src="/js/quick-connect.js" type="text/javascript"></script>\n</body>');
    }

    // Remove hs-script-loader
    content = content.replace(/<script[^>]*hs-scripts\.com[^>]*><\/script>/g, '');
    content = content.replace(/<!--\s*Start of HubSpot Embed Code\s*-->/g, '');
    content = content.replace(/<!--\s*End of HubSpot Embed Code\s*-->/g, '');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated services/' + file);
  });
}

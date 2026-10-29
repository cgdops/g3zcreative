const fs = require('fs');

const index = fs.readFileSync('index.html', 'utf8');
const regex = /href=["']([^"']+)["']/g;
const links = [];
let match;
while ((match = regex.exec(index)) !== null) {
  links.push(match[1]);
}

const serviceLinks = links.filter(l => l.includes('service') || l.includes('pembroke') || l.includes('miramar'));
console.log('Relevant links found in index.html:');
console.log(serviceLinks);

const navFile = fs.existsSync('templates/nav.html') ? fs.readFileSync('templates/nav.html', 'utf8') : '';
const footerFile = fs.existsSync('templates/footer.html') ? fs.readFileSync('templates/footer.html', 'utf8') : '';
console.log('\nNav contains pembroke:', navFile.includes('pembroke'));
console.log('Footer contains pembroke:', footerFile.includes('pembroke'));

const fs = require('fs');

const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');
console.log('--- Miramar occurrences in index.html ---');
lines.forEach((l, idx) => {
  if (l.toLowerCase().includes('miramar')) {
    console.log(`Line ${idx+1}: ${l.trim()}`);
  }
});

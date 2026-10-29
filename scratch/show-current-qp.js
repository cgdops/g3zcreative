const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/gsc-detailed-pop.json'), 'utf8'));

console.log('=== CURRENT QUERY + PAGE ROWS (' + data.currentQueryPage.length + ') ===');
data.currentQueryPage.forEach((r, i) => {
  const q = r.keys[0];
  const p = r.keys[1].replace('https://g3zcreative.com', '');
  console.log(`${(i+1).toString().padStart(2)}. [${q}] -> [${p}] | clk:${r.clicks} imp:${r.impressions} pos:${r.position.toFixed(1)} ctr:${(r.ctr*100).toFixed(1)}%`);
});

console.log('\n=== CURRENT PAGES (' + data.currentPages.length + ') ===');
data.currentPages.forEach(r => {
  const p = r.keys[0].replace('https://g3zcreative.com', '');
  console.log(`${p.padEnd(50)} | clk: ${r.clicks} | imp: ${r.impressions} | pos: ${r.position.toFixed(1)}`);
});

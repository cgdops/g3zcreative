const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/gsc-detailed-pop.json'), 'utf8'));

console.log('=== CURRENT QUERY + PAGE ROWS (' + data.currentQueryPage.length + ') ===');
data.currentQueryPage.forEach((r, i) => {
  const q = r.keys[0];
  const p = r.keys[1].replace('https://g3zcreative.com', '');
  console.log(`${(i+1).toString().padStart(2)}. ${q.padEnd(45)} | ${p.padEnd(42)} | clk: ${r.clicks} | imp: ${r.impressions} | pos: ${r.position.toFixed(1)} | ctr: ${(r.ctr*100).toFixed(1)}%`);
});

console.log('\n=== PREVIOUS QUERY + PAGE ROWS (' + data.prevQueryPage.length + ') ===');
data.prevQueryPage.forEach(r => {
  const q = r.keys[0];
  const p = r.keys[1].replace('https://g3zcreative.com', '');
  console.log(`${q.padEnd(45)} | ${p.padEnd(45)} | clk: ${r.clicks} | imp: ${r.impressions} | pos: ${r.position.toFixed(1)} | ctr: ${(r.ctr*100).toFixed(1)}%`);
});

console.log('\n=== CURRENT PAGES (' + data.currentPages.length + ') ===');
data.currentPages.forEach(r => {
  const p = r.keys[0].replace('https://g3zcreative.com', '');
  console.log(`${p.padEnd(50)} | clk: ${r.clicks} | imp: ${r.impressions} | pos: ${r.position.toFixed(1)}`);
});

console.log('\n=== PREVIOUS PAGES (' + data.prevPages.length + ') ===');
data.prevPages.forEach(r => {
  const p = r.keys[0].replace('https://g3zcreative.com', '');
  console.log(`${p.padEnd(50)} | clk: ${r.clicks} | imp: ${r.impressions} | pos: ${r.position.toFixed(1)}`);
});

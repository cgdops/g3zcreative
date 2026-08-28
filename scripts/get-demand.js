require('dotenv').config();
const https = require('https');
const login = process.env.DATAFORSEO_LOGIN;
const password = process.env.DATAFORSEO_PASSWORD;
const authHeader = 'Basic ' + Buffer.from(login + ':' + password).toString('base64');

async function getSearchVolume(keywords) {
  const postData = JSON.stringify([{
    keywords: keywords,
    location_name: 'United States',
    language_name: 'English'
  }]);
  const options = {
    hostname: 'api.dataforseo.com',
    path: '/v3/keywords_data/google_ads/search_volume/live',
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  const serviceKeywords = [
    'programmatic seo',
    'pseo',
    'ai seo',
    'ai search optimization',
    'local seo',
    'local seo services',
    'workflow automation',
    'business automation',
    'custom crm',
    'custom crm development',
    'custom business tools',
    'custom business tool development',
    'web development',
    'website development',
    'lead generation for contractors',
    'home service marketing'
  ];
  const nicheKeywords = [
    'roofing marketing',
    'hvac marketing',
    'plumbing marketing',
    'electrician marketing',
    'landscaping marketing',
    'commercial cleaning marketing',
    'contractor marketing',
    'med spa marketing',
    'law firm marketing',
    'dance studio marketing',
    'home service marketing',
    'general contractor marketing'
  ];
  console.log('Sending requests to DataForSEO...');
  const servicesRes = await getSearchVolume(serviceKeywords);
  const nichesRes = await getSearchVolume(nicheKeywords);
  
  console.log('\n=== SERVICES DEMAND ===');
  if (servicesRes.tasks && servicesRes.tasks[0]?.result) {
    const items = servicesRes.tasks[0].result;
    items.sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0));
    for (const item of items) {
      console.log(`${(item.keyword || '').padEnd(32)} | Vol: ${(item.search_volume || 0).toString().padStart(6)} | CPC: $${(item.cpc || 0).toFixed(2)} | Comp: ${item.competition_level}`);
    }
  } else {
    console.log('Services raw:', servicesRes);
  }
  
  console.log('\n=== NICHES DEMAND ===');
  if (nichesRes.tasks && nichesRes.tasks[0]?.result) {
    const items = nichesRes.tasks[0].result;
    items.sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0));
    for (const item of items) {
      console.log(`${(item.keyword || '').padEnd(32)} | Vol: ${(item.search_volume || 0).toString().padStart(6)} | CPC: $${(item.cpc || 0).toFixed(2)} | Comp: ${item.competition_level}`);
    }
  } else {
    console.log('Niches raw:', nichesRes);
  }
}
run().catch(console.error);

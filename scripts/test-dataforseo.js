require('dotenv').config();
const https = require('https');

const login = process.env.DATAFORSEO_LOGIN;
const password = process.env.DATAFORSEO_PASSWORD;

if (!login || !password) {
  console.error('❌ Missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD in .env file.');
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(login + ':' + password).toString('base64');

const options = {
  hostname: 'api.dataforseo.com',
  path: '/v3/appendix/user_data',
  method: 'GET',
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/json'
  }
};

console.log('Testing DataForSEO API connection...');

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.status_code === 20000 && parsed.tasks && parsed.tasks[0]?.result) {
        const user = parsed.tasks[0].result[0];
        console.log('✅ DataForSEO Connection Successful!');
        console.log(`👤 User Login: ${user.login || login}`);
        if (user.money) {
          const bal = typeof user.money === 'object' ? (user.money.balance ?? JSON.stringify(user.money)) : user.money;
          console.log(`💰 Account Balance: $${bal}`);
        }
        if (user.rates) {
          console.log(`⚡ API Modules: SERP, Keywords Data, On-Page, Backlinks & LLM Mentions`);
        }
        console.log(`📅 Account Status: Verified & Connected`);
      } else {
        console.error('❌ DataForSEO API Error:', parsed.status_message || parsed);
      }
    } catch (err) {
      console.error('❌ Error parsing response:', err.message);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Request Error: ${e.message}`);
});

req.end();

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const CREDENTIALS_PATH = path.join(ROOT, '.credentials', 'client-secret.json');
const TOKEN_PATH = path.join(ROOT, '.credentials', 'tokens.json');
const SITE_URL = process.env.GSC_SITE_URL || 'sc-domain:g3zcreative.com';

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(TOKEN_PATH)) {
    console.error('Credentials or Tokens missing.');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const clientType = credentials.installed ? 'installed' : 'web';
  const clientSecrets = credentials[clientType];
  const { client_secret, client_id } = clientSecrets;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000/oauth2callback');
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));

  const searchconsole = google.searchconsole({ version: 'v1', auth: oAuth2Client });

  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 3);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 33);

  const formatDate = (date) => date.toISOString().split('T')[0];

  console.log(`Fetching Query + Page data for ${SITE_URL} from ${formatDate(startDate)} to ${formatDate(endDate)}...`);

  try {
    const response = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ['query', 'page'],
        rowLimit: 150,
        searchType: 'web'
      }
    });

    const rows = response.data.rows || [];
    console.log(`\nFound ${rows.length} unique Query-Page combinations.`);
    console.log('------------------------------------------------------------------------------------------------------------------------');
    console.log(`${'Query'.padEnd(35)} | ${'Page'.padEnd(50)} | ${'Clicks'.padStart(6)} | ${'Imps'.padStart(6)} | ${'CTR'.padStart(6)} | ${'Pos'.padStart(5)}`);
    console.log('------------------------------------------------------------------------------------------------------------------------');
    
    rows.slice(0, 40).forEach(row => {
      const query = row.keys[0];
      const page = row.keys[1].replace('https://g3zcreative.com', '');
      const clicks = row.clicks;
      const imps = row.impressions;
      const ctr = (row.ctr * 100).toFixed(1) + '%';
      const pos = row.position.toFixed(1);
      console.log(`${query.substring(0, 35).padEnd(35)} | ${page.substring(0, 50).padEnd(50)} | ${clicks.toString().padStart(6)} | ${imps.toString().padStart(6)} | ${ctr.padStart(6)} | ${pos.padStart(5)}`);
    });
    console.log('------------------------------------------------------------------------------------------------------------------------');

    // Save output to JSON for programmatic reading
    const dataPath = path.join(ROOT, 'data', 'gsc-query-pages.json');
    fs.writeFileSync(dataPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log(`Saved Query-Page mapping to ${dataPath}`);

  } catch (err) {
    console.error('Error fetching query-page data:', err.message);
  }
}

main();

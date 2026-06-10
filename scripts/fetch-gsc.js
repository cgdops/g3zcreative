require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const CREDENTIALS_PATH = path.join(__dirname, '../.credentials/client-secret.json');
const TOKEN_PATH = path.join(__dirname, '../.credentials/tokens.json');
const SITE_URL = process.env.GSC_SITE_URL || 'https://g3zcreative.com/';

// Port to run local redirect server on
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`Error: Credentials file not found at ${CREDENTIALS_PATH}`);
    console.error('Please download your OAuth client credentials JSON from Google Cloud Console and save it there.');
    process.exit(1);
  }

  // Load client secrets
  const credentialsFile = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const credentials = JSON.parse(credentialsFile);
  const clientType = credentials.installed ? 'installed' : 'web';
  const clientSecrets = credentials[clientType];
  
  if (!clientSecrets) {
    console.error('Error: Invalid client-secret.json structure. Could not find "installed" or "web" key.');
    process.exit(1);
  }

  const { client_secret, client_id } = clientSecrets;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  // Check if we have previously stored token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));
    console.log('✓ Loaded existing credentials from tokens.json');
  } else {
    console.log('No existing credentials found. Starting authorization flow...');
    const tokens = await getNewToken(oAuth2Client);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    oAuth2Client.setCredentials(tokens);
    console.log(`✓ Stored credentials in: ${TOKEN_PATH}`);
  }

  // Set up auto-refresh
  oAuth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      // Store new tokens
      const existing = fs.existsSync(TOKEN_PATH) ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')) : {};
      const updated = { ...existing, ...tokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
      console.log('✓ Auto-refreshed and updated tokens.json');
    }
  });

  await runDemoQuery(oAuth2Client);
}

/**
 * Request permission from user and start a local server to capture redirect
 */
function getNewToken(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Forces consent screen to ensure refresh_token is returned
    });

    console.log('\n======================================================');
    console.log('1. Open the following URL in your web browser:');
    console.log('\x1b[36m%s\x1b[0m', authUrl);
    console.log('\n2. Sign in with the account that has access to your Search Console.');
    console.log('3. Complete the consent screen.');
    console.log('======================================================\n');
    console.log('Waiting for authorization code from browser redirect...');

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = req.url || '';
        if (reqUrl.includes('/oauth2callback')) {
          const parsedUrl = new url.URL(reqUrl, `http://localhost:${PORT}`);
          const code = parsedUrl.searchParams.get('code');

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Authorization code missing in redirect.');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background-color: #f3f4f6; color: #1f2937;">
                <div style="display: inline-block; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                  <h1 style="color: #10b981; margin-bottom: 10px;">✓ Authentication Successful!</h1>
                  <p style="font-size: 16px; margin-bottom: 20px;">You have authorized the GSC script. You can close this tab now.</p>
                  <span style="font-size: 12px; color: #6b7280;">Powering G3Z Creative Search Strategy</span>
                </div>
              </body>
            </html>
          `);

          // Shutdown local server
          server.close();
          console.log('✓ Received code from browser redirect.');

          // Exchange authorization code for access token
          const { tokens } = await oAuth2Client.getToken(code);
          resolve(tokens);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      } catch (err) {
        console.error('Error handling oauth redirect:', err);
        res.writeHead(500);
        res.end('Internal Server Error');
        reject(err);
      }
    });

    server.listen(PORT, (err) => {
      if (err) {
        reject(err);
      }
    });
  });
}

/**
 * Fetch Search Console performance data
 */
async function runDemoQuery(auth) {
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  console.log(`\nFetching Search Console data for property: ${SITE_URL}...`);

  // Calculate start/end dates (past 30 days to 3 days ago, as GSC data has a 2-3 day lag)
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 3);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 33);

  const formatDate = (date) => date.toISOString().split('T')[0];

  try {
    const response = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ['query'],
        rowLimit: 15,
        searchType: 'web'
      }
    });

    const rows = response.data.rows;

    if (!rows || rows.length === 0) {
      console.log('No query data returned. Check if the SITE_URL is verified and has traffic.');
      return;
    }

    console.log('\nTop 15 Queries in the last 30 days:');
    console.log('---------------------------------------------------------------------------------------------');
    console.log(
      `${'Query'.padEnd(30)} | ${'Clicks'.padStart(8)} | ${'Impressions'.padStart(12)} | ${'CTR'.padStart(8)} | ${'Avg. Pos'.padStart(10)}`
    );
    console.log('---------------------------------------------------------------------------------------------');

    for (const row of rows) {
      const query = row.keys[0];
      const clicks = row.clicks;
      const impressions = row.impressions;
      const ctr = (row.ctr * 100).toFixed(2) + '%';
      const position = row.position.toFixed(1);
      console.log(
        `${query.substring(0, 30).padEnd(30)} | ${clicks.toString().padStart(8)} | ${impressions.toString().padStart(12)} | ${ctr.padStart(8)} | ${position.padStart(10)}`
      );
    }
    console.log('---------------------------------------------------------------------------------------------');

  } catch (error) {
    console.error('Error querying Search Console API:', error.message);
    
    try {
      console.log('\nAttempting to list available properties in your GSC account...');
      const sitesResponse = await searchconsole.sites.list();
      const sites = sitesResponse.data.siteEntry;
      if (sites && sites.length > 0) {
        console.log('Here are the sites you have access to:');
        sites.forEach(s => {
          console.log(`- "${s.siteUrl}" (Permission: ${s.permissionLevel})`);
        });
        console.log('\nPlease update GSC_SITE_URL in your .env file to match one of these exact strings.');
      } else {
        console.log('No sites found in this Google Search Console account. Make sure you authenticated with the correct account.');
      }
    } catch (listError) {
      console.error('Could not list GSC sites:', listError.message);
    }
  }
}

main().catch(console.error);

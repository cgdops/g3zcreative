const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const resultsPath = path.join(ROOT, 'data', 'gsc-comparison-results.json');

if (!fs.existsSync(resultsPath)) {
  console.error('No comparison results found.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

// We want to analyze comparedList inside the JSON, but wait!
// Let's see what is inside the JSON structure. In gsc-comparison.js we wrote:
// fs.writeFileSync(outputPath, JSON.stringify({ metadata, ...comparison }, null, 2))
// comparison has summary, clickWinners, positionWinners, clickLosers, positionLosers, newQueries, strikeZone, lowCtrOpportunities.
// Wait! E:\GitHub\g3zcreative\scripts\gsc-comparison.js didn't return all queries or impression losers in the final json, only the top slices.
// Let's re-extract from the GSC data or write a quick script that reads E:\GitHub\g3zcreative\data\gsc-comparison-results.json if it has them.
// Ah, the JSON only has the slices (top 15 clickWinners, etc.).
// Let's write a script that queries GSC directly or does a full comparison analysis and logs the top impression losers.

// Let's read service account/tokens and query GSC to find impression changes.
const { google } = require('googleapis');
const CREDENTIALS_PATH = path.join(ROOT, '.credentials', 'client-secret.json');
const TOKEN_PATH = path.join(ROOT, '.credentials', 'tokens.json');
const SITE_URL = process.env.GSC_SITE_URL || 'sc-domain:g3zcreative.com';

async function main() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const clientType = credentials.installed ? 'installed' : 'web';
  const clientSecrets = credentials[clientType];
  const { client_secret, client_id } = clientSecrets;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000/oauth2callback');
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));

  const searchconsole = google.searchconsole({ version: 'v1', auth: oAuth2Client });

  const today = new Date();
  
  // Current 30 days
  const currentEnd = new Date(today);
  currentEnd.setDate(today.getDate() - 3);
  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - 33);

  // Previous 30 days
  const prevEnd = new Date(today);
  prevEnd.setDate(today.getDate() - 34);
  const prevStart = new Date(today);
  prevStart.setDate(today.getDate() - 64);

  const formatDate = (date) => date.toISOString().split('T')[0];

  const currentRows = await fetchGSCPeriod(searchconsole, formatDate(currentStart), formatDate(currentEnd));
  const prevRows = await fetchGSCPeriod(searchconsole, formatDate(prevStart), formatDate(prevEnd));

  const currentMap = new Map(currentRows.map(r => [r.keys[0], r]));
  const prevMap = new Map(prevRows.map(r => [r.keys[0], r]));

  const compared = [];
  const all = new Set([...currentMap.keys(), ...prevMap.keys()]);

  all.forEach(q => {
    const cur = currentMap.get(q);
    const prev = prevMap.get(q);

    const impCur = cur ? cur.impressions : 0;
    const impPrev = prev ? prev.impressions : 0;
    const impDiff = impCur - impPrev;

    const clicksCur = cur ? cur.clicks : 0;
    const clicksPrev = prev ? prev.clicks : 0;
    const clicksDiff = clicksCur - clicksPrev;

    compared.push({
      query: q,
      currentImpressions: impCur,
      previousImpressions: impPrev,
      impressionDiff: impDiff,
      currentClicks: clicksCur,
      previousClicks: clicksPrev,
      clickDiff: clicksDiff,
      currentPos: cur ? cur.position : null,
      previousPos: prev ? prev.position : null
    });
  });

  // Sort by impression drop (most negative diff)
  const impressionLosers = compared
    .filter(c => c.impressionDiff < 0)
    .sort((a, b) => a.impressionDiff - b.impressionDiff);

  console.log('\nTop 15 Queries with Largest Impression Drops:');
  console.log('---------------------------------------------------------------------------------------------');
  console.log(`${'Query'.padEnd(30)} | ${'Prev Imp'.padStart(8)} | ${'Cur Imp'.padStart(8)} | ${'Diff'.padStart(8)} | ${'Prev Pos'.padStart(8)} -> ${'Cur Pos'.padStart(8)}`);
  console.log('---------------------------------------------------------------------------------------------');
  impressionLosers.slice(0, 15).forEach(l => {
    console.log(
      `${l.query.substring(0, 30).padEnd(30)} | ${l.previousImpressions.toString().padStart(8)} | ${l.currentImpressions.toString().padStart(8)} | ${l.impressionDiff.toString().padStart(8)} | ${(l.previousPos ? l.previousPos.toFixed(1) : 'N/A').padStart(8)} -> ${(l.currentPos ? l.currentPos.toFixed(1) : 'N/A').padStart(8)}`
    );
  });
  console.log('---------------------------------------------------------------------------------------------');
}

async function fetchGSCPeriod(searchconsole, startDate, endDate) {
  try {
    const response = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 1000,
        searchType: 'web'
      }
    });
    return response.data.rows || [];
  } catch (err) {
    console.error(err.message);
    return [];
  }
}

main();

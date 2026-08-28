require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const CREDENTIALS_PATH = path.join(ROOT, '.credentials', 'client-secret.json');
const TOKEN_PATH = path.join(ROOT, '.credentials', 'tokens.json');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, '.credentials', 'service-account.json');
const SITE_URL = process.env.GSC_SITE_URL || 'sc-domain:g3zcreative.com';

async function main() {
  console.log('Starting GSC 7-Day Period-over-Period Comparison...');

  // 1. Authenticate
  let searchconsole;
  if (fs.existsSync(TOKEN_PATH) && fs.existsSync(CREDENTIALS_PATH)) {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const clientType = credentials.installed ? 'installed' : 'web';
    const clientSecrets = credentials[clientType];
    const { client_secret, client_id } = clientSecrets;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000/oauth2callback');

    const token = fs.readFileSync(TOKEN_PATH, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));

    // Handle token refresh
    oAuth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...tokens }, null, 2));
      }
    });

    searchconsole = google.searchconsole({ version: 'v1', auth: oAuth2Client });
  } else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.log('Using Service Account authentication...');
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_PATH,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    const client = await auth.getClient();
    searchconsole = google.searchconsole({ version: 'v1', auth: client });
  } else {
    console.error('Error: Neither tokens.json nor service-account.json found.');
    process.exit(1);
  }

  // 2. Calculate Date Ranges (7-day periods with a 3-day lag)
  const today = new Date();
  
  // Current 7 days: Day -9 to Day -3
  const currentEnd = new Date(today);
  currentEnd.setDate(today.getDate() - 3);
  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - 9);

  // Previous 7 days: Day -16 to Day -10
  const prevEnd = new Date(today);
  prevEnd.setDate(today.getDate() - 10);
  const prevStart = new Date(today);
  prevStart.setDate(today.getDate() - 16);

  const formatDate = (date) => date.toISOString().split('T')[0];

  const currentRange = { start: formatDate(currentStart), end: formatDate(currentEnd) };
  const prevRange = { start: formatDate(prevStart), end: formatDate(prevEnd) };

  console.log(`Current 7-Day Period:  ${currentRange.start} to ${currentRange.end}`);
  console.log(`Previous 7-Day Period: ${prevRange.start} to ${prevRange.end}`);

  // 3. Fetch GSC Data
  console.log(`Fetching data for ${SITE_URL}...`);
  const currentTotals = await fetchGSCTotals(searchconsole, currentRange.start, currentRange.end);
  const prevTotals = await fetchGSCTotals(searchconsole, prevRange.start, prevRange.end);

  const currentRows = await fetchGSCPeriod(searchconsole, currentRange.start, currentRange.end);
  const prevRows = await fetchGSCPeriod(searchconsole, prevRange.start, prevRange.end);

  console.log(`Retrieved ${currentRows.length} identifiable queries for Current, ${prevRows.length} for Previous.`);
  console.log(`Total Site Impressions: ${prevTotals.impressions} -> ${currentTotals.impressions}`);

  // 4. Compare and Analyze
  const comparison = analyzeComparison(currentRows, prevRows, currentTotals, prevTotals);

  // 5. Write comparison to file
  const outputPath = path.join(ROOT, 'data', 'gsc-7day-comparison-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    metadata: {
      siteUrl: SITE_URL,
      currentRange,
      prevRange,
      generatedAt: new Date().toISOString()
    },
    ...comparison
  }, null, 2), 'utf8');
  console.log(`✓ Comparison results written to ${outputPath}`);

  // 6. Generate a Markdown Summary and print to console
  generateConsoleAndMarkdownSummary(comparison, currentRange, prevRange);
}

async function fetchGSCTotals(searchconsole, startDate, endDate) {
  try {
    const response = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['date'],
        searchType: 'web'
      }
    });
    const rows = response.data.rows || [];
    let clicks = 0;
    let impressions = 0;
    let weightedPosSum = 0;
    rows.forEach(r => {
      clicks += r.clicks;
      impressions += r.impressions;
      weightedPosSum += r.position * r.impressions;
    });
    const avgPos = impressions > 0 ? (weightedPosSum / impressions).toFixed(1) : '0';
    return { clicks, impressions, avgPos, daily: rows };
  } catch (err) {
    console.error(`Error fetching totals for range ${startDate} to ${endDate}:`, err.message);
    return { clicks: 0, impressions: 0, avgPos: '0', daily: [] };
  }
}

async function fetchGSCPeriod(searchconsole, startDate, endDate) {
  try {
    const response = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 2000,
        searchType: 'web'
      }
    });
    return response.data.rows || [];
  } catch (err) {
    console.error(`Error fetching for range ${startDate} to ${endDate}:`, err.message);
    return [];
  }
}

function analyzeComparison(currentRows, prevRows, currentTotals, prevTotals) {
  const currentMap = new Map();
  currentRows.forEach(row => {
    currentMap.set(row.keys[0], {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    });
  });

  const prevMap = new Map();
  prevRows.forEach(row => {
    prevMap.set(row.keys[0], {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    });
  });

  // Track global query-level stats
  const currentStats = { clicks: 0, impressions: 0, avgPosSum: 0, count: 0 };
  const prevStats = { clicks: 0, impressions: 0, avgPosSum: 0, count: 0 };

  currentRows.forEach(r => {
    currentStats.clicks += r.clicks;
    currentStats.impressions += r.impressions;
    currentStats.avgPosSum += r.position;
    currentStats.count++;
  });

  prevRows.forEach(r => {
    prevStats.clicks += r.clicks;
    prevStats.impressions += r.impressions;
    prevStats.avgPosSum += r.position;
    prevStats.count++;
  });

  const summary = {
    current: {
      clicks: currentTotals ? currentTotals.clicks : currentStats.clicks,
      impressions: currentTotals ? currentTotals.impressions : currentStats.impressions,
      avgPos: currentTotals ? currentTotals.avgPos : (currentStats.count > 0 ? (currentStats.avgPosSum / currentStats.count).toFixed(2) : 0),
      queriesCount: currentStats.count,
      identifiableImpressions: currentStats.impressions,
      anonymizedImpressions: currentTotals ? (currentTotals.impressions - currentStats.impressions) : 0
    },
    previous: {
      clicks: prevTotals ? prevTotals.clicks : prevStats.clicks,
      impressions: prevTotals ? prevTotals.impressions : prevStats.impressions,
      avgPos: prevTotals ? prevTotals.avgPos : (prevStats.count > 0 ? (prevStats.avgPosSum / prevStats.count).toFixed(2) : 0),
      queriesCount: prevStats.count,
      identifiableImpressions: prevStats.impressions,
      anonymizedImpressions: prevTotals ? (prevTotals.impressions - prevStats.impressions) : 0
    },
    diff: {
      clicks: (currentTotals ? currentTotals.clicks : currentStats.clicks) - (prevTotals ? prevTotals.clicks : prevStats.clicks),
      impressions: (currentTotals ? currentTotals.impressions : currentStats.impressions) - (prevTotals ? prevTotals.impressions : prevStats.impressions),
      avgPos: ((currentTotals ? parseFloat(currentTotals.avgPos) : 0) - (prevTotals ? parseFloat(prevTotals.avgPos) : 0)).toFixed(1),
      queriesCount: currentStats.count - prevStats.count
    }
  };

  const allQueries = new Set([...currentMap.keys(), ...prevMap.keys()]);
  const comparedList = [];

  allQueries.forEach(query => {
    const cur = currentMap.get(query);
    const prev = prevMap.get(query);

    const clicksPrev = prev ? prev.clicks : 0;
    const clicksCur = cur ? cur.clicks : 0;
    const clicksDiff = clicksCur - clicksPrev;

    const impPrev = prev ? prev.impressions : 0;
    const impCur = cur ? cur.impressions : 0;
    const impDiff = impCur - impPrev;

    const posPrev = prev ? prev.position : null;
    const posCur = cur ? cur.position : null;
    
    let posDiff = null;
    if (posPrev !== null && posCur !== null) {
      posDiff = posPrev - posCur; // positive means rank improved
    }

    const ctrPrev = prev ? prev.ctr : 0;
    const ctrCur = cur ? cur.ctr : 0;
    const ctrDiff = ctrCur - ctrPrev;

    comparedList.push({
      query,
      current: cur || null,
      previous: prev || null,
      diff: {
        clicks: clicksDiff,
        impressions: impDiff,
        position: posDiff,
        ctr: ctrDiff
      }
    });
  });

  // 1. Winners (Improved Clicks, Position or Impressions)
  const clickWinners = comparedList
    .filter(item => item.diff.clicks > 0)
    .sort((a, b) => b.diff.clicks - a.diff.clicks);

  const positionWinners = comparedList
    .filter(item => item.diff.position !== null && item.diff.position >= 0.5 && item.current.impressions >= 1)
    .sort((a, b) => b.diff.position - a.diff.position);

  const impressionWinners = comparedList
    .filter(item => item.diff.impressions > 0)
    .sort((a, b) => b.diff.impressions - a.diff.impressions);

  // 2. Losers (Dropped Clicks, Position or Impressions)
  const clickLosers = comparedList
    .filter(item => item.diff.clicks < 0)
    .sort((a, b) => a.diff.clicks - b.diff.clicks);

  const positionLosers = comparedList
    .filter(item => item.diff.position !== null && item.diff.position <= -0.5 && item.previous.impressions >= 1)
    .sort((a, b) => a.diff.position - b.diff.position);

  const impressionLosers = comparedList
    .filter(item => item.diff.impressions < 0)
    .sort((a, b) => a.diff.impressions - b.diff.impressions);

  // 3. New Queries (Did not rank in previous period, sorted by current impressions)
  const newQueries = comparedList
    .filter(item => !item.previous && item.current && item.current.impressions >= 1)
    .sort((a, b) => b.current.impressions - a.current.impressions);

  // 4. Near-Strike Zone Opportunities (Current position 11 to 25, sorted by impressions)
  const strikeZone = comparedList
    .filter(item => item.current && item.current.position >= 11 && item.current.position <= 25)
    .sort((a, b) => b.current.impressions - a.current.impressions);

  // 5. High Impression, Low CTR (Current impressions >= 5, CTR < 2%)
  const lowCtrOpportunities = comparedList
    .filter(item => item.current && item.current.impressions >= 5 && item.current.ctr < 0.02)
    .sort((a, b) => b.current.impressions - a.current.impressions);

  return {
    summary,
    clickWinners: clickWinners.slice(0, 15),
    positionWinners: positionWinners.slice(0, 15),
    impressionWinners: impressionWinners.slice(0, 15),
    clickLosers: clickLosers.slice(0, 15),
    positionLosers: positionLosers.slice(0, 15),
    impressionLosers: impressionLosers.slice(0, 15),
    newQueries: newQueries.slice(0, 20),
    strikeZone: strikeZone.slice(0, 15),
    lowCtrOpportunities: lowCtrOpportunities.slice(0, 15)
  };
}

function generateConsoleAndMarkdownSummary(comparison, currentRange, prevRange) {
  const { 
    summary, 
    clickWinners, 
    positionWinners, 
    impressionWinners, 
    clickLosers, 
    positionLosers, 
    impressionLosers, 
    newQueries, 
    strikeZone, 
    lowCtrOpportunities 
  } = comparison;

  console.log('\n================================================================');
  console.log('GSC 7-DAY COMPARISON SUMMARY');
  console.log('================================================================');
  console.log(`Clicks:       ${summary.previous.clicks} -> ${summary.current.clicks} (${summary.diff.clicks >= 0 ? '+' : ''}${summary.diff.clicks})`);
  console.log(`Impressions:  ${summary.previous.impressions} -> ${summary.current.impressions} (${summary.diff.impressions >= 0 ? '+' : ''}${summary.diff.impressions})`);
  console.log(`Avg Position: ${summary.previous.avgPos} -> ${summary.current.avgPos} (${summary.diff.avgPos <= 0 ? '' : '+'}${summary.diff.avgPos})`);
  console.log(`Total Queries:${summary.previous.queriesCount} -> ${summary.current.queriesCount}`);
  console.log('================================================================\n');

  let md = `# Google Search Console 7-Day PoP Report

**Property:** \`${SITE_URL}\`  
**Generated On:** ${new Date().toLocaleDateString()}  
**Comparison Period (7 Days):**  
*   **Current:** ${currentRange.start} to ${currentRange.end} (7 days)
*   **Previous:** ${prevRange.start} to ${prevRange.end} (7 days)

## 📊 High-Level Metrics Comparison

| Metric | Previous | Current | Change |
| :--- | :---: | :---: | :---: |
| **Clicks** | ${summary.previous.clicks} | ${summary.current.clicks} | **${summary.diff.clicks >= 0 ? '+' : ''}${summary.diff.clicks}** |
| **Impressions** | ${summary.previous.impressions} | ${summary.current.impressions} | **${summary.diff.impressions >= 0 ? '+' : ''}${summary.diff.impressions}** |
| **Average Position** | ${summary.previous.avgPos} | ${summary.current.avgPos} | **${summary.diff.avgPos <= 0 ? '' : '+'}${summary.diff.avgPos}** |
| **Unique Queries** | ${summary.previous.queriesCount} | ${summary.current.queriesCount} | **${summary.current.queriesCount - summary.previous.queriesCount >= 0 ? '+' : ''}${summary.current.queriesCount - summary.previous.queriesCount}** |

---

## 🏆 Click Winners
Queries that gained the most absolute clicks:

${clickWinners.length === 0 ? '_No click gains in this period._' : `
| Query | Previous Clicks | Current Clicks | Change | Current Impressions | Current Position |
| :--- | :---: | :---: | :---: | :---: | :---: |
${clickWinners.map(w => `| \`${w.query}\` | ${w.previous ? w.previous.clicks : 0} | ${w.current.clicks} | **+${w.diff.clicks}** | ${w.current.impressions} | ${w.current.position.toFixed(1)} |`).join('\n')}
`}

## 📈 Top Position Gainers
Queries with the biggest improvement in average ranking:

${positionWinners.length === 0 ? '_No position gainers in this period._' : `
| Query | Previous Pos | Current Pos | Change | Current Clicks | Current Impressions |
| :--- | :---: | :---: | :---: | :---: | :---: |
${positionWinners.map(w => `| \`${w.query}\` | ${w.previous.position.toFixed(1)} | ${w.current.position.toFixed(1)} | **+${w.diff.position.toFixed(1)}** | ${w.current.clicks} | ${w.current.impressions} |`).join('\n')}
`}

## 🌐 Impression Winners
Queries that gained the most absolute impressions:

${impressionWinners.length === 0 ? '_No impression winners in this period._' : `
| Query | Previous Imp | Current Imp | Change | Current Clicks | Current Position |
| :--- | :---: | :---: | :---: | :---: | :---: |
${impressionWinners.map(w => `| \`${w.query}\` | ${w.previous ? w.previous.impressions : 0} | ${w.current.impressions} | **+${w.diff.impressions}** | ${w.current.clicks} | ${w.current.position.toFixed(1)} |`).join('\n')}
`}

---

## 📉 Click Losers
Queries that dropped in clicks:

${clickLosers.length === 0 ? '_No click losses in this period._' : `
| Query | Previous Clicks | Current Clicks | Change | Current Impressions | Current Position |
| :--- | :---: | :---: | :---: | :---: | :---: |
${clickLosers.map(l => `| \`${l.query}\` | ${l.previous.clicks} | ${l.current ? l.current.clicks : 0} | **${l.diff.clicks}** | ${l.current ? l.current.impressions : 0} | ${l.current ? l.current.position.toFixed(1) : 'N/A'} |`).join('\n')}
`}

## 📉 Position Losers
Queries with the largest ranking drop:

${positionLosers.length === 0 ? '_No position losers in this period._' : `
| Query | Previous Pos | Current Pos | Change | Current Clicks | Current Impressions |
| :--- | :---: | :---: | :---: | :---: | :---: |
${positionLosers.map(l => `| \`${l.query}\` | ${l.previous.position.toFixed(1)} | ${l.current.position.toFixed(1)} | **${l.diff.position.toFixed(1)}** | ${l.current.clicks} | ${l.current.impressions} |`).join('\n')}
`}

## 📉 Impression Losers
Queries with the largest drop in impressions:

${impressionLosers.length === 0 ? '_No impression losers in this period._' : `
| Query | Previous Imp | Current Imp | Change | Current Clicks | Current Position |
| :--- | :---: | :---: | :---: | :---: | :---: |
${impressionLosers.map(l => `| \`${l.query}\` | ${l.previous.impressions} | ${l.current ? l.current.impressions : 0} | **${l.diff.impressions}** | ${l.current ? l.current.clicks : 0} | ${l.current ? l.current.position.toFixed(1) : 'N/A'} |`).join('\n')}
`}

---

## ✨ New Queries Discovered
Queries ranking now that had no visibility in the previous period:

${newQueries.length === 0 ? '_No new queries._' : `
| Query | Current Clicks | Current Impressions | Current CTR | Current Position |
| :--- | :---: | :---: | :---: | :---: |
${newQueries.map(n => `| \`${n.query}\` | ${n.current.clicks} | ${n.current.impressions} | ${(n.current.ctr * 100).toFixed(2)}% | ${n.current.position.toFixed(1)} |`).join('\n')}
`}

---

## 🎯 Strike-Zone Opportunities (Pos 11-25)
Queries on Page 2 that have high impressions and could be optimized to jump to Page 1:

${strikeZone.length === 0 ? '_No strike-zone opportunities._' : `
| Query | Current Position | Current Impressions | Current Clicks | Current CTR |
| :--- | :---: | :---: | :---: | :---: |
${strikeZone.map(s => `| \`${s.query}\` | ${s.current.position.toFixed(1)} | ${s.current.impressions} | ${s.current.clicks} | ${(s.current.ctr * 100).toFixed(2)}% |`).join('\n')}
`}

## ⚡ High Impressions, Low CTR Opportunities
Queries ranking well but with less than 2% Click-Through Rate:

${lowCtrOpportunities.length === 0 ? '_No low CTR opportunities._' : `
| Query | Current Position | Current Impressions | Current Clicks | Current CTR |
| :--- | :---: | :---: | :---: | :---: |
${lowCtrOpportunities.map(o => `| \`${o.query}\` | ${o.current.position.toFixed(1)} | ${o.current.impressions} | ${o.current.clicks} | ${(o.current.ctr * 100).toFixed(2)}% |`).join('\n')}
`}`;

  const mdPath = path.join(ROOT, 'data', 'gsc-7day-comparison-summary.md');
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`✓ Markdown summary written to ${mdPath}`);
}

main().catch(err => {
  console.error('Comparison script failed:', err);
});

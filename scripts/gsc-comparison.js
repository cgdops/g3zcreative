require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const CREDENTIALS_PATH = path.join(ROOT, '.credentials', 'client-secret.json');
const TOKEN_PATH = path.join(ROOT, '.credentials', 'tokens.json');
const SITE_URL = process.env.GSC_SITE_URL || 'sc-domain:g3zcreative.com';

async function main() {
  console.log('Starting GSC Period-over-Period Comparison...');

  // 1. Authenticate
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`Error: Credentials file not found at ${CREDENTIALS_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error(`Error: Tokens file not found at ${TOKEN_PATH}. Run "npm run fetch:gsc" first.`);
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const clientType = credentials.installed ? 'installed' : 'web';
  const clientSecrets = credentials[clientType];
  const { client_secret, client_id } = clientSecrets;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000/oauth2callback');

  const token = fs.readFileSync(TOKEN_PATH, 'utf8');
  oAuth2Client.setCredentials(JSON.parse(token));

  const searchconsole = google.searchconsole({ version: 'v1', auth: oAuth2Client });

  // 2. Calculate Date Ranges (30-day periods with a 3-day lag)
  const today = new Date();
  
  // Current 30 days: Day -33 to Day -3
  const currentEnd = new Date(today);
  currentEnd.setDate(today.getDate() - 3);
  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - 33);

  // Previous 30 days: Day -64 to Day -34
  const prevEnd = new Date(today);
  prevEnd.setDate(today.getDate() - 34);
  const prevStart = new Date(today);
  prevStart.setDate(today.getDate() - 64);

  const formatDate = (date) => date.toISOString().split('T')[0];

  const currentRange = { start: formatDate(currentStart), end: formatDate(currentEnd) };
  const prevRange = { start: formatDate(prevStart), end: formatDate(prevEnd) };

  console.log(`Current Period:  ${currentRange.start} to ${currentRange.end}`);
  console.log(`Previous Period: ${prevRange.start} to ${prevRange.end}`);

  // 3. Fetch GSC Data
  console.log(`Fetching data for ${SITE_URL}...`);
  const currentRows = await fetchGSCPeriod(searchconsole, currentRange.start, currentRange.end);
  const prevRows = await fetchGSCPeriod(searchconsole, prevRange.start, prevRange.end);

  console.log(`Retrieved ${currentRows.length} queries for Current, ${prevRows.length} queries for Previous.`);

  // 4. Compare and Analyze
  const comparison = analyzeComparison(currentRows, prevRows);

  // 5. Write comparison to file
  const outputPath = path.join(ROOT, 'data', 'gsc-comparison-results.json');
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
    console.error(`Error fetching for range ${startDate} to ${endDate}:`, err.message);
    return [];
  }
}

function analyzeComparison(currentRows, prevRows) {
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

  // Track global stats
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
      clicks: currentStats.clicks,
      impressions: currentStats.impressions,
      avgPos: currentStats.count > 0 ? (currentStats.avgPosSum / currentStats.count).toFixed(2) : 0,
      queriesCount: currentStats.count
    },
    previous: {
      clicks: prevStats.clicks,
      impressions: prevStats.impressions,
      avgPos: prevStats.count > 0 ? (prevStats.avgPosSum / prevStats.count).toFixed(2) : 0,
      queriesCount: prevStats.count
    },
    diff: {
      clicks: currentStats.clicks - prevStats.clicks,
      impressions: currentStats.impressions - prevStats.impressions,
      avgPos: (currentStats.count > 0 && prevStats.count > 0) 
        ? ((currentStats.avgPosSum / currentStats.count) - (prevStats.avgPosSum / prevStats.count)).toFixed(2)
        : 0
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
    // Positive posDiff means position improved (rank number decreased, e.g. 15 -> 5 is +10)
    let posDiff = null;
    if (posPrev !== null && posCur !== null) {
      posDiff = posPrev - posCur;
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

  // 1. Winners (Improved Clicks or Position)
  // Click Winners: Clicks improved
  const clickWinners = comparedList
    .filter(item => item.diff.clicks > 0)
    .sort((a, b) => b.diff.clicks - a.diff.clicks);

  // Position Winners: Rank improved (min 2 impressions in current)
  const positionWinners = comparedList
    .filter(item => item.diff.position !== null && item.diff.position >= 1 && item.current.impressions >= 2)
    .sort((a, b) => b.diff.position - a.diff.position);

  // 2. Losers (Dropped Clicks or Position)
  // Click Losers: Clicks decreased
  const clickLosers = comparedList
    .filter(item => item.diff.clicks < 0)
    .sort((a, b) => a.diff.clicks - b.diff.clicks);

  // Position Losers: Rank dropped (min 2 impressions in previous)
  const positionLosers = comparedList
    .filter(item => item.diff.position !== null && item.diff.position <= -1 && item.previous.impressions >= 2)
    .sort((a, b) => a.diff.position - b.diff.position);

  // 3. New Queries (Did not rank in previous period, sorted by current impressions)
  const newQueries = comparedList
    .filter(item => !item.previous && item.current && item.current.impressions >= 2)
    .sort((a, b) => b.current.impressions - a.current.impressions);

  // 4. Near-Strike Zone Opportunities (Current position 11 to 25, sorted by impressions)
  const strikeZone = comparedList
    .filter(item => item.current && item.current.position >= 11 && item.current.position <= 25)
    .sort((a, b) => b.current.impressions - a.current.impressions);

  // 5. High Impression, Low CTR (Current impressions >= 10, CTR < 2%)
  const lowCtrOpportunities = comparedList
    .filter(item => item.current && item.current.impressions >= 10 && item.current.ctr < 0.02)
    .sort((a, b) => b.current.impressions - a.current.impressions);

  return {
    summary,
    clickWinners: clickWinners.slice(0, 15),
    positionWinners: positionWinners.slice(0, 15),
    clickLosers: clickLosers.slice(0, 15),
    positionLosers: positionLosers.slice(0, 15),
    newQueries: newQueries.slice(0, 20),
    strikeZone: strikeZone.slice(0, 15),
    lowCtrOpportunities: lowCtrOpportunities.slice(0, 15)
  };
}

function generateConsoleAndMarkdownSummary(comparison, currentRange, prevRange) {
  const { summary, clickWinners, positionWinners, clickLosers, positionLosers, newQueries, strikeZone, lowCtrOpportunities } = comparison;

  console.log('\n================================================================');
  console.log('GSC COMPARISON SUMMARY');
  console.log('================================================================');
  console.log(`Clicks:       ${summary.previous.clicks} -> ${summary.current.clicks} (${summary.diff.clicks >= 0 ? '+' : ''}${summary.diff.clicks})`);
  console.log(`Impressions:  ${summary.previous.impressions} -> ${summary.current.impressions} (${summary.diff.impressions >= 0 ? '+' : ''}${summary.diff.impressions})`);
  console.log(`Avg Position: ${summary.previous.avgPos} -> ${summary.current.avgPos} (${summary.diff.avgPos <= 0 ? '' : '+'}${summary.diff.avgPos}) (rank number decrease is good)`);
  console.log(`Total Queries:${summary.previous.queriesCount} -> ${summary.current.queriesCount}`);
  console.log('================================================================\n');

  // Let's also build a markdown report that we will write to data/gsc-comparison-summary.md
  let md = `# Google Search Console PoP Report

**Property:** \`${SITE_URL}\`  
**Generated On:** ${new Date().toLocaleDateString()}  
**Comparison Period:**  
*   **Current:** ${currentRange.start} to ${currentRange.end} (30 days)
*   **Previous:** ${prevRange.start} to ${prevRange.end} (30 days)

## 📊 High-Level Metrics Comparison

| Metric | Previous | Current | Change |
| :--- | :---: | :---: | :---: |
| **Clicks** | ${summary.previous.clicks} | ${summary.current.clicks} | **${summary.diff.clicks >= 0 ? '+' : ''}${summary.diff.clicks}** |
| **Impressions** | ${summary.previous.impressions} | ${summary.current.impressions} | **${summary.diff.impressions >= 0 ? '+' : ''}${summary.diff.impressions}** |
| **Average Position** | ${summary.previous.avgPos} | ${summary.current.avgPos} | **${summary.diff.avgPos <= 0 ? '' : '+'}${summary.diff.avgPos}** |
| **Unique Queries** | ${summary.previous.queriesCount} | ${summary.current.queriesCount} | **${summary.current.queriesCount - summary.previous.queriesCount >= 0 ? '+' : ''}${summary.current.queriesCount - summary.previous.queriesCount}** |

---

## 🏆 Top Winning Queries (Clicks Improvement)
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

---

## 📉 Top Click Losers
Queries that dropped in clicks:

${clickLosers.length === 0 ? '_No click losses in this period._' : `
| Query | Previous Clicks | Current Clicks | Change | Current Impressions | Current Position |
| :--- | :---: | :---: | :---: | :---: | :---: |
${clickLosers.map(l => `| \`${l.query}\` | ${l.previous.clicks} | ${l.current ? l.current.clicks : 0} | **${l.diff.clicks}** | ${l.current ? l.current.impressions : 0} | ${l.current ? l.current.position.toFixed(1) : 'N/A'} |`).join('\n')}
`}

## 📉 Top Position Losers
Queries with the largest ranking drop:

${positionLosers.length === 0 ? '_No position losers in this period._' : `
| Query | Previous Pos | Current Pos | Change | Current Clicks | Current Impressions |
| :--- | :---: | :---: | :---: | :---: | :---: |
${positionLosers.map(l => `| \`${l.query}\` | ${l.previous.position.toFixed(1)} | ${l.current.position.toFixed(1)} | **${l.diff.position.toFixed(1)}** | ${l.current.clicks} | ${l.current.impressions} |`).join('\n')}
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

  const mdPath = path.join(ROOT, 'data', 'gsc-comparison-summary.md');
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`✓ Markdown summary written to ${mdPath}`);
}

main().catch(err => {
  console.error('Comparison script failed:', err);
});

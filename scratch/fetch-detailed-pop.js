require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, '.credentials', 'service-account.json');
const SITE_URL = process.env.GSC_SITE_URL || 'sc-domain:g3zcreative.com';

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const client = await auth.getClient();
  const searchconsole = google.searchconsole({ version: 'v1', auth: client });

  const today = new Date();
  const currentEnd = new Date(today);
  currentEnd.setDate(today.getDate() - 3);
  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - 9);

  const prevEnd = new Date(today);
  prevEnd.setDate(today.getDate() - 10);
  const prevStart = new Date(today);
  prevStart.setDate(today.getDate() - 16);

  const formatDate = (d) => d.toISOString().split('T')[0];

  const currentRange = { start: formatDate(currentStart), end: formatDate(currentEnd) };
  const prevRange = { start: formatDate(prevStart), end: formatDate(prevEnd) };

  console.log(`Current: ${currentRange.start} to ${currentRange.end}`);
  console.log(`Previous: ${prevRange.start} to ${prevRange.end}`);

  const qpCurrent = await searchconsole.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: currentRange.start,
      endDate: currentRange.end,
      dimensions: ['query', 'page'],
      rowLimit: 500,
      searchType: 'web'
    }
  });

  const qpPrev = await searchconsole.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: prevRange.start,
      endDate: prevRange.end,
      dimensions: ['query', 'page'],
      rowLimit: 500,
      searchType: 'web'
    }
  });

  const pCurrent = await searchconsole.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: currentRange.start,
      endDate: currentRange.end,
      dimensions: ['page'],
      rowLimit: 500,
      searchType: 'web'
    }
  });

  const pPrev = await searchconsole.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: prevRange.start,
      endDate: prevRange.end,
      dimensions: ['page'],
      rowLimit: 500,
      searchType: 'web'
    }
  });

  const output = {
    metadata: {
      siteUrl: SITE_URL,
      currentRange,
      prevRange,
      fetchedAt: new Date().toISOString()
    },
    currentQueryPage: qpCurrent.data.rows || [],
    prevQueryPage: qpPrev.data.rows || [],
    currentPages: pCurrent.data.rows || [],
    prevPages: pPrev.data.rows || []
  };

  const outputPath = path.join(ROOT, 'data', 'gsc-detailed-pop.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Saved detailed POP data to ${outputPath}`);
}

main().catch(console.error);

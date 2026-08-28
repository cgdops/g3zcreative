#!/usr/bin/env node
/**
 * Automated Indexing Submission Script — G3Z Creative
 *
 * Submits all programmatic and static site URLs to:
 * 1. Google Search Console Sitemaps API (forces Google to re-fetch sitemap.xml)
 * 2. Google Indexing API (direct crawl notification to Googlebot)
 * 3. IndexNow API (instant notification to Bing, Yandex, etc.)
 *
 * Usage: node scripts/submit-indexing.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, '.credentials', 'service-account.json');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SITE_URL = 'https://g3zcreative.com';
const GSC_SITE_ID = process.env.GSC_SITE_URL || 'sc-domain:g3zcreative.com';

// ── 1. Parse Sitemap URLs ──────────────────────────────────────────────────
function getSitemapUrls() {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.error(`Error: sitemap.xml not found at ${SITEMAP_PATH}`);
    process.exit(1);
  }
  const sitemap = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const matches = sitemap.match(/<loc>(.*?)<\/loc>/g) || [];
  return matches.map(m => m.replace(/<\/?loc>/g, '').trim());
}

// ── 2. Submit to Google Search Console Sitemaps API ────────────────────────
async function submitGscSitemap(auth) {
  console.log('\n[1/3] Submitting sitemap to Google Search Console API...');
  try {
    const searchconsole = google.searchconsole({ version: 'v1', auth });
    const res = await searchconsole.sitemaps.submit({
      siteUrl: GSC_SITE_ID,
      feedpath: `${SITE_URL}/sitemap.xml`
    });
    if (res.status === 204 || res.status === 200) {
      console.log('  ✓ Successfully submitted sitemap.xml to Google Search Console (Status 204/200)');
    } else {
      console.log(`  ✓ GSC Sitemaps response status: ${res.status}`);
    }
  } catch (err) {
    console.error('  ✗ GSC Sitemaps submit error:', err.message);
  }
}

// ── 3. Submit to Google Indexing API ───────────────────────────────────────
async function submitGoogleIndexingApi(auth, urls) {
  console.log(`\n[2/3] Submitting ${urls.length} URLs to Google Indexing API...`);
  try {
    const indexing = google.indexing({ version: 'v3', auth });
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        await indexing.urlNotifications.publish({
          requestBody: {
            url: url,
            type: 'URL_UPDATED'
          }
        });
        successCount++;
        if ((i + 1) % 25 === 0 || i === urls.length - 1) {
          console.log(`  ✓ Processed ${i + 1}/${urls.length} URLs via Google Indexing API`);
        }
      } catch (err) {
        failCount++;
        if (err.message.includes('has not been used in project') || err.message.includes('disabled')) {
          console.log('\n  ⚠️  Google Indexing API is not yet enabled on your Google Cloud project.');
          console.log('  👉 Enable it with 1 click here: https://console.developers.google.com/apis/api/indexing.googleapis.com/overview?project=489481235771');
          console.log('  Once enabled, rerun: npm run submit:indexing\n');
          break;
        } else {
          console.log(`  ✗ Failed to submit ${url}:`, err.message);
        }
      }
    }

    if (successCount > 0) {
      console.log(`  ✓ Google Indexing API Summary: ${successCount} succeeded, ${failCount} failed.`);
    }
  } catch (err) {
    console.error('  ✗ Google Indexing API error:', err.message);
  }
}

// ── 4. Submit to IndexNow (Bing / Microsoft Search / Yandex) ───────────────
async function submitIndexNow(urls) {
  console.log(`\n[3/3] Submitting ${urls.length} URLs to IndexNow (Bing, Yandex, etc.)...`);
  const host = 'g3zcreative.com';
  const apiKey = 'g3zcreative2026indexnow';
  const keyLocation = `${SITE_URL}/${apiKey}.txt`;

  // Write key file to root if not exists
  const keyFilePath = path.join(ROOT, `${apiKey}.txt`);
  if (!fs.existsSync(keyFilePath)) {
    fs.writeFileSync(keyFilePath, apiKey, 'utf8');
  }

  const postData = JSON.stringify({
    host: host,
    key: apiKey,
    keyLocation: keyLocation,
    urlList: urls
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.indexnow.org',
      port: 443,
      path: '/IndexNow',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      if (res.statusCode === 200 || res.statusCode === 202) {
        console.log(`  ✓ IndexNow submission successful! (HTTP ${res.statusCode})`);
      } else {
        console.log(`  ℹ IndexNow response status: HTTP ${res.statusCode}`);
      }
      resolve();
    });

    req.on('error', (e) => {
      console.error(`  ✗ IndexNow request error: ${e.message}`);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

// ── Main Execution ────────────────────────────────────────────────────────
async function main() {
  console.log('================================================================');
  console.log('🚀 G3Z CREATIVE — AUTOMATED SEARCH INDEXING SUBMISSION');
  console.log('================================================================');

  const urls = getSitemapUrls();
  console.log(`Found ${urls.length} URLs in sitemap.xml`);

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`Error: Service account not found at ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: [
      'https://www.googleapis.com/auth/webmasters',
      'https://www.googleapis.com/auth/indexing'
    ]
  });

  const client = await auth.getClient();

  // 1. Google Search Console Sitemap API
  await submitGscSitemap(client);

  // 2. Google Indexing API
  await submitGoogleIndexingApi(client, urls);

  // 3. IndexNow API
  await submitIndexNow(urls);

  console.log('================================================================');
  console.log('✅ Indexing submission process completed.');
  console.log('================================================================\n');
}

main().catch(console.error);

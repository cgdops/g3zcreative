require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { execSync } = require('child_process');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');

const ROOT = path.join(__dirname, '..');
const CREDENTIALS_PATH = path.join(ROOT, '.credentials', 'client-secret.json');
const TOKEN_PATH = path.join(ROOT, '.credentials', 'tokens.json');
const HISTORY_PATH = path.join(ROOT, 'data', 'gsc-history.json');
const CITIES_PATH = path.join(ROOT, 'data', 'cities.json');
const NICHES_PATH = path.join(ROOT, 'data', 'niches.json');
const PSEO_DATA_PATH = path.join(ROOT, 'data', 'pseo-data.json');
const SITE_URL = process.env.GSC_SITE_URL || 'sc-domain:g3zcreative.com';

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`Starting GSC Tracker & Auto-Publisher (Dry Run: ${isDryRun})...`);

  // 1. Authenticate with Google
  const auth = await authenticate();
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  // 2. Fetch GSC Data (last 30 days)
  const gscRows = await fetchGSCData(searchconsole);
  if (!gscRows || gscRows.length === 0) {
    console.log('No data returned from Search Console. Exiting.');
    return;
  }

  // 3. Compare with Historical Metrics
  const history = loadHistory();
  const report = processMetrics(gscRows, history);
  
  if (!isDryRun) {
    saveHistory(gscRows);
  }

  // 4. Identify Gaps & Generate Pages
  const newPages = await findAndGenerateGaps(report.newQueries, isDryRun);

  // 5. Rebuild site if new pages were generated
  let buildSuccess = false;
  if (newPages.length > 0) {
    console.log('\nNew opportunities found. Rebuilding site...');
    try {
      if (!isDryRun) {
        // Regenerate pseo data model
        console.log('Running generate-pseo-data.js...');
        execSync('node scripts/generate-pseo-data.js', { cwd: ROOT, stdio: 'inherit' });
        
        // Build static pages
        console.log('Running build-pseo.js...');
        execSync('node scripts/build-pseo.js', { cwd: ROOT, stdio: 'inherit' });
        
        // Patch navigation links
        console.log('Running patch-nav.js...');
        execSync('node scripts/patch-nav.js', { cwd: ROOT, stdio: 'inherit' });
        
        // Re-generate sitemap.xml
        generateSitemap();
      }
      buildSuccess = true;
      console.log('✓ Rebuild and sitemap update complete.');
    } catch (err) {
      console.error('Error during site rebuild:', err);
    }
  } else {
    console.log('\nNo new landing pages needed to be generated today.');
  }

  // 6. Push to Git (Cloudflare Pages deploy)
  let gitSuccess = false;
  if (newPages.length > 0 && buildSuccess && !isDryRun) {
    gitSuccess = commitAndPush(newPages);
  }

  // 7. Send Email Summary
  await sendEmailSummary(report, newPages, gitSuccess, isDryRun);

  console.log('\nGSC Pipeline execution completed.');
}

/**
 * Authenticates using OAuth2 token or triggers interactive desktop flow
 */
async function authenticate() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Credentials file not found at ${CREDENTIALS_PATH}`);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const clientType = credentials.installed ? 'installed' : 'web';
  const clientSecrets = credentials[clientType];
  const { client_secret, client_id } = clientSecrets;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } else {
    throw new Error(`No OAuth tokens found at ${TOKEN_PATH}. Please run "npm run fetch:gsc" manually first to authenticate.`);
  }
}

/**
 * Fetch top queries from GSC
 */
async function fetchGSCData(searchconsole) {
  console.log(`Fetching Search Console data for property: ${SITE_URL}...`);
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 3); // 3-day lag
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 33); // 30 days before

  const formatDate = (date) => date.toISOString().split('T')[0];

  try {
    const response = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ['query'],
        rowLimit: 100, // Fetch top 100 queries
        searchType: 'web'
      }
    });
    return response.data.rows || [];
  } catch (error) {
    console.error('Error fetching GSC data:', error.message);
    return [];
  }
}

/**
 * Load history JSON
 */
function loadHistory() {
  if (fs.existsSync(HISTORY_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    } catch (e) {
      console.error('Error reading history file, resetting database:', e.message);
    }
  }
  return { lastUpdated: null, history: {} };
}

/**
 * Save history JSON
 */
function saveHistory(gscRows) {
  const history = {
    lastUpdated: new Date().toISOString(),
    history: {}
  };
  gscRows.forEach(row => {
    const query = row.keys[0];
    history.history[query] = {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    };
  });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
  console.log('✓ GSC history database updated.');
}

/**
 * Processes current GSC rows and compares to history to generate stats
 */
function processMetrics(currentRows, oldHistory) {
  const report = {
    gains: [],
    losses: [],
    newQueries: [],
    summary: {
      totalImpressions: 0,
      totalClicks: 0,
      avgPosition: 0
    }
  };

  let totalPos = 0;
  currentRows.forEach(row => {
    const query = row.keys[0];
    report.summary.totalClicks += row.clicks;
    report.summary.totalImpressions += row.impressions;
    totalPos += row.position;

    const oldMetric = oldHistory.history[query];
    if (!oldMetric) {
      // Only include new queries with some minimal traction (e.g. > 1 impression)
      if (row.impressions > 1) {
        report.newQueries.push({
          query,
          clicks: row.clicks,
          impressions: row.impressions,
          position: row.position
        });
      }
    } else {
      const posDiff = oldMetric.position - row.position; // positive = rank improved (e.g. 10 -> 8)
      const clickDiff = row.clicks - oldMetric.clicks;

      if (posDiff >= 1 || clickDiff > 0) {
        report.gains.push({
          query,
          oldPos: oldMetric.position.toFixed(1),
          newPos: row.position.toFixed(1),
          change: (posDiff > 0 ? '+' : '') + posDiff.toFixed(1),
          clicks: row.clicks,
          impressions: row.impressions
        });
      } else if (posDiff <= -1 || clickDiff < 0) {
        report.losses.push({
          query,
          oldPos: oldMetric.position.toFixed(1),
          newPos: row.position.toFixed(1),
          change: posDiff.toFixed(1),
          clicks: row.clicks,
          impressions: row.impressions
        });
      }
    }
  });

  if (currentRows.length > 0) {
    report.summary.avgPosition = (totalPos / currentRows.length).toFixed(1);
  }

  // Sort report items by impressions descending
  report.newQueries.sort((a, b) => b.impressions - a.impressions);
  report.gains.sort((a, b) => b.impressions - a.impressions);
  report.losses.sort((a, b) => b.impressions - a.impressions);

  return report;
}

/**
 * Filter new queries for local home service intent and generate pages
 */
async function findAndGenerateGaps(newQueries, isDryRun) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    console.warn('\n⚠️ GEMINI_API_KEY is not configured in .env. Skipping content generation.');
    return [];
  }

  // Load existing cities & niches to check for redundancy
  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  const niches = JSON.parse(fs.readFileSync(NICHES_PATH, 'utf8'));
  const pseoData = fs.existsSync(PSEO_DATA_PATH) ? JSON.parse(fs.readFileSync(PSEO_DATA_PATH, 'utf8')) : [];
  const existingSlugs = new Set(pseoData.map(p => p.slug));

  const candidateQueries = newQueries.slice(0, 15); // Inspect top 15 new queries
  if (candidateQueries.length === 0) return [];

  console.log('\nAnalyzing search intent content gaps with Gemini...');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: "application/json" } });

  const prompt = `
You are an expert SEO strategist for G3Z Creative, a digital marketing agency that helps home services companies.
Here are the new search queries ranking for our site in GSC:
${JSON.stringify(candidateQueries, null, 2)}

We already have landing pages generated for:
Niches: ${JSON.stringify(niches.map(n => n.name))}
Cities: ${JSON.stringify(cities.map(c => c.name))}

Task:
Analyze these search queries. Do any of them indicate high local home services search intent targeting a city/niche that is NOT already fully covered by our landing pages? (e.g. we might have "roofers" in "Miramar", but the query is about "painters in Hollywood FL" or "deck builders in Davie FL").

If yes, extract and return a JSON array containing NEW niches or NEW cities, and details to generate them.
Do not generate pages for generic searches (e.g. "small businesses near me", "g3z"). Only return entries for concrete local service niches in a specific city/state.

Format the response EXACTLY as a JSON array of objects like this:
[
  {
    "type": "new_combination", // or "new_niche" or "new_city"
    "query": "the search query that triggered this",
    "niche": {
      "slug": "painters", // lowercase, dashed
      "name": "Painting Contractors", // plural, capitalized
      "singular": "Painting Contractor",
      "serviceType": "Painting Services",
      "description": "residential and commercial painting, trim detailing, pressure washing, and drywall repairs." // lowercase singular summary
    },
    "city": {
      "name": "Hollywood", // proper case
      "stateAbbr": "FL", // 2 letter state
      "state": "Florida",
      "county": "Broward County",
      "localDetails": "salty coastal sea-air, high humidity, and historic bungalow preservation rules", // local details relevant to home services
      "landmark": "Hollywood Beach Broadwalk"
    }
  }
]

If no high-intent content gaps are found, return an empty array: []
`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const recommendations = JSON.parse(responseText);

    const generatedPages = [];

    for (const rec of recommendations) {
      const nicheSlug = rec.niche.slug;
      const cityName = rec.city.name;
      const stateAbbr = rec.city.stateAbbr;
      const pageSlug = `${nicheSlug}-in-${cityName.toLowerCase().replace(/\s+/g, '-')}-${stateAbbr.toLowerCase()}`;

      if (existingSlugs.has(pageSlug)) {
        console.log(`- Skipping "${pageSlug}" (already exists)`);
        continue;
      }

      console.log(`\n★ Identified Content Gap! Triggering generation for: ${rec.niche.name} in ${cityName}, ${stateAbbr}`);
      
      if (!isDryRun) {
        // 1. Add Niche if it's new
        const nicheExists = niches.some(n => n.slug === nicheSlug);
        if (!nicheExists) {
          niches.push(rec.niche);
          fs.writeFileSync(NICHES_PATH, JSON.stringify(niches, null, 2), 'utf8');
          console.log(`  Added new niche to niches.json: ${rec.niche.name}`);
        }

        // 2. Add City if it's new
        const cityExists = cities.some(c => c.name.toLowerCase() === cityName.toLowerCase() && c.stateAbbr === stateAbbr);
        if (!cityExists) {
          cities.push(rec.city);
          fs.writeFileSync(CITIES_PATH, JSON.stringify(cities, null, 2), 'utf8');
          console.log(`  Added new city to cities.json: ${cityName}, ${stateAbbr}`);
        }
      }

      generatedPages.push({
        slug: pageSlug,
        title: `${rec.niche.name} in ${cityName}, ${stateAbbr}`,
        query: rec.query
      });
    }

    return generatedPages;

  } catch (err) {
    console.error('Error generating gaps with Gemini:', err.message);
    return [];
  }
}

/**
 * Re-generate sitemap.xml based on files in marketing-for/ and services/
 */
function generateSitemap() {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  const nowStr = new Date().toISOString().split('T')[0];
  
  let urls = [
    'https://g3zcreative.com/',
    'https://g3zcreative.com/pricing.html',
    'https://g3zcreative.com/privacy-policy.html',
    'https://g3zcreative.com/roi-calculator.html'
  ];

  // Scan marketing-for
  const mktDir = path.join(ROOT, 'marketing-for');
  if (fs.existsSync(mktDir)) {
    const files = fs.readdirSync(mktDir);
    files.forEach(file => {
      if (file.endsWith('.html')) {
        urls.push(`https://g3zcreative.com/marketing-for/${file}`);
      }
    });
  }

  // Scan services
  const servicesDir = path.join(ROOT, 'services');
  if (fs.existsSync(servicesDir)) {
    const files = fs.readdirSync(servicesDir);
    files.forEach(file => {
      if (file.endsWith('.html')) {
        urls.push(`https://g3zcreative.com/services/${file}`);
      }
    });
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  urls.forEach(url => {
    xml += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${nowStr}</lastmod>\n  </url>\n`;
  });
  xml += `</urlset>\n`;

  fs.writeFileSync(sitemapPath, xml, 'utf8');
}

/**
 * Commit and push changes to trigger deploy
 */
function commitAndPush(newPages) {
  try {
    console.log('\nCommitting and pushing generated pages to Git...');
    
    // Check if git is clean (excluding our ignored folders)
    execSync('git add data/cities.json data/niches.json sitemap.xml marketing-for/ .env data/gsc-history.json', { cwd: ROOT });
    
    const pageList = newPages.map(p => p.title).join(', ');
    const commitMsg = `Auto-generated SEO landing pages from GSC queries: ${pageList}`;
    
    execSync(`git commit -m "${commitMsg}"`, { cwd: ROOT, stdio: 'inherit' });
    execSync('git push', { cwd: ROOT, stdio: 'inherit' });
    
    console.log('✓ Git push completed. Cloudflare deploy triggered.');
    return true;
  } catch (err) {
    console.error('Git execution failed:', err.message);
    return false;
  }
}

/**
 * Send an email report summarizing the metrics and generated content
 */
async function sendEmailSummary(report, newPages, gitSuccess, isDryRun) {
  const toEmail = 'chris@g3zcreative.com';
  
  // Set up transporter
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = process.env.SMTP_PORT || 587;
  const fromEmail = process.env.SMTP_FROM || 'chris@g3zcreative.com';

  const hasSMTP = smtpHost && smtpUser && smtpPass && smtpHost !== 'YOUR_SMTP_HOST';

  // Construct email body
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">GSC Daily Tracker Summary</h2>
      
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #374151;">30-Day Performance Overview</h3>
        <p style="margin: 5px 0;"><strong>Total Impressions:</strong> ${report.summary.totalImpressions}</p>
        <p style="margin: 5px 0;"><strong>Total Clicks:</strong> ${report.summary.totalClicks}</p>
        <p style="margin: 5px 0;"><strong>Average Position:</strong> ${report.summary.avgPosition}</p>
      </div>
  `;

  // 1. New Pages Generated
  if (newPages.length > 0) {
    html += `
      <h3 style="color: #10b981;">★ Programmatic SEO Pages Published</h3>
      <ul>
    `;
    newPages.forEach(p => {
      html += `<li><strong>${p.title}</strong> (Targeting query: <em>"${p.query}"</em>) &rarr; <a href="https://g3zcreative.com/marketing-for/${p.slug}.html">View Page</a></li>`;
    });
    html += `
      </ul>
      <p><strong>Deployment Status:</strong> ${gitSuccess ? '<span style="color: #10b981; font-weight: bold;">Deployed to Cloudflare</span>' : '<span style="color: #ef4444; font-weight: bold;">Failed / Skip Deploy</span>'}</p>
    `;
  } else {
    html += `<p style="color: #6b7280; font-style: italic;">No new landing pages generated today (no unsatisfied search intents found).</p>`;
  }

  // 2. Rank Gains
  if (report.gains.length > 0) {
    html += `
      <h3 style="color: #2563eb;">Rank Gains (Top 5)</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #eff6ff; border-bottom: 1px solid #bfdbfe;">
            <th style="text-align: left; padding: 8px;">Query</th>
            <th style="text-align: right; padding: 8px;">Pos Change</th>
            <th style="text-align: right; padding: 8px;">Impressions</th>
          </tr>
        </thead>
        <tbody>
    `;
    report.gains.slice(0, 5).forEach(g => {
      html += `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px;">${g.query}</td>
          <td style="text-align: right; padding: 8px; color: #10b981; font-weight: bold;">${g.oldPos} &rarr; ${g.newPos} (${g.change})</td>
          <td style="text-align: right; padding: 8px;">${g.impressions}</td>
        </tr>
      `;
    });
    html += `
        </tbody>
      </table>
    `;
  }

  // 3. New Queries Discovered
  if (report.newQueries.length > 0) {
    html += `
      <h3 style="color: #4f46e5;">New Queries Discovered (Top 5)</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f5f3ff; border-bottom: 1px solid #ddd6fe;">
            <th style="text-align: left; padding: 8px;">Query</th>
            <th style="text-align: right; padding: 8px;">Position</th>
            <th style="text-align: right; padding: 8px;">Impressions</th>
          </tr>
        </thead>
        <tbody>
    `;
    report.newQueries.slice(0, 5).forEach(q => {
      html += `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px;">${q.query}</td>
          <td style="text-align: right; padding: 8px;">${q.position.toFixed(1)}</td>
          <td style="text-align: right; padding: 8px;">${q.impressions}</td>
        </tr>
      `;
    });
    html += `
        </tbody>
      </table>
    `;
  }

  html += `
      <p style="font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 30px;">
        This is an automated SEO report powered by Antigravity at G3Z Creative.
      </p>
    </div>
  `;

  if (hasSMTP) {
    console.log(`Sending summary email to ${toEmail}...`);
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: smtpPort == 465, // true for 465, false for others
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const subject = `GSC Report: ${newPages.length} New Pages Generated — ${new Date().toLocaleDateString()}`;
      await transporter.sendMail({
        from: `G3Z SEO Automation <${fromEmail}>`,
        to: toEmail,
        subject: subject,
        html: html
      });
      console.log('✓ Summary email sent successfully.');
    } catch (err) {
      console.error('Failed to send summary email:', err.message);
    }
  } else {
    console.log('\n--- EMAIL REPORT LOG (SMTP NOT SETUP) ---');
    console.log(`To: ${toEmail}`);
    console.log(`Subject: GSC Report`);
    // Convert HTML to simple console log format
    console.log(html.replace(/<[^>]*>/g, '').trim());
    console.log('-----------------------------------------\n');
    
    // Save to a local report file as backup
    const reportPath = path.join(ROOT, 'data', 'daily-report-backup.html');
    fs.writeFileSync(reportPath, html, 'utf8');
    console.log(`Saved report backup HTML to ${reportPath}`);
  }
}

main().catch(console.error);

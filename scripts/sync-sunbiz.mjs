#!/usr/bin/env node
/**
 * Sunbiz Official Daily SFTP Sync & Smart Enrichment Pipeline
 *
 * Usage:
 *   npm run sync:sunbiz                     # Pull latest daily file from sftp.floridados.gov, filter to South FL, enrich top niches, push to D1
 *   npm run sync:sunbiz -- --date=20261023  # Pull a specific YYYYMMDD daily file from Sunbiz SFTP
 *   npm run sync:sunbiz -- --file=path.txt  # Parse a local Sunbiz fixed-width .txt or .csv file
 *   npm run sync:sunbiz -- --local          # Target local Wrangler D1 database instead of remote
 *   npm run sync:sunbiz -- --dry-run        # Parse & score without writing to D1
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync } from 'child_process';
import dotenv from 'dotenv';
import {
  parseSunbizBulkText,
  enrichOutreachCandidate
} from '../functions/api/crm/_sunbiz.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_FILE_PATH = path.join(REPO_ROOT, '.env');
const DEV_VARS_PATH = path.join(REPO_ROOT, '.dev.vars');

if (fs.existsSync(ENV_FILE_PATH)) {
  dotenv.config({ path: ENV_FILE_PATH, quiet: true });
}
if (fs.existsSync(DEV_VARS_PATH)) {
  const devVars = dotenv.parse(fs.readFileSync(DEV_VARS_PATH, 'utf8'));
  for (const [key, val] of Object.entries(devVars)) {
    if (process.env[key] === undefined || String(process.env[key]).trim() === '') {
      process.env[key] = val;
    }
  }
}

const SFTP_HOST = 'sftp.floridados.gov';
const SFTP_USER = 'Public';
const SFTP_PASS = 'PubAccess1845!';
const REMOTE_COR_DIR = '/Public/doc/cor';

function parseArgs(argv) {
  const args = {
    date: null,
    file: null,
    local: false,
    dryRun: false,
    maxEnrich: 10
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--date=')) args.date = arg.slice('--date='.length);
    else if (arg.startsWith('--file=')) args.file = arg.slice('--file='.length);
    else if (arg === '--local') args.local = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--max-enrich=')) {
      args.maxEnrich = parseInt(arg.slice('--max-enrich='.length), 10) || 10;
    }
  }
  return args;
}

export function getRecentWeekdayDates(specificDate = null) {
  if (specificDate !== null && specificDate !== undefined && specificDate !== '') {
    const cleaned = String(specificDate).trim();
    if (!/^\d{8}$/.test(cleaned)) {
      throw new Error(
        `Invalid --date value "${specificDate}". Expected strict 8-digit YYYYMMDD format (e.g. 20261023).`
      );
    }
    return [cleaned];
  }
  const dates = [];
  const cursor = new Date();
  for (let i = 0; i < 7; i++) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getDate()).padStart(2, '0');
      dates.push(`${yyyy}${mm}${dd}`);
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates;
}

async function downloadSunbizDailyText(dateCandidates) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sunbiz-'));
  const allowInsecureHostKey = process.env.SUNBIZ_INSECURE_SKIP_HOSTKEY === '1';
  const pinnedKnownHost = (
    process.env.SUNBIZ_SFTP_KNOWN_HOST ||
    process.env.SUNBIZ_SFTP_HOST_KEY ||
    ''
  ).trim();

  try {
    let knownHostsFile = null;
    if (pinnedKnownHost) {
      knownHostsFile = path.join(tmpDir, 'known_hosts');
      const hostLine = pinnedKnownHost.startsWith(SFTP_HOST)
        ? pinnedKnownHost
        : `${SFTP_HOST} ${pinnedKnownHost}`;
      fs.writeFileSync(knownHostsFile, `${hostLine}\n`, { encoding: 'utf8', mode: 0o600 });
    } else if (allowInsecureHostKey) {
      console.warn(
        '[Sunbiz Sync] WARNING: SUNBIZ_INSECURE_SKIP_HOSTKEY=1 is set; SSH host key verification is disabled.'
      );
    }

    for (const ymd of dateCandidates) {
      if (!/^\d{8}$/.test(ymd)) {
        throw new Error(`Refusing invalid SFTP date candidate: "${ymd}"`);
      }
      const fileName = `${ymd}c.txt`;
      const localPath = path.join(tmpDir, fileName);
      console.log(`[Sunbiz Sync] Checking official SFTP for ${REMOTE_COR_DIR}/${fileName}...`);

      // Method 1: Try curl if sftp protocol is enabled (strict host-key check unless explicitly opted out)
      const curlArgs = ['-s', '-S', '-f'];
      if (allowInsecureHostKey) {
        curlArgs.push('-k');
      }
      curlArgs.push(
        `sftp://${SFTP_USER}:${SFTP_PASS}@${SFTP_HOST}${REMOTE_COR_DIR}/${fileName}`,
        '-o',
        localPath
      );
      const curlRes = spawnSync('curl', curlArgs, { encoding: 'utf8', timeout: 45000 });

      if (curlRes.status === 0 && fs.existsSync(localPath) && fs.statSync(localPath).size > 500) {
        console.log(
          `[Sunbiz Sync] Downloaded ${fileName} (${(fs.statSync(localPath).size / 1024).toFixed(1)} KB)`
        );
        return fs.readFileSync(localPath, 'utf8');
      }

      // Method 2: Try sshpass + sftp (Linux / GitHub Actions)
      const sftpArgs = ['-p', SFTP_PASS, 'sftp', '-oBatchMode=no'];
      if (knownHostsFile) {
        sftpArgs.push('-oStrictHostKeyChecking=yes', `-oUserKnownHostsFile=${knownHostsFile}`);
      } else if (allowInsecureHostKey) {
        sftpArgs.push('-oStrictHostKeyChecking=no');
      } else {
        sftpArgs.push('-oStrictHostKeyChecking=yes');
      }
      sftpArgs.push(`${SFTP_USER}@${SFTP_HOST}:${REMOTE_COR_DIR}/${fileName}`, localPath);

      const sshpassRes = spawnSync('sshpass', sftpArgs, { encoding: 'utf8', timeout: 45000 });

      if (sshpassRes.status === 0 && fs.existsSync(localPath) && fs.statSync(localPath).size > 500) {
        console.log(`[Sunbiz Sync] Downloaded ${fileName} via sshpass+sftp`);
        return fs.readFileSync(localPath, 'utf8');
      }
    }

    throw new Error(
      `Could not download direct SFTP file automatically in this shell (ensure SUNBIZ_SFTP_KNOWN_HOST or ~/.ssh/known_hosts contains ${SFTP_HOST}, or pass --file=<path-to-sunbiz-file.txt>).`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function sqlString(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const cleaned = String(val).replace(/\0/g, '').replace(/'/g, "''");
  return cleaned === '' ? 'NULL' : `'${cleaned}'`;
}

async function main() {
  const args = parseArgs(process.argv);

  let rawText = '';
  if (args.file) {
    const resolved = path.resolve(args.file);
    if (!fs.existsSync(resolved)) {
      console.error(`File not found: ${resolved}`);
      process.exit(1);
    }
    console.log(`[Sunbiz Sync] Reading local file: ${resolved}`);
    rawText = fs.readFileSync(resolved, 'utf8');
  } else {
    const dates = getRecentWeekdayDates(args.date);
    rawText = await downloadSunbizDailyText(dates);
  }

  const candidates = parseSunbizBulkText(rawText, {
    requireSouthFlorida: true,
    excludeShells: true
  });

  console.log(`[Sunbiz Sync] Parsed ${candidates.length} South Florida operating business candidates (shells excluded).`);
  if (candidates.length === 0) {
    return;
  }

  candidates.sort((a, b) => b.score - a.score);

  const env = {
    DATAFORSEO_LOGIN: process.env.DATAFORSEO_LOGIN,
    DATAFORSEO_PASSWORD: process.env.DATAFORSEO_PASSWORD,
    ENRICHMENT_API_KEY: process.env.ENRICHMENT_API_KEY || process.env.HUNTER_API_KEY || process.env.HUNTER_API,
    ENRICHMENT_PROVIDER: process.env.ENRICHMENT_PROVIDER || 'hunter',
    APOLLO_API_KEY: process.env.APOLLO_API_KEY || process.env.APOLLO_API,
    PDL_API_KEY: process.env.PDL_API_KEY || process.env.PDL_API
  };

  const hasEnrichment = Boolean(
    env.ENRICHMENT_API_KEY || env.APOLLO_API_KEY || env.PDL_API_KEY || (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)
  );

  if (hasEnrichment && args.maxEnrich > 0) {
    const toEnrich = candidates.filter(c => c.score >= 80 && !c.email).slice(0, args.maxEnrich);
    console.log(`[Sunbiz Sync] Running Smart Hybrid Enrichment on top ${toEnrich.length} high-priority candidates...`);
    for (const cand of toEnrich) {
      try {
        // Use pre-calibrated DataForSEO county/niche search volume during bulk sync
        const enr = await enrichOutreachCandidate(cand, { ...env, SKIP_LIVE_VOLUME_IN_BULK: true });
        if (enr.email) cand.email = enr.email;
        if (enr.phone) cand.phone = enr.phone;
        if (enr.website) cand.website = enr.website;
        cand.enrichment_status = enr.status;
        cand.enrichment_source = enr.source;
        cand.enrichment_confidence = enr.confidence;
        cand.enrichment_meta = JSON.stringify(enr.meta || {});
        console.log(`  -> ${cand.business_name_clean} (${cand.founder_name}, ${cand.city}): ${enr.status} [email=${cand.email || 'none'}, phone=${cand.phone || 'none'}, src=${cand.enrichment_source || 'none'}]`);
      } catch (err) {
        console.warn(`  -> Enrichment error for ${cand.business_name_clean}: ${err.message}`);
      }
    }
  }

  if (args.dryRun) {
    console.log('[Sunbiz Sync] Dry run complete. Top candidates:');
    console.table(candidates.slice(0, 10).map(c => ({
      doc: c.doc_number,
      business: c.business_name_clean,
      founder: c.founder_name,
      city: c.city,
      niche: c.niche,
      score: c.score,
      email: c.email || '-',
      phone: c.phone || '-'
    })));
    return;
  }

  const sqlStatements = [
    `CREATE TABLE IF NOT EXISTS outreach_candidates (
      id TEXT PRIMARY KEY, doc_number TEXT UNIQUE, business_name TEXT NOT NULL, business_name_clean TEXT NOT NULL,
      entity_type TEXT DEFAULT 'FL LLC', filing_date TEXT, founder_name TEXT NOT NULL, founder_first_name TEXT,
      founder_last_name TEXT, founder_title TEXT, secondary_officers TEXT, registered_agent TEXT,
      principal_address TEXT, mailing_address TEXT, city TEXT, state TEXT DEFAULT 'FL', zip TEXT, county TEXT,
      niche TEXT DEFAULT 'Local Business', score INTEGER DEFAULT 50, email TEXT, phone TEXT, website TEXT,
      enrichment_status TEXT DEFAULT 'unattempted', enrichment_source TEXT, enrichment_confidence INTEGER,
      enrichment_meta TEXT, enriched_at DATETIME, outreach_status TEXT DEFAULT 'uncontacted',
      emailed_at DATETIME, last_subject TEXT, lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL, notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  ];

  for (const c of candidates) {
    sqlStatements.push(`
      INSERT INTO outreach_candidates (
        id, doc_number, business_name, business_name_clean, entity_type, filing_date,
        founder_name, founder_first_name, founder_last_name, founder_title, secondary_officers,
        registered_agent, principal_address, mailing_address, city, state, zip, county,
        niche, score, email, phone, website, enrichment_status, enrichment_source,
        enrichment_confidence, enrichment_meta, outreach_status
      ) VALUES (
        ${sqlString(c.id)}, ${sqlString(c.doc_number)}, ${sqlString(c.business_name)}, ${sqlString(c.business_name_clean)},
        ${sqlString(c.entity_type)}, ${sqlString(c.filing_date)}, ${sqlString(c.founder_name)}, ${sqlString(c.founder_first_name)},
        ${sqlString(c.founder_last_name)}, ${sqlString(c.founder_title)}, ${sqlString(c.secondary_officers)},
        ${sqlString(c.registered_agent)}, ${sqlString(c.principal_address)}, ${sqlString(c.mailing_address)},
        ${sqlString(c.city)}, ${sqlString(c.state)}, ${sqlString(c.zip)}, ${sqlString(c.county)},
        ${sqlString(c.niche)}, ${Number(c.score) || 50}, ${sqlString(c.email)}, ${sqlString(c.phone)},
        ${sqlString(c.website)}, ${sqlString(c.enrichment_status)}, ${sqlString(c.enrichment_source)},
        ${c.enrichment_confidence ? Number(c.enrichment_confidence) : 'NULL'}, ${sqlString(c.enrichment_meta)}, 'uncontacted'
      )
      ON CONFLICT(doc_number) DO UPDATE SET
        email = COALESCE(excluded.email, outreach_candidates.email),
        phone = COALESCE(excluded.phone, outreach_candidates.phone),
        website = COALESCE(excluded.website, outreach_candidates.website),
        enrichment_status = CASE WHEN excluded.enrichment_status != 'unattempted' THEN excluded.enrichment_status ELSE outreach_candidates.enrichment_status END,
        enrichment_source = COALESCE(excluded.enrichment_source, outreach_candidates.enrichment_source),
        enrichment_confidence = COALESCE(excluded.enrichment_confidence, outreach_candidates.enrichment_confidence),
        enrichment_meta = CASE WHEN excluded.enrichment_meta IS NOT NULL AND excluded.enrichment_meta != '{}' THEN excluded.enrichment_meta ELSE outreach_candidates.enrichment_meta END,
        updated_at = CURRENT_TIMESTAMP;
    `);
  }

  const cfToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_GITHUB_API;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (args.local || (cfToken && cfAccountId)) {
    const tmpSqlPath = path.join(os.tmpdir(), `sunbiz_sync_${Date.now()}.sql`);
    fs.writeFileSync(tmpSqlPath, sqlStatements.join('\n'), 'utf8');
    const d1Flag = args.local ? '--local' : '--remote';
    console.log(`[Sunbiz Sync] Executing Wrangler D1 batch import (${d1Flag}) for ${candidates.length} candidates...`);

    try {
      execFileSync(
        'npx',
        ['wrangler', 'd1', 'execute', 'g3zcreative-crm', d1Flag, `--file=${tmpSqlPath}`],
        {
          stdio: 'inherit',
          shell: process.platform === 'win32',
          env: {
            ...process.env,
            CLOUDFLARE_API_TOKEN: cfToken || process.env.CLOUDFLARE_API_TOKEN
          }
        }
      );
      console.log(`[Sunbiz Sync] Successfully synced ${candidates.length} South Florida candidates to D1 (${d1Flag})!`);
      return;
    } catch (d1Err) {
      if (args.local) throw d1Err;
      console.warn(`[Sunbiz Sync] Wrangler D1 CLI returned an error (${d1Err.message}); falling back to CRM Worker API...`);
    } finally {
      if (fs.existsSync(tmpSqlPath)) fs.unlinkSync(tmpSqlPath);
    }
  }

  // Fallback remote upload via authenticated CRM API
  const crmApiUrl = (process.env.CRM_API_URL || 'https://g3zcreative.com').replace(/\/+$/, '');
  const crmKey = (process.env.CRM_PASSCODE || '').trim();
  if (!crmKey) {
    throw new Error(
      'Missing CRM_PASSCODE environment variable. Set CRM_PASSCODE in .env or .dev.vars before uploading candidates to the CRM API.'
    );
  }
  const batchSize = 100;
  let totalInserted = 0;
  let totalUpdated = 0;

  console.log(`[Sunbiz Sync] Uploading ${candidates.length} South Florida candidates to ${crmApiUrl}/api/crm/outreach in batches of ${batchSize}...`);

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const res = await fetch(`${crmApiUrl}/api/crm/outreach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CRM-Key': crmKey
      },
      body: JSON.stringify({
        candidates: batch,
        require_south_fl: true,
        exclude_shells: true,
        auto_enrich_top: false
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`CRM API batch upload failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    totalInserted += Number(data.inserted || 0);
    totalUpdated += Number(data.updated || 0);
    console.log(`  -> Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(candidates.length / batchSize)}: +${data.inserted || 0} inserted, ${data.updated || 0} updated`);
  }

  console.log(`[Sunbiz Sync] Successfully synced ${candidates.length} South Florida candidates to production D1 (${totalInserted} new, ${totalUpdated} updated)!`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(err => {
    console.error('[Sunbiz Sync Error]', err.message);
    process.exit(1);
  });
}

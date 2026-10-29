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
import { execFileSync, spawnSync } from 'child_process';
import dotenv from 'dotenv';
import {
  parseSunbizBulkText,
  enrichOutreachCandidate
} from '../functions/api/crm/_sunbiz.js';

dotenv.config();

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
    if (arg.startsWith('--date=')) args.date = arg.split('=')[1];
    else if (arg.startsWith('--file=')) args.file = arg.split('=')[1];
    else if (arg === '--local') args.local = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--max-enrich=')) args.maxEnrich = parseInt(arg.split('=')[1], 10) || 10;
  }
  return args;
}

function getRecentWeekdayDates(specificDate = null) {
  if (specificDate) return [specificDate.replace(/-/g, '')];
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

async function downloadSunbizDailyFile(dateCandidates) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sunbiz-'));

  for (const ymd of dateCandidates) {
    const fileName = `${ymd}c.txt`;
    const localPath = path.join(tmpDir, fileName);
    console.log(`[Sunbiz Sync] Checking official SFTP for ${REMOTE_COR_DIR}/${fileName}...`);

    // Method 1: Try curl if sftp protocol is enabled
    const curlRes = spawnSync('curl', [
      '-s', '-S', '-f', '-k',
      `sftp://${SFTP_USER}:${SFTP_PASS}@${SFTP_HOST}${REMOTE_COR_DIR}/${fileName}`,
      '-o', localPath
    ], { encoding: 'utf8', timeout: 45000 });

    if (curlRes.status === 0 && fs.existsSync(localPath) && fs.statSync(localPath).size > 500) {
      console.log(`[Sunbiz Sync] Downloaded ${fileName} (${(fs.statSync(localPath).size / 1024).toFixed(1)} KB)`);
      return localPath;
    }

    // Method 2: Try sshpass + sftp (Linux / GitHub Actions)
    const sshpassRes = spawnSync('sshpass', [
      '-p', SFTP_PASS,
      'sftp',
      '-oBatchMode=no',
      '-oStrictHostKeyChecking=no',
      `${SFTP_USER}@${SFTP_HOST}:${REMOTE_COR_DIR}/${fileName}`,
      localPath
    ], { encoding: 'utf8', timeout: 45000 });

    if (sshpassRes.status === 0 && fs.existsSync(localPath) && fs.statSync(localPath).size > 500) {
      console.log(`[Sunbiz Sync] Downloaded ${fileName} via sshpass+sftp`);
      return localPath;
    }
  }

  throw new Error(
    `Could not download direct SFTP file automatically in this shell (Windows curl disables SFTP protocol by default). ` +
    `Run via the GitHub Action workflow (.github/workflows/sunbiz-outreach-sync.yml) or pass --file=<path-to-sunbiz-file.txt>.`
  );
}

function sqlString(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
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
    const downloadedPath = await downloadSunbizDailyFile(dates);
    rawText = fs.readFileSync(downloadedPath, 'utf8');
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
    ENRICHMENT_API_KEY: process.env.ENRICHMENT_API_KEY,
    ENRICHMENT_PROVIDER: process.env.ENRICHMENT_PROVIDER || 'hunter',
    APOLLO_API_KEY: process.env.APOLLO_API_KEY,
    PDL_API_KEY: process.env.PDL_API_KEY
  };

  const hasEnrichment = Boolean(
    env.ENRICHMENT_API_KEY || env.APOLLO_API_KEY || env.PDL_API_KEY || (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)
  );

  if (hasEnrichment && args.maxEnrich > 0) {
    const toEnrich = candidates.filter(c => c.score >= 80 && !c.email).slice(0, args.maxEnrich);
    console.log(`[Sunbiz Sync] Running Smart Hybrid Enrichment on top ${toEnrich.length} high-priority candidates...`);
    for (const cand of toEnrich) {
      try {
        const enr = await enrichOutreachCandidate(cand, env);
        if (enr.email) cand.email = enr.email;
        if (enr.phone) cand.phone = enr.phone;
        if (enr.website) cand.website = enr.website;
        cand.enrichment_status = enr.status;
        cand.enrichment_source = enr.source;
        cand.enrichment_confidence = enr.confidence;
        cand.enrichment_meta = JSON.stringify(enr.meta || {});
        console.log(`  -> ${cand.business_name_clean} (${cand.founder_name}): ${enr.status} [email=${cand.email || 'none'}, phone=${cand.phone || 'none'}]`);
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
      emailed_at DATETIME, last_subject TEXT, lead_id TEXT, notes TEXT,
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
        updated_at = CURRENT_TIMESTAMP;
    `);
  }

  const tmpSqlPath = path.join(os.tmpdir(), `sunbiz_sync_${Date.now()}.sql`);
  fs.writeFileSync(tmpSqlPath, sqlStatements.join('\n'), 'utf8');

  const d1Flag = args.local ? '--local' : '--remote';
  console.log(`[Sunbiz Sync] Executing D1 batch import (${d1Flag}) for ${candidates.length} candidates...`);

  try {
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['wrangler', 'd1', 'execute', 'g3zcreative-crm', d1Flag, `--file=${tmpSqlPath}`],
      { stdio: 'inherit' }
    );
    console.log(`[Sunbiz Sync] Successfully synced ${candidates.length} South Florida candidates to D1!`);
  } finally {
    if (fs.existsSync(tmpSqlPath)) fs.unlinkSync(tmpSqlPath);
  }
}

main().catch(err => {
  console.error('[Sunbiz Sync Error]', err.message);
  process.exit(1);
});

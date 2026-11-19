#!/usr/bin/env node
/**
 * Google Maps "Page 2 Bleeders" Discovery, Live Technical Diagnostic,
 * Tier Classification, Smart Enrichment & Cloudflare D1 Sync Pipeline
 *
 * Usage:
 *   npm run sync:maps -- --city="Pembroke Pines" --niche="Roofing" --dry-run
 *   npm run sync:outreach -- --city=top --niche=top --local
 *   npm run sync:maps -- --fixture --dry-run
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import {
  SOUTH_FL_CITIES,
  NICHE_RULES,
  normalizeSouthFlCity,
  matchSouthFloridaLocation,
  cleanBusinessName,
  toTitleCase,
  getNicheOutreachMeta,
  enrichOutreachCandidate
} from '../functions/api/crm/_outreach_engine.js';
import {
  normalizeDomain,
  isValidCompanyDomain
} from '../functions/api/crm/_enrich.js';

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

// Dynamically load ../functions/api/crm/_outreach_engine.js when present
let outreachEngineModule = null;
async function getOutreachEngine() {
  if (outreachEngineModule) return outreachEngineModule;
  try {
    outreachEngineModule = await import('../functions/api/crm/_outreach_engine.js');
    return outreachEngineModule;
  } catch (_) {
    return {};
  }
}

// ---------------------------------------------------------------------------
// 1. Canonical Defaults & Argument Parser
// ---------------------------------------------------------------------------
export const DEFAULT_TOP_CITIES = [
  'Miramar',
  'Pembroke Pines',
  'Hollywood',
  'Davie',
  'Fort Lauderdale'
];

export const DEFAULT_TOP_NICHES = [
  'Roofing',
  'HVAC',
  'Plumbing',
  'Electrical'
];

const CANONICAL_NICHES_MAP = new Map([
  ['roofing', 'Roofing'],
  ['roofer', 'Roofing'],
  ['roofers', 'Roofing'],
  ['hvac', 'HVAC'],
  ['ac', 'HVAC'],
  ['air conditioning', 'HVAC'],
  ['plumbing', 'Plumbing'],
  ['plumber', 'Plumbing'],
  ['plumbers', 'Plumbing'],
  ['electrical', 'Electrical'],
  ['electrician', 'Electrical'],
  ['electricians', 'Electrical'],
  ['landscaping', 'Landscaping & Lawn'],
  ['landscaping & lawn', 'Landscaping & Lawn'],
  ['lawn', 'Landscaping & Lawn'],
  ['construction', 'Construction & Remodeling'],
  ['remodeling', 'Construction & Remodeling'],
  ['construction & remodeling', 'Construction & Remodeling'],
  ['pool', 'Pool & Outdoor'],
  ['pool & outdoor', 'Pool & Outdoor'],
  ['pest control', 'Pest Control & Mold'],
  ['pest control & mold', 'Pest Control & Mold'],
  ['mold', 'Pest Control & Mold'],
  ['cleaning', 'Cleaning & Property Care'],
  ['cleaning & property care', 'Cleaning & Property Care'],
  ['medical', 'Medical, Dental & Wellness'],
  ['dental', 'Medical, Dental & Wellness'],
  ['medical, dental & wellness', 'Medical, Dental & Wellness'],
  ['fitness', 'Fitness & Studios'],
  ['fitness & studios', 'Fitness & Studios'],
  ['legal', 'Legal & Accounting'],
  ['legal & accounting', 'Legal & Accounting'],
  ['auto', 'Auto & Marine'],
  ['auto & marine', 'Auto & Marine']
]);

function normalizeNicheToken(rawNiche) {
  const cleaned = String(rawNiche || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!cleaned) return '';
  const lower = cleaned.toLowerCase();
  if (CANONICAL_NICHES_MAP.has(lower)) {
    return CANONICAL_NICHES_MAP.get(lower);
  }
  const matchedRule = NICHE_RULES.find(
    r => r.niche.toLowerCase() === lower || r.pattern.test(cleaned)
  );
  if (matchedRule) return matchedRule.niche;
  return toTitleCase(cleaned);
}

function normalizeCityToken(rawCity) {
  const cleaned = String(rawCity || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!cleaned) return '';
  const normalized = normalizeSouthFlCity(cleaned);
  return normalized || toTitleCase(cleaned);
}

function clampInt(val, min, max, defaultVal) {
  const parsed = parseInt(String(val ?? ''), 10);
  if (!Number.isFinite(parsed)) return defaultVal;
  return Math.min(max, Math.max(min, parsed));
}

function parseNonNegativeInt(val, defaultVal) {
  if (val === undefined || val === null || String(val).trim() === '') return defaultVal;
  const parsed = parseInt(String(val).trim(), 10);
  if (!Number.isFinite(parsed)) return defaultVal;
  return Math.max(0, parsed);
}

/**
 * Parse and validate CLI arguments for `scripts/sync-maps-outreach.mjs`.
 * Accepts `process.argv`, a raw array of CLI flag strings, or an options object.
 */
export function parseSyncMapsArgs(argv = process.argv) {
  if (argv && typeof argv === 'object' && !Array.isArray(argv)) {
    const rawCity = argv.city ?? argv.cities ?? 'top';
    const rawNiche = argv.niche ?? argv.niches ?? 'top';
    const builtFlags = [];
    if (Array.isArray(rawCity)) builtFlags.push(`--city=${rawCity.join(',')}`);
    else if (rawCity) builtFlags.push(`--city=${rawCity}`);
    if (Array.isArray(rawNiche)) builtFlags.push(`--niche=${rawNiche.join(',')}`);
    else if (rawNiche) builtFlags.push(`--niche=${rawNiche}`);
    if (argv.rankMin !== undefined || argv.rank_min !== undefined) {
      builtFlags.push(`--rank-min=${argv.rankMin ?? argv.rank_min}`);
    }
    if (argv.rankMax !== undefined || argv.rank_max !== undefined) {
      builtFlags.push(`--rank-max=${argv.rankMax ?? argv.rank_max}`);
    }
    if (argv.minReviews !== undefined || argv.min_reviews !== undefined) {
      builtFlags.push(`--min-reviews=${argv.minReviews ?? argv.min_reviews}`);
    }
    if (argv.maxReviews !== undefined || argv.max_reviews !== undefined) {
      builtFlags.push(`--max-reviews=${argv.maxReviews ?? argv.max_reviews}`);
    }
    if (argv.maxAudit !== undefined || argv.max_audit !== undefined) {
      builtFlags.push(`--max-audit=${argv.maxAudit ?? argv.max_audit}`);
    }
    if (argv.maxEnrich !== undefined || argv.max_enrich !== undefined) {
      builtFlags.push(`--max-enrich=${argv.maxEnrich ?? argv.max_enrich}`);
    }
    if (argv.local) builtFlags.push('--local');
    if (argv.dryRun || argv.dry_run) builtFlags.push('--dry-run');
    if (argv.fixture || argv.offline) builtFlags.push('--fixture');
    return parseSyncMapsArgs(builtFlags);
  }

  const tokens = Array.isArray(argv) ? argv.map(a => String(a ?? '')) : [];
  // Support both process.argv ([node, script, ...flags]) and direct flag arrays (['--city=Miramar', ...])
  const startIndex =
    tokens.length >= 2 &&
    !tokens[0].startsWith('-') &&
    !tokens[1].startsWith('-')
      ? 2
      : 0;

  let rawCityArg = 'top';
  let rawNicheArg = 'top';
  let rawRankMin = 6;
  let rawRankMax = 25;
  let rawMinReviews = 5;
  let rawMaxReviews = 120;
  let rawMaxAudit = 20;
  let rawMaxEnrich = 10;
  let local = false;
  let dryRun = false;
  let fixture = false;

  for (let i = startIndex; i < tokens.length; i++) {
    const arg = tokens[i].trim();
    if (!arg) continue;

    const readNextOrEq = (prefix, consumeMultiWord = false) => {
      let initial = null;
      if (arg.startsWith(`${prefix}=`)) {
        initial = arg.slice(prefix.length + 1).replace(/^["']+|["']+$/g, '').trim();
      } else if (arg === prefix && i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        i += 1;
        initial = tokens[i].replace(/^["']+|["']+$/g, '').trim();
      }
      if (initial === null) return null;
      if (consumeMultiWord) {
        const parts = [initial];
        while (i + 1 < tokens.length && !tokens[i + 1].trim().startsWith('--')) {
          i += 1;
          parts.push(tokens[i].replace(/^["']+|["']+$/g, '').trim());
        }
        return parts.filter(Boolean).join(' ');
      }
      return initial;
    };

    let val;
    if ((val = readNextOrEq('--city', true)) !== null || (val = readNextOrEq('--cities', true)) !== null) {
      rawCityArg = val || 'top';
    } else if ((val = readNextOrEq('--niche', true)) !== null || (val = readNextOrEq('--niches', true)) !== null) {
      rawNicheArg = val || 'top';
    } else if ((val = readNextOrEq('--rank-min')) !== null) {
      rawRankMin = val;
    } else if ((val = readNextOrEq('--rank-max')) !== null) {
      rawRankMax = val;
    } else if ((val = readNextOrEq('--min-reviews')) !== null) {
      rawMinReviews = val;
    } else if ((val = readNextOrEq('--max-reviews')) !== null) {
      rawMaxReviews = val;
    } else if ((val = readNextOrEq('--max-audit')) !== null) {
      rawMaxAudit = val;
    } else if ((val = readNextOrEq('--max-enrich')) !== null) {
      rawMaxEnrich = val;
    } else if (arg === '--local') {
      local = true;
    } else if (arg === '--dry-run' || arg === '--dryrun') {
      dryRun = true;
    } else if (arg === '--fixture' || arg === '--offline') {
      fixture = true;
    } else if (arg.startsWith('--fixture=') || arg.startsWith('--offline=')) {
      const boolStr = arg.split('=')[1]?.trim().toLowerCase();
      fixture = boolStr !== 'false' && boolStr !== '0';
    }
  }

  // Resolve canonical cities
  const cityLower = String(rawCityArg || 'top').trim().toLowerCase();
  let cities = [];
  if (!cityLower || cityLower === 'top' || cityLower === 'all') {
    cities = [...DEFAULT_TOP_CITIES];
  } else {
    cities = String(rawCityArg)
      .split(',')
      .map(normalizeCityToken)
      .filter(Boolean);
    if (cities.length === 0) cities = [...DEFAULT_TOP_CITIES];
  }

  // Resolve canonical niches
  const nicheLower = String(rawNicheArg || 'top').trim().toLowerCase();
  let niches = [];
  if (!nicheLower || nicheLower === 'top' || nicheLower === 'all') {
    niches = [...DEFAULT_TOP_NICHES];
  } else {
    niches = String(rawNicheArg)
      .split(',')
      .map(normalizeNicheToken)
      .filter(Boolean);
    if (niches.length === 0) niches = [...DEFAULT_TOP_NICHES];
  }

  let rankMin = clampInt(rawRankMin, 1, 50, 6);
  let rankMax = clampInt(rawRankMax, 1, 50, 25);
  if (rankMin > rankMax) {
    const tmp = rankMin;
    rankMin = rankMax;
    rankMax = tmp;
  }

  let minReviews = parseNonNegativeInt(rawMinReviews, 5);
  let maxReviews = parseNonNegativeInt(rawMaxReviews, 120);
  if (maxReviews < minReviews) {
    maxReviews = minReviews;
  }

  const maxAudit = parseNonNegativeInt(rawMaxAudit, 20);
  const maxEnrich = parseNonNegativeInt(rawMaxEnrich, 10);

  return {
    city: cities.length === 1 ? cities[0] : cities.join(', '),
    cities,
    niche: niches.length === 1 ? niches[0] : niches.join(', '),
    niches,
    rankMin,
    rank_min: rankMin,
    rankMax,
    rank_max: rankMax,
    minReviews,
    min_reviews: minReviews,
    maxReviews,
    max_reviews: maxReviews,
    maxAudit,
    max_audit: maxAudit,
    maxEnrich,
    max_enrich: maxEnrich,
    local,
    dryRun,
    dry_run: dryRun,
    fixture,
    offline: fixture
  };
}

// ---------------------------------------------------------------------------
// 2. SQL Escaping & Upsert Statement Builders
// ---------------------------------------------------------------------------
export function sqlString(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  const cleaned = str.replace(/\0/g, '').replace(/'/g, "''");
  return cleaned === '' ? 'NULL' : `'${cleaned}'`;
}

export function sqlNumber(val, fallback = null) {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') {
    if (fallback !== null && fallback !== undefined && Number.isFinite(Number(fallback))) {
      return String(Number(fallback));
    }
    return 'NULL';
  }
  const num = Number(val);
  if (!Number.isFinite(num)) {
    if (fallback !== null && fallback !== undefined && Number.isFinite(Number(fallback))) {
      return String(Number(fallback));
    }
    return 'NULL';
  }
  return String(num);
}

/**
 * Generate schema creation & migration guard SQL statements for D1.
 */
export function getSchemaInitSqlStatements() {
  return [
    `CREATE TABLE IF NOT EXISTS outreach_candidates (
      id TEXT PRIMARY KEY,
      doc_number TEXT UNIQUE,
      business_name TEXT NOT NULL,
      business_name_clean TEXT NOT NULL,
      entity_type TEXT DEFAULT 'Google Maps GBP',
      filing_date TEXT,
      founder_name TEXT NOT NULL,
      founder_first_name TEXT,
      founder_last_name TEXT,
      founder_title TEXT,
      secondary_officers TEXT,
      registered_agent TEXT,
      principal_address TEXT,
      mailing_address TEXT,
      city TEXT,
      state TEXT DEFAULT 'FL',
      zip TEXT,
      county TEXT,
      niche TEXT DEFAULT 'Local Business',
      score INTEGER DEFAULT 50,
      email TEXT,
      phone TEXT,
      website TEXT,
      enrichment_status TEXT DEFAULT 'unattempted',
      enrichment_source TEXT,
      enrichment_confidence INTEGER,
      enrichment_meta TEXT,
      enriched_at DATETIME,
      outreach_status TEXT DEFAULT 'uncontacted',
      emailed_at DATETIME,
      last_subject TEXT,
      lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
      notes TEXT,
      place_id TEXT,
      cid TEXT,
      gbp_rank INTEGER,
      review_count INTEGER,
      rating REAL,
      gbp_category TEXT,
      top_competitors TEXT,
      lcp_ms INTEGER,
      performance_score INTEGER,
      has_schema INTEGER DEFAULT 0,
      has_ssl INTEGER DEFAULT 0,
      website_status TEXT,
      recommended_tier TEXT,
      pain_summary TEXT,
      cadence_step INTEGER DEFAULT 0,
      next_action_at DATETIME,
      last_channel TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_place_id ON outreach_candidates(place_id);`,
    `CREATE INDEX IF NOT EXISTS idx_outreach_tier_score ON outreach_candidates(outreach_status, recommended_tier, score DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_outreach_rank_reviews ON outreach_candidates(gbp_rank, review_count DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_outreach_next_action ON outreach_candidates(next_action_at ASC);`
  ];
}

/**
 * Build a safe, SQL-injection-proof D1 `INSERT INTO outreach_candidates ... ON CONFLICT(doc_number) DO UPDATE SET ...` statement
 * for a single candidate record, preserving all Google Maps & Business Listings Diagnostic Pivot columns.
 */
export function buildUpsertSqlForCandidate(c) {
  if (!c || typeof c !== 'object') {
    throw new Error('buildUpsertSqlForCandidate requires a candidate object.');
  }

  const placeId = c.place_id ? String(c.place_id).trim() : '';
  const fallbackDoc = placeId
    ? `MAP_${placeId.replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase()}`
    : `MAP_${Date.now().toString(36).toUpperCase()}`;
  const docNum = String(c.doc_number || fallbackDoc).trim();
  const id = String(c.id || `map_${docNum.toLowerCase().replace(/[^a-z0-9]/g, '')}`).trim();
  const businessName = String(c.business_name || c.business_name_clean || 'Local Business').trim();
  const businessNameClean = String(c.business_name_clean || cleanBusinessName(businessName) || businessName).trim();
  const founderName = String(c.founder_name || 'Owner').trim();
  const founderFirst = String(c.founder_first_name ?? (founderName === 'Owner' ? '' : founderName.split(/\s+/)[0] || '')).trim();
  const founderLast = String(c.founder_last_name ?? (founderName === 'Owner' ? '' : founderName.split(/\s+/).slice(1).join(' ') || '')).trim();

  const gbpRank = c.gbp_rank ?? c.maps_rank ?? c.rank ?? null;
  const reviewCount = c.review_count ?? c.reviews_count ?? c.reviews ?? null;
  const rating = c.rating ?? null;
  const lcpMs = c.lcp_ms ?? c.lcpMs ?? null;
  const perfScore = c.performance_score ?? c.performanceScore ?? null;
  const hasSchema = c.has_schema === true || c.has_schema === 1 || c.hasSchema === true || c.hasSchema === 1 ? 1 : 0;
  const hasSsl = c.has_ssl === true || c.has_ssl === 1 || c.hasSsl === true || c.hasSsl === 1 ? 1 : 0;
  const cadenceStep = Number.isFinite(Number(c.cadence_step)) ? Number(c.cadence_step) : 0;

  const topCompetitorsStr =
    typeof c.top_competitors === 'string'
      ? c.top_competitors
      : Array.isArray(c.top_competitors)
        ? JSON.stringify(c.top_competitors)
        : Array.isArray(c.topCompetitors)
          ? JSON.stringify(c.topCompetitors)
          : null;

  const enrichmentMetaStr =
    typeof c.enrichment_meta === 'string'
      ? c.enrichment_meta
      : JSON.stringify(c.enrichment_meta || {});

  const secondaryOfficersStr =
    typeof c.secondary_officers === 'string'
      ? c.secondary_officers
      : JSON.stringify(c.secondary_officers || []);

  const idValueSql = placeId
    ? `COALESCE((SELECT id FROM outreach_candidates WHERE place_id = ${sqlString(placeId)} LIMIT 1), ${sqlString(id)})`
    : sqlString(id);

  const docNumValueSql = placeId
    ? `COALESCE((SELECT doc_number FROM outreach_candidates WHERE place_id = ${sqlString(placeId)} LIMIT 1), ${sqlString(docNum)})`
    : sqlString(docNum);

  return `
INSERT INTO outreach_candidates (
  id, doc_number, business_name, business_name_clean, entity_type, filing_date,
  founder_name, founder_first_name, founder_last_name, founder_title, secondary_officers,
  registered_agent, principal_address, mailing_address, city, state, zip, county,
  niche, score, email, phone, website, enrichment_status, enrichment_source,
  enrichment_confidence, enrichment_meta, outreach_status, notes,
  place_id, cid, gbp_rank, review_count, rating, gbp_category, top_competitors,
  lcp_ms, performance_score, has_schema, has_ssl, website_status, recommended_tier,
  pain_summary, cadence_step, next_action_at, last_channel,
  created_at, updated_at
) VALUES (
  ${idValueSql}, ${docNumValueSql}, ${sqlString(businessName)}, ${sqlString(businessNameClean)},
  ${sqlString(c.entity_type || 'Google Maps GBP')}, ${sqlString(c.filing_date || new Date().toISOString().slice(0, 10))},
  ${sqlString(founderName)}, ${sqlString(founderFirst)}, ${sqlString(founderLast)},
  ${sqlString(c.founder_title || 'Owner')}, ${sqlString(secondaryOfficersStr)},
  ${sqlString(c.registered_agent || founderName)}, ${sqlString(c.principal_address || '')}, ${sqlString(c.mailing_address || '')},
  ${sqlString(c.city)}, ${sqlString(c.state || 'FL')}, ${sqlString(c.zip || '')}, ${sqlString(c.county || 'Broward County')},
  ${sqlString(c.niche || 'Local Business')}, ${sqlNumber(c.score, 50)}, ${sqlString(c.email)}, ${sqlString(c.phone)},
  ${sqlString(c.website)}, ${sqlString(c.enrichment_status || 'unattempted')}, ${sqlString(c.enrichment_source)},
  ${sqlNumber(c.enrichment_confidence)}, ${sqlString(enrichmentMetaStr)}, ${sqlString(c.outreach_status || 'uncontacted')}, ${sqlString(c.notes)},
  ${sqlString(placeId || null)}, ${sqlString(c.cid)}, ${sqlNumber(gbpRank)}, ${sqlNumber(reviewCount)},
  ${sqlNumber(rating)}, ${sqlString(c.gbp_category || c.niche)}, ${sqlString(topCompetitorsStr)},
  ${sqlNumber(lcpMs)}, ${sqlNumber(perfScore)}, ${sqlNumber(hasSchema, 0)}, ${sqlNumber(hasSsl, 0)},
  ${sqlString(c.website_status || 'unoptimized')}, ${sqlString(c.recommended_tier || 'pilot_500')},
  ${sqlString(c.pain_summary)}, ${sqlNumber(cadenceStep, 0)}, ${sqlString(c.next_action_at)}, ${sqlString(c.last_channel)},
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT(doc_number) DO UPDATE SET
  business_name = COALESCE(NULLIF(excluded.business_name, ''), outreach_candidates.business_name),
  business_name_clean = COALESCE(NULLIF(excluded.business_name_clean, ''), outreach_candidates.business_name_clean),
  city = COALESCE(NULLIF(excluded.city, ''), outreach_candidates.city),
  county = COALESCE(NULLIF(excluded.county, ''), outreach_candidates.county),
  niche = COALESCE(NULLIF(excluded.niche, ''), outreach_candidates.niche),
  score = COALESCE(excluded.score, outreach_candidates.score),
  email = COALESCE(NULLIF(excluded.email, ''), outreach_candidates.email),
  phone = COALESCE(NULLIF(excluded.phone, ''), outreach_candidates.phone),
  website = COALESCE(NULLIF(excluded.website, ''), outreach_candidates.website),
  enrichment_status = CASE WHEN excluded.enrichment_status != 'unattempted' THEN excluded.enrichment_status ELSE outreach_candidates.enrichment_status END,
  enrichment_source = COALESCE(NULLIF(excluded.enrichment_source, ''), outreach_candidates.enrichment_source),
  enrichment_confidence = COALESCE(excluded.enrichment_confidence, outreach_candidates.enrichment_confidence),
  enrichment_meta = CASE WHEN excluded.enrichment_meta IS NOT NULL AND excluded.enrichment_meta != '{}' THEN excluded.enrichment_meta ELSE outreach_candidates.enrichment_meta END,
  place_id = COALESCE(NULLIF(excluded.place_id, ''), outreach_candidates.place_id),
  cid = COALESCE(NULLIF(excluded.cid, ''), outreach_candidates.cid),
  gbp_rank = COALESCE(excluded.gbp_rank, outreach_candidates.gbp_rank),
  review_count = COALESCE(excluded.review_count, outreach_candidates.review_count),
  rating = COALESCE(excluded.rating, outreach_candidates.rating),
  gbp_category = COALESCE(NULLIF(excluded.gbp_category, ''), outreach_candidates.gbp_category),
  top_competitors = COALESCE(NULLIF(excluded.top_competitors, ''), outreach_candidates.top_competitors),
  lcp_ms = COALESCE(excluded.lcp_ms, outreach_candidates.lcp_ms),
  performance_score = COALESCE(excluded.performance_score, outreach_candidates.performance_score),
  has_schema = COALESCE(excluded.has_schema, outreach_candidates.has_schema),
  has_ssl = COALESCE(excluded.has_ssl, outreach_candidates.has_ssl),
  website_status = COALESCE(NULLIF(excluded.website_status, ''), outreach_candidates.website_status),
  recommended_tier = COALESCE(NULLIF(excluded.recommended_tier, ''), outreach_candidates.recommended_tier),
  pain_summary = COALESCE(NULLIF(excluded.pain_summary, ''), outreach_candidates.pain_summary),
  updated_at = CURRENT_TIMESTAMP;`.trim();
}

// ---------------------------------------------------------------------------
// 3. Deterministic Offline Fixture & Fallback Engine Implementations
// ---------------------------------------------------------------------------
export function buildOfflineMapsFixture(city, niche) {
  const canonicalCity = normalizeCityToken(city) || 'Pembroke Pines';
  const canonicalNiche = normalizeNicheToken(niche) || 'Roofing';
  const citySlug = canonicalCity.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nicheSlug = canonicalNiche.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cityUpper = canonicalCity.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const nicheUpper = canonicalNiche.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

  const topCompetitors = [
    {
      name: `${canonicalCity} Elite ${canonicalNiche}`,
      rank: 1,
      reviews: 214,
      rating: 4.9,
      website: `https://eliteroofing-${citySlug}.com`,
      domain: `eliteroofing-${citySlug}.com`
    },
    {
      name: `All Star ${canonicalNiche} of ${canonicalCity}`,
      rank: 2,
      reviews: 168,
      rating: 4.8,
      website: `https://allstar${nicheSlug}-${citySlug}.com`,
      domain: `allstar${nicheSlug}-${citySlug}.com`
    },
    {
      name: `South Florida Pro ${canonicalNiche}`,
      rank: 3,
      reviews: 142,
      rating: 4.8,
      website: `https://sflpro${nicheSlug}.com`,
      domain: `sflpro${nicheSlug}.com`
    }
  ];

  const bleeders = [
    {
      place_id: `ChIJ_FIX_${cityUpper}_${nicheUpper}_07`,
      cid: `990107${citySlug.length}${nicheSlug.length}`,
      doc_number: `MAP_${`ChIJ_FIX_${cityUpper}_${nicheUpper}_07`.replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase()}`,
      business_name: `${canonicalCity} Premier ${canonicalNiche} LLC`,
      business_name_clean: `${canonicalCity} Premier ${canonicalNiche}`,
      founder_name: 'Carlos Mendoza',
      founder_first_name: 'Carlos',
      founder_last_name: 'Mendoza',
      founder_title: 'Owner',
      city: canonicalCity,
      state: 'FL',
      zip: '33028',
      niche: canonicalNiche,
      gbp_category: `${canonicalNiche} Contractor`,
      gbp_rank: 7,
      review_count: 42,
      rating: 4.8,
      phone: '(954) 555-0147',
      website: `premier${nicheSlug}${citySlug}.com`,
      principal_address: `10450 Taft St, ${canonicalCity}, FL`,
      top_competitors: topCompetitors,
      _simulatedAudit: {
        website_status: 'slow',
        lcp_ms: 4850,
        performance_score: 44,
        has_schema: 0,
        has_ssl: 1
      }
    },
    {
      place_id: `ChIJ_FIX_${cityUpper}_${nicheUpper}_09`,
      cid: `990109${citySlug.length}${nicheSlug.length}`,
      doc_number: `MAP_${`ChIJ_FIX_${cityUpper}_${nicheUpper}_09`.replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase()}`,
      business_name: `Apex ${canonicalNiche} & Repair Inc`,
      business_name_clean: `Apex ${canonicalNiche} & Repair`,
      founder_name: 'David Morales',
      founder_first_name: 'David',
      founder_last_name: 'Morales',
      founder_title: 'President',
      city: canonicalCity,
      state: 'FL',
      zip: '33026',
      niche: canonicalNiche,
      gbp_category: `${canonicalNiche} Service`,
      gbp_rank: 9,
      review_count: 28,
      rating: 4.9,
      phone: '(954) 555-0189',
      website: '',
      principal_address: `8820 Pines Blvd, ${canonicalCity}, FL`,
      top_competitors: topCompetitors,
      _simulatedAudit: {
        website_status: 'missing',
        lcp_ms: null,
        performance_score: 0,
        has_schema: 0,
        has_ssl: 0
      }
    },
    {
      place_id: `ChIJ_FIX_${cityUpper}_${nicheUpper}_12`,
      cid: `990112${citySlug.length}${nicheSlug.length}`,
      doc_number: `MAP_${`ChIJ_FIX_${cityUpper}_${nicheUpper}_12`.replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase()}`,
      business_name: `Reliable ${canonicalNiche} Masters LLC`,
      business_name_clean: `Reliable ${canonicalNiche} Masters`,
      founder_name: 'Michael Castellanos',
      founder_first_name: 'Michael',
      founder_last_name: 'Castellanos',
      founder_title: 'MGR',
      city: canonicalCity,
      state: 'FL',
      zip: '33025',
      niche: canonicalNiche,
      gbp_category: `${canonicalNiche} Contractor`,
      gbp_rank: 12,
      review_count: 64,
      rating: 4.7,
      phone: '(954) 555-0192',
      website: `reliable${nicheSlug}fl.com`,
      principal_address: `3400 Hiatus Rd, ${canonicalCity}, FL`,
      top_competitors: topCompetitors,
      _simulatedAudit: {
        website_status: 'unoptimized',
        lcp_ms: 2950,
        performance_score: 68,
        has_schema: 0,
        has_ssl: 1
      }
    },
    {
      place_id: `ChIJ_FIX_${cityUpper}_${nicheUpper}_18`,
      cid: `990118${citySlug.length}${nicheSlug.length}`,
      doc_number: `MAP_${`ChIJ_FIX_${cityUpper}_${nicheUpper}_18`.replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase()}`,
      business_name: `NextGen ${canonicalNiche} Solutions LLC`,
      business_name_clean: `NextGen ${canonicalNiche} Solutions`,
      founder_name: 'Roberto Diaz',
      founder_first_name: 'Roberto',
      founder_last_name: 'Diaz',
      founder_title: 'Owner',
      city: canonicalCity,
      state: 'FL',
      zip: '33024',
      niche: canonicalNiche,
      gbp_category: `${canonicalNiche} Service`,
      gbp_rank: 18,
      review_count: 8,
      rating: 4.6,
      phone: '(954) 555-0164',
      website: `nextgen${nicheSlug}sfl.com`,
      principal_address: `6700 University Dr, ${canonicalCity}, FL`,
      top_competitors: topCompetitors,
      _simulatedAudit: {
        website_status: 'healthy',
        lcp_ms: 2100,
        performance_score: 82,
        has_schema: 1,
        has_ssl: 1
      }
    }
  ];

  return {
    city: canonicalCity,
    niche: canonicalNiche,
    topCompetitors,
    candidates: bleeders,
    items: [
      ...topCompetitors.map(tc => ({
        title: tc.name,
        rank_group: tc.rank,
        rank_absolute: tc.rank,
        rating: { value: tc.rating, votes_count: tc.reviews },
        domain: tc.domain,
        url: tc.website
      })),
      ...bleeders
    ]
  };
}

/**
 * Fallback first-principles scoring & tier classification if _outreach_engine.js is not loaded or lacks a field.
 */
function fallbackScoreAndClassify(candidate) {
  const rank = Number(candidate.gbp_rank ?? candidate.maps_rank ?? candidate.rank ?? 12);
  const reviews = Number(candidate.review_count ?? candidate.reviews_count ?? candidate.reviews ?? 0);
  const rating = Number(candidate.rating ?? 4.5);
  const website = normalizeDomain(candidate.website || '');
  const websiteStatus =
    candidate.website_status ||
    (!website ? 'missing' : (Number(candidate.lcp_ms) > 3500 ? 'slow' : (candidate.has_schema ? 'healthy' : 'unoptimized')));
  const lcpMs = candidate.lcp_ms ?? null;
  const hasSchema = candidate.has_schema === 1 || candidate.has_schema === true ? 1 : 0;
  const hasSsl = candidate.has_ssl === 1 || candidate.has_ssl === true ? 1 : (website ? 1 : 0);

  const cityMeta = matchSouthFloridaLocation(candidate.city || 'Pembroke Pines', candidate.zip || '', 'FL');

  // First-principles opportunity score (0..99):
  // Base 45 + Bleeder Rank Sweet Spot (#6..#15 = +18, #16..#25 = +12) + Review Authority + Technical Deficit Boost + City Priority
  let rankScore = 8;
  if (rank >= 6 && rank <= 15) rankScore = 18;
  else if (rank >= 16 && rank <= 25) rankScore = 12;

  let reviewScore = 5;
  if (reviews >= 25) reviewScore = 16;
  else if (reviews >= 10) reviewScore = 12;
  else if (reviews >= 5) reviewScore = 8;

  let techPainBoost = 4;
  if (websiteStatus === 'missing' || websiteStatus === 'broken') techPainBoost = 16;
  else if (websiteStatus === 'slow') techPainBoost = 14;
  else if (!hasSchema || websiteStatus === 'unoptimized') techPainBoost = 10;

  const cityBoost = Math.min(8, Math.round((cityMeta.priority || 12) / 2));
  const rawScore = 42 + rankScore + reviewScore + techPainBoost + cityBoost;
  const score = Math.max(10, Math.min(99, rawScore));

  // Tier Classification:
  // - platform_3k: >= 10 reviews AND website is missing, broken, or slow (LCP > 3500ms)
  // - retainer_2500: >= 10 reviews AND website exists (unoptimized / missing schema / stuck #6-#25)
  // - pilot_500: < 10 reviews OR smaller operator needing GBP + citation velocity pilot
  let recommendedTier = 'pilot_500';
  if (reviews >= 10 && (websiteStatus === 'missing' || websiteStatus === 'broken' || websiteStatus === 'slow')) {
    recommendedTier = 'platform_3k';
  } else if (reviews >= 10) {
    recommendedTier = 'retainer_2500';
  }

  let topCompList = [];
  if (Array.isArray(candidate.top_competitors)) topCompetitors: topCompList = candidate.top_competitors;
  else if (typeof candidate.top_competitors === 'string' && candidate.top_competitors.trim().startsWith('[')) {
    try { topCompList = JSON.parse(candidate.top_competitors); } catch (_) { topCompList = []; }
  }
  const comp1 = topCompList[0]?.name || `Top ${candidate.city || 'Local'} ${candidate.niche || 'Service'} Leader`;
  const lcpSec = lcpMs ? `${(Number(lcpMs) / 1000).toFixed(1)}s` : null;

  const painParts = [];
  if (rank > 0) painParts.push(`Ranked #${rank} on Google Maps (${reviews} reviews, ${rating.toFixed(1)}★)`);
  if (websiteStatus === 'missing') {
    painParts.push('No website linked to GBP');
  } else if (websiteStatus === 'broken') {
    painParts.push(`Website (${website}) broken/unreachable`);
  } else if (websiteStatus === 'slow') {
    painParts.push(`Slow mobile LCP (${lcpSec || '>4.0s'})`);
  }
  if (!hasSchema && websiteStatus !== 'missing') {
    painParts.push('Missing LocalBusiness JSON-LD schema');
  }
  if (comp1) {
    painParts.push(`Trailing #1 ${comp1}`);
  }

  return {
    score,
    recommended_tier: recommendedTier,
    website_status: websiteStatus,
    has_schema: hasSchema,
    has_ssl: hasSsl,
    lcp_ms: lcpMs,
    pain_summary: painParts.join(' • ')
  };
}

function fallbackRenderTouch(touchKey, candidate) {
  const firstName = candidate.founder_first_name || (candidate.founder_name || 'there').split(' ')[0] || 'there';
  const biz = candidate.business_name_clean || candidate.business_name || 'your company';
  const city = candidate.city || 'South Florida';
  const niche = (candidate.niche || 'local services').toLowerCase();
  const rank = candidate.gbp_rank || 8;
  const reviews = candidate.review_count || 20;
  let comp1 = 'your top Map Pack competitor';
  try {
    const comps = typeof candidate.top_competitors === 'string'
      ? JSON.parse(candidate.top_competitors)
      : candidate.top_competitors;
    if (Array.isArray(comps) && comps[0]?.name) comp1 = comps[0].name;
  } catch (_) {}

  const lcpSec = candidate.lcp_ms ? `${(Number(candidate.lcp_ms) / 1000).toFixed(1)}s` : '4.6s';
  const painHook = candidate.website_status === 'missing'
    ? `no website or LocalBusiness schema linked to your Google Business Profile`
    : `a ${lcpSec} mobile load time and missing LocalBusiness JSON-LD schema`;

  if (touchKey === 'touch_2' || touchKey === 'call_sms') {
    return {
      templateId: 'touch_2_call_sms',
      subject: `SMS / Call Script — ${biz}`,
      body: `Hey ${firstName}, Christian here in Broward. Sent you a quick note earlier—saw ${biz} sitting at #${rank} on Google Maps in ${city} (${reviews} reviews) behind ${comp1}. Fixable issue with ${painHook}. Mind if I text over the 60-sec breakdown? - Christian (786) 967-3699`
    };
  }
  if (touchKey === 'touch_3' || touchKey === 'followup') {
    return {
      templateId: 'touch_3_followup',
      subject: `Re: ${biz} (${city} Map Pack #${rank})`,
      body: `Hi ${firstName},\n\nFollowing up quickly before I close out our ${city} ${niche} audit.\n\nWith ${reviews} reviews, ${biz} already has the reputation to crack the Top 3 Map Pack ahead of ${comp1}—fixing ${painHook} is the fastest lever.\n\nOpen to a 10-minute walkthrough this week?\n\nChristian\n(786) 967-3699`
    };
  }
  return {
    templateId: 'touch_1_diagnostic',
    subject: `${biz} — #${rank} on ${city} Google Maps`,
    body: `Hi ${firstName},\n\nI was looking at ${city} ${niche} results on Google Maps and noticed ${biz} is sitting at #${rank} (${reviews} reviews), while ${comp1} is capturing the Top 3 Map Pack calls.\n\nWhen I ran a quick diagnostic on your listing, ${painHook} stood out as the main bottleneck holding back your rank.\n\nAre you open to a quick 2-minute breakdown of how to fix that and move into the Top 3 in ${city}?\n\nChristian\n(786) 967-3699`
  };
}

// ---------------------------------------------------------------------------
// 4. Unified Pipeline Runner (`runSyncMapsPipeline`)
// ---------------------------------------------------------------------------
export async function runSyncMapsPipeline(optionsOrArgv = process.argv, customEnv = null) {
  const args = parseSyncMapsArgs(optionsOrArgv);
  const engine = await getOutreachEngine();

  const env = {
    DATAFORSEO_LOGIN: customEnv?.DATAFORSEO_LOGIN ?? process.env.DATAFORSEO_LOGIN,
    DATAFORSEO_PASSWORD: customEnv?.DATAFORSEO_PASSWORD ?? process.env.DATAFORSEO_PASSWORD,
    ENRICHMENT_API_KEY:
      customEnv?.ENRICHMENT_API_KEY ||
      process.env.ENRICHMENT_API_KEY ||
      process.env.HUNTER_API_KEY ||
      process.env.HUNTER_API,
    ENRICHMENT_PROVIDER: customEnv?.ENRICHMENT_PROVIDER || process.env.ENRICHMENT_PROVIDER || 'hunter',
    APOLLO_API_KEY: customEnv?.APOLLO_API_KEY || process.env.APOLLO_API_KEY || process.env.APOLLO_API,
    PDL_API_KEY: customEnv?.PDL_API_KEY || process.env.PDL_API_KEY || process.env.PDL_API,
    PAGESPEED_API_KEY: customEnv?.PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY
  };

  const hasDataForSeoCreds = Boolean(
    env.DATAFORSEO_LOGIN &&
    String(env.DATAFORSEO_LOGIN).trim() !== '' &&
    env.DATAFORSEO_PASSWORD &&
    String(env.DATAFORSEO_PASSWORD).trim() !== ''
  );

  const isOfflineFixture = Boolean(args.fixture || args.offline || !hasDataForSeoCreds);
  if (!hasDataForSeoCreds && !args.fixture && !args.offline) {
    console.log(
      '[Maps Sync] Notice: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not configured in .env or .dev.vars; auto-activating deterministic offline fixture mode.'
    );
  } else if (isOfflineFixture) {
    console.log('[Maps Sync] Running in deterministic offline fixture mode (--fixture / --offline).');
  }

  console.log(
    `[Maps Sync] Starting discovery for Cities=[${args.cities.join(', ')}] × Niches=[${args.niches.join(', ')}] (Ranks #${args.rankMin}..#${args.rankMax}, Reviews ${args.minReviews}..${args.maxReviews})`
  );

  const discoveredRaw = [];
  const topCompetitorsByPair = new Map();

  // Step 2: Discover Google Maps Bleeders for each (city, niche) pair
  for (const city of args.cities) {
    for (const niche of args.niches) {
      const pairKey = `${city}::${niche}`;
      let pairCandidates = [];
      let pairTopCompetitors = [];

      const callDiscoverFn = async (offlineFlag, envToUse) => {
        const fn = engine.discoverMapsBleedersViaDataForSeo;
        const combined = {
          ...envToUse,
          env: envToUse,
          city,
          niche,
          rankMin: args.rankMin,
          rank_min: args.rankMin,
          rankMax: args.rankMax,
          rank_max: args.rankMax,
          minReviews: args.minReviews,
          min_reviews: args.minReviews,
          maxReviews: args.maxReviews,
          max_reviews: args.maxReviews,
          useFixture: Boolean(offlineFlag),
          fixture: Boolean(offlineFlag),
          offline: Boolean(offlineFlag),
          auditWebsites: false
        };
        const fnHeader = Function.prototype.toString.call(fn).slice(0, 140);
        if (/^\s*(?:async\s+)?(?:function\s+\w*\s*)?\(\s*city\b/i.test(fnHeader)) {
          return fn(city, niche, combined, envToUse);
        }
        return fn(combined, envToUse);
      };

      if (!isOfflineFixture && typeof engine.discoverMapsBleedersViaDataForSeo === 'function') {
        try {
          const res = await callDiscoverFn(false, env);

          if (Array.isArray(res)) {
            pairCandidates = res;
          } else if (res && typeof res === 'object') {
            pairCandidates = res.candidates || res.bleeders || res.items || [];
            pairTopCompetitors = res.topCompetitors || res.top_competitors || [];
          }
        } catch (err) {
          console.warn(
            `[Maps Sync] Live DataForSEO discovery failed for (${city}, ${niche}): ${err.message}. Falling back to deterministic fixture.`
          );
        }
      } else if (isOfflineFixture && typeof engine.discoverMapsBleedersViaDataForSeo === 'function') {
        try {
          const res = await callDiscoverFn(true, { ...env, DATAFORSEO_LOGIN: '', DATAFORSEO_PASSWORD: '' });
          if (Array.isArray(res) && res.length > 0) {
            pairCandidates = res;
          } else if (res && typeof res === 'object') {
            pairCandidates = res.candidates || res.bleeders || [];
            pairTopCompetitors = res.topCompetitors || res.top_competitors || [];
          }
        } catch (_) {
          // Use local deterministic fixture fallback below
        }
      }

      if (pairCandidates.length === 0) {
        const fixtureData = buildOfflineMapsFixture(city, niche);
        pairTopCompetitors = fixtureData.topCompetitors;
        pairCandidates = fixtureData.candidates;
      }

      topCompetitorsByPair.set(pairKey, pairTopCompetitors);

      // Filter to #rankMin..#rankMax and minReviews..maxReviews
      const filtered = pairCandidates.filter(c => {
        const rank = Number(c.gbp_rank ?? c.maps_rank ?? c.rank ?? 0);
        const reviews = Number(c.review_count ?? c.reviews_count ?? c.reviews ?? 0);
        return (
          rank >= args.rankMin &&
          rank <= args.rankMax &&
          reviews >= args.minReviews &&
          reviews <= args.maxReviews
        );
      });

      for (const item of filtered) {
        discoveredRaw.push({
          ...item,
          city: item.city || city,
          niche: item.niche || niche,
          top_competitors: item.top_competitors || item.topCompetitors || pairTopCompetitors
        });
      }
    }
  }

  // Deduplicate by both place_id and doc_number before Step 3 / Step 7
  const seenPlaceIds = new Set();
  const seenDocNumbers = new Set();
  const uniqueRawCandidates = [];
  for (const item of discoveredRaw) {
    const pId = item.place_id ? String(item.place_id).trim() : '';
    let dNum = item.doc_number
      ? String(item.doc_number).trim().toUpperCase()
      : (pId ? `MAP_${pId.replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase()}` : '');
    const fallbackKey = `${item.business_name || ''}_${item.city || ''}`.trim().toUpperCase();

    if (pId && seenPlaceIds.has(pId)) continue;
    if (!pId && dNum && seenDocNumbers.has(dNum)) continue;
    if (!pId && !dNum && seenDocNumbers.has(fallbackKey)) continue;

    // If two distinct place_ids share the same 14-char city+niche suffix (e.g. ChIJ_bleed07_pembrokepines_roofing vs ChIJ_bleed09_pembrokepines_roofing),
    // disambiguate doc_number so distinct businesses aren't dropped or overwritten on ON CONFLICT(doc_number).
    if (pId && dNum && seenDocNumbers.has(dNum)) {
      const cleanPId = pId.replace(/^ChIJ_?/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      dNum = `MAP_${cleanPId.slice(0, 7)}${cleanPId.slice(-7)}`;
      item.doc_number = dNum;
    }

    if (pId) seenPlaceIds.add(pId);
    if (dNum) seenDocNumbers.add(dNum);
    else if (fallbackKey) seenDocNumbers.add(fallbackKey);

    uniqueRawCandidates.push(item);
  }

  console.log(
    `[Maps Sync] Discovered ${uniqueRawCandidates.length} qualified Page-2 Bleeder candidates across ${args.cities.length * args.niches.length} (city, niche) pairs.`
  );

  // Step 3: Technical Website Diagnostic Audit on up to --max-audit candidates
  const auditLimit = Math.min(args.maxAudit, uniqueRawCandidates.length);
  if (auditLimit > 0) {
    console.log(`[Maps Sync] Running Technical & Entity Diagnostics on top ${auditLimit} candidates...`);
  }

  for (let i = 0; i < uniqueRawCandidates.length; i++) {
    const cand = uniqueRawCandidates[i];
    if (i < auditLimit) {
      if (cand._simulatedAudit && isOfflineFixture) {
        Object.assign(cand, cand._simulatedAudit);
      } else if (typeof engine.auditCandidateWebsite === 'function') {
        try {
          const auditRes = await engine.auditCandidateWebsite(cand.website || '', {
            ...env,
            offline: isOfflineFixture,
            fixture: isOfflineFixture,
            timeoutMs: isOfflineFixture ? 500 : 6500
          });
          if (auditRes && typeof auditRes === 'object') {
            cand.website_status = auditRes.website_status ?? auditRes.status ?? cand.website_status;
            cand.lcp_ms = auditRes.lcp_ms ?? auditRes.lcpMs ?? cand.lcp_ms ?? null;
            cand.performance_score = auditRes.performance_score ?? auditRes.performanceScore ?? cand.performance_score ?? null;
            cand.has_schema = auditRes.has_schema !== undefined ? (auditRes.has_schema ? 1 : 0) : (auditRes.hasSchema ? 1 : 0);
            cand.has_ssl = auditRes.has_ssl !== undefined ? (auditRes.has_ssl ? 1 : 0) : (auditRes.hasSsl ? 1 : 0);
          }
        } catch (err) {
          if (cand._simulatedAudit) {
            Object.assign(cand, cand._simulatedAudit);
          }
        }
      } else if (cand._simulatedAudit) {
        Object.assign(cand, cand._simulatedAudit);
      }
    }
    delete cand._simulatedAudit;
  }

  // Step 4: Score & Classify Candidates + Normalize via buildCandidateRecord
  const candidates = [];
  const finalSeenPlaceIds = new Set();
  const finalSeenDocNumbers = new Set();

  for (const raw of uniqueRawCandidates) {
    let scored = raw;
    if (typeof engine.scoreAndClassifyCandidate === 'function') {
      try {
        const res = engine.scoreAndClassifyCandidate(raw);
        if (res && typeof res === 'object') {
          scored = { ...raw, ...res };
        }
      } catch (_) {}
    }

    const fallbackScored = fallbackScoreAndClassify(scored);
    scored = {
      ...fallbackScored,
      ...scored,
      score: typeof scored.score === 'number' ? scored.score : fallbackScored.score,
      recommended_tier: scored.recommended_tier || fallbackScored.recommended_tier,
      website_status: scored.website_status || fallbackScored.website_status,
      pain_summary: scored.pain_summary || fallbackScored.pain_summary,
      has_schema: scored.has_schema !== undefined ? (scored.has_schema ? 1 : 0) : fallbackScored.has_schema,
      has_ssl: scored.has_ssl !== undefined ? (scored.has_ssl ? 1 : 0) : fallbackScored.has_ssl,
      lcp_ms: scored.lcp_ms ?? fallbackScored.lcp_ms
    };

    let record = null;
    if (typeof engine.buildCandidateRecord === 'function') {
      try {
        record = engine.buildCandidateRecord(scored, { requireSouthFlorida: false, excludeShells: false });
      } catch (_) {
        record = null;
      }
    }

    const cityMeta = matchSouthFloridaLocation(scored.city || 'Pembroke Pines', scored.zip || '', 'FL');
    const canonicalPlaceId = String(scored.place_id || record?.place_id || '').trim();
    const canonicalDocFallback = canonicalPlaceId
      ? `MAP_${canonicalPlaceId.replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase()}`
      : `MAP_${Date.now().toString(36).toUpperCase()}`;
    const rawDocNum = String(scored.doc_number || record?.doc_number || canonicalDocFallback).trim().toUpperCase();
    const docNumber = canonicalPlaceId && rawDocNum.startsWith('GBP_')
      ? canonicalDocFallback
      : rawDocNum;
    const businessName = String(scored.business_name || scored.title || 'Local Business').trim();
    const businessNameClean = String(scored.business_name_clean || cleanBusinessName(businessName) || businessName).trim();
    const founderName = String(record?.founder_name || scored.founder_name || 'Owner').trim();
    const founderFirst = String(record?.founder_first_name ?? scored.founder_first_name ?? (founderName === 'Owner' ? '' : founderName.split(/\s+/)[0] || '')).trim();
    const founderLast = String(record?.founder_last_name ?? scored.founder_last_name ?? (founderName === 'Owner' ? '' : founderName.split(/\s+/).slice(1).join(' ') || '')).trim();
    const cleanDomain = normalizeDomain(scored.website || record?.website || '');

    const mergedRecord = {
      ...(record || {}),
      id: record?.id || scored.id || `map_${docNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      doc_number: docNumber,
      business_name: businessName.toUpperCase(),
      business_name_clean: businessNameClean,
      entity_type: record?.entity_type || scored.entity_type || 'Google Maps GBP',
      filing_date: record?.filing_date || scored.filing_date || new Date().toISOString().slice(0, 10),
      founder_name: founderName,
      founder_first_name: founderFirst,
      founder_last_name: founderLast,
      founder_title: record?.founder_title || scored.founder_title || 'Owner',
      secondary_officers:
        typeof scored.secondary_officers === 'string'
          ? scored.secondary_officers
          : JSON.stringify(scored.secondary_officers || []),
      registered_agent: record?.registered_agent || scored.registered_agent || founderName,
      principal_address: record?.principal_address || scored.principal_address || '',
      mailing_address: record?.mailing_address || scored.mailing_address || '',
      city: record?.city || cityMeta.city || scored.city,
      state: 'FL',
      zip: record?.zip || scored.zip || '',
      county: record?.county || cityMeta.county || 'Broward County',
      niche: record?.niche || scored.niche || 'Roofing',
      score: Number(scored.score ?? record?.score ?? 75),
      email: record?.email || scored.email || null,
      phone: record?.phone || scored.phone || null,
      website: isValidCompanyDomain(cleanDomain) ? cleanDomain : null,
      enrichment_status: record?.enrichment_status || scored.enrichment_status || (scored.phone ? 'partial' : 'unattempted'),
      enrichment_source: record?.enrichment_source || scored.enrichment_source || (scored.phone ? 'google_maps' : null),
      enrichment_confidence: record?.enrichment_confidence || scored.enrichment_confidence || null,
      enrichment_meta:
        typeof (record?.enrichment_meta || scored.enrichment_meta) === 'string'
          ? (record?.enrichment_meta || scored.enrichment_meta)
          : JSON.stringify(record?.enrichment_meta || scored.enrichment_meta || {}),
      outreach_status: record?.outreach_status || scored.outreach_status || 'uncontacted',
      notes: record?.notes || scored.notes || null,
      place_id: canonicalPlaceId || null,
      cid: scored.cid || record?.cid || null,
      gbp_rank: Number(scored.gbp_rank ?? scored.maps_rank ?? scored.rank ?? record?.gbp_rank ?? 10),
      review_count: Number(scored.review_count ?? scored.reviews_count ?? scored.reviews ?? record?.review_count ?? 0),
      rating: Number(scored.rating ?? record?.rating ?? 4.7),
      gbp_category: scored.gbp_category || record?.gbp_category || `${scored.niche || 'Local'} Service`,
      top_competitors:
        typeof scored.top_competitors === 'string'
          ? scored.top_competitors
          : JSON.stringify(scored.top_competitors || []),
      lcp_ms: scored.lcp_ms !== undefined && scored.lcp_ms !== null ? Number(scored.lcp_ms) : null,
      performance_score:
        scored.performance_score !== undefined && scored.performance_score !== null
          ? Number(scored.performance_score)
          : null,
      has_schema: scored.has_schema ? 1 : 0,
      has_ssl: scored.has_ssl ? 1 : 0,
      website_status: scored.website_status || 'unoptimized',
      recommended_tier: scored.recommended_tier || 'pilot_500',
      pain_summary: scored.pain_summary || '',
      cadence_step: Number(scored.cadence_step ?? 0),
      next_action_at: scored.next_action_at || null,
      last_channel: scored.last_channel || null
    };

    if (mergedRecord.place_id && finalSeenPlaceIds.has(mergedRecord.place_id)) continue;
    if (mergedRecord.doc_number && finalSeenDocNumbers.has(mergedRecord.doc_number)) continue;
    if (mergedRecord.place_id) finalSeenPlaceIds.add(mergedRecord.place_id);
    if (mergedRecord.doc_number) finalSeenDocNumbers.add(mergedRecord.doc_number);

    candidates.push(mergedRecord);
  }

  candidates.sort((a, b) => b.score - a.score || (b.review_count || 0) - (a.review_count || 0));

  // Step 5: Smart Contact Enrichment on top-scoring candidates when keys are configured and not offline
  const hasEnrichmentKeys = Boolean(env.ENRICHMENT_API_KEY || env.APOLLO_API_KEY || env.PDL_API_KEY);
  const enrichFn = engine.enrichOutreachCandidate || enrichOutreachCandidate;

  if (!isOfflineFixture && hasEnrichmentKeys && args.maxEnrich > 0 && typeof enrichFn === 'function') {
    const toEnrich = candidates.filter(c => !c.email).slice(0, args.maxEnrich);
    if (toEnrich.length > 0) {
      console.log(`[Maps Sync] Enriching top ${toEnrich.length} candidates via Hunter/Apollo/PDL waterfall...`);
      for (const cand of toEnrich) {
        try {
          const enr = await enrichFn(cand, { ...env, SKIP_LIVE_VOLUME_IN_BULK: true });
          if (enr?.email) cand.email = enr.email;
          if (enr?.phone && !cand.phone) cand.phone = enr.phone;
          if (enr?.website && !cand.website) cand.website = enr.website;
          cand.enrichment_status = enr?.status || cand.enrichment_status;
          cand.enrichment_source = enr?.source || cand.enrichment_source;
          cand.enrichment_confidence = enr?.confidence ?? cand.enrichment_confidence;
          cand.enrichment_meta = JSON.stringify(enr?.meta || {});
        } catch (err) {
          console.warn(`[Maps Sync] Enrichment warning for ${cand.business_name_clean}: ${err.message}`);
        }
      }
    }
  }

  // Step 6: Print structured summary table + Touch 1 / Touch 2 / Touch 3 previews for #1 candidate
  const summaryRows = candidates.map(c => {
    let topComp1 = '-';
    try {
      const parsedComps = typeof c.top_competitors === 'string' ? JSON.parse(c.top_competitors) : c.top_competitors;
      if (Array.isArray(parsedComps) && parsedComps[0]?.name) {
        topComp1 = `${parsedComps[0].name} (${parsedComps[0].reviews || 0} rev)`;
      }
    } catch (_) {}

    return {
      Rank: `#${c.gbp_rank ?? '-'}`,
      Business: c.business_name_clean,
      City: c.city,
      Niche: c.niche,
      Reviews: `${c.review_count ?? 0} (${Number(c.rating || 0).toFixed(1)}★)`,
      'Web Status': c.website_status,
      LCP: c.lcp_ms ? `${(c.lcp_ms / 1000).toFixed(1)}s` : 'N/A',
      Schema: c.has_schema ? 'Yes' : 'No',
      Tier: c.recommended_tier,
      Score: c.score,
      'Top Competitor #1': topComp1
    };
  });

  if (summaryRows.length > 0) {
    console.log('\n=== Google Maps "Page 2 Bleeders" Diagnostic Summary ===');
    console.table(summaryRows);
  }

  let sampleTouches = null;
  if (candidates.length > 0) {
    const topCandidate = candidates[0];
    const renderFn = engine.renderOutreachTemplate;

    const renderTouchSafe = (preferredIds, fallbackKey) => {
      if (typeof renderFn === 'function') {
        for (const tid of preferredIds) {
          try {
            const out = renderFn(tid, topCandidate);
            if (out && out.body) return out;
          } catch (_) {}
        }
      }
      return fallbackRenderTouch(fallbackKey, topCandidate);
    };

    const touch1 = renderTouchSafe(
      ['touch_1_audit', 'touch_1_diagnostic', 'touch_1', 'maps_diagnostic_audit', 'launchpad_mockup'],
      'touch_1'
    );
    const touch2 = renderTouchSafe(
      ['touch_2_call_sms', 'touch_2', 'call_sms_script', 'local_demand_snapshot'],
      'touch_2'
    );
    const touch3 = renderTouchSafe(
      ['touch_3_followup', 'touch_3', 'competitor_fomo_followup', 'short_neighbor'],
      'touch_3'
    );

    sampleTouches = { touch1, touch2, touch3 };

    console.log(`\n=== Sample Multi-Touch Cadence Preview (#1 Candidate: ${topCandidate.business_name_clean} [${topCandidate.recommended_tier}]) ===`);
    console.log(`\n--- Touch 1 (Audit Email) | Subject: ${touch1.subject} ---\n${touch1.body}`);
    console.log(`\n--- Touch 2 (Call/SMS) | Subject: ${touch2.subject} ---\n${touch2.body}`);
    console.log(`\n--- Touch 3 (Follow-Up) | Subject: ${touch3.subject} ---\n${touch3.body}\n`);
  }

  // Step 7: When not --dry-run, persist to D1 (or fallback to POST /api/crm/outreach)
  const sqlStatements = [
    ...getSchemaInitSqlStatements(),
    ...candidates.map(c => buildUpsertSqlForCandidate(c))
  ];

  if (args.dryRun) {
    console.log(`[Maps Sync] Dry run complete (${candidates.length} candidates scored, 0 written to D1).`);
    return {
      dryRun: true,
      offline: isOfflineFixture,
      args,
      candidates,
      sampleTouches,
      sqlStatements
    };
  }

  if (candidates.length === 0) {
    console.log('[Maps Sync] No candidates matched filters; skipping D1 write.');
    return {
      dryRun: false,
      offline: isOfflineFixture,
      args,
      candidates: [],
      sampleTouches: null,
      sqlStatements: []
    };
  }

  const cfToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_GITHUB_API;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (args.local || (cfToken && cfAccountId)) {
    const d1Flag = args.local ? '--local' : '--remote';
    const migrationPath = path.join(REPO_ROOT, 'migrations', '0005_maps_diagnostic_pivot.sql');

    // Best-effort apply migration 0005 if table already existed from 0003 without new columns
    if (fs.existsSync(migrationPath)) {
      try {
        execFileSync(
          'npx',
          ['wrangler', 'd1', 'execute', 'g3zcreative-crm', d1Flag, `--file=${migrationPath}`],
          {
            stdio: 'pipe',
            shell: process.platform === 'win32',
            env: {
              ...process.env,
              CLOUDFLARE_API_TOKEN: cfToken || process.env.CLOUDFLARE_API_TOKEN
            }
          }
        );
      } catch (_) {
        // Ignore if columns already exist on target D1 database
      }
    }

    const tmpSqlPath = path.join(os.tmpdir(), `maps_outreach_sync_${Date.now()}.sql`);
    fs.writeFileSync(tmpSqlPath, sqlStatements.join('\n\n'), 'utf8');
    console.log(`[Maps Sync] Executing Wrangler D1 batch upsert (${d1Flag}) for ${candidates.length} candidates...`);

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
      console.log(`[Maps Sync] Successfully synced ${candidates.length} Google Maps Bleeder candidates to D1 (${d1Flag})!`);
      return {
        dryRun: false,
        offline: isOfflineFixture,
        syncedVia: `wrangler_${d1Flag.replace(/^--/, '')}`,
        args,
        candidates,
        sampleTouches,
        sqlStatements
      };
    } catch (d1Err) {
      if (args.local) throw d1Err;
      console.warn(`[Maps Sync] Wrangler D1 CLI returned an error (${d1Err.message}); falling back to CRM Worker API...`);
    } finally {
      if (fs.existsSync(tmpSqlPath)) fs.unlinkSync(tmpSqlPath);
    }
  }

  // Fallback remote upload via authenticated CRM API (POST /api/crm/outreach with X-CRM-Key)
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

  console.log(`[Maps Sync] Uploading ${candidates.length} candidates to ${crmApiUrl}/api/crm/outreach in batches of ${batchSize}...`);

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
  }

  console.log(
    `[Maps Sync] Successfully synced ${candidates.length} candidates via CRM API (${totalInserted} new, ${totalUpdated} updated)!`
  );

  return {
    dryRun: false,
    offline: isOfflineFixture,
    syncedVia: 'crm_api',
    inserted: totalInserted,
    updated: totalUpdated,
    args,
    candidates,
    sampleTouches,
    sqlStatements
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runSyncMapsPipeline(process.argv).catch(err => {
    console.error('[Maps Sync Error]', err.message);
    process.exit(1);
  });
}

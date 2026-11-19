/**
 * Centralized Google Maps Bleeder Discovery, Business Listings Diagnostic, Scoring,
 * Multi-Stage Decision-Maker Enrichment & Multi-Touch Cadence Engine.
 *
 * Includes South Florida geographic normalization, Google Maps / Business Listings
 * CSV/JSON parsing, technical site diagnostics, and multi-touch cadence helpers.
 */

import { enrichLead, isValidCompanyDomain, normalizeDomain, splitName } from './_enrich.js';

function getTimeoutSignal(ms = 8000) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

/**
 * Deterministic canonical doc_number generator for Google Maps place_id values.
 * Shared across discovery, candidate building, and API upserts.
 */
export function buildCanonicalDocNumberFromPlaceId(placeId) {
  const cleaned = String(placeId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase();
  return cleaned ? `MAP_${cleaned}` : `MAP_${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Safely evolve an existing `outreach_candidates` table in D1/SQLite by adding any missing
 * columns and indexes from Migration 0005. If the table does not exist, returns
 * `{ tableExists: false }` without creating it.
 */
export async function upgradeExistingOutreachTableColumns(db) {
  if (!db) return { tableExists: false, addedColumns: [] };
  const infoRes = await db.prepare('PRAGMA table_info(outreach_candidates)').all();
  const existingRows = infoRes?.results || [];
  if (!Array.isArray(existingRows) || existingRows.length === 0) {
    return { tableExists: false, addedColumns: [] };
  }

  const existingNames = new Set(existingRows.map(r => String(r.name || '').toLowerCase()));
  const requiredColumns = [
    ['place_id', 'TEXT'],
    ['cid', 'TEXT'],
    ['gbp_rank', 'INTEGER'],
    ['review_count', 'INTEGER'],
    ['rating', 'REAL'],
    ['gbp_category', 'TEXT'],
    ['top_competitors', 'TEXT'],
    ['lcp_ms', 'INTEGER'],
    ['performance_score', 'INTEGER'],
    ['has_schema', 'INTEGER DEFAULT 0'],
    ['has_ssl', 'INTEGER DEFAULT 0'],
    ['website_status', 'TEXT'],
    ['recommended_tier', 'TEXT'],
    ['pain_summary', 'TEXT'],
    ['cadence_step', 'INTEGER DEFAULT 0'],
    ['next_action_at', 'DATETIME'],
    ['last_channel', 'TEXT']
  ];

  const addedColumns = [];
  for (const [colName, colDef] of requiredColumns) {
    if (!existingNames.has(colName)) {
      try {
        await db.prepare(`ALTER TABLE outreach_candidates ADD COLUMN ${colName} ${colDef}`).run();
        addedColumns.push(colName);
      } catch (err) {
        if (!/duplicate column name/i.test(String(err?.message || err))) {
          throw err;
        }
      }
    }
  }

  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_place_id ON outreach_candidates(place_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_outreach_tier_score ON outreach_candidates(outreach_status, recommended_tier, score DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_outreach_rank_reviews ON outreach_candidates(gbp_rank, review_count DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_outreach_next_action ON outreach_candidates(next_action_at ASC)').run();

  return { tableExists: true, addedColumns };
}

// ---------------------------------------------------------------------------
// 1. South Florida Target Cities & Canonical Normalization
// ---------------------------------------------------------------------------
export const SOUTH_FL_CITIES = new Map([
  // Broward County
  ['MIRAMAR', { name: 'Miramar', county: 'Broward County', priority: 15, landmark: 'Miramar Regional Park' }],
  ['PEMBROKE PINES', { name: 'Pembroke Pines', county: 'Broward County', priority: 15, landmark: 'C.B. Smith Park' }],
  ['HOLLYWOOD', { name: 'Hollywood', county: 'Broward County', priority: 14, landmark: 'Hollywood Beach Broadwalk' }],
  ['DAVIE', { name: 'Davie', county: 'Broward County', priority: 14, landmark: 'Bergeron Rodeo Grounds' }],
  ['COOPER CITY', { name: 'Cooper City', county: 'Broward County', priority: 14, landmark: 'Brian Piccolo Sports Park' }],
  ['SOUTHWEST RANCHES', { name: 'Southwest Ranches', county: 'Broward County', priority: 14, landmark: 'Sunshine Ranches' }],
  ['WESTON', { name: 'Weston', county: 'Broward County', priority: 14, landmark: 'Weston Town Center' }],
  ['FORT LAUDERDALE', { name: 'Fort Lauderdale', county: 'Broward County', priority: 13, landmark: 'Las Olas Boulevard' }],
  ['PLANTATION', { name: 'Plantation', county: 'Broward County', priority: 13, landmark: 'Plantation Central Park' }],
  ['SUNRISE', { name: 'Sunrise', county: 'Broward County', priority: 12, landmark: 'Sawgrass Mills' }],
  ['HALLANDALE BEACH', { name: 'Hallandale Beach', county: 'Broward County', priority: 12, landmark: 'Gulfstream Park' }],
  ['DANIA BEACH', { name: 'Dania Beach', county: 'Broward County', priority: 12, landmark: 'Dania Beach Pier' }],
  ['CORAL SPRINGS', { name: 'Coral Springs', county: 'Broward County', priority: 12, landmark: 'Coral Springs Center for the Arts' }],
  ['PARKLAND', { name: 'Parkland', county: 'Broward County', priority: 12, landmark: 'Pine Trails Park' }],
  ['POMPANO BEACH', { name: 'Pompano Beach', county: 'Broward County', priority: 12, landmark: 'Pompano Beach Fishing Pier' }],
  ['COCONUT CREEK', { name: 'Coconut Creek', county: 'Broward County', priority: 11, landmark: 'Promenade at Coconut Creek' }],
  ['DEERFIELD BEACH', { name: 'Deerfield Beach', county: 'Broward County', priority: 11, landmark: 'Deerfield Beach Pier' }],
  ['TAMARAC', { name: 'Tamarac', county: 'Broward County', priority: 11, landmark: 'Tamarac Sports Complex' }],
  ['MARGATE', { name: 'Margate', county: 'Broward County', priority: 11, landmark: 'Firefighters Park' }],
  ['LAUDERHILL', { name: 'Lauderhill', county: 'Broward County', priority: 11, landmark: 'Central Broward Regional Park' }],
  ['OAKLAND PARK', { name: 'Oakland Park', county: 'Broward County', priority: 11, landmark: 'Jaco Pastorius Park' }],
  ['WILTON MANORS', { name: 'Wilton Manors', county: 'Broward County', priority: 11, landmark: 'Island City Park Preserve' }],
  ['LIGHTHOUSE POINT', { name: 'Lighthouse Point', county: 'Broward County', priority: 11, landmark: 'Hillsboro Inlet Lighthouse' }],
  ['LAUDERDALE LAKES', { name: 'Lauderdale Lakes', county: 'Broward County', priority: 10, landmark: 'Vincent Torres Memorial Park' }],
  ['NORTH LAUDERDALE', { name: 'North Lauderdale', county: 'Broward County', priority: 10, landmark: 'Hampton Pines Park' }],
  ['LAUDERDALE BY THE SEA', { name: 'Lauderdale By The Sea', county: 'Broward County', priority: 10, landmark: 'Anglins Fishing Pier' }],
  ['HILLSBORO BEACH', { name: 'Hillsboro Beach', county: 'Broward County', priority: 10, landmark: 'Hillsboro Mile' }],
  ['WEST PARK', { name: 'West Park', county: 'Broward County', priority: 10, landmark: 'McTyre Park' }],
  ['PEMBROKE PARK', { name: 'Pembroke Park', county: 'Broward County', priority: 10, landmark: 'Pembroke Park' }],
  ['SEA RANCH LAKES', { name: 'Sea Ranch Lakes', county: 'Broward County', priority: 10, landmark: 'Sea Ranch Lakes' }],

  // Miami-Dade County
  ['MIAMI GARDENS', { name: 'Miami Gardens', county: 'Miami-Dade County', priority: 13, landmark: 'Hard Rock Stadium' }],
  ['MIAMI LAKES', { name: 'Miami Lakes', county: 'Miami-Dade County', priority: 13, landmark: 'Main Street Miami Lakes' }],
  ['AVENTURA', { name: 'Aventura', county: 'Miami-Dade County', priority: 13, landmark: 'Aventura Mall' }],
  ['DORAL', { name: 'Doral', county: 'Miami-Dade County', priority: 13, landmark: 'CityPlace Doral' }],
  ['CORAL GABLES', { name: 'Coral Gables', county: 'Miami-Dade County', priority: 13, landmark: 'Miracle Mile' }],
  ['MIAMI', { name: 'Miami', county: 'Miami-Dade County', priority: 12, landmark: 'Brickell Financial District' }],
  ['MIAMI BEACH', { name: 'Miami Beach', county: 'Miami-Dade County', priority: 12, landmark: 'South Beach' }],
  ['NORTH MIAMI BEACH', { name: 'North Miami Beach', county: 'Miami-Dade County', priority: 12, landmark: 'Ancient Spanish Monastery' }],
  ['SUNNY ISLES BEACH', { name: 'Sunny Isles Beach', county: 'Miami-Dade County', priority: 12, landmark: 'Newport Fishing Pier' }],
  ['PINECREST', { name: 'Pinecrest', county: 'Miami-Dade County', priority: 12, landmark: 'Pinecrest Gardens' }],
  ['KEY BISCAYNE', { name: 'Key Biscayne', county: 'Miami-Dade County', priority: 12, landmark: 'Crandon Park' }],
  ['BAL HARBOUR', { name: 'Bal Harbour', county: 'Miami-Dade County', priority: 12, landmark: 'Bal Harbour Shops' }],
  ['NORTH MIAMI', { name: 'North Miami', county: 'Miami-Dade County', priority: 11, landmark: 'Oleta River State Park' }],
  ['HIALEAH', { name: 'Hialeah', county: 'Miami-Dade County', priority: 11, landmark: 'Amelia Earhart Park' }],
  ['HIALEAH GARDENS', { name: 'Hialeah Gardens', county: 'Miami-Dade County', priority: 11, landmark: 'Westland Gardens Park' }],
  ['KENDALL', { name: 'Kendall', county: 'Miami-Dade County', priority: 11, landmark: 'Dadeland Mall' }],
  ['MIAMI SPRINGS', { name: 'Miami Springs', county: 'Miami-Dade County', priority: 11, landmark: 'Miami Springs Golf & Country Club' }],
  ['MIAMI SHORES', { name: 'Miami Shores', county: 'Miami-Dade County', priority: 11, landmark: 'Miami Shores Country Club' }],
  ['CUTLER BAY', { name: 'Cutler Bay', county: 'Miami-Dade County', priority: 11, landmark: 'Southland Mall' }],
  ['PALMETTO BAY', { name: 'Palmetto Bay', county: 'Miami-Dade County', priority: 11, landmark: 'Deering Estate' }],
  ['SURFSIDE', { name: 'Surfside', county: 'Miami-Dade County', priority: 11, landmark: 'Surfside Community Center' }],
  ['BAY HARBOR ISLANDS', { name: 'Bay Harbor Islands', county: 'Miami-Dade County', priority: 11, landmark: 'Kane Concourse' }],
  ['GOLDEN BEACH', { name: 'Golden Beach', county: 'Miami-Dade County', priority: 11, landmark: 'Golden Beach' }],
  ['SOUTH MIAMI', { name: 'South Miami', county: 'Miami-Dade County', priority: 11, landmark: 'Sunset Drive' }],
  ['SWEETWATER', { name: 'Sweetwater', county: 'Miami-Dade County', priority: 10, landmark: 'Dolphin Mall' }],
  ['HOMESTEAD', { name: 'Homestead', county: 'Miami-Dade County', priority: 10, landmark: 'Homestead-Miami Speedway' }],
  ['OPA LOCKA', { name: 'Opa Locka', county: 'Miami-Dade County', priority: 10, landmark: 'Opa-locka Historic City Hall' }],
  ['FLORIDA CITY', { name: 'Florida City', county: 'Miami-Dade County', priority: 10, landmark: 'Florida Keys Outlet Marketplace' }],
  ['MEDLEY', { name: 'Medley', county: 'Miami-Dade County', priority: 10, landmark: 'Medley Industrial Corridor' }],
  ['VIRGINIA GARDENS', { name: 'Virginia Gardens', county: 'Miami-Dade County', priority: 10, landmark: 'Virginia Gardens' }],
  ['EL PORTAL', { name: 'El Portal', county: 'Miami-Dade County', priority: 10, landmark: 'El Portal Nature Trail' }],
  ['BISCAYNE PARK', { name: 'Biscayne Park', county: 'Miami-Dade County', priority: 10, landmark: 'Biscayne Park' }],
  ['WEST MIAMI', { name: 'West Miami', county: 'Miami-Dade County', priority: 10, landmark: 'West Miami' }],

  // Palm Beach County
  ['BOCA RATON', { name: 'Boca Raton', county: 'Palm Beach County', priority: 11, landmark: 'Mizner Park' }],
  ['WELLINGTON', { name: 'Wellington', county: 'Palm Beach County', priority: 11, landmark: 'Wellington International' }],
  ['JUPITER', { name: 'Jupiter', county: 'Palm Beach County', priority: 11, landmark: 'Jupiter Inlet Lighthouse' }],
  ['PALM BEACH GARDENS', { name: 'Palm Beach Gardens', county: 'Palm Beach County', priority: 11, landmark: 'The Gardens Mall' }],
  ['PALM BEACH', { name: 'Palm Beach', county: 'Palm Beach County', priority: 11, landmark: 'Worth Avenue' }],
  ['DELRAY BEACH', { name: 'Delray Beach', county: 'Palm Beach County', priority: 10, landmark: 'Atlantic Avenue' }],
  ['BOYNTON BEACH', { name: 'Boynton Beach', county: 'Palm Beach County', priority: 10, landmark: 'Boynton Harbor Marina' }],
  ['WEST PALM BEACH', { name: 'West Palm Beach', county: 'Palm Beach County', priority: 10, landmark: 'The Square' }],
  ['LAKE WORTH BEACH', { name: 'Lake Worth Beach', county: 'Palm Beach County', priority: 10, landmark: 'Lake Worth Pier' }],
  ['ROYAL PALM BEACH', { name: 'Royal Palm Beach', county: 'Palm Beach County', priority: 10, landmark: 'Commons Park' }],
  ['GREENACRES', { name: 'Greenacres', county: 'Palm Beach County', priority: 10, landmark: 'Samuel J. Ferreri Community Park' }],
  ['NORTH PALM BEACH', { name: 'North Palm Beach', county: 'Palm Beach County', priority: 10, landmark: 'John D. MacArthur Beach State Park' }],
  ['RIVIERA BEACH', { name: 'Riviera Beach', county: 'Palm Beach County', priority: 10, landmark: 'Peanut Island' }],
  ['LANTANA', { name: 'Lantana', county: 'Palm Beach County', priority: 10, landmark: 'Lantana Municipal Beach' }],
  ['PALM SPRINGS', { name: 'Palm Springs', county: 'Palm Beach County', priority: 10, landmark: 'Village of Palm Springs' }],
  ['TEQUESTA', { name: 'Tequesta', county: 'Palm Beach County', priority: 10, landmark: 'Coral Cove Park' }],

  // Monroe County (Florida Keys)
  ['ISLAMORADA', { name: 'Islamorada', county: 'Monroe County', priority: 10, landmark: 'Theater of the Sea' }],
  ['KEY LARGO', { name: 'Key Largo', county: 'Monroe County', priority: 10, landmark: 'John Pennekamp Coral Reef State Park' }],
  ['MARATHON', { name: 'Marathon', county: 'Monroe County', priority: 10, landmark: 'Seven Mile Bridge' }],
  ['KEY WEST', { name: 'Key West', county: 'Monroe County', priority: 10, landmark: 'Duval Street' }],
  ['TAVERNIER', { name: 'Tavernier', county: 'Monroe County', priority: 10, landmark: 'Tavernier Historic District' }]
]);

const SOUTH_FL_CITY_ALIASES = new Map([
  // Fort Lauderdale
  ['FT LAUDERDALE', 'FORT LAUDERDALE'],
  ['FTLAUDERDALE', 'FORT LAUDERDALE'],
  ['FORT LAUDERALE', 'FORT LAUDERDALE'],
  ['FT LAUDERALE', 'FORT LAUDERDALE'],
  ['FORT LAUDEDALE', 'FORT LAUDERDALE'],
  ['FT LAUD', 'FORT LAUDERDALE'],
  ['FORT LAUD', 'FORT LAUDERDALE'],
  ['LAUDERDALE', 'FORT LAUDERDALE'],

  // Miami
  ['MIAMI DADE', 'MIAMI'],
  ['MIAM', 'MIAMI'],
  ['MAMI', 'MIAMI'],
  ['MAIMI', 'MIAMI'],
  ['CITY OF MIAMI', 'MIAMI'],

  // Weston
  ['WESON', 'WESTON'],
  ['WESTN', 'WESTON'],

  // West Palm Beach
  ['WEST PALM BEAH', 'WEST PALM BEACH'],
  ['W PALM BEACH', 'WEST PALM BEACH'],
  ['W PALM BCH', 'WEST PALM BEACH'],
  ['WEST PALM BCH', 'WEST PALM BEACH'],
  ['WPB', 'WEST PALM BEACH'],
  ['W P B', 'WEST PALM BEACH'],
  ['WEST PALM', 'WEST PALM BEACH'],

  // Opa Locka
  ['OPALOCKA', 'OPA LOCKA'],
  ['OPA LOCK', 'OPA LOCKA'],

  // Palmetto Bay
  ['PALMETO BAY', 'PALMETTO BAY'],
  ['PALMETTO BY', 'PALMETTO BAY'],

  // Islamorada
  ['ISLA MORADA', 'ISLAMORADA'],

  // Broward variants
  ['PEMBROKE PINE', 'PEMBROKE PINES'],
  ['PEMBROKE PNS', 'PEMBROKE PINES'],
  ['PEMBRK PINES', 'PEMBROKE PINES'],
  ['PEMB PINES', 'PEMBROKE PINES'],
  ['HOLLYWOOD BEACH', 'HOLLYWOOD'],
  ['HOLLYWOOD BCH', 'HOLLYWOOD'],
  ['HOLLYWD', 'HOLLYWOOD'],
  ['SW RANCHES', 'SOUTHWEST RANCHES'],
  ['S W RANCHES', 'SOUTHWEST RANCHES'],
  ['SOUTH WEST RANCHES', 'SOUTHWEST RANCHES'],
  ['HALLANDALE', 'HALLANDALE BEACH'],
  ['HALLANDALE BCH', 'HALLANDALE BEACH'],
  ['HALLENDALE', 'HALLANDALE BEACH'],
  ['HALLENDALE BEACH', 'HALLANDALE BEACH'],
  ['DANIA', 'DANIA BEACH'],
  ['DANIA BCH', 'DANIA BEACH'],
  ['POMPANO', 'POMPANO BEACH'],
  ['POMPANO BCH', 'POMPANO BEACH'],
  ['DEERFIELD', 'DEERFIELD BEACH'],
  ['DEERFIELD BCH', 'DEERFIELD BEACH'],
  ['CORAL SPRING', 'CORAL SPRINGS'],
  ['CORAL SPGS', 'CORAL SPRINGS'],
  ['COCONUT CRK', 'COCONUT CREEK'],
  ['N LAUDERDALE', 'NORTH LAUDERDALE'],
  ['NO LAUDERDALE', 'NORTH LAUDERDALE'],
  ['LAUD BY THE SEA', 'LAUDERDALE BY THE SEA'],
  ['LAUDERDALE BY SEA', 'LAUDERDALE BY THE SEA'],

  // Miami-Dade variants
  ['MIAMI BCH', 'MIAMI BEACH'],
  ['SOUTH BEACH', 'MIAMI BEACH'],
  ['S MIAMI BEACH', 'MIAMI BEACH'],
  ['N MIAMI BEACH', 'NORTH MIAMI BEACH'],
  ['N MIAMI BCH', 'NORTH MIAMI BEACH'],
  ['NORTH MIAMI BCH', 'NORTH MIAMI BEACH'],
  ['NMB', 'NORTH MIAMI BEACH'],
  ['N M B', 'NORTH MIAMI BEACH'],
  ['N MIAMI', 'NORTH MIAMI'],
  ['NO MIAMI', 'NORTH MIAMI'],
  ['S MIAMI', 'SOUTH MIAMI'],
  ['SO MIAMI', 'SOUTH MIAMI'],
  ['SUNNY ISLES', 'SUNNY ISLES BEACH'],
  ['SUNNY ISLES BCH', 'SUNNY ISLES BEACH'],
  ['SUNNY ISLE BEACH', 'SUNNY ISLES BEACH'],
  ['SUNNY ISLE', 'SUNNY ISLES BEACH'],
  ['MIAMI GRDNS', 'MIAMI GARDENS'],
  ['MIAMI GDNS', 'MIAMI GARDENS'],
  ['CAROL CITY', 'MIAMI GARDENS'],
  ['HIALEAH GDNS', 'HIALEAH GARDENS'],
  ['HIALEAH GRDNS', 'HIALEAH GARDENS'],
  ['CORAL GABLE', 'CORAL GABLES'],
  ['CUTLER RIDGE', 'CUTLER BAY'],
  ['BAL HARBOR', 'BAL HARBOUR'],
  ['BAL HARBOUR VILLAGE', 'BAL HARBOUR'],
  ['BAY HARBOR', 'BAY HARBOR ISLANDS'],
  ['BAY HARBOR ISLAND', 'BAY HARBOR ISLANDS'],
  ['BAY HARBOUR', 'BAY HARBOR ISLANDS'],
  ['BAY HARBOUR ISLANDS', 'BAY HARBOR ISLANDS'],
  ['KEY BISC', 'KEY BISCAYNE'],

  // Palm Beach variants
  ['BOCA', 'BOCA RATON'],
  ['DELRAY', 'DELRAY BEACH'],
  ['DELRAY BCH', 'DELRAY BEACH'],
  ['BOYNTON', 'BOYNTON BEACH'],
  ['BOYNTON BCH', 'BOYNTON BEACH'],
  ['LAKE WORTH', 'LAKE WORTH BEACH'],
  ['LK WORTH', 'LAKE WORTH BEACH'],
  ['LAKE WORTH BCH', 'LAKE WORTH BEACH'],
  ['PBG', 'PALM BEACH GARDENS'],
  ['P B G', 'PALM BEACH GARDENS'],
  ['PALM BCH GARDENS', 'PALM BEACH GARDENS'],
  ['PALM BEACH GDNS', 'PALM BEACH GARDENS'],
  ['ROYAL PALM BCH', 'ROYAL PALM BEACH'],
  ['ROYAL PALM', 'ROYAL PALM BEACH'],
  ['N PALM BEACH', 'NORTH PALM BEACH'],
  ['N PALM BCH', 'NORTH PALM BEACH'],
  ['NORTH PALM BCH', 'NORTH PALM BEACH'],
  ['RIVIERA BCH', 'RIVIERA BEACH']
]);

const SOUTH_FL_ZIP_CITIES = new Map([
  // Broward & Monroe 330xx
  ['33004', 'DANIA BEACH'],
  ['33009', 'HALLANDALE BEACH'],
  ['33019', 'HOLLYWOOD'], ['33020', 'HOLLYWOOD'], ['33021', 'HOLLYWOOD'],
  ['33023', 'MIRAMAR'], ['33025', 'MIRAMAR'], ['33027', 'MIRAMAR'],
  ['33024', 'PEMBROKE PINES'], ['33026', 'PEMBROKE PINES'], ['33028', 'PEMBROKE PINES'], ['33029', 'PEMBROKE PINES'],
  ['33060', 'POMPANO BEACH'], ['33062', 'POMPANO BEACH'], ['33069', 'POMPANO BEACH'],
  ['33063', 'MARGATE'],
  ['33064', 'DEERFIELD BEACH'],
  ['33065', 'CORAL SPRINGS'], ['33071', 'CORAL SPRINGS'],
  ['33066', 'COCONUT CREEK'], ['33073', 'COCONUT CREEK'],
  ['33067', 'PARKLAND'], ['33076', 'PARKLAND'],
  ['33068', 'NORTH LAUDERDALE'],
  ['33036', 'ISLAMORADA'],
  ['33037', 'KEY LARGO'],
  ['33040', 'KEY WEST'], ['33042', 'KEY WEST'], ['33043', 'KEY WEST'],
  ['33050', 'MARATHON'], ['33051', 'MARATHON'],
  ['33070', 'TAVERNIER'],
  // Miami-Dade 330xx & 331xx
  ['33010', 'HIALEAH'], ['33012', 'HIALEAH'], ['33013', 'HIALEAH'], ['33015', 'HIALEAH'], ['33018', 'HIALEAH'],
  ['33014', 'MIAMI LAKES'], ['33016', 'HIALEAH GARDENS'],
  ['33030', 'HOMESTEAD'], ['33033', 'HOMESTEAD'], ['33035', 'HOMESTEAD'],
  ['33034', 'FLORIDA CITY'],
  ['33054', 'OPA LOCKA'],
  ['33055', 'MIAMI GARDENS'], ['33056', 'MIAMI GARDENS'],
  ['33122', 'DORAL'], ['33166', 'DORAL'], ['33172', 'DORAL'], ['33178', 'DORAL'],
  ['33134', 'CORAL GABLES'], ['33146', 'CORAL GABLES'],
  ['33139', 'MIAMI BEACH'], ['33140', 'MIAMI BEACH'], ['33141', 'MIAMI BEACH'],
  ['33149', 'KEY BISCAYNE'],
  ['33154', 'BAL HARBOUR'],
  ['33156', 'PINECREST'],
  ['33157', 'PALMETTO BAY'],
  ['33160', 'SUNNY ISLES BEACH'],
  ['33161', 'NORTH MIAMI'], ['33168', 'NORTH MIAMI'],
  ['33162', 'NORTH MIAMI BEACH'], ['33179', 'NORTH MIAMI BEACH'],
  ['33180', 'AVENTURA'],
  ['33189', 'CUTLER BAY'], ['33190', 'CUTLER BAY'],
  // Broward 333xx
  ['33301', 'FORT LAUDERDALE'], ['33304', 'FORT LAUDERDALE'], ['33305', 'FORT LAUDERDALE'],
  ['33306', 'FORT LAUDERDALE'], ['33308', 'FORT LAUDERDALE'], ['33309', 'FORT LAUDERDALE'],
  ['33311', 'FORT LAUDERDALE'], ['33312', 'FORT LAUDERDALE'], ['33315', 'FORT LAUDERDALE'],
  ['33316', 'FORT LAUDERDALE'], ['33334', 'FORT LAUDERDALE'],
  ['33313', 'LAUDERHILL'], ['33319', 'LAUDERHILL'],
  ['33314', 'DAVIE'], ['33325', 'DAVIE'], ['33328', 'DAVIE'],
  ['33330', 'COOPER CITY'],
  ['33317', 'PLANTATION'], ['33322', 'PLANTATION'], ['33324', 'PLANTATION'],
  ['33321', 'TAMARAC'],
  ['33323', 'SUNRISE'], ['33351', 'SUNRISE'],
  ['33326', 'WESTON'], ['33327', 'WESTON'], ['33331', 'WESTON'], ['33332', 'SOUTHWEST RANCHES'],
  // Palm Beach 334xx
  ['33401', 'WEST PALM BEACH'], ['33405', 'WEST PALM BEACH'], ['33407', 'WEST PALM BEACH'], ['33409', 'WEST PALM BEACH'],
  ['33410', 'PALM BEACH GARDENS'], ['33418', 'PALM BEACH GARDENS'],
  ['33411', 'ROYAL PALM BEACH'],
  ['33414', 'WELLINGTON'],
  ['33426', 'BOYNTON BEACH'], ['33435', 'BOYNTON BEACH'], ['33436', 'BOYNTON BEACH'], ['33437', 'BOYNTON BEACH'],
  ['33428', 'BOCA RATON'], ['33431', 'BOCA RATON'], ['33432', 'BOCA RATON'], ['33433', 'BOCA RATON'],
  ['33434', 'BOCA RATON'], ['33486', 'BOCA RATON'], ['33487', 'BOCA RATON'], ['33496', 'BOCA RATON'], ['33498', 'BOCA RATON'],
  ['33444', 'DELRAY BEACH'], ['33445', 'DELRAY BEACH'], ['33446', 'DELRAY BEACH'], ['33483', 'DELRAY BEACH'], ['33484', 'DELRAY BEACH'],
  ['33458', 'JUPITER'], ['33477', 'JUPITER'], ['33478', 'JUPITER'],
  ['33460', 'LAKE WORTH BEACH'], ['33461', 'LAKE WORTH BEACH'], ['33463', 'LAKE WORTH BEACH'], ['33467', 'LAKE WORTH BEACH'],
  ['33480', 'PALM BEACH']
]);

const MONROE_KEYS_ZIPS = new Set(['33036', '33037', '33040', '33042', '33043', '33050', '33051', '33070']);

// ---------------------------------------------------------------------------
// 2. Niche Classification, Offer Tiers & Industry Lingo / Demand Rules
// ---------------------------------------------------------------------------
export const OFFER_TIERS = {
  platform_3k: {
    id: 'platform_3k',
    label: '$3,000 Web Platform',
    shortLabel: '$3k Platform',
    price: 3000,
    description: 'Custom sub-1.5s mobile web platform + LocalBusiness JSON-LD schema + conversion architecture for established operators losing calls to broken, missing, or slow mobile sites.'
  },
  retainer_2500: {
    id: 'retainer_2500',
    label: '$2,500/mo Growth Retainer',
    shortLabel: '$2.5k/mo Retainer',
    price: 2500,
    description: 'Ongoing Map Pack authority, service-area entity schema, neighborhood landing pages, and review velocity to move rank #6–#25 operators into the Top 3 Map Pack.'
  },
  pilot_500: {
    id: 'pilot_500',
    label: '$500 48-Hour Quick-Win Pilot',
    shortLabel: '$500 Pilot',
    price: 500,
    description: 'Fast-turnaround custom homepage/landing page deployment + GBP No-Suspension & LocalBusiness Schema setup for newer local operators.'
  }
};

export const NICHE_RULES = [
  {
    niche: 'Roofing',
    boost: 38,
    audienceNoun: 'homeowners',
    businessNoun: 'roofing company',
    serviceTerm: 'roofing services',
    topServiceQueries: 'roof repair, roof replacement, and local roofers',
    lingoServices: 'full re-roofs, tile & metal replacements, and storm leak repairs',
    lingoQuestion: 'Could you use a few more full re-roof or leak repair estimates coming in from Google, or is your crew already booked out?',
    seedKeywords: ['roofer', 'roofing company', 'roof repair', 'roof replacement', 'roofer near me', 'roofing contractor'],
    searchDemand: {
      'Broward County': 3570,
      'Miami-Dade County': 6430,
      'Palm Beach County': 2630,
      'Monroe County': 660,
      default: 3570
    },
    serviceHook: 'roof replacements, storm damage inspections, and emergency leak repairs',
    pattern: /\b(ROOF|ROOFING|ROOFER|ROOFERS|SHINGLE|RE-ROOF)\b/i
  },
  {
    niche: 'HVAC',
    boost: 38,
    audienceNoun: 'homeowners',
    businessNoun: 'HVAC company',
    serviceTerm: 'AC & HVAC services',
    topServiceQueries: 'AC repair, HVAC installation, and emergency AC service',
    lingoServices: 'AC changeouts, emergency no-cool service calls, and maintenance agreements',
    lingoQuestion: 'Could you use more AC changeout and service calls from Google right now, or are your techs already running at capacity?',
    seedKeywords: ['ac repair', 'air conditioning repair', 'hvac repair', 'ac installation', 'hvac company', 'ac repair near me'],
    searchDemand: {
      'Broward County': 8550,
      'Miami-Dade County': 12860,
      'Palm Beach County': 6340,
      'Monroe County': 1590,
      default: 8550
    },
    serviceHook: 'AC repair, HVAC installations, and emergency cooling calls',
    pattern: /\b(HVAC|AIR CONDITIONING|A\/C|COOLING|REFRIGERATION|CLIMATE CONTROL|DUCTWORK|MECHANICAL)\b/i
  },
  {
    niche: 'Plumbing',
    boost: 38,
    audienceNoun: 'homeowners',
    businessNoun: 'plumbing company',
    serviceTerm: 'plumbing services',
    topServiceQueries: 'emergency plumbers, drain cleaning, leak repair, and water heaters',
    lingoServices: 'emergency service calls, slab leaks, repipes, and water heater installs',
    lingoQuestion: 'Could you use more high-ticket repipe, water heater, or emergency dispatch calls from Google, or is your board already full?',
    seedKeywords: ['plumber', 'plumber near me', 'plumbing company', 'emergency plumber', 'drain cleaning', 'water heater repair'],
    searchDemand: {
      'Broward County': 11910,
      'Miami-Dade County': 17210,
      'Palm Beach County': 8540,
      'Monroe County': 2140,
      default: 11910
    },
    serviceHook: 'emergency plumbing, leak detection, water heaters, and drain clearing',
    pattern: /\b(PLUMB|PLUMBING|PLUMBER|DRAIN|ROOTER|SEWER|PIPING)\b/i
  },
  {
    niche: 'Electrical',
    boost: 38,
    audienceNoun: 'homeowners',
    businessNoun: 'electrical contractor',
    serviceTerm: 'electrical services',
    topServiceQueries: 'local electricians, panel upgrades, and generator installation',
    lingoServices: 'panel upgrades, whole-home generator installs, EV chargers, and commercial buildouts',
    lingoQuestion: 'Could you use more panel upgrade, generator install, or service calls from Google, or are you mostly booked through GCs and referrals?',
    seedKeywords: ['electrician', 'electrician near me', 'electrical contractor', 'panel upgrade', 'generator installation'],
    searchDemand: {
      'Broward County': 3860,
      'Miami-Dade County': 6050,
      'Palm Beach County': 3450,
      'Monroe County': 860,
      default: 3860
    },
    serviceHook: 'panel upgrades, residential & commercial electrical, and EV/generator installs',
    pattern: /\b(ELECTRIC|ELECTRICAL|ELECTRICIAN|WIRING|LIGHTING|GENERATOR)\b/i
  },
  {
    niche: 'Landscaping & Lawn',
    boost: 35,
    audienceNoun: 'homeowners',
    businessNoun: 'landscaping company',
    serviceTerm: 'landscaping & hardscape services',
    topServiceQueries: 'landscaping, lawn care, tree service, and paver installation',
    lingoServices: 'HOA/commercial maintenance accounts, paver & travertine installs, and sod/design jobs',
    lingoQuestion: 'Are you looking to add more recurring route density and paver/design installs from Google, or is your schedule already packed?',
    seedKeywords: ['landscaping', 'landscaping near me', 'lawn care', 'tree service', 'paver installation', 'sod installation'],
    searchDemand: {
      'Broward County': 2270,
      'Miami-Dade County': 3870,
      'Palm Beach County': 2030,
      'Monroe County': 510,
      default: 2270
    },
    serviceHook: 'landscape design, sod installation, tree service, and commercial lawn care',
    pattern: /\b(LANDSCAP|LAWN|TURF|TREE SERVICE|ARBOR|IRRIGATION|HARDSCAP|PAVER|SOD)\b/i
  },
  {
    niche: 'Construction & Remodeling',
    boost: 34,
    audienceNoun: 'homeowners',
    businessNoun: 'remodeling contractor',
    serviceTerm: 'remodeling & contracting services',
    topServiceQueries: 'kitchen & bath remodeling, impact windows, and general contractors',
    lingoServices: 'kitchen & bath gut-remodels, impact windows & doors, and residential additions',
    lingoQuestion: 'Could you use more qualified homeowner estimates for remodels or impact jobs from Google, or is your pipeline booked out on referrals?',
    seedKeywords: ['general contractor', 'home remodeling', 'kitchen remodeling', 'bathroom remodeling', 'impact windows'],
    searchDemand: {
      'Broward County': 3650,
      'Miami-Dade County': 4330,
      'Palm Beach County': 2330,
      'Monroe County': 580,
      default: 3650
    },
    serviceHook: 'kitchen & bath remodeling, impact windows, flooring, and general contracting',
    pattern: /\b(REMODEL|RENOVAT|CONSTRUCTION|CONTRACTOR|BUILDERS|CABINET|FLOORING|DRYWALL|PAINTING|PAINTER|STUCCO|FENCE|FENCING|GLAZING|WINDOWS|DOORS|CONCRETE|MASONRY|HANDYMAN)\b/i
  },
  {
    niche: 'Pool & Outdoor',
    boost: 34,
    audienceNoun: 'homeowners',
    businessNoun: 'pool company',
    serviceTerm: 'pool & outdoor living services',
    topServiceQueries: 'pool cleaning, pool repair, resurfacing, and custom pool builders',
    lingoServices: 'diamond brite resurfacing, custom pool builds, screen enclosures, and weekly route accounts',
    lingoQuestion: 'Could you use more pool resurfacing, remodel, or weekly route leads from Google right now?',
    seedKeywords: ['pool service', 'pool cleaning', 'pool repair', 'pool builder', 'pool resurfacing'],
    searchDemand: {
      'Broward County': 1300,
      'Miami-Dade County': 1290,
      'Palm Beach County': 840,
      'Monroe County': 210,
      default: 1300
    },
    serviceHook: 'pool maintenance, resurfacing, patio enclosures, and outdoor kitchens',
    pattern: /\b(POOL|POOLS|SPA|PATIO|PERGOLA|SCREEN ENCLOSURE)\b/i
  },
  {
    niche: 'Pest Control & Mold',
    boost: 34,
    audienceNoun: 'homeowners',
    businessNoun: 'pest & restoration company',
    serviceTerm: 'pest control & remediation services',
    topServiceQueries: 'pest control, termite treatment, mold remediation, and water damage restoration',
    lingoServices: 'recurring pest routes, termite treatments, water mitigation, and mold remediation jobs',
    lingoQuestion: 'Could you use more emergency mitigation calls or recurring pest route signups from Google?',
    seedKeywords: ['pest control', 'exterminator', 'termite control', 'mold remediation', 'water damage restoration'],
    searchDemand: {
      'Broward County': 3000,
      'Miami-Dade County': 4690,
      'Palm Beach County': 2530,
      'Monroe County': 630,
      default: 3000
    },
    serviceHook: 'pest control, termite protection, mold remediation, and water damage restoration',
    pattern: /\b(PEST|EXTERMINAT|TERMITE|MOLD|RESTORATION|MITIGATION|BIOHAZARD)\b/i
  },
  {
    niche: 'Cleaning & Property Care',
    boost: 30,
    audienceNoun: 'property owners',
    businessNoun: 'cleaning company',
    serviceTerm: 'cleaning & property care services',
    topServiceQueries: 'house cleaning, commercial janitorial, and pressure washing',
    lingoServices: 'commercial janitorial contracts, recurring residential cleanings, and roof/paver soft-washing',
    lingoQuestion: 'Could you use more commercial walkthroughs or recurring residential bookings from Google?',
    seedKeywords: ['house cleaning', 'commercial cleaning', 'pressure washing', 'maid service', 'janitorial services'],
    searchDemand: {
      'Broward County': 3350,
      'Miami-Dade County': 4070,
      'Palm Beach County': 2750,
      'Monroe County': 690,
      default: 3350
    },
    serviceHook: 'commercial janitorial, pressure washing, and residential maid services',
    pattern: /\b(CLEANING|CLEANERS|MAID|JANITORIAL|PRESSURE WASH|POWER WASH|SOFT WASH|WINDOW CLEANING|CARPET CLEANING)\b/i
  },
  {
    niche: 'Medical, Dental & Wellness',
    boost: 35,
    audienceNoun: 'patients',
    businessNoun: 'practice',
    serviceTerm: 'dental, medical & wellness services',
    topServiceQueries: 'local dentists, dental implants, med spas, and chiropractors',
    lingoServices: 'high-value Cash/PPO patient bookings, implant & cosmetic consults, and aesthetic treatments',
    lingoQuestion: 'Could you use more private-pay consults and new patient bookings coming in from Google?',
    seedKeywords: ['dentist near me', 'med spa', 'chiropractor near me', 'physical therapy', 'dental implants'],
    searchDemand: {
      'Broward County': 20700,
      'Miami-Dade County': 24500,
      'Palm Beach County': 17280,
      'Monroe County': 4320,
      default: 20700
    },
    serviceHook: 'new patient bookings, local treatment searches, and high-trust clinic visibility',
    pattern: /\b(DENTAL|DENTIST|ORTHODONT|MEDICAL|CLINIC|HEALTH|WELLNESS|MEDSPA|AESTHETIC|CHIROPRACT|THERAPY|PHYSICAL THERAPY|COUNSELING|PEDIATRIC|DERMATOLOG|OPTOMETR|VISION|PHARMACY|CARE|NURSING)\b/i
  },
  {
    niche: 'Fitness & Studios',
    boost: 33,
    audienceNoun: 'members',
    businessNoun: 'studio',
    serviceTerm: 'classes & studio memberships',
    topServiceQueries: 'local gyms, pilates & yoga studios, dance classes, and martial arts',
    lingoServices: 'paid intro trials, recurring monthly memberships, and youth/adult class enrollments',
    lingoQuestion: 'Could you use more local intro-trial bookings and monthly members from Google as you fill up your class schedule?',
    seedKeywords: ['dance studio', 'pilates studio', 'gym near me', 'martial arts', 'yoga studio'],
    searchDemand: {
      'Broward County': 20350,
      'Miami-Dade County': 31000,
      'Palm Beach County': 11790,
      'Monroe County': 2950,
      default: 20350
    },
    serviceHook: 'new class trials, studio memberships, and local parent/student signups',
    pattern: /\b(DANCE|STUDIO|GYM|FITNESS|PILATES|YOGA|MARTIAL ARTS|KARATE|JIU JITSU|BOXING|ACADEMY|CROSSFIT|TRAINING)\b/i
  },
  {
    niche: 'Legal & Accounting',
    boost: 32,
    audienceNoun: 'clients',
    businessNoun: 'firm',
    serviceTerm: 'legal & accounting services',
    topServiceQueries: 'local CPAs, tax accountants, bookkeeping, and attorneys',
    lingoServices: 'qualified client retainers, business tax/advisory engagements, and high-intent case consults',
    lingoQuestion: 'Could your practice use more qualified local client consultations coming in from Google?',
    seedKeywords: ['cpa near me', 'tax accountant', 'real estate attorney', 'personal injury lawyer', 'bookkeeping services'],
    searchDemand: {
      'Broward County': 1030,
      'Miami-Dade County': 1330,
      'Palm Beach County': 790,
      'Monroe County': 200,
      default: 1030
    },
    serviceHook: 'high-intent client consultations, local practice visibility, and authority positioning',
    pattern: /\b(LAW|LEGAL|ATTORNEY|COUNSEL|ESQ|CPA|ACCOUNTING|TAX|BOOKKEEPING|ADVISOR|NOTARY)\b/i
  },
  {
    niche: 'Auto & Marine',
    boost: 28,
    audienceNoun: 'vehicle & boat owners',
    businessNoun: 'shop',
    serviceTerm: 'auto & marine services',
    topServiceQueries: 'auto repair, mobile detailing, mechanics, and boat repair',
    lingoServices: 'ceramic coating & detailing packages, marine/outboard service, and high-ticket repair tickets',
    lingoQuestion: 'Could you use more high-ticket service bays or mobile bookings coming in from Google?',
    seedKeywords: ['auto detailing', 'mobile detailing', 'auto repair', 'mechanic near me', 'boat repair'],
    searchDemand: {
      'Broward County': 5420,
      'Miami-Dade County': 6280,
      'Palm Beach County': 3690,
      'Monroe County': 920,
      default: 5420
    },
    serviceHook: 'mobile detailing, marine service, auto repair, and fleet care',
    pattern: /\b(AUTO|AUTOMOTIVE|DETAILING|CAR WASH|TOWING|MECHANIC|BODY SHOP|TIRES|MARINE|YACHT|BOAT)\b/i
  }
];

function normalizeCountyDemandKey(countyName) {
  const raw = String(countyName || '').trim();
  if (!raw) return 'Broward County';
  if (/monroe/i.test(raw)) return 'Monroe County';
  if (/broward/i.test(raw)) return 'Broward County';
  if (/miami|dade/i.test(raw)) return 'Miami-Dade County';
  if (/palm\s*beach/i.test(raw)) return 'Palm Beach County';
  return raw;
}

export function getNicheOutreachMeta(nicheName, countyName = 'Broward County') {
  const countyKey = normalizeCountyDemandKey(countyName);
  const rule = NICHE_RULES.find(r => r.niche === nicheName);
  if (!rule) {
    const fallbackCount = countyKey === 'Monroe County' ? 460 : 1850;
    return {
      audienceNoun: 'customers',
      businessNoun: 'local business',
      serviceTerm: 'local services',
      topServiceQueries: 'local services in your area',
      lingoServices: 'new customer inquiries and local bookings',
      lingoQuestion: 'Could you use any more leads from Google?',
      seedKeywords: ['local contractor', 'home services'],
      searchersCount: fallbackCount,
      searchersFormatted: fallbackCount.toLocaleString('en-US')
    };
  }
  const count = (rule.searchDemand && (rule.searchDemand[countyKey] || rule.searchDemand[countyName] || rule.searchDemand.default)) || 2500;
  return {
    audienceNoun: rule.audienceNoun || 'customers',
    businessNoun: rule.businessNoun || 'local business',
    serviceTerm: rule.serviceTerm,
    topServiceQueries: rule.topServiceQueries || rule.serviceTerm,
    lingoServices: rule.lingoServices,
    lingoQuestion: rule.lingoQuestion,
    seedKeywords: rule.seedKeywords,
    searchersCount: count,
    searchersFormatted: count.toLocaleString('en-US')
  };
}

// Shell / Holding / Passive Entity Exclusion Patterns
const SHELL_ENTITY_PATTERNS = [
  /\b(HOLDINGS?|INVESTMENTS?|PROPERTIES|PROPERTY|VENTURES|CAPITAL|ASSET|ASSETS|EQUITY|EQUITIES|TRUST|ESTATE|ROYALTIES|ACQUISITIONS?|PORTFOLIO|FUND|SPV|SERIES|SYNDICATE)\b/i,
  /^\d{2,6}\s+(NW|NE|SW|SE|N|S|E|W|NORTH|SOUTH|EAST|WEST|AVE|ST|RD|BLVD|TER|CT|LN|DR|WAY|PL|CIR|PKWY|HWY)\b/i,
  /\b(APT|UNIT|SUITE|LOT|PARCEL|CONDO)\s+#?\d+/i
];

// Known commercial Registered Agent mills to avoid mistaking for the founder
const CORPORATE_AGENT_PATTERNS = /\b(REGISTERED AGENTS? INC|NORTHWEST REGISTERED|LEGALINC|LEGALZOOM|BIZEFILE|ZENBUSINESS|INCFILE|UNITED STATES CORPORATION AGENTS|CORPORATION SERVICE COMPANY|CT CORPORATION|INCORP SERVICES|COGENCY GLOBAL|HARBOR COMPLIANCE|SUNBIZ FILING|CORPORATE CREATIONS)\b/i;

// Social/Directory domains that do not count as an owned standalone business website
const SOCIAL_OR_DIRECTORY_DOMAINS = /(^|\.)(facebook\.com|fb\.com|instagram\.com|yelp\.com|linktr\.ee|linkedin\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|nextdoor\.com|angi\.com|homeadvisor\.com|thumbtack\.com|porch\.com|houzz\.com|bbb\.org|yellowpages\.com|superpages\.com|manta\.com|mapquest\.com|bark\.com|buildzoom\.com|birdeye\.com|google\.com|goo\.gl)$/i;

// Wildcard DNS-rebinding domains blocked for SSRF protection
const DNS_REBINDING_DOMAINS = [
  'nip.io',
  'sslip.io',
  'xip.io',
  'localtest.me',
  'lvh.me',
  'vcap.me'
];

// ---------------------------------------------------------------------------
// 3. String, City & Name Normalization Helpers
// ---------------------------------------------------------------------------
export function toTitleCase(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b([a-z])([a-z]*)/g, (_, first, rest) => {
      const word = first + rest;
      if (['llc', 'inc', 'pa', 'pllc', 'lp', 'llp', 'dba', 'fl', 'usa', 'ii', 'iii', 'iv', 'hvac', 'cpa', 'md'].includes(word)) {
        return word.toUpperCase();
      }
      return first.toUpperCase() + rest;
    });
}

export function cleanBusinessName(rawName) {
  if (!rawName) return '';
  const stripped = String(rawName)
    .trim()
    .replace(/,?\s*\b(L\.?L\.?C\.?|INC\.?|INCORPORATED|CORP\.?|CORPORATION|CO\.?|COMPANY|P\.?A\.?|P\.?L\.?L\.?C\.?|L\.?P\.?|L\.?L\.?P\.?)\s*$/i, '')
    .trim();
  return toTitleCase(stripped || rawName);
}

export function isShellOrHoldingEntity(businessName) {
  const name = String(businessName || '').trim();
  if (!name || name.length < 3) return true;
  return SHELL_ENTITY_PATTERNS.some(rx => rx.test(name));
}

export function normalizeSouthFlCity(rawCity, rawZip = '') {
  const rawStr = String(rawCity || '').trim();
  const explicitZipMatch = String(rawZip || '').trim().match(/\b(\d{5})\b/);
  const embeddedZipMatch = rawStr.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  const zip5 = (explicitZipMatch && explicitZipMatch[1]) || (embeddedZipMatch && embeddedZipMatch[1]) || '';

  let cleaned = rawStr
    .replace(/[.,#/_-]+/g, ' ')
    .replace(/['’"`]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  cleaned = cleaned.replace(/\s+\d{5}(?:\s+\d{4})?$/, '').trim();
  cleaned = cleaned.replace(/^(.+?)\s+(?:FL|FLA|FLORIDA)$/, '$1').trim();

  if (!cleaned || /^(?:FL|FLA|FLORIDA)$/.test(cleaned) || !/[A-Z]{2}/.test(cleaned)) {
    if (zip5 && SOUTH_FL_ZIP_CITIES.has(zip5)) {
      const zipCanon = SOUTH_FL_ZIP_CITIES.get(zip5);
      return SOUTH_FL_CITIES.get(zipCanon)?.name || toTitleCase(zipCanon);
    }
    return '';
  }

  const canonicalKey = SOUTH_FL_CITY_ALIASES.get(cleaned) || cleaned;
  if (SOUTH_FL_CITIES.has(canonicalKey)) {
    return SOUTH_FL_CITIES.get(canonicalKey).name;
  }

  return toTitleCase(cleaned);
}

export function matchSouthFloridaLocation(cityInput, zipInput, stateInput = 'FL') {
  const state = String(stateInput || 'FL').trim().toUpperCase();
  if (state && state !== 'FL' && state !== 'FLA' && state !== 'FLORIDA') {
    return { isSouthFlorida: false, city: toTitleCase(cityInput), county: 'Out of State', priority: 0 };
  }

  const zipMatch = String(zipInput || '').trim().match(/^(\d{5})/);
  const zip = zipMatch ? zipMatch[1] : '';
  const normalizedCity = normalizeSouthFlCity(cityInput, zip);
  const lookupKey = normalizedCity.toUpperCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

  if (lookupKey && SOUTH_FL_CITIES.has(lookupKey)) {
    const match = SOUTH_FL_CITIES.get(lookupKey);
    return {
      isSouthFlorida: true,
      city: match.name,
      county: match.county,
      landmark: match.landmark,
      priority: match.priority
    };
  }

  if (/^33[01234]\d{2}$/.test(zip)) {
    const prefix = zip.slice(0, 3);
    const county = MONROE_KEYS_ZIPS.has(zip)
      ? 'Monroe County'
      : (prefix === '330' || prefix === '333')
        ? 'Broward County'
        : (prefix === '331' || prefix === '332')
          ? 'Miami-Dade County'
          : 'Palm Beach County';
    return {
      isSouthFlorida: true,
      city: normalizedCity || 'South Florida',
      county,
      landmark: 'South Florida',
      priority: 8
    };
  }

  return {
    isSouthFlorida: false,
    city: normalizedCity || 'Florida',
    county: 'Florida',
    landmark: 'Florida',
    priority: 0
  };
}

/**
 * Shared parameterized WHERE clause builder for outreach candidate queries & CSV exports.
 * Supports legacy filters plus Maps Diagnostic & Multi-Touch Cadence filters.
 */
export function buildOutreachWhereClause({
  search = '',
  status = 'active',
  niche = 'all',
  city = 'all',
  contactFilter = 'all',
  recommendedTier = 'all',
  websiteStatus = 'all',
  cadenceFilter = 'all',
  dueFollowup = 'all'
} = {}) {
  const conditions = [];
  const params = [];

  if (status === 'active') {
    conditions.push("outreach_status != 'dismissed'");
  } else if (status === 'in_cadence') {
    conditions.push("((outreach_status = 'in_cadence' OR COALESCE(cadence_step, 0) >= 1) AND outreach_status != 'dismissed')");
  } else if (status && status !== 'all') {
    conditions.push('outreach_status = ?');
    params.push(status);
  }

  if (niche && niche !== 'all') {
    conditions.push('niche = ?');
    params.push(niche);
  }

  if (city && city !== 'all') {
    const normCity = normalizeSouthFlCity(city);
    if (normCity && normCity !== city) {
      conditions.push('(city = ? OR city = ?)');
      params.push(city, normCity);
    } else {
      conditions.push('city = ?');
      params.push(normCity || city);
    }
  }

  if (contactFilter === 'has_email') {
    conditions.push("email IS NOT NULL AND email != ''");
  } else if (contactFilter === 'has_phone') {
    conditions.push("phone IS NOT NULL AND phone != ''");
  } else if (contactFilter === 'has_any') {
    conditions.push("((email IS NOT NULL AND email != '') OR (phone IS NOT NULL AND phone != ''))");
  } else if (contactFilter === 'needs_enrichment') {
    conditions.push("(email IS NULL OR email = '') AND enrichment_status = 'unattempted'");
  }

  if (recommendedTier && recommendedTier !== 'all') {
    conditions.push('recommended_tier = ?');
    params.push(recommendedTier);
  }

  if (websiteStatus && websiteStatus !== 'all') {
    if (websiteStatus === 'needs_fix') {
      conditions.push("(website_status IN ('missing', 'broken', 'slow', 'unoptimized') OR website IS NULL OR website = '')");
    } else {
      conditions.push('website_status = ?');
      params.push(websiteStatus);
    }
  }

  const effectiveCadence = (cadenceFilter && cadenceFilter !== 'all')
    ? cadenceFilter
    : (dueFollowup === true || dueFollowup === 'true' || dueFollowup === '1')
      ? 'due_today'
      : (dueFollowup || 'all');

  if (effectiveCadence && effectiveCadence !== 'all') {
    if (effectiveCadence === 'due_today') {
      conditions.push("(outreach_status != 'dismissed' AND COALESCE(cadence_step, 0) < 4 AND next_action_at IS NOT NULL AND datetime(next_action_at) <= datetime('now'))");
    } else if (effectiveCadence === 'step_0') {
      conditions.push('COALESCE(cadence_step, 0) = 0');
    } else if (effectiveCadence === 'step_1') {
      conditions.push('cadence_step = 1');
    } else if (effectiveCadence === 'step_2') {
      conditions.push('cadence_step = 2');
    } else if (effectiveCadence === 'step_3') {
      conditions.push('cadence_step = 3');
    } else if (effectiveCadence === 'step_4') {
      conditions.push('cadence_step >= 4');
    } else if (effectiveCadence === 'in_cadence') {
      conditions.push("((outreach_status = 'in_cadence' OR COALESCE(cadence_step, 0) BETWEEN 1 AND 3) AND outreach_status != 'dismissed')");
    }
  }

  if (search) {
    conditions.push('(business_name LIKE ? OR business_name_clean LIKE ? OR founder_name LIKE ? OR city LIKE ? OR niche LIKE ? OR doc_number LIKE ? OR email LIKE ? OR phone LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term, term, term);
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

export function classifyAndScoreBusiness(businessName, cityMeta, categoryHint = '') {
  const combined = `${String(businessName || '')} ${String(categoryHint || '')}`;
  let matchedNiche = 'Local Business';
  let nicheBoost = 15;
  let serviceHook = 'local customers searching on Google and AI search';

  for (const rule of NICHE_RULES) {
    if (rule.pattern.test(combined)) {
      matchedNiche = rule.niche;
      nicheBoost = rule.boost;
      serviceHook = rule.serviceHook;
      break;
    }
  }

  // Legacy baseline score: Base 45 + city priority (0-15) + niche boost (15-38) = 60 to 98
  const rawScore = 45 + (cityMeta?.priority || 5) + nicheBoost;
  const score = Math.max(10, Math.min(99, rawScore));

  return {
    niche: matchedNiche,
    score,
    serviceHook,
    nicheBoost,
    isHighPriorityNiche: nicheBoost >= 30
  };
}

// ---------------------------------------------------------------------------
// 4. First-Principles Opportunity Score (0–100) & Deterministic Tier Classifier
// ---------------------------------------------------------------------------

/**
 * Calibrate opportunity score (10..99), recommended offer tier ('platform_3k' | 'retainer_2500' | 'pilot_500'),
 * and a high-signal diagnostic pain_summary from GBP rank, review proof, and website technical audit metrics.
 */
export function scoreAndClassifyCandidate(candidateInput = {}, auditInput = null, options = {}) {
  const merged = (auditInput && typeof auditInput === 'object')
    ? { ...candidateInput, ...auditInput }
    : { ...candidateInput };

  const city = normalizeSouthFlCity(merged.city || '', merged.zip || '') || merged.city || 'South Florida';
  const cityMeta = matchSouthFloridaLocation(city, merged.zip || '', 'FL');
  const classification = classifyAndScoreBusiness(
    merged.business_name_clean || merged.business_name || '',
    cityMeta,
    merged.gbp_category || merged.niche || ''
  );
  const niche = (merged.niche && merged.niche !== 'Local Business')
    ? merged.niche
    : classification.niche;

  const rawRank = merged.gbp_rank;
  const gbpRank = (rawRank !== null && rawRank !== undefined && rawRank !== '' && Number(rawRank) > 0)
    ? Math.round(Number(rawRank))
    : null;

  const rawReviews = merged.review_count;
  const reviewCount = (rawReviews !== null && rawReviews !== undefined && rawReviews !== '' && Number(rawReviews) >= 0)
    ? Math.round(Number(rawReviews))
    : 0;

  const rawRating = merged.rating;
  const rating = (rawRating !== null && rawRating !== undefined && rawRating !== '' && Number(rawRating) > 0)
    ? Math.round(Number(rawRating) * 10) / 10
    : null;

  const effectiveWebsite = String(merged.website || merged.audited_url || '').trim();
  const hasAnyWebsite = Boolean(effectiveWebsite && !SOCIAL_OR_DIRECTORY_DOMAINS.test(normalizeDomain(effectiveWebsite)));

  let websiteStatus = merged.website_status || null;
  let lcpMs = (merged.lcp_ms !== null && merged.lcp_ms !== undefined && merged.lcp_ms !== '' && Number(merged.lcp_ms) > 0)
    ? Math.round(Number(merged.lcp_ms))
    : null;
  let performanceScore = (merged.performance_score !== null && merged.performance_score !== undefined && merged.performance_score !== '' && Number.isFinite(Number(merged.performance_score)))
    ? Math.max(0, Math.min(100, Math.round(Number(merged.performance_score))))
    : null;
  let hasSchema = Number(merged.has_schema) === 1 ? 1 : 0;
  let hasSsl = Number(merged.has_ssl) === 1 ? 1 : (hasAnyWebsite && !merged.website_status ? 1 : 0);

  // If no website is present (and no explicit audit status overriding a known URL), force missing state
  if (!hasAnyWebsite && (!auditInput || !auditInput.website_status || auditInput.website_status === 'missing')) {
    websiteStatus = 'missing';
    hasSsl = 0;
    hasSchema = 0;
    lcpMs = null;
    performanceScore = 0;
  } else if (!websiteStatus) {
    if (lcpMs !== null && lcpMs > 4000) {
      websiteStatus = 'slow';
    } else if (performanceScore !== null && performanceScore < 50) {
      websiteStatus = 'slow';
    } else if (hasSchema === 1 && hasSsl === 1) {
      websiteStatus = 'healthy';
    } else {
      websiteStatus = 'unoptimized';
    }
  }

  // Deterministic Offer Tier Classification:
  // 1. platform_3k ($3,000 Dynamic Web Platform): Established operator (review_count >= 10) with missing, broken, or slow site (or lcp_ms > 4000)
  // 2. retainer_2500 ($2,500/mo Growth Retainer): Established operator (review_count >= 15 with functional site, or review_count >= 10 with unoptimized/healthy site) bleeding calls at rank #4-#30
  // 3. pilot_500 ($500 Quick-Win Pilot): Newer/smaller businesses (review_count < 10 or newer listings without GBP reviews)
  let recommendedTier = 'pilot_500';
  const hasSevereWebBottleneck = ['missing', 'broken', 'slow'].includes(websiteStatus) || (lcpMs !== null && lcpMs > 4000);
  if (reviewCount >= 10 && hasSevereWebBottleneck) {
    recommendedTier = 'platform_3k';
  } else if (reviewCount >= 15 || (reviewCount >= 10 && ['unoptimized', 'healthy'].includes(websiteStatus))) {
    recommendedTier = 'retainer_2500';
  } else {
    recommendedTier = 'pilot_500';
  }

  // First-Principles Opportunity Score (0–100):
  // 1. Rank Bleeder Gravity (0–30 pts)
  let rankPts = 18;
  if (gbpRank !== null) {
    if (gbpRank >= 6 && gbpRank <= 10) rankPts = 30;
    else if (gbpRank >= 11 && gbpRank <= 15) rankPts = 28;
    else if (gbpRank >= 16 && gbpRank <= 20) rankPts = 25;
    else if (gbpRank >= 21 && gbpRank <= 25) rankPts = 22;
    else if (gbpRank >= 4 && gbpRank <= 5) rankPts = 20;
    else if (gbpRank >= 26 && gbpRank <= 30) rankPts = 18;
    else if (gbpRank >= 1 && gbpRank <= 3) rankPts = 10;
    else rankPts = 14;
  }

  // 2. Review Authority & Proof (0–25 pts)
  let reviewPts = 0;
  if (reviewCount >= 35) reviewPts = 25;
  else if (reviewCount >= 20) reviewPts = 22;
  else if (reviewCount >= 10) reviewPts = 18;
  else if (reviewCount >= 5) reviewPts = 12;
  else if (reviewCount >= 1) reviewPts = 8;
  else reviewPts = gbpRank === null ? 12 : 4;

  if (rating !== null && rating >= 4.5) {
    reviewPts = Math.min(25, reviewPts + 3);
  } else if (rating !== null && rating >= 4.2) {
    reviewPts = Math.min(25, reviewPts + 1);
  }

  // 3. Technical Bottleneck Severity / Fixability (0–25 pts)
  let techPts = 14;
  if (websiteStatus === 'missing' || websiteStatus === 'broken') {
    techPts = reviewCount >= 10 ? 25 : 21;
  } else if (websiteStatus === 'slow' || (lcpMs !== null && lcpMs > 4000)) {
    techPts = 23;
  } else if (hasSchema === 0) {
    techPts = hasSsl === 0 ? 21 : 20;
  } else if (hasSsl === 0) {
    techPts = 18;
  } else {
    techPts = 12;
  }

  // 4. Market & Niche Value (0–20 pts)
  const cityPriority = cityMeta.priority || 10;
  const cityPts = Math.min(10, Math.max(4, Math.round((cityPriority / 15) * 10)));
  const ruleMatch = NICHE_RULES.find(r => r.niche === niche);
  const nicheBoost = ruleMatch ? ruleMatch.boost : classification.nicheBoost;
  const nichePts = nicheBoost >= 35 ? 10 : nicheBoost >= 32 ? 8 : nicheBoost >= 28 ? 6 : 4;
  const marketPts = Math.min(20, cityPts + nichePts);

  const rawScore = rankPts + reviewPts + techPts + marketPts;
  const score = Math.max(10, Math.min(99, Math.round(rawScore)));

  // Parse top competitors for pain_summary context
  let competitors = [];
  if (Array.isArray(merged.top_competitors)) {
    competitors = merged.top_competitors;
  } else if (typeof merged.top_competitors === 'string' && merged.top_competitors.trim().startsWith('[')) {
    try {
      competitors = JSON.parse(merged.top_competitors);
    } catch (_) {
      competitors = [];
    }
  }
  const leader = competitors[0] || null;

  // Build crisp, human-readable pain_summary
  const summaryParts = [];
  if (gbpRank !== null) {
    const ratingBadge = rating !== null ? `, ${rating.toFixed(1)}★` : '';
    const leaderVs = leader && leader.reviews
      ? ` vs #1 ${leader.name || 'leader'} (${leader.reviews} reviews)`
      : (leader?.name ? ` vs #1 ${leader.name}` : '');
    summaryParts.push(`Ranked #${gbpRank} in ${city} (${reviewCount} reviews${ratingBadge})${leaderVs}`);
  } else if (reviewCount > 0) {
    const ratingBadge = rating !== null ? `, ${rating.toFixed(1)}★` : '';
    summaryParts.push(`${reviewCount} GBP reviews${ratingBadge} in ${city}`);
  } else {
    summaryParts.push(`New ${city} ${niche} entity`);
  }

  if (websiteStatus === 'missing') {
    summaryParts.push('No active website linked to GBP');
  } else if (websiteStatus === 'broken') {
    summaryParts.push('Broken / unreachable website on GBP');
  } else if (websiteStatus === 'slow' || (lcpMs !== null && lcpMs > 4000)) {
    const secStr = lcpMs ? `${(lcpMs / 1000).toFixed(1)}s` : '4.5s+';
    summaryParts.push(`Slow ${secStr} mobile LCP`);
  } else if (lcpMs !== null) {
    summaryParts.push(`${(lcpMs / 1000).toFixed(1)}s mobile LCP`);
  }

  if (websiteStatus !== 'missing' && websiteStatus !== 'broken') {
    if (hasSsl === 0) {
      summaryParts.push('Missing HTTPS/SSL');
    }
    if (hasSchema === 0) {
      summaryParts.push('Missing LocalBusiness JSON-LD schema');
    } else if (websiteStatus === 'healthy') {
      summaryParts.push('Needs Map Pack citation & authority velocity');
    }
  } else {
    summaryParts.push('Missing LocalBusiness JSON-LD schema');
  }

  const computedPainSummary = summaryParts.join(' • ');
  const shouldKeepExistingPain = options.recomputePainSummary === false && !auditInput && candidateInput.pain_summary;
  const painSummary = shouldKeepExistingPain ? candidateInput.pain_summary : (computedPainSummary || candidateInput.pain_summary);

  return {
    score,
    niche,
    recommended_tier: recommendedTier,
    website_status: websiteStatus,
    has_schema: hasSchema,
    has_ssl: hasSsl,
    lcp_ms: lcpMs,
    performance_score: performanceScore ?? (websiteStatus === 'missing' || websiteStatus === 'broken' ? 0 : (websiteStatus === 'slow' ? 42 : 74)),
    pain_summary: painSummary
  };
}

export function classifyCandidateTier(candidate = {}, audit = null) {
  return scoreAndClassifyCandidate(candidate, audit).recommended_tier;
}

export function buildPainSummary(candidate = {}, audit = null, tier = null) {
  const merged = tier ? { ...candidate, recommended_tier: tier } : candidate;
  return scoreAndClassifyCandidate(merged, audit, { recomputePainSummary: true }).pain_summary;
}

export function scoreDiagnosticCandidate(candidate = {}, audit = null, tier = null) {
  const merged = tier ? { ...candidate, recommended_tier: tier } : candidate;
  return scoreAndClassifyCandidate(merged, audit).score;
}

// ---------------------------------------------------------------------------
// 5. SSRF-Hardened Live Technical & Entity Diagnostic Auditor
// ---------------------------------------------------------------------------

/**
 * Validate a target URL against SSRF vectors before fetching.
 * - Allows ONLY http: and https: protocols on standard ports (80, 443, or default).
 * - Blocks localhost, .local, .internal, wildcard DNS rebinding domains (.nip.io, .sslip.io, .xip.io, etc.),
 *   IPv6 literals ([::1]), and all IPv4 private, loopback, link-local, metadata, or RFC 6890 special-purpose ranges:
 *   127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8,
 *   100.64.0.0/10, 192.0.0.0/24, 192.0.2.0/24, 198.18.0.0/15, 198.51.100.0/24, 203.0.113.0/24, 224.0.0.0/4.
 */
export function isSafePublicAuditUrl(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { safe: false, reason: 'Empty URL' };
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { safe: false, reason: 'Empty URL' };
  }

  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(withProto);
  } catch {
    return { safe: false, reason: 'Malformed URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
  }

  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    return { safe: false, reason: 'Disallowed non-standard port' };
  }

  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'Credentials in URL are not allowed' };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) {
    return { safe: false, reason: 'Missing hostname' };
  }

  // Block IPv6 literals (e.g. [::1], [fe80::1], [::ffff:127.0.0.1])
  if (host.includes(':') || host.startsWith('[') || host.endsWith(']')) {
    return { safe: false, reason: 'IPv6 literals are blocked (SSRF protection)' };
  }

  // Block localhost and internal/local special-use TLDs
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.intranet') ||
    host.endsWith('.corp') ||
    host.endsWith('.home') ||
    host.endsWith('.lan') ||
    host.endsWith('.arpa') ||
    host === 'metadata.google.internal'
  ) {
    return { safe: false, reason: `Blocked internal hostname: ${host}` };
  }

  // Block wildcard DNS-rebinding domains (.nip.io, .sslip.io, .xip.io, localtest.me, lvh.me, vcap.me)
  if (DNS_REBINDING_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))) {
    return { safe: false, reason: `Blocked DNS-rebinding domain: ${host}` };
  }

  // Check if host is an IPv4 literal or numeric/hex IP encoding
  const ipv4Parts = host.split('.');
  const isAllNumericOrHex = ipv4Parts.every(p => /^\d+$/.test(p) || /^0x[0-9a-f]+$/i.test(p));
  if (isAllNumericOrHex) {
    if (ipv4Parts.length !== 4 || ipv4Parts.some(p => !/^\d{1,3}$/.test(p) || (p.length > 1 && p.startsWith('0')))) {
      return { safe: false, reason: 'Non-standard numeric IP encoding is blocked' };
    }
    const octets = ipv4Parts.map(Number);
    if (octets.some(o => !Number.isInteger(o) || o < 0 || o > 255)) {
      return { safe: false, reason: 'Invalid IPv4 address octets' };
    }
    const [a, b, c] = octets;
    if (
      a === 0 ||                                      // 0.0.0.0/8
      a === 10 ||                                     // 10.0.0.0/8
      a === 127 ||                                    // 127.0.0.0/8 (loopback)
      (a === 169 && b === 254) ||                     // 169.254.0.0/16 (link-local / cloud metadata)
      (a === 172 && b >= 16 && b <= 31) ||            // 172.16.0.0/12 (private)
      (a === 192 && b === 168) ||                     // 192.168.0.0/16 (private)
      (a === 192 && b === 0 && c === 0) ||            // 192.0.0.0/24 (RFC 6890 IETF protocol assignments)
      (a === 192 && b === 0 && c === 2) ||            // 192.0.2.0/24 (RFC 5737 TEST-NET-1)
      (a === 198 && b === 51 && c === 100) ||         // 198.51.100.0/24 (RFC 5737 TEST-NET-2)
      (a === 203 && b === 0 && c === 113) ||          // 203.0.113.0/24 (RFC 5737 TEST-NET-3)
      (a === 100 && b >= 64 && b <= 127) ||           // 100.64.0.0/10 (Carrier-Grade NAT)
      (a === 198 && (b === 18 || b === 19)) ||        // 198.18.0.0/15 (Benchmark)
      a >= 224                                        // 224.0.0.0/4 (Multicast & Reserved)
    ) {
      return { safe: false, reason: `Blocked private/reserved IPv4 range: ${host}` };
    }
    return { safe: true, url: parsed.toString(), hostname: host };
  }

  // Require at least one dot and a valid alphabetic TLD for domain names
  if (!host.includes('.') || !/\.[a-z]{2,}$/i.test(host)) {
    return { safe: false, reason: 'Hostname lacks a valid public TLD' };
  }

  return { safe: true, url: parsed.toString(), hostname: host };
}

const LOCAL_SCHEMA_TYPE_REGEX = /\b(LocalBusiness|HomeAndConstructionBusiness|RoofingContractor|Plumber|HVACBusiness|Electrician|GeneralContractor|Locksmith|MovingCompany|HousePainter|MedicalBusiness|Dentist|Physician|Optician|Chiropractor|LegalService|Attorney|AccountingService|AutoRepair|AutoBodyShop|AutoWash|HealthAndBeautyBusiness|DaySpa|ExerciseGym|SportsActivityLocation|ProfessionalService|Service)\b/i;

function inspectHtmlDiagnostics(htmlText, finalUrl, ttfbMs = 450) {
  const html = String(htmlText || '');
  const hasSsl = /^https:\/\//i.test(String(finalUrl || '')) ? 1 : 0;

  let hasSchema = 0;
  const ldJsonRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = ldJsonRegex.exec(html)) !== null) {
    const block = match[1] || '';
    if (LOCAL_SCHEMA_TYPE_REGEX.test(block)) {
      hasSchema = 1;
      break;
    }
  }
  if (!hasSchema && /itemtype=["']https?:\/\/schema\.org\/(LocalBusiness|HomeAndConstructionBusiness|RoofingContractor|Plumber|HVACBusiness|Electrician|GeneralContractor|MedicalBusiness|Dentist|LegalService|AutoRepair|Service)/i.test(html)) {
    hasSchema = 1;
  }

  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
  const hasTitle = /<title[^>]*>[^<]{3,}<\/title>/i.test(html);
  const hasH1 = /<h1[^>]*>[\s\S]*?<\/h1>/i.test(html);

  const scriptCount = (html.match(/<script\b/gi) || []).length;
  const htmlBytes = html.length;

  let estimatedLcpMs = Math.round(
    1350 +
    Math.min(3500, ttfbMs * 2.1) +
    Math.min(2400, (htmlBytes / 1024) * 14) +
    Math.min(2000, Math.max(0, scriptCount - 4) * 165) +
    (hasViewport ? 0 : 950)
  );
  estimatedLcpMs = Math.max(950, Math.min(9800, estimatedLcpMs));

  let perfScore = Math.round(100 - Math.max(0, (estimatedLcpMs - 1200) / 85));
  if (!hasViewport) perfScore -= 12;
  if (!hasSsl) perfScore -= 10;
  perfScore = Math.max(15, Math.min(98, perfScore));

  let websiteStatus = 'healthy';
  if (estimatedLcpMs > 4000 || perfScore < 50) {
    websiteStatus = 'slow';
  } else if (hasSchema === 0 || hasSsl === 0 || !hasViewport || (!hasTitle && !hasH1)) {
    websiteStatus = 'unoptimized';
  }

  return {
    website_status: websiteStatus,
    has_ssl: hasSsl,
    has_schema: hasSchema,
    lcp_ms: estimatedLcpMs,
    performance_score: perfScore,
    has_viewport: hasViewport,
    has_title: hasTitle
  };
}

/**
 * Audit a candidate's website URL (or candidate object) for SSL, mobile LCP / performance score,
 * and LocalBusiness JSON-LD schema.
 * Enforces strict SSRF protection, manual redirect validation (max 3 hops), and a 6000ms timeout.
 */
export async function auditCandidateWebsite(websiteOrUrl, options = {}) {
  const candidateObj = (websiteOrUrl && typeof websiteOrUrl === 'object') ? websiteOrUrl : null;
  if (candidateObj) {
    websiteOrUrl = candidateObj.website || candidateObj.url || candidateObj.domain || '';
  }

  const rawStr = String(websiteOrUrl || '').trim();
  if (!rawStr) {
    return {
      website_status: 'missing',
      has_ssl: 0,
      has_schema: 0,
      lcp_ms: null,
      performance_score: 0,
      audited_url: null
    };
  }

  // Check if URL is a social profile or directory page rather than an owned business website
  const bareDomain = normalizeDomain(rawStr);
  if (bareDomain && SOCIAL_OR_DIRECTORY_DOMAINS.test(bareDomain)) {
    return {
      website_status: 'missing',
      has_ssl: 0,
      has_schema: 0,
      lcp_ms: null,
      performance_score: 0,
      audited_url: null,
      is_social_or_directory: true
    };
  }

  const initialSafety = isSafePublicAuditUrl(rawStr);
  if (!initialSafety.safe) {
    return {
      website_status: 'broken',
      has_ssl: 0,
      has_schema: 0,
      lcp_ms: null,
      performance_score: 0,
      audited_url: null,
      ssrf_blocked: true,
      error: initialSafety.reason
    };
  }

  // Allow deterministic mock HTML in unit tests
  if (typeof options.mockHtml === 'string') {
    const diag = inspectHtmlDiagnostics(options.mockHtml, initialSafety.url, options.mockTtfbMs || 350);
    return {
      ...diag,
      audited_url: initialSafety.url
    };
  }

  // Deterministic offline / fixture audit mode without network subrequests
  if (options?.offline || options?.fixture) {
    if (candidateObj?.fixture_diagnostic && typeof candidateObj.fixture_diagnostic === 'object') {
      return {
        ...candidateObj.fixture_diagnostic,
        audited_url: initialSafety.url
      };
    }
    const hostLower = initialSafety.hostname;
    const isHttpExplicit = /^http:\/\//i.test(rawStr);
    if (hostLower.includes('broken') || hostLower.includes('dead') || hostLower.includes('sunshine')) {
      return {
        website_status: 'broken',
        has_ssl: isHttpExplicit ? 0 : 1,
        has_schema: 0,
        lcp_ms: null,
        performance_score: 0,
        audited_url: initialSafety.url
      };
    }
    if (hostLower.includes('slow') || hostLower.includes('apex')) {
      return {
        website_status: 'slow',
        has_ssl: isHttpExplicit ? 0 : 1,
        has_schema: 0,
        lcp_ms: 5600,
        performance_score: 39,
        audited_url: initialSafety.url
      };
    }
    if (hostLower.includes('healthy') || hostLower.includes('premier')) {
      return {
        website_status: 'healthy',
        has_ssl: 1,
        has_schema: 1,
        lcp_ms: 1750,
        performance_score: 88,
        audited_url: initialSafety.url
      };
    }
    return {
      website_status: 'unoptimized',
      has_ssl: isHttpExplicit ? 0 : 1,
      has_schema: 0,
      lcp_ms: 2650,
      performance_score: 71,
      audited_url: initialSafety.url
    };
  }

  const timeoutMs = Math.max(1000, Math.min(15000, Number(options.timeoutMs) || 6000));
  const maxRedirects = typeof options.maxRedirects === 'number' ? options.maxRedirects : 3;
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const psiKey = options?.psiApiKey || options?.PAGESPEED_API_KEY || options?.PSI_API_KEY || options?.env?.PAGESPEED_API_KEY || options?.env?.PSI_API_KEY || null;

  let currentUrl = initialSafety.url;
  const startMs = Date.now();

  try {
    let response = null;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const safety = isSafePublicAuditUrl(currentUrl);
      if (!safety.safe) {
        return {
          website_status: 'broken',
          has_ssl: 0,
          has_schema: 0,
          lcp_ms: null,
          performance_score: 0,
          audited_url: currentUrl,
          ssrf_blocked: true,
          error: `Unsafe redirect target blocked: ${safety.reason}`
        };
      }

      response = await fetchFn(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: getTimeoutSignal(timeoutMs),
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 G3ZDiagnosticAuditor/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (response.status >= 300 && response.status < 400) {
        const locationHeader = response.headers?.get?.('location');
        if (!locationHeader) {
          return {
            website_status: 'broken',
            has_ssl: /^https:\/\//i.test(currentUrl) ? 1 : 0,
            has_schema: 0,
            lcp_ms: null,
            performance_score: 0,
            audited_url: currentUrl,
            error: `Redirect (${response.status}) missing Location header`
          };
        }
        if (hop === maxRedirects) {
          return {
            website_status: 'broken',
            has_ssl: /^https:\/\//i.test(currentUrl) ? 1 : 0,
            has_schema: 0,
            lcp_ms: null,
            performance_score: 0,
            audited_url: currentUrl,
            error: `Exceeded maximum redirect hops (${maxRedirects})`
          };
        }
        const nextUrl = new URL(locationHeader, currentUrl).toString();
        const nextSafety = isSafePublicAuditUrl(nextUrl);
        if (!nextSafety.safe) {
          return {
            website_status: 'broken',
            has_ssl: 0,
            has_schema: 0,
            lcp_ms: null,
            performance_score: 0,
            audited_url: nextUrl,
            ssrf_blocked: true,
            error: `Blocked redirect to unsafe target: ${nextSafety.reason}`
          };
        }
        const nextDomain = normalizeDomain(nextUrl);
        if (nextDomain && SOCIAL_OR_DIRECTORY_DOMAINS.test(nextDomain)) {
          return {
            website_status: 'missing',
            has_ssl: 0,
            has_schema: 0,
            lcp_ms: null,
            performance_score: 0,
            audited_url: nextUrl,
            is_social_or_directory: true
          };
        }
        currentUrl = nextUrl;
        continue;
      }
      break;
    }

    const ttfbMs = Math.max(50, Date.now() - startMs);
    const hasSsl = /^https:\/\//i.test(currentUrl) ? 1 : 0;

    if (!response || response.status >= 400) {
      return {
        website_status: 'broken',
        has_ssl: hasSsl,
        has_schema: 0,
        lcp_ms: null,
        performance_score: 0,
        http_status: response ? response.status : 0,
        audited_url: currentUrl,
        error: `HTTP ${response ? response.status : 'error'}`
      };
    }

    const rawText = await response.text().catch(() => '');
    const htmlSlice = rawText.slice(0, 262144);
    const diag = inspectHtmlDiagnostics(htmlSlice, currentUrl, ttfbMs);

    // Optional Google PageSpeed Insights override when psiKey or usePsi is provided
    if (psiKey || options.usePsi) {
      try {
        const psiKeyParam = psiKey ? `&key=${encodeURIComponent(psiKey)}` : '';
        const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(currentUrl)}&strategy=mobile&category=performance${psiKeyParam}`;
        const psiRes = await fetchFn(psiUrl, { method: 'GET', signal: getTimeoutSignal(4500) });
        if (psiRes.ok) {
          const psiData = await psiRes.json().catch(() => ({}));
          const lhr = psiData?.lighthouseResult;
          const psiLcp = lhr?.audits?.['largest-contentful-paint']?.numericValue;
          const psiPerf = lhr?.categories?.performance?.score;
          if (typeof psiLcp === 'number' && psiLcp > 0) {
            diag.lcp_ms = Math.round(psiLcp);
          }
          if (typeof psiPerf === 'number') {
            diag.performance_score = Math.round(psiPerf * 100);
          }
          if (diag.lcp_ms > 4000 || diag.performance_score < 50) {
            diag.website_status = 'slow';
          } else if (diag.has_schema === 1 && diag.has_ssl === 1) {
            diag.website_status = 'healthy';
          } else {
            diag.website_status = 'unoptimized';
          }
        }
      } catch (_) {
        // Fallback to lightweight HTML diagnostic metrics
      }
    }

    return {
      ...diag,
      http_status: response.status,
      audited_url: currentUrl
    };
  } catch (err) {
    return {
      website_status: 'broken',
      has_ssl: /^https:\/\//i.test(currentUrl) ? 1 : 0,
      has_schema: 0,
      lcp_ms: null,
      performance_score: 0,
      audited_url: currentUrl,
      error: err?.message || 'Network or timeout error during website audit'
    };
  }
}

// ---------------------------------------------------------------------------
// 6. DataForSEO Google Maps Live Discovery ("Page 2 Bleeder" Engine)
// ---------------------------------------------------------------------------

/**
 * Deterministic, realistic South Florida Google Maps SERP fixture for offline / demo runs
 * or when DATAFORSEO_LOGIN is not configured.
 */
export function getOfflineMapsFixture(cityInput = 'Pembroke Pines', nicheInput = 'Roofing') {
  const cityMeta = matchSouthFloridaLocation(cityInput, '', 'FL');
  const city = cityMeta.isSouthFlorida ? cityMeta.city : (normalizeSouthFlCity(cityInput) || 'Pembroke Pines');
  const classification = classifyAndScoreBusiness(nicheInput, cityMeta, nicheInput);
  const niche = NICHE_RULES.find(r => r.niche.toLowerCase() === String(nicheInput || '').toLowerCase())?.niche || classification.niche || 'Roofing';
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nicheSlug = niche.toLowerCase().replace(/[^a-z0-9]/g, '');

  const zipByCity = {
    'Pembroke Pines': '33028',
    'Miramar': '33027',
    'Hollywood': '33021',
    'Davie': '33325',
    'Fort Lauderdale': '33301',
    'Weston': '33326',
    'Coral Springs': '33065',
    'Pompano Beach': '33062',
    'Plantation': '33324',
    'Doral': '33178',
    'Miami': '33134',
    'Boca Raton': '33432',
    'Key West': '33040',
    'Key Largo': '33037',
    'Marathon': '33050',
    'Islamorada': '33036',
    'Tavernier': '33070'
  };
  const zip = zipByCity[city] || '33028';

  const nicheShort = niche.split(/[&\s]+/)[0];

  return [
    // Top 3 Map Pack Leaders
    {
      type: 'maps_search',
      rank_group: 1,
      rank_absolute: 1,
      title: `${city} Premier ${nicheShort} Pros`,
      place_id: `ChIJ_leader1_${citySlug}_${nicheSlug}`,
      cid: `1001001_${citySlug}_${nicheSlug}`,
      category: `${nicheShort} Contractor`,
      rating: { value: 4.9, votes_count: 148 },
      domain: `${citySlug}premier${nicheSlug}.com`,
      url: `https://${citySlug}premier${nicheSlug}.com`,
      phone: '(954) 555-0101',
      address_info: { address: `101 Pines Blvd`, city, zip, region: 'FL' },
      is_closed: false
    },
    {
      type: 'maps_search',
      rank_group: 2,
      rank_absolute: 2,
      title: `All-Star South Florida ${nicheShort}`,
      place_id: `ChIJ_leader2_${citySlug}_${nicheSlug}`,
      cid: `1001002_${citySlug}_${nicheSlug}`,
      category: `${nicheShort} Service`,
      rating: { value: 4.8, votes_count: 112 },
      domain: `allstarsfl${nicheSlug}.com`,
      url: `https://allstarsfl${nicheSlug}.com`,
      phone: '(954) 555-0102',
      address_info: { address: `240 Flamingo Rd`, city, zip, region: 'FL' },
      is_closed: false
    },
    {
      type: 'maps_search',
      rank_group: 3,
      rank_absolute: 3,
      title: `Gold Coast ${nicheShort} & Repair`,
      place_id: `ChIJ_leader3_${citySlug}_${nicheSlug}`,
      cid: `1001003_${citySlug}_${nicheSlug}`,
      category: `${nicheShort} Contractor`,
      rating: { value: 4.8, votes_count: 89 },
      domain: `goldcoast${nicheSlug}fl.com`,
      url: `https://goldcoast${nicheSlug}fl.com`,
      phone: '(954) 555-0103',
      address_info: { address: `880 University Dr`, city, zip, region: 'FL' },
      is_closed: false
    },

    // Page 2 Bleeders (#6 - #25 Goldilocks Zone)
    {
      type: 'maps_search',
      rank_group: 7,
      rank_absolute: 7,
      title: `Apex ${city} ${nicheShort} Solutions LLC`,
      place_id: `ChIJ_bleed07_${citySlug}_${nicheSlug}`,
      cid: `9007_${citySlug}_${nicheSlug}`,
      category: `${nicheShort} Contractor`,
      rating: { value: 4.9, votes_count: 42 },
      domain: `apex${citySlug}${nicheSlug}.com`,
      url: `https://apex${citySlug}${nicheSlug}.com`,
      phone: '(954) 612-4410',
      address_info: { address: `11420 Pines Blvd Ste 204`, city, zip, region: 'FL' },
      is_closed: false,
      founder_name: 'Carlos Mendoza',
      founder_title: 'Owner',
      fixture_diagnostic: {
        website_status: 'slow',
        lcp_ms: 5800,
        performance_score: 38,
        has_schema: 0,
        has_ssl: 1
      }
    },
    {
      type: 'maps_search',
      rank_group: 9,
      rank_absolute: 9,
      title: `Atlantic Shield ${nicheShort} & Masters`,
      place_id: `ChIJ_bleed09_${citySlug}_${nicheSlug}`,
      cid: `9009_${citySlug}_${nicheSlug}`,
      category: `${nicheShort} Contractor`,
      rating: { value: 4.8, votes_count: 31 },
      domain: null,
      url: null,
      phone: '(954) 703-8821',
      address_info: { address: `6800 Dykes Rd`, city, zip, region: 'FL' },
      is_closed: false,
      founder_name: 'David Morales',
      founder_title: 'President',
      fixture_diagnostic: {
        website_status: 'missing',
        lcp_ms: null,
        performance_score: 0,
        has_schema: 0,
        has_ssl: 0
      }
    },
    {
      type: 'maps_search',
      rank_group: 11,
      rank_absolute: 11,
      title: `Broward Precision ${nicheShort} Group`,
      place_id: `ChIJ_bleed11_${citySlug}_${nicheSlug}`,
      cid: `9011_${citySlug}_${nicheSlug}`,
      category: `${nicheShort} Service`,
      rating: { value: 4.9, votes_count: 37 },
      domain: `precision${nicheSlug}broward.com`,
      url: `https://precision${nicheSlug}broward.com`,
      phone: '(954) 819-3304',
      address_info: { address: `1850 NW 122nd Ter`, city, zip, region: 'FL' },
      is_closed: false,
      founder_name: 'Michael Castellanos',
      founder_title: 'Managing Member',
      fixture_diagnostic: {
        website_status: 'unoptimized',
        lcp_ms: 2300,
        performance_score: 74,
        has_schema: 0,
        has_ssl: 1
      }
    },
    {
      type: 'maps_search',
      rank_group: 14,
      rank_absolute: 14,
      title: `Sunshine State ${nicheShort} Specialists`,
      place_id: `ChIJ_bleed14_${citySlug}_${nicheSlug}`,
      cid: `9014_${citySlug}_${nicheSlug}`,
      category: `${nicheShort} Contractor`,
      rating: { value: 4.7, votes_count: 19 },
      domain: `sunshine${nicheSlug}${citySlug}.com`,
      url: `http://sunshine${nicheSlug}${citySlug}.com`,
      phone: '(754) 224-9105',
      address_info: { address: `420 SW 145th Ave`, city, zip, region: 'FL' },
      is_closed: false,
      founder_name: 'Roberto Alvarez',
      founder_title: 'Owner',
      fixture_diagnostic: {
        website_status: 'broken',
        lcp_ms: null,
        performance_score: 0,
        has_schema: 0,
        has_ssl: 0
      }
    },
    {
      type: 'maps_search',
      rank_group: 17,
      rank_absolute: 17,
      title: `Tri-County Elite ${nicheShort}`,
      place_id: `ChIJ_bleed17_${citySlug}_${nicheSlug}`,
      cid: `9017_${citySlug}_${nicheSlug}`,
      category: `${nicheShort} Service`,
      rating: { value: 4.8, votes_count: 23 },
      domain: `tricountyelite${nicheSlug}.com`,
      url: `https://tricountyelite${nicheSlug}.com`,
      phone: '(954) 391-6720',
      address_info: { address: `9900 Sheridan St`, city, zip, region: 'FL' },
      is_closed: false,
      founder_name: 'Steven Henao',
      founder_title: 'Founder',
      fixture_diagnostic: {
        website_status: 'unoptimized',
        lcp_ms: 2650,
        performance_score: 71,
        has_schema: 0,
        has_ssl: 1
      }
    },
    {
      type: 'maps_search',
      rank_group: 21,
      rank_absolute: 21,
      title: `${city} NextGen ${nicheShort} Services`,
      place_id: `ChIJ_bleed21_${citySlug}_${nicheSlug}`,
      cid: `9021_${citySlug}_${nicheSlug}`,
      category: `${nicheShort} Service`,
      rating: { value: 5.0, votes_count: 8 },
      domain: null,
      url: `https://facebook.com/${citySlug}nextgen${nicheSlug}`,
      phone: '(954) 448-1920',
      address_info: { address: `1600 Hiatus Rd`, city, zip, region: 'FL' },
      is_closed: false,
      founder_name: 'Daniel Quintero',
      founder_title: 'Owner',
      fixture_diagnostic: {
        website_status: 'missing',
        lcp_ms: null,
        performance_score: 0,
        has_schema: 0,
        has_ssl: 0
      }
    }
  ];
}

/**
 * Discover "Page 2 Bleeder" local service businesses via DataForSEO Google Maps SERP Live API
 * (or calibrated South Florida fixture when offline / useFixture is true).
 * Accepts `(options = {}, envArg = null)` with full snake_case and camelCase option support.
 */
export async function discoverMapsBleedersViaDataForSeo(options = {}, envArg = null) {
  const effectiveEnv = (envArg && typeof envArg === 'object' && Object.keys(envArg).length > 0)
    ? envArg
    : (options.env && typeof options.env === 'object' && Object.keys(options.env).length > 0 ? options.env : options);

  const city = options.city || 'Pembroke Pines';
  const niche = options.niche || 'Roofing';
  const keyword = options.keyword || '';
  const rankMin = Math.max(1, Math.min(50, Number(options.rankMin ?? options.rank_min ?? options.minRank ?? options.min_rank ?? 6) || 6));
  const rankMax = Math.max(rankMin, Math.min(50, Number(options.rankMax ?? options.rank_max ?? options.maxRank ?? options.max_rank ?? 25) || 25));
  const minReviews = Math.max(0, Number(options.minReviews ?? options.min_reviews ?? 5) || 0);
  const maxReviews = Math.max(minReviews, Number(options.maxReviews ?? options.max_reviews ?? 120) || 120);
  const depth = Math.max(Number(options.depth) || 35, rankMax + 5);
  const fixtureItems = Array.isArray(options.fixtureItems) ? options.fixtureItems : null;
  const useFixture = Boolean(options.useFixture || options.fixture || options.offline);
  const auditTopN = Math.max(0, Number(options.auditTopN ?? options.maxAudit ?? options.max_audit ?? 8) || 0);
  const auditWebsites = options.auditWebsites !== undefined ? Boolean(options.auditWebsites) : true;

  const cityMeta = matchSouthFloridaLocation(city, '', 'FL');
  const canonicalCity = cityMeta.isSouthFlorida ? cityMeta.city : (normalizeSouthFlCity(city) || city || 'Pembroke Pines');
  const nicheMeta = getNicheOutreachMeta(niche, cityMeta.county || 'Broward County');
  const primarySeed = keyword
    ? String(keyword).trim()
    : (Array.isArray(nicheMeta.seedKeywords) && nicheMeta.seedKeywords[0]) || `${niche} contractor`;

  const searchQuery = /\bin\b/i.test(primarySeed)
    ? primarySeed
    : `${primarySeed} in ${canonicalCity}, FL`;

  let rawItems = [];
  let sourceMode = 'fixture';

  if (Array.isArray(fixtureItems)) {
    rawItems = fixtureItems;
    sourceMode = 'custom_fixture';
  } else if (!useFixture && effectiveEnv?.DATAFORSEO_LOGIN && effectiveEnv?.DATAFORSEO_PASSWORD) {
    const authHeader = 'Basic ' + btoa(`${effectiveEnv.DATAFORSEO_LOGIN}:${effectiveEnv.DATAFORSEO_PASSWORD}`);
    const res = await fetch('https://api.dataforseo.com/v3/serp/google/maps/live/advanced', {
      method: 'POST',
      signal: getTimeoutSignal(12000),
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        keyword: searchQuery,
        location_code: 2840,
        language_code: 'en',
        depth
      }])
    });

    if (!res.ok) {
      throw new Error(`DataForSEO Maps SERP API error (HTTP ${res.status})`);
    }
    const body = await res.json().catch(() => ({}));
    rawItems = body?.tasks?.[0]?.result?.[0]?.items || [];
    sourceMode = 'dataforseo_maps_live';
  } else {
    rawItems = getOfflineMapsFixture(canonicalCity, niche);
    sourceMode = 'offline_fixture';
  }

  // 1. Extract Top 3 Map Pack leaders (rank 1..3)
  const topCompetitors = [];
  for (const item of rawItems) {
    const rank = Number(item.rank_group ?? item.rank_absolute ?? 0);
    if (rank >= 1 && rank <= 3 && topCompetitors.length < 3) {
      const compReviews = Number(item.rating?.votes_count ?? item.review_count ?? item.reviews_count ?? 0);
      const compRating = Number(item.rating?.value ?? item.rating_value ?? item.rating ?? 0) || null;
      const compDomain = normalizeDomain(item.domain || item.url || item.website || '');
      const validCompDomain = isValidCompanyDomain(compDomain) ? compDomain : null;
      topCompetitors.push({
        name: cleanBusinessName(item.title || item.business_name || `Leader #${rank}`),
        rank,
        reviews: compReviews,
        rating: compRating,
        website: validCompDomain,
        domain: validCompDomain
      });
    }
  }

  // 2. Filter for active "Page 2 Bleeders" in the Goldilocks zone (rankMin..rankMax, minReviews..maxReviews)
  const NATIONAL_CHAIN_REGEX = /\b(HOME DEPOT|LOWE'?S|ROTO-?ROOTER|SERVPRO|TERMINIX|ORKIN|TRUGREEN|ONE HOUR HEATING|MR\.?\s*ROOTER|MR\.?\s*ELECTRIC|AIRE SERV|ARS RESCUE ROOTER|STANLEY STEEMER|ASPEN DENTAL)\b/i;

  const filteredItems = [];
  for (const item of rawItems) {
    if (item.is_closed === true || item.work_hours?.current_status === 'permanently_closed') {
      continue;
    }
    const title = String(item.title || item.business_name || '').trim();
    if (!title || isShellOrHoldingEntity(title) || NATIONAL_CHAIN_REGEX.test(title)) {
      continue;
    }

    const rank = Number(item.rank_group ?? item.rank_absolute ?? 0);
    if (rank < rankMin || rank > rankMax) {
      continue;
    }

    const reviews = Number(item.rating?.votes_count ?? item.review_count ?? item.reviews_count ?? 0);
    if (reviews < minReviews || reviews > maxReviews) {
      continue;
    }

    filteredItems.push({ item, rank, reviews });
  }

  // 3. Audit websites (up to auditTopN live fetches) & construct scored candidate records
  const candidates = [];
  let liveAuditsRun = 0;

  for (let idx = 0; idx < filteredItems.length; idx++) {
    const { item, rank, reviews } = filteredItems[idx];
    const ratingVal = typeof item.rating === 'number'
      ? item.rating
      : Number(item.rating?.value ?? item.rating_value ?? 0) || null;

    const rawUrl = item.url || item.website || item.domain || '';
    const normDomain = normalizeDomain(rawUrl);
    const isSocial = normDomain && SOCIAL_OR_DIRECTORY_DOMAINS.test(normDomain);
    const validWebsite = (!isSocial && isValidCompanyDomain(normDomain)) ? normDomain : null;

    let diag = null;
    if (item.fixture_diagnostic && typeof item.fixture_diagnostic === 'object') {
      diag = { ...item.fixture_diagnostic };
    } else if (!rawUrl || isSocial || !validWebsite) {
      diag = {
        website_status: 'missing',
        has_ssl: 0,
        has_schema: 0,
        lcp_ms: null,
        performance_score: 0
      };
    } else if (auditWebsites && liveAuditsRun < auditTopN) {
      liveAuditsRun++;
      diag = await auditCandidateWebsite(rawUrl, {
        timeoutMs: 5500,
        offline: useFixture,
        env: effectiveEnv,
        psiApiKey: effectiveEnv?.PSI_API_KEY || effectiveEnv?.PAGESPEED_API_KEY || null
      });
    } else {
      diag = {
        website_status: 'unoptimized',
        has_ssl: /^https:/i.test(String(rawUrl)) ? 1 : 1,
        has_schema: 0,
        lcp_ms: 2850,
        performance_score: 68
      };
    }

    const placeId = String(item.place_id || item.placeId || '').trim() ||
      `ChIJ_${canonicalCity.toLowerCase().replace(/[^a-z0-9]/g, '')}_${rank}_${idx}`;
    const cid = String(item.cid || item.data_cid || '').trim() || null;
    const docNumber = buildCanonicalDocNumberFromPlaceId(placeId);

    const itemAddress = item.address_info?.address || item.address || '';
    const itemCity = normalizeSouthFlCity(item.address_info?.city || canonicalCity, item.address_info?.zip || '');
    const itemZip = String(item.address_info?.zip || item.zip || '').trim();

    const candidateRecord = buildCandidateRecord({
      id: `gbp_${placeId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-20)}`,
      doc_number: docNumber,
      place_id: placeId,
      cid,
      business_name: item.title || item.business_name,
      entity_type: 'Google Maps GBP',
      filing_date: new Date().toISOString().slice(0, 10),
      founder_name: item.founder_name || 'Owner',
      founder_title: item.founder_title || 'Owner',
      principal_address: itemAddress,
      city: itemCity || canonicalCity,
      state: 'FL',
      zip: itemZip,
      niche,
      phone: item.phone || null,
      email: item.email || null,
      website: validWebsite,
      gbp_rank: rank,
      review_count: reviews,
      rating: ratingVal,
      gbp_category: item.category || item.main_category || `${niche} Contractor`,
      top_competitors: topCompetitors,
      lcp_ms: diag.lcp_ms,
      performance_score: diag.performance_score,
      has_schema: diag.has_schema,
      has_ssl: diag.has_ssl,
      website_status: diag.website_status
    }, { requireSouthFlorida: false, excludeShells: true });

    if (candidateRecord) {
      candidates.push(candidateRecord);
    }
  }

  candidates.sort((a, b) => (b.score || 0) - (a.score || 0));

  return {
    query: searchQuery,
    city: canonicalCity,
    county: cityMeta.county || 'Broward County',
    niche,
    sourceMode,
    topCompetitors,
    candidates,
    totalSerpItems: rawItems.length
  };
}

// ---------------------------------------------------------------------------
// 7. Google Maps & Business Listings Candidate Builder & CSV/JSON Parsers
// ---------------------------------------------------------------------------

/**
 * Normalize & validate any raw candidate object (from Google Maps GBP, CSV, or JSON)
 * into a scored, tier-classified outreach candidate record.
 */
export function buildCandidateRecord(raw, options = { requireSouthFlorida: true, excludeShells: true }) {
  const businessName = String(raw.business_name || raw.businessName || raw.company || raw.title || '').trim();
  if (!businessName) return null;

  if (options.excludeShells !== false && isShellOrHoldingEntity(businessName)) {
    return null;
  }

  const placeId = raw.place_id || raw.placeId || null;
  let founderName = toTitleCase(raw.founder_name || raw.founderName || raw.officer_name || raw.name || 'Owner');
  if (founderName.includes(',')) {
    const [last, first] = founderName.split(',').map(s => s.trim());
    founderName = [first, last].filter(Boolean).join(' ');
  }

  if (!founderName || CORPORATE_AGENT_PATTERNS.test(founderName)) {
    return null;
  }

  const isGenericOwnerTitle = isPlaceholderFounderName(founderName, businessName);
  const nameParts = splitName(founderName);
  const firstName = isGenericOwnerTitle
    ? ''
    : toTitleCase(raw.founder_first_name || (nameParts.ok ? nameParts.firstName : founderName.split(' ')[0]));
  const lastName = isGenericOwnerTitle
    ? ''
    : toTitleCase(raw.founder_last_name || (nameParts.ok ? nameParts.lastName : founderName.split(' ').slice(1).join(' ')));

  const cityMeta = matchSouthFloridaLocation(raw.city, raw.zip, raw.state || 'FL');
  if (options.requireSouthFlorida !== false && !cityMeta.isSouthFlorida) {
    return null;
  }

  const cleanName = cleanBusinessName(businessName);
  const rawWebsite = normalizeDomain(raw.website || raw.company_domain || '');
  const website = (rawWebsite && !SOCIAL_OR_DIRECTORY_DOMAINS.test(rawWebsite) && isValidCompanyDomain(rawWebsite))
    ? rawWebsite
    : null;

  const scored = scoreAndClassifyCandidate({
    ...raw,
    business_name: businessName,
    business_name_clean: cleanName,
    city: cityMeta.city,
    website
  }, null, { recomputePainSummary: !raw.pain_summary });

  const docNumber = String(raw.doc_number || raw.docNumber || '').trim().toUpperCase() ||
    (placeId ? buildCanonicalDocNumberFromPlaceId(placeId) : `MAP_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`);

  const email = String(raw.email || '').trim().toLowerCase() || null;
  const phone = String(raw.phone || '').trim() || null;

  let enrichmentStatus = raw.enrichment_status || 'unattempted';
  if (email && phone) enrichmentStatus = 'found';
  else if (email || phone) enrichmentStatus = 'partial';

  const topCompetitorsStr = typeof raw.top_competitors === 'string'
    ? raw.top_competitors
    : (Array.isArray(raw.top_competitors) ? JSON.stringify(raw.top_competitors) : null);

  const outreachStatus = raw.outreach_status || 'uncontacted';
  const defaultCadenceStep = raw.cadence_step !== undefined && raw.cadence_step !== null
    ? Number(raw.cadence_step)
    : (['in_cadence', 'emailed', 'promoted'].includes(outreachStatus) ? 1 : 0);

  return {
    id: raw.id || (placeId ? `gbp_${String(placeId).toLowerCase().replace(/[^a-z0-9]/g, '').slice(-20)}` : `map_${docNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}`),
    doc_number: docNumber,
    place_id: placeId ? String(placeId).trim() : null,
    cid: raw.cid ? String(raw.cid).trim() : null,
    business_name: businessName.toUpperCase(),
    business_name_clean: cleanName,
    entity_type: raw.entity_type || 'Google Maps GBP',
    filing_date: raw.filing_date || new Date().toISOString().slice(0, 10),
    founder_name: founderName,
    founder_first_name: firstName,
    founder_last_name: lastName,
    founder_title: String(raw.founder_title || 'Owner').toUpperCase(),
    secondary_officers: typeof raw.secondary_officers === 'string' ? raw.secondary_officers : JSON.stringify(raw.secondary_officers || []),
    registered_agent: toTitleCase(raw.registered_agent || founderName),
    principal_address: toTitleCase(raw.principal_address || raw.address || ''),
    mailing_address: toTitleCase(raw.mailing_address || ''),
    city: cityMeta.city,
    state: 'FL',
    zip: String(raw.zip || '').trim().slice(0, 10),
    county: cityMeta.county,
    niche: raw.niche || scored.niche,
    score: typeof raw.score === 'number' ? raw.score : scored.score,
    gbp_rank: raw.gbp_rank !== undefined && raw.gbp_rank !== null && raw.gbp_rank !== '' ? Number(raw.gbp_rank) : null,
    review_count: raw.review_count !== undefined && raw.review_count !== null && raw.review_count !== '' ? Number(raw.review_count) : null,
    rating: raw.rating !== undefined && raw.rating !== null && raw.rating !== '' ? Number(raw.rating) : null,
    gbp_category: raw.gbp_category || null,
    top_competitors: topCompetitorsStr,
    lcp_ms: scored.lcp_ms,
    performance_score: scored.performance_score,
    has_schema: scored.has_schema,
    has_ssl: scored.has_ssl,
    website_status: scored.website_status,
    recommended_tier: raw.recommended_tier || scored.recommended_tier,
    pain_summary: raw.pain_summary || scored.pain_summary,
    cadence_step: defaultCadenceStep,
    next_action_at: raw.next_action_at || null,
    last_channel: raw.last_channel || null,
    email,
    phone,
    website,
    enrichment_status: enrichmentStatus,
    enrichment_source: raw.enrichment_source || (email || phone ? 'manual' : null),
    enrichment_confidence: raw.enrichment_confidence || null,
    enrichment_meta: typeof raw.enrichment_meta === 'string' ? raw.enrichment_meta : JSON.stringify(raw.enrichment_meta || {}),
    outreach_status: outreachStatus,
    notes: raw.notes || null
  };
}

export function parseOutreachBulkText(text, options = { requireSouthFlorida: true, excludeShells: true }) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      const items = Array.isArray(parsedJson)
        ? parsedJson
        : (Array.isArray(parsedJson?.candidates) ? parsedJson.candidates : null);
      if (items) {
        return items
          .filter(item => item && typeof item === 'object' && !Array.isArray(item))
          .map(item => buildCandidateRecord(item, options))
          .filter(Boolean);
      }
    } catch (_) {
      // Fall through to CSV parser if input is not valid JSON
    }
  }

  const lines = trimmed.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Reject 1440-byte Sunbiz cordata fixed-width lines; outreach is Google Maps / Business Listings only
  const firstLine = lines[0];
  if (firstLine.length >= 400 && /^[LPFN]\d{9,11}/i.test(firstLine.trim())) {
    return [];
  }

  const rows = parseCsvLines(lines);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_'));
  const candidates = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] || '';
    });

    const rawZip = obj.zip || obj.postal_code || obj.principal_zip || '';
    const mapped = {
      doc_number: obj.doc_number || obj.document_number || obj.doc || obj.id,
      place_id: obj.place_id || obj.placeid || null,
      cid: obj.cid || null,
      business_name: obj.business_name || obj.entity_name || obj.company || obj.corporation_name || obj.name || obj.title,
      filing_date: obj.filing_date || obj.date_filed || obj.effective_date,
      founder_name: obj.founder_name || obj.officer_name || obj.manager_name || obj.authorized_person || obj.founder || obj.registered_agent || 'Owner',
      founder_title: obj.founder_title || obj.title || 'Owner',
      principal_address: obj.principal_address || obj.address || obj.street_address,
      city: normalizeSouthFlCity(obj.city || obj.principal_city, rawZip),
      state: obj.state || obj.principal_state || 'FL',
      zip: rawZip,
      niche: obj.niche || obj.category || undefined,
      gbp_rank: obj.gbp_rank || obj.rank || undefined,
      review_count: obj.review_count || obj.reviews || undefined,
      rating: obj.rating || undefined,
      gbp_category: obj.gbp_category || obj.category || undefined,
      email: obj.email || obj.email_address,
      phone: obj.phone || obj.phone_number,
      website: obj.website || obj.domain
    };

    const record = buildCandidateRecord(mapped, options);
    if (record) candidates.push(record);
  }

  return candidates;
}

function parseCsvLines(lines) {
  return lines.map(line => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });
}

// ---------------------------------------------------------------------------
// 8. Multi-Stage Decision-Maker Enrichment Waterfall
// ---------------------------------------------------------------------------

export async function verifyEmailDomainDns(emailOrDomain) {
  const domain = normalizeDomain(emailOrDomain);
  if (!domain) {
    return { valid: false, domain: '', reason: 'Invalid domain format' };
  }

  try {
    const mxRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      signal: getTimeoutSignal(5000),
      headers: { 'Accept': 'application/dns-json' }
    });
    if (mxRes.ok) {
      const mxData = await mxRes.json().catch(() => ({}));
      if (mxData.Status === 3) {
        return { valid: false, domain, reason: `Domain "${domain}" does not exist in DNS (NXDOMAIN)` };
      }
      if (Array.isArray(mxData.Answer) && mxData.Answer.length > 0) {
        return { valid: true, domain, hasMx: true };
      }
    }

    const aRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
      signal: getTimeoutSignal(5000),
      headers: { 'Accept': 'application/dns-json' }
    });
    if (aRes.ok) {
      const aData = await aRes.json().catch(() => ({}));
      if (aData.Status === 3) {
        return { valid: false, domain, reason: `Domain "${domain}" does not exist in DNS (NXDOMAIN)` };
      }
      if (Array.isArray(aData.Answer) && aData.Answer.length > 0) {
        return { valid: false, domain, reason: `Domain "${domain}" has no mail server (MX) records configured` };
      }
    }

    return { valid: false, domain, reason: `Domain "${domain}" has no DNS or mail server records` };
  } catch (err) {
    return { valid: true, domain, warning: err.message };
  }
}

const GENERIC_BUSINESS_STOPWORDS = new Set([
  'llc', 'inc', 'corp', 'corporation', 'company', 'co', 'group', 'services', 'service',
  'solutions', 'enterprises', 'enterprise', 'management', 'holdings', 'holding', 'partners',
  'associates', 'consulting', 'consultants', 'florida', 'south', 'north', 'east', 'west',
  'central', 'coastal', 'miami', 'broward', 'palm', 'beach', 'fort', 'lauderdale', 'weston',
  'doral', 'hollywood', 'pompano', 'davie', 'miramar', 'pembroke', 'pines', 'coral', 'springs',
  'gables', 'plantation', 'sunrise', 'boca', 'raton', 'delray', 'aventura', 'hialeah', 'kendall',
  'homestead', 'tamarac', 'margate', 'deerfield', 'hallandale', 'dania', 'parkland', 'coconut',
  'creek', 'lauderhill', 'oakland', 'wilton', 'manors', 'sweetwater', 'gardens', 'lakes', 'isles',
  'the', 'and', 'for', 'with', 'from', 'center', 'care', 'pro', 'pros', 'all', 'best', 'prime',
  'elite', 'premier', 'first', 'new', 'usa', 'america', 'american', 'global', 'national', 'local'
]);

function extractBusinessKeywords(businessNameClean) {
  return String(businessNameClean || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !GENERIC_BUSINESS_STOPWORDS.has(w));
}

function doesOrgMatchCandidate(orgNameInput, businessNameClean) {
  const orgLower = String(orgNameInput || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const candLower = String(businessNameClean || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  if (!orgLower || !candLower) return false;
  if (orgLower.includes(candLower) || candLower.includes(orgLower)) return true;

  const keywords = extractBusinessKeywords(businessNameClean);
  if (keywords.length === 0) return false;

  const brandWord = keywords[0];
  const matchedKeywords = keywords.filter(w => w.length >= 4 && orgLower.includes(w));

  if (brandWord && brandWord.length >= 4 && orgLower.includes(brandWord)) return true;
  if (brandWord && brandWord.length === 3 && new RegExp(`\\b${brandWord}\\b`, 'i').test(orgLower)) return true;
  if (matchedKeywords.length >= 2) return true;
  return false;
}

export function isPlaceholderFounderName(nameInput, businessNameClean = '') {
  const raw = String(nameInput || '').trim();
  if (!raw) return true;
  if (/^(owner(\s*\/\s*decision\s*maker)?|decision\s*maker|manager|founder|president|principal|admin|team|director|member|mgr|ambr|ra|unknown|n\/a|none|null|undefined|there)$/i.test(raw)) {
    return true;
  }
  const cleanBiz = String(businessNameClean || '').trim().toLowerCase();
  if (cleanBiz && raw.toLowerCase() === cleanBiz) {
    return true;
  }
  const cleanBizStripped = cleanBusinessName(businessNameClean).toLowerCase();
  if (cleanBizStripped && raw.toLowerCase() === cleanBizStripped) {
    return true;
  }
  return false;
}

export function resolveFounderNameParts(candidate) {
  let firstName = String(candidate.founder_first_name || '').trim();
  let lastName = String(candidate.founder_last_name || '').trim();
  let fullName = String(candidate.founder_name || '').trim();

  if (isPlaceholderFounderName(fullName, candidate.business_name_clean)) {
    return { firstName: '', lastName: '', fullName: fullName || 'Owner' };
  }

  const tokens = fullName.split(/\s+/).filter(Boolean);
  if (
    tokens.length >= 3 &&
    String(candidate.founder_title || '').includes('RA') &&
    firstName === tokens[0] &&
    lastName === tokens[tokens.length - 1]
  ) {
    firstName = tokens[tokens.length - 1];
    lastName = tokens.slice(0, tokens.length - 1).join(' ');
    fullName = `${firstName} ${lastName}`;
  } else if (!firstName || !lastName) {
    const split = splitName(fullName);
    if (split.ok) {
      firstName = firstName || split.firstName;
      lastName = lastName || split.lastName;
    }
  }

  return { firstName, lastName, fullName };
}

/**
 * Search Hunter.io `/v2/domain-search?domain=...` to discover the owner / president / GM
 * name and verified email when a candidate's domain is known from Google Maps GBP.
 */
async function hunterSearchDecisionMakerByDomain(domain, apiKey) {
  const cleanDomain = normalizeDomain(domain);
  if (!isValidCompanyDomain(cleanDomain)) {
    return { found: false };
  }

  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(cleanDomain)}&limit=10`;
  const res = await fetch(url, {
    method: 'GET',
    signal: getTimeoutSignal(7000),
    headers: {
      'X-API-KEY': apiKey,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    return { found: false };
  }
  const body = await res.json().catch(() => ({}));
  const emails = Array.isArray(body?.data?.emails) ? body.data.emails : [];
  if (emails.length === 0) {
    return { found: false, domain: cleanDomain };
  }

  const EXEC_TITLE_REGEX = /\b(owner|founder|co-founder|president|ceo|principal|managing\s*member|partner|general\s*manager|director|vp|vice\s*president)\b/i;

  const scoredEmails = emails
    .filter(e => typeof e?.value === 'string' && e.value.includes('@'))
    .map(e => {
      const pos = String(e.position || e.seniority || '');
      const hasExecTitle = EXEC_TITLE_REGEX.test(pos) || e.seniority === 'executive';
      const hasPersonName = Boolean(e.first_name && e.last_name);
      const conf = Number(e.confidence || 50);
      const rankScore = (hasExecTitle ? 100 : 0) + (hasPersonName ? 40 : 0) + conf;
      return { entry: e, rankScore };
    })
    .sort((a, b) => b.rankScore - a.rankScore);

  const best = scoredEmails[0]?.entry;
  if (!best) return { found: false, domain: cleanDomain };

  const firstName = best.first_name ? toTitleCase(best.first_name) : '';
  const lastName = best.last_name ? toTitleCase(best.last_name) : '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  return {
    found: true,
    email: best.value.trim().toLowerCase(),
    confidence: Number(best.confidence || 82),
    firstName: firstName || null,
    lastName: lastName || null,
    fullName: fullName || null,
    position: best.position || null,
    linkedinUrl: best.linkedin || null,
    verification: best.verification?.status || null,
    domain: cleanDomain
  };
}

export async function enrichOutreachCandidate(candidate, env = {}) {
  let email = (candidate.email && !/@google\.com$/i.test(candidate.email)) ? candidate.email : null;
  let phone = candidate.phone || null;
  const initialDomain = normalizeDomain(candidate.website || '');
  let website = (initialDomain && !SOCIAL_OR_DIRECTORY_DOMAINS.test(initialDomain) && isValidCompanyDomain(initialDomain))
    ? initialDomain
    : '';
  let confidence = candidate.enrichment_confidence || null;
  let source = candidate.enrichment_source || null;

  let resolvedNames = resolveFounderNameParts(candidate);
  const effectiveCandidate = {
    ...candidate,
    founder_name: resolvedNames.fullName,
    founder_first_name: resolvedNames.firstName,
    founder_last_name: resolvedNames.lastName
  };

  const calibratedMeta = getNicheOutreachMeta(effectiveCandidate.niche, effectiveCandidate.county);
  const meta = {
    attempts: [],
    linkedin_url: null,
    job_title: effectiveCandidate.founder_title || 'Owner',
    verification: null,
    live_search_volume: calibratedMeta.searchersCount
  };

  // Stage 1: If domain is already known from Google Maps GBP, run Hunter.io Domain Search (+ Email Finder if founder name is known)
  const hunterKey = env.ENRICHMENT_API_KEY || env.HUNTER_API_KEY || env.HUNTER_API;
  if (website && hunterKey && (!email || !resolvedNames.firstName)) {
    try {
      const domainSearchRes = await hunterSearchDecisionMakerByDomain(website, hunterKey);
      meta.attempts.push({
        provider: 'hunter_domain_search',
        status: domainSearchRes.found ? 'found' : 'not_found',
        domain: website,
        discoveredPerson: domainSearchRes.fullName || null
      });
      if (domainSearchRes.found) {
        if (domainSearchRes.email && !email) {
          email = domainSearchRes.email;
          confidence = domainSearchRes.confidence || 84;
          source = 'hunter';
          meta.verification = domainSearchRes.verification;
        }
        if (domainSearchRes.fullName && !resolvedNames.firstName) {
          resolvedNames = {
            firstName: domainSearchRes.firstName || '',
            lastName: domainSearchRes.lastName || '',
            fullName: domainSearchRes.fullName
          };
          effectiveCandidate.founder_name = resolvedNames.fullName;
          effectiveCandidate.founder_first_name = resolvedNames.firstName;
          effectiveCandidate.founder_last_name = resolvedNames.lastName;
        }
        if (domainSearchRes.position) {
          meta.job_title = domainSearchRes.position;
        }
        if (domainSearchRes.linkedinUrl && !meta.linkedin_url) {
          meta.linkedin_url = domainSearchRes.linkedinUrl;
        }
      }
    } catch (err) {
      meta.attempts.push({ provider: 'hunter_domain_search', error: err.message });
    }
  }

  // Stage 2: DataForSEO Organic SERP Lookup (when website or phone is still missing)
  if (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) {
    try {
      if (!website || !phone) {
        const dfs = await lookupViaDataForSeo(effectiveCandidate, env);
        meta.attempts.push({ provider: 'dataforseo_serp', foundWebsite: dfs.website, foundPhone: dfs.phone });
        if (dfs.website && !website) website = dfs.website;
        if (dfs.phone && !phone) {
          phone = dfs.phone;
          source = source || 'dataforseo';
        }
        if (dfs.linkedinUrl && !meta.linkedin_url) {
          meta.linkedin_url = dfs.linkedinUrl;
        }
      }
      if (env.FORCE_LIVE_VOLUME === true) {
        const vol = await lookupSearchDemandViaDataForSeo(effectiveCandidate, env);
        if (vol > 0) meta.live_search_volume = vol;
      }
    } catch (err) {
      meta.attempts.push({ provider: 'dataforseo', error: err.message });
    }
  }

  // Stage 3: People Data Labs Person Enrich (when we have a person's first & last name)
  let pdlHints = null;
  const pdlKey = env.PDL_API_KEY || env.PDL_API;
  if ((!email || !phone) && pdlKey && effectiveCandidate.founder_first_name && effectiveCandidate.founder_last_name) {
    try {
      const pdlRes = await lookupViaPdl(effectiveCandidate, pdlKey);
      pdlHints = pdlRes;
      meta.attempts.push({
        provider: 'pdl',
        status: pdlRes.found ? 'found' : (pdlRes.personMatched ? 'matched_masked_on_free_tier' : 'not_found'),
        matchedCompany: pdlRes.jobCompanyName || null,
        matchedDomain: pdlRes.jobCompanyWebsite || null
      });
      if (pdlRes.email && !email) {
        email = pdlRes.email;
        confidence = pdlRes.likelihood ? pdlRes.likelihood * 10 : 85;
        source = 'pdl';
      }
      if (pdlRes.phone && !phone) {
        phone = pdlRes.phone;
        source = source || 'pdl';
      }
      if (pdlRes.linkedinUrl) meta.linkedin_url = pdlRes.linkedinUrl;
      if (
        pdlRes.jobCompanyWebsite &&
        !website &&
        isValidCompanyDomain(pdlRes.jobCompanyWebsite) &&
        doesOrgMatchCandidate(pdlRes.jobCompanyName, effectiveCandidate.business_name_clean)
      ) {
        website = normalizeDomain(pdlRes.jobCompanyWebsite);
      }
    } catch (err) {
      meta.attempts.push({ provider: 'pdl', error: err.message });
    }
  }

  // Stage 4: Hunter.io Email Finder (when founder name is known and email is still missing)
  if (!email && hunterKey && effectiveCandidate.founder_first_name && effectiveCandidate.founder_last_name) {
    try {
      const hunterRes = await enrichLead({
        name: effectiveCandidate.founder_name,
        firstName: effectiveCandidate.founder_first_name,
        lastName: effectiveCandidate.founder_last_name,
        company: effectiveCandidate.business_name_clean,
        companyDomain: isValidCompanyDomain(website) ? website : ''
      }, { ...env, ENRICHMENT_API_KEY: hunterKey });
      meta.attempts.push({ provider: 'hunter', status: hunterRes.status, domain: hunterRes.domain });
      if (hunterRes.domain && isValidCompanyDomain(hunterRes.domain) && !website) {
        website = hunterRes.domain;
      }
      if (hunterRes.email) {
        email = hunterRes.email;
        confidence = hunterRes.confidence || 80;
        source = 'hunter';
        meta.verification = hunterRes.verification;
        meta.linkedin_url = hunterRes.linkedinUrl || meta.linkedin_url;
      }
    } catch (err) {
      meta.attempts.push({ provider: 'hunter', error: err.message });
    }
  }

  // Stage 5: Apollo.io Organization/Domain People Search & Match
  const apolloKey = env.APOLLO_API_KEY || env.APOLLO_API;
  if ((!email || !phone || !resolvedNames.firstName) && apolloKey) {
    try {
      const apolloRes = await lookupViaApollo(effectiveCandidate, website, pdlHints, apolloKey);
      meta.attempts.push({
        provider: 'apollo',
        status: apolloRes.found ? 'found' : 'not_found',
        matchedOrg: apolloRes.matchedOrg || null,
        matchConfidence: apolloRes.matchConfidence || null,
        discoveredPerson: apolloRes.fullName || null
      });
      if (apolloRes.email && !email) {
        email = apolloRes.email;
        confidence = apolloRes.matchConfidence === 'high' ? 92 : 85;
        source = 'apollo';
      }
      if (apolloRes.phone && !phone) {
        phone = apolloRes.phone;
        source = source || 'apollo';
      }
      if (apolloRes.fullName && !resolvedNames.firstName) {
        resolvedNames = {
          firstName: apolloRes.firstName || '',
          lastName: apolloRes.lastName || '',
          fullName: apolloRes.fullName
        };
      }
      if (apolloRes.title) {
        meta.job_title = apolloRes.title;
      }
      if (apolloRes.linkedinUrl && !meta.linkedin_url) meta.linkedin_url = apolloRes.linkedinUrl;
      if (apolloRes.website && isValidCompanyDomain(apolloRes.website) && !website) {
        website = apolloRes.website;
      }
    } catch (err) {
      meta.attempts.push({ provider: 'apollo', error: err.message });
    }
  }

  // Stage 6: Cloudflare DoH MX verification on discovered email
  if (email) {
    const dnsCheck = await verifyEmailDomainDns(email);
    meta.dns_mx_valid = dnsCheck.valid;
    if (!dnsCheck.valid) {
      meta.rejected_unroutable_email = email;
      meta.rejected_reason = dnsCheck.reason;
      email = null;
      confidence = null;
    }
  }

  let status = 'not_found';
  if (email && phone) status = 'found';
  else if (email || phone) status = 'partial';

  return {
    status,
    email: email || null,
    phone: phone || null,
    website: (website && isValidCompanyDomain(website)) ? website : null,
    confidence: confidence || null,
    source: (email || phone) ? (source || 'enrichment') : (meta.attempts.length > 0 ? meta.attempts[0].provider : 'none'),
    resolvedFounder: resolvedNames,
    meta
  };
}

async function lookupViaDataForSeo(candidate, env) {
  const authHeader = 'Basic ' + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);
  const query = candidate.city
    ? `"${candidate.business_name_clean}" "${candidate.city}" FL`
    : `"${candidate.business_name_clean}" FL`;
  const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method: 'POST',
    signal: getTimeoutSignal(8000),
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      keyword: query,
      location_code: 2840,
      language_code: 'en',
      depth: 8
    }])
  });

  if (!res.ok) return { website: null, phone: null, linkedinUrl: null };
  const data = await res.json().catch(() => ({}));
  const items = data?.tasks?.[0]?.result?.[0]?.items || [];

  const candLower = String(candidate.business_name_clean || '').toLowerCase().trim();
  const keywords = extractBusinessKeywords(candidate.business_name_clean);
  const primaryBrandWord = keywords[0] || '';
  const founderLastLower = String(candidate.founder_last_name || '').toLowerCase().trim();

  let website = null;
  let phone = null;
  let linkedinUrl = null;

  for (const item of items) {
    if (item.type && item.type !== 'organic' && item.type !== 'local_pack' && item.type !== 'knowledge_graph') {
      continue;
    }

    const titleLower = String(item.title || '').toLowerCase();
    const descLower = String(item.description || '').toLowerCase();
    const combinedText = `${titleLower} ${descLower}`;
    const itemUrl = String(item.url || '');

    if (!linkedinUrl && /linkedin\.com\/in\//i.test(itemUrl) && founderLastLower && combinedText.includes(founderLastLower)) {
      linkedinUrl = itemUrl.split('?')[0];
    }

    const matchesExactName = candLower.length >= 4 && combinedText.includes(candLower);
    const matchedKeywordCount = keywords.filter(w => combinedText.includes(w)).length;
    const hasBrandWord = primaryBrandWord.length >= 3 && (
      combinedText.includes(primaryBrandWord) ||
      String(item.domain || '').toLowerCase().includes(primaryBrandWord)
    );
    const isRelevantResult = matchesExactName || (hasBrandWord && (matchedKeywordCount >= 2 || keywords.length === 1));

    if (!isRelevantResult) continue;

    if (item.type === 'organic' && item.domain && !website) {
      const candidateDomain = normalizeDomain(item.domain);
      if (isValidCompanyDomain(candidateDomain) && !SOCIAL_OR_DIRECTORY_DOMAINS.test(candidateDomain)) {
        const domainNoTld = candidateDomain.split('.')[0].replace(/[^a-z0-9]/g, '');
        const domainHasKeyword = keywords.some(w => w.length >= 4 && domainNoTld.includes(w));
        if (domainHasKeyword || matchesExactName) {
          website = candidateDomain;
        }
      }
    }

    if (!phone) {
      const phoneMatch = `${item.title || ''} ${item.description || ''}`.match(/\(?(305|786|954|754|561)\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        phone = phoneMatch[0];
      }
    }
  }

  return { website, phone, linkedinUrl };
}

export async function lookupSearchDemandViaDataForSeo(candidate, env) {
  const nicheMeta = getNicheOutreachMeta(candidate.niche, candidate.county);
  const keywords = nicheMeta.seedKeywords;
  if (!keywords || keywords.length === 0) return nicheMeta.searchersCount;

  const county = candidate.county && candidate.county.includes('County')
    ? candidate.county
    : 'Broward County';
  const authHeader = 'Basic ' + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);
  const res = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
    method: 'POST',
    signal: getTimeoutSignal(8000),
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      location_name: `${county},Florida,United States`,
      language_name: 'English',
      keywords
    }])
  });

  if (!res.ok) return nicheMeta.searchersCount;
  const data = await res.json().catch(() => ({}));
  const items = data?.tasks?.[0]?.result || [];
  let sum = 0;
  for (const item of items) {
    if (item && typeof item.search_volume === 'number') {
      sum += item.search_volume;
    }
  }
  return sum > 0 ? sum : nicheMeta.searchersCount;
}

async function lookupViaApollo(candidate, domain, pdlHints, apiKey) {
  const validDomain = isValidCompanyDomain(domain) ? normalizeDomain(domain) : '';
  const pdlMatchedCompany = (pdlHints?.jobCompanyName && doesOrgMatchCandidate(pdlHints.jobCompanyName, candidate.business_name_clean))
    ? pdlHints.jobCompanyName
    : null;
  const pdlMatchedDomain = (pdlMatchedCompany && pdlHints?.jobCompanyWebsite && isValidCompanyDomain(pdlHints.jobCompanyWebsite))
    ? normalizeDomain(pdlHints.jobCompanyWebsite)
    : '';

  const effectiveDomain = validDomain || pdlMatchedDomain || undefined;
  const effectiveOrgName = pdlMatchedCompany || candidate.business_name_clean;
  const hasKnownPersonName = Boolean(candidate.founder_first_name && candidate.founder_last_name);

  const callPeopleMatch = async (payload) => {
    const res = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      signal: getTimeoutSignal(8000),
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({
        reveal_personal_emails: true,
        ...payload
      })
    });
    if (!res.ok) throw new Error(`Apollo HTTP ${res.status}`);
    const body = await res.json().catch(() => ({}));
    return body?.person || null;
  };

  let person = null;
  if (hasKnownPersonName) {
    person = await callPeopleMatch({
      first_name: candidate.founder_first_name,
      last_name: candidate.founder_last_name,
      organization_name: effectiveOrgName,
      domain: effectiveDomain,
      linkedin_url: pdlHints?.linkedinUrl || undefined,
      city: candidate.city || undefined,
      state: 'Florida',
      country: 'United States'
    });
  }

  // Domain / Organization Decision-Maker Search when starting from a Google Maps GBP listing ("Owner") or unmatched LLC
  if (!person || person.result !== 'Matched' || person.match_confidence === 'low') {
    try {
      const searchPayload = {
        person_locations: [candidate.city ? `${candidate.city}, Florida` : 'Florida'],
        per_page: 5
      };
      if (hasKnownPersonName) {
        searchPayload.q_person_name = `${candidate.founder_first_name} ${candidate.founder_last_name}`.trim();
      } else if (effectiveDomain) {
        searchPayload.q_organization_domains = [effectiveDomain];
        searchPayload.person_seniorities = ['owner', 'founder', 'c_suite', 'partner', 'vp', 'director', 'manager'];
      } else {
        searchPayload.q_organization_name = effectiveOrgName;
        searchPayload.person_seniorities = ['owner', 'founder', 'c_suite', 'partner', 'director', 'manager'];
      }

      const searchRes = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
        method: 'POST',
        signal: getTimeoutSignal(8000),
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey
        },
        body: JSON.stringify(searchPayload)
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json().catch(() => ({}));
        const people = Array.isArray(searchData?.people) ? searchData.people : [];
        const matchingCandidate = people.find(p =>
          p.id &&
          (p.has_email || p.has_direct_phone === 'Yes') &&
          (effectiveDomain || doesOrgMatchCandidate(p.organization?.name, candidate.business_name_clean))
        );
        if (matchingCandidate) {
          const unlocked = await callPeopleMatch({ id: matchingCandidate.id });
          if (unlocked) person = unlocked;
        }
      }
    } catch (_) {
      // ignore fallback search errors
    }
  }

  if (!person || person.result === 'N/A') return { found: false };

  const personState = String(person.state || '').trim().toLowerCase();
  const personCity = String(person.city || '').trim().toLowerCase();
  const candCity = String(candidate.city || '').trim().toLowerCase();
  const orgName = String(person.organization?.name || '').trim();
  const orgMatchesCandidate = doesOrgMatchCandidate(orgName, candidate.business_name_clean) || Boolean(effectiveDomain);
  const isFloridaPerson = personState === 'florida' || personState === 'fl';
  const matchConfidence = String(person.match_confidence || '').toLowerCase();

  if (matchConfidence === 'low' && !orgMatchesCandidate && (!isFloridaPerson || (candCity && personCity !== candCity))) {
    return { found: false, matchConfidence };
  }

  if (!effectiveDomain && !isFloridaPerson && !orgMatchesCandidate) {
    return { found: false, matchConfidence };
  }

  let email = (typeof person.email === 'string' && person.email.includes('@'))
    ? person.email.trim().toLowerCase()
    : (Array.isArray(person.personal_emails) && typeof person.personal_emails[0] === 'string'
      ? person.personal_emails[0].trim().toLowerCase()
      : null);
  if (email && /^email_not_unlocked@/i.test(email)) email = null;

  if (email && !orgMatchesCandidate) {
    const emailDomain = email.split('@')[1]?.toLowerCase() || '';
    const isPersonalProvider = [
      'gmail.com', 'yahoo.com', 'icloud.com', 'outlook.com', 'hotmail.com',
      'aol.com', 'comcast.net', 'att.net', 'msn.com', 'live.com', 'me.com'
    ].includes(emailDomain);
    const sameFloridaCity = isFloridaPerson && (!candCity || personCity === candCity);
    if (!isPersonalProvider || !sameFloridaCity || matchConfidence === 'low') {
      email = null;
    }
  }

  const rawPersonalPhone = person.phone_numbers?.[0]?.sanitized_number;
  const personalPhone = (typeof rawPersonalPhone === 'string' && /\d{7,}/.test(rawPersonalPhone) && (isFloridaPerson || orgMatchesCandidate))
    ? rawPersonalPhone
    : null;
  const rawOrgPhone = orgMatchesCandidate ? person.organization?.primary_phone?.sanitized_number : null;
  const orgPhone = (typeof rawOrgPhone === 'string' && /\d{7,}/.test(rawOrgPhone)) ? rawOrgPhone : null;
  const phone = personalPhone || orgPhone;
  const rawOrgWebsite = orgMatchesCandidate ? normalizeDomain(person.organization?.website_url || '') : '';
  const website = isValidCompanyDomain(rawOrgWebsite) ? rawOrgWebsite : '';

  const pFirst = person.first_name ? toTitleCase(person.first_name) : '';
  const pLast = person.last_name ? toTitleCase(person.last_name) : '';
  const pFull = [pFirst, pLast].filter(Boolean).join(' ') || null;

  return {
    found: Boolean(email || phone || pFull),
    email,
    phone,
    website,
    firstName: pFirst || null,
    lastName: pLast || null,
    fullName: pFull,
    title: person.title || null,
    matchedOrg: orgName || null,
    matchConfidence: matchConfidence || null,
    linkedinUrl: typeof person.linkedin_url === 'string' ? person.linkedin_url : null
  };
}

async function lookupViaPdl(candidate, apiKey) {
  const baseParams = {
    first_name: candidate.founder_first_name || '',
    last_name: candidate.founder_last_name || '',
    ...(candidate.city ? { locality: candidate.city } : {}),
    region: 'florida',
    country: 'united states',
    min_likelihood: '6'
  };

  const queryPdl = async (extraParams = {}) => {
    const params = new URLSearchParams({ ...baseParams, ...extraParams });
    return fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`, {
      method: 'GET',
      signal: getTimeoutSignal(8000),
      headers: {
        'X-Api-Key': apiKey,
        'Accept': 'application/json'
      }
    });
  };

  const cleanStreet = String(candidate.principal_address || '')
    .replace(/\s+\b(apt|apartment|unit|ste|suite|bldg|building|fl|floor|rm|room|#)\b.*$/i, '')
    .replace(/\s+\d{3,5}$/, '')
    .trim();

  let res = await queryPdl(
    cleanStreet
      ? { street_address: cleanStreet, ...(candidate.zip ? { postal_code: candidate.zip } : {}) }
      : {}
  );

  if (res.status === 404 && cleanStreet) {
    res = await queryPdl({});
  }

  if (res.status === 404) return { found: false, personMatched: false };
  if (!res.ok) throw new Error(`PDL HTTP ${res.status}`);

  const body = await res.json().catch(() => ({}));
  const data = body?.data || body;

  const candidateEmails = [
    data?.work_email,
    data?.recommended_personal_email,
    ...(Array.isArray(data?.personal_emails) ? data.personal_emails : []),
    ...(Array.isArray(data?.emails) ? data.emails.map(e => e?.address || e) : [])
  ];
  const email = candidateEmails.find(e => typeof e === 'string' && e.includes('@')) || null;

  const candidatePhones = [
    data?.mobile_phone,
    ...(Array.isArray(data?.phone_numbers) ? data.phone_numbers : []),
    ...(Array.isArray(data?.phones) ? data.phones.map(p => p?.number || p) : [])
  ];
  const phone = candidatePhones.find(p => typeof p === 'string' && /\d{7,}/.test(p)) || null;

  return {
    found: Boolean(email || phone),
    personMatched: true,
    email,
    phone,
    likelihood: body?.likelihood || null,
    jobCompanyName: typeof data?.job_company_name === 'string' ? data.job_company_name : null,
    jobCompanyWebsite: typeof data?.job_company_website === 'string' ? data.job_company_website : null,
    linkedinUrl: typeof data?.linkedin_url === 'string' ? `https://${data.linkedin_url.replace(/^https?:\/\//, '')}` : null
  };
}

// ---------------------------------------------------------------------------
// 9. Evidence-Based Multi-Touch Cadence Templates & Renderer
// ---------------------------------------------------------------------------

const TOUCH_1_AUDIT_BODY = `Hi {{first_name}},

I was looking at the {{city}} Google Maps results for {{top_service_queries}} (~{{searchers_count}} searches/mo) and noticed **{{business_name_clean}}** is sitting at **#{{gbp_rank}}** with {{review_count}} reviews—while **#1 {{top_competitor_1}}** ({{top_competitor_1_reviews}} reviews) is capturing most of the Top 3 Map Pack phone calls.

When I checked what local {{audience_noun}} see on your listing, the biggest leak is {{pain_hook}}.

I put together a custom 60-second preview & breakdown showing the exact fix to push {{business_name_clean}} into the {{city}} Top 3. Want me to send it over?

Christian Gomez
G3Z Creative • (786) 967-3699`;

const TOUCH_2_CALL_SMS_BODY = `📱 **2-Sentence "60-Sec Preview" SMS (Copy & Text to {{business_name_clean}}):**
Hey {{first_name}}, Christian here in South FL — sent you a quick note on why {{business_name_clean}} is sitting at #{{gbp_rank}} in {{city}} behind {{top_competitor_1}} because of {{pain_short}}. Mind if I text over a 60-sec custom preview?

📞 **<15s Owner-to-Owner Call Opener:**
"Hey {{first_name}}, Christian Gomez calling locally in South Florida. I saw {{business_name_clean}} at #{{gbp_rank}} in {{city}} behind {{top_competitor_1}} because of {{pain_short}}. I built a 60-second preview showing the fix—can I text you the link?"`;

const TOUCH_3_FOLLOWUP_BODY = `Hi {{first_name}},

Quick follow-up on {{business_name_clean}}. Across the ~{{searchers_count}} monthly searches for {{top_service_queries}} around {{city}}, over 70% of {{audience_noun}} call the Top 3 Map Pack (**#1 {{top_competitor_1}}** with {{top_competitor_1_reviews}} reviews and **#2 {{top_competitor_2}}** with {{top_competitor_2_reviews}} reviews).

Even bigger right now: when local {{audience_noun}} ask ChatGPT or Google AI for the best {{business_noun}} in {{city}}, it recommends the same Top 3 businesses whose websites clearly list their local services and neighborhoods. Right now at **#{{gbp_rank}}**, {{schema_gap}} is costing you both Map Pack and AI Search calls.

I have a 60-second custom preview link ready showing how {{business_name_clean}} can capture those calls. Want me to text or email the link over?

Christian Gomez
G3Z Creative • (786) 967-3699`;

const TOUCH_4_BREAKUP_BODY = `Hi {{first_name}},

I haven't heard back after reaching out a few times, so I'm assuming **{{business_name_clean}}** is booked solid on {{lingo_services}} right now.

I'm closing out the {{city}} diagnostic file and the custom 60-second preview built for {{business_name_clean}} before I offer our {{city}} slot to another local {{business_noun}}. That preview shows how to close the gap on **#1 {{top_competitor_1}}** by fixing {{pain_short}}.

If you'd like the 60-second breakdown link before I archive it, just reply **"send it"** and I'll send it right over. Either way, wishing you and your team a great season.

Christian Gomez
G3Z Creative • (786) 967-3699`;

export const OUTREACH_TEMPLATES = {
  touch_1_audit: {
    id: 'touch_1_audit',
    name: '🎯 Touch 1 (Day 0 Email): Rank & Competitor Gap Audit',
    channel: 'email',
    cadenceStep: 1,
    subject: '{{business_name_clean}} — #{{gbp_rank}} in {{city}} Map Pack vs {{top_competitor_1}}',
    body: TOUCH_1_AUDIT_BODY
  },

  touch_2_call_sms: {
    id: 'touch_2_call_sms',
    name: '📱 Touch 2 (Day +2 Call / SMS): Owner Opener & 2-Sentence Text',
    channel: 'sms_call',
    cadenceStep: 2,
    subject: 'Quick text / call script for {{business_name_clean}} ({{city}})',
    body: TOUCH_2_CALL_SMS_BODY
  },

  touch_3_followup: {
    id: 'touch_3_followup',
    name: '📈 Touch 3 (Day +5 Email): Map Pack Math & AI Search Wedge',
    channel: 'email',
    cadenceStep: 3,
    subject: 'Re: {{business_name_clean}} / {{city}} Map Pack & AI search calls',
    body: TOUCH_3_FOLLOWUP_BODY
  },

  touch_4_breakup: {
    id: 'touch_4_breakup',
    name: '👋 Touch 4 (Day +9 Email): Permission-Based Breakup ("Closing Your {{city}} File")',
    channel: 'email',
    cadenceStep: 4,
    subject: 'Closing my {{city}} file on {{business_name_clean}}',
    body: TOUCH_4_BREAKUP_BODY
  },

  // Legacy template aliases preserved for 100% backward compatibility
  launchpad_mockup: {
    id: 'launchpad_mockup',
    name: '⚡ Touch 1 (Default): Rank & Competitor Gap Audit',
    channel: 'email',
    cadenceStep: 1,
    subject: '{{business_name_clean}} — #{{gbp_rank}} in {{city}} Map Pack vs {{top_competitor_1}}',
    body: TOUCH_1_AUDIT_BODY
  },

  local_demand_snapshot: {
    id: 'local_demand_snapshot',
    name: '📱 Touch 2 (Day +2): Call & SMS Field Script ({{city}})',
    channel: 'sms_call',
    cadenceStep: 2,
    subject: 'Quick question re: {{business_name_clean}} in {{city}}',
    body: TOUCH_2_CALL_SMS_BODY
  },

  short_neighbor: {
    id: 'short_neighbor',
    name: '📈 Touch 3 (Day +5): Follow-Up — Map Pack Math & Mockup',
    channel: 'email',
    cadenceStep: 3,
    subject: 'Re: {{business_name_clean}} / {{city}} Map Pack & AI search calls',
    body: TOUCH_3_FOLLOWUP_BODY
  }
};

/**
 * Compute next cadence state when an outreach touch is logged or sent.
 * Step 1 (Touch 1 Email) -> next_action_at = +2 days
 * Step 2 (Touch 2 Call/SMS) -> next_action_at = +3 days (Day +5 from start)
 * Step 3 (Touch 3 Follow-Up) -> next_action_at = +4 days (Day +9 from start)
 * Step 4 (Touch 4 Breakup Email) -> next_action_at = null (4-touch cadence complete unless explicitly overridden)
 */
export function computeNextCadenceState(currentStep = 0, requestedStep = null, channel = 'email', nowDate = new Date(), explicitNextActionAt = undefined) {
  let effCurrent = currentStep;
  let effRequested = requestedStep;
  let effChannel = channel;
  let effNow = nowDate;
  let effExplicitNext = explicitNextActionAt;

  if (currentStep && typeof currentStep === 'object' && !(currentStep instanceof Date)) {
    effCurrent = currentStep.currentStep ?? currentStep.cadence_step ?? 0;
    effRequested = currentStep.step ?? currentStep.requestedStep ?? null;
    effChannel = currentStep.channel ?? currentStep.last_channel ?? 'email';
    effNow = currentStep.nowDate ?? new Date();
    effExplicitNext = currentStep.next_action_at ?? currentStep.explicitNextActionAt;
  } else if (requestedStep && typeof requestedStep === 'object' && !(requestedStep instanceof Date)) {
    effRequested = requestedStep.step ?? requestedStep.requestedStep ?? null;
    effChannel = requestedStep.channel ?? requestedStep.last_channel ?? channel;
    effNow = requestedStep.nowDate ?? nowDate;
    effExplicitNext = requestedStep.next_action_at ?? requestedStep.explicitNextActionAt ?? explicitNextActionAt;
  }

  const hasRequested = effRequested !== null && effRequested !== undefined && effRequested !== '' && Number.isFinite(Number(effRequested));
  const nextStep = hasRequested
    ? Math.max(1, Math.min(4, Math.round(Number(effRequested))))
    : Math.max(1, Math.min(4, Math.round(Number(effCurrent || 0)) + 1));

  const hasExplicitNext = effExplicitNext !== undefined &&
    (effExplicitNext === null || String(effExplicitNext).trim() !== '');
  if (hasExplicitNext) {
    return {
      cadence_step: nextStep,
      next_action_at: effExplicitNext,
      last_channel: effChannel || (nextStep === 2 ? 'sms' : 'email')
    };
  }

  const parsedNow = effNow instanceof Date
    ? effNow.getTime()
    : (typeof effNow === 'number' || typeof effNow === 'string' ? new Date(effNow).getTime() : NaN);
  const baseMs = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  let nextActionIso = null;
  if (nextStep === 1) {
    nextActionIso = new Date(baseMs + 2 * 86400 * 1000).toISOString();
  } else if (nextStep === 2) {
    nextActionIso = new Date(baseMs + 3 * 86400 * 1000).toISOString();
  } else if (nextStep === 3) {
    nextActionIso = new Date(baseMs + 4 * 86400 * 1000).toISOString();
  } else {
    // Step 4 completes the 4-touch cadence; next_action_at is null unless explicitly overridden
    nextActionIso = null;
  }

  return {
    cadence_step: nextStep,
    next_action_at: nextActionIso,
    last_channel: effChannel || (nextStep === 2 ? 'sms' : 'email')
  };
}

export function renderOutreachTemplate(templateId, candidate = {}) {
  const tpl = OUTREACH_TEMPLATES[templateId] || OUTREACH_TEMPLATES.touch_1_audit || OUTREACH_TEMPLATES.launchpad_mockup;
  const businessClean = candidate.business_name_clean || cleanBusinessName(candidate.business_name) || 'your business';
  const city = candidate.city || 'South Florida';
  let county = candidate.county || '';
  if (!county && (candidate.city || candidate.zip)) {
    const loc = matchSouthFloridaLocation(candidate.city, candidate.zip, candidate.state || 'FL');
    if (loc.isSouthFlorida && loc.county) {
      county = loc.county;
    }
  }
  county = county || 'Broward County';
  const niche = candidate.niche || 'Local Business';
  const nicheLower = niche === 'Local Business' ? 'local services' : niche.toLowerCase();

  // Graceful first_name fallback: never render "Hi Owner", "Hi Manager", "Hi undefined", or business name
  const rawFirst = String(candidate.founder_first_name || '').trim();
  const rawFull = String(candidate.founder_name || '').trim();
  const candidateFirstToken = rawFirst || rawFull.split(/\s+/)[0] || '';
  const isGenericFirst = isPlaceholderFounderName(candidateFirstToken, businessClean) ||
    isPlaceholderFounderName(rawFull, businessClean) ||
    candidateFirstToken.length < 2;

  const firstName = isGenericFirst ? 'there' : toTitleCase(candidateFirstToken);
  const founderNameDisplay = isGenericFirst ? 'Owner / Decision Maker' : toTitleCase(rawFull || candidateFirstToken);

  const nicheMeta = getNicheOutreachMeta(niche, county);
  const audienceNoun = nicheMeta.audienceNoun || 'customers';
  const businessNoun = nicheMeta.businessNoun || 'local business';

  let searchersFormatted = nicheMeta.searchersFormatted;
  if (candidate.enrichment_meta) {
    try {
      const parsedMeta = typeof candidate.enrichment_meta === 'string'
        ? JSON.parse(candidate.enrichment_meta)
        : candidate.enrichment_meta;
      if (parsedMeta?.live_search_volume && Number(parsedMeta.live_search_volume) > 0) {
        searchersFormatted = Number(parsedMeta.live_search_volume).toLocaleString('en-US');
      }
    } catch (_) {
      // fallback to calibrated county/niche volume
    }
  }

  // Parse top competitors with natural fallbacks and zero fabricated review counts
  let competitors = [];
  if (Array.isArray(candidate.top_competitors)) {
    competitors = candidate.top_competitors;
  } else if (typeof candidate.top_competitors === 'string' && candidate.top_competitors.trim().startsWith('[')) {
    try {
      competitors = JSON.parse(candidate.top_competitors);
    } catch (_) {
      competitors = [];
    }
  }

  const comp1 = competitors[0] || null;
  const comp2 = competitors[1] || null;
  const comp1HasName = Boolean(comp1?.name);
  const comp1HasReviews = Boolean(comp1?.reviews && Number(comp1.reviews) > 0);
  const comp2HasName = Boolean(comp2?.name);
  const comp2HasReviews = Boolean(comp2?.reviews && Number(comp2.reviews) > 0);

  const topComp1Name = comp1HasName ? comp1.name : `the top ${city} ${businessNoun}`;
  const topComp1Reviews = comp1HasReviews ? String(comp1.reviews) : '';
  const topComp2Name = comp2HasName ? comp2.name : `other ${city} Top 3 leaders`;
  const topComp2Reviews = comp2HasReviews ? String(comp2.reviews) : '';

  const hasRank = candidate.gbp_rank !== null && candidate.gbp_rank !== undefined && candidate.gbp_rank !== '' && Number(candidate.gbp_rank) > 0;
  const gbpRankStr = hasRank ? String(Math.round(Number(candidate.gbp_rank))) : 'outside the Top 3 Map Pack';

  const hasReviews = candidate.review_count !== null && candidate.review_count !== undefined && candidate.review_count !== '' && Number(candidate.review_count) > 0;
  const reviewCountStr = hasReviews ? String(Math.round(Number(candidate.review_count))) : '0';

  const ratingStr = (candidate.rating !== null && candidate.rating !== undefined && Number(candidate.rating) > 0)
    ? Number(candidate.rating).toFixed(1)
    : '4.8';

  const scored = scoreAndClassifyCandidate({ ...candidate, business_name_clean: businessClean, city });
  const websiteStatus = candidate.website_status || scored.website_status;
  const lcpMs = candidate.lcp_ms ?? scored.lcp_ms;
  const hasSchema = candidate.has_schema !== undefined && candidate.has_schema !== null ? Number(candidate.has_schema) : scored.has_schema;
  const hasSsl = candidate.has_ssl !== undefined && candidate.has_ssl !== null ? Number(candidate.has_ssl) : scored.has_ssl;
  const tierKey = candidate.recommended_tier || scored.recommended_tier || 'pilot_500';
  const tierMeta = OFFER_TIERS[tierKey] || OFFER_TIERS.pilot_500;

  const hasPositiveLcp = Boolean(
    lcpMs &&
    Number(lcpMs) > 0 &&
    websiteStatus !== 'missing' &&
    websiteStatus !== 'broken' &&
    candidate.website
  );
  let lcpSeconds = 'no mobile site';
  let painHook = `having no dedicated website linked to your Google Business Profile, so ${audienceNoun} who click your listing to check your work bounce straight to a competing ${businessNoun}`;
  let painShort = 'the missing website on your Google listing';
  let schemaGap = 'having no dedicated website or city service pages for Google to verify what you do';

  if (websiteStatus === 'missing' || !candidate.website) {
    lcpSeconds = 'no mobile site';
    painHook = `having no dedicated website linked to your Google Business Profile, so ${audienceNoun} who click your listing to check your work bounce straight to a competing ${businessNoun}`;
    painShort = 'the missing website on your Google listing';
  } else if (websiteStatus === 'broken') {
    lcpSeconds = 'broken mobile link';
    painHook = `your website link failing to load on phones, causing ${audienceNoun} to hit the back button and call the next ${businessNoun}`;
    painShort = 'a broken mobile website link';
  } else if (websiteStatus === 'slow' || (hasPositiveLcp && Number(lcpMs) > 4000)) {
    if (hasPositiveLcp) {
      lcpSeconds = `${(Number(lcpMs) / 1000).toFixed(1)}s`;
      painHook = `your mobile site taking ${lcpSeconds} to load—over half of ${audienceNoun} tap the back button after 3 seconds and call the next ${businessNoun}`;
      painShort = `a ${lcpSeconds} mobile load time`;
    } else {
      lcpSeconds = 'slow mobile site';
      painHook = `a slow mobile website—over half of ${audienceNoun} tap the back button after 3 seconds and call the next ${businessNoun}`;
      painShort = 'a slow mobile site';
    }
  } else if (websiteStatus === 'unoptimized') {
    if (hasPositiveLcp) {
      lcpSeconds = `${(Number(lcpMs) / 1000).toFixed(1)}s`;
      painHook = `your site taking ${lcpSeconds} on phones and missing the dedicated city and service pages Google uses to rank the Top 3 Map Pack`;
      painShort = `a ${lcpSeconds} mobile site missing city service pages`;
    } else {
      lcpSeconds = 'unoptimized mobile site';
      painHook = 'your site missing dedicated city and service pages Google uses to rank the Top 3 Map Pack';
      painShort = 'missing city service pages';
    }
  } else {
    if (hasPositiveLcp) {
      lcpSeconds = `${(Number(lcpMs) / 1000).toFixed(1)}s`;
      painHook = `thinner local service coverage than the Top 3 Map Pack leaders (${lcpSeconds} mobile load)`;
      painShort = `thinner local pages than the Top 3 (${lcpSeconds} mobile load)`;
    } else {
      lcpSeconds = 'healthy mobile site';
      painHook = 'thinner local service coverage than the Top 3 Map Pack leaders';
      painShort = 'thinner local service pages than the Top 3';
    }
  }

  if (websiteStatus === 'missing' || !candidate.website) {
    schemaGap = 'having no dedicated website or city service pages for Google to verify what you do';
  } else if (websiteStatus === 'broken') {
    schemaGap = 'a broken mobile website';
  } else if (hasSsl === 0) {
    schemaGap = 'an unsecure mobile link and missing local trust info';
  } else if (websiteStatus === 'slow' || (hasPositiveLcp && Number(lcpMs) > 4000)) {
    schemaGap = hasSchema === 1
      ? 'slow mobile page speed'
      : 'slow mobile speed and missing local info';
  } else if (websiteStatus === 'unoptimized' || hasSchema === 0) {
    schemaGap = 'lack of dedicated city and service pages on your website';
  } else {
    schemaGap = 'thinner city service coverage than the Top 3 leaders';
  }

  const lcpDisplay = (websiteStatus === 'missing' || !candidate.website)
    ? 'no mobile site linked'
    : (websiteStatus === 'broken')
      ? 'broken mobile link'
      : hasPositiveLcp
        ? `${(Number(lcpMs) / 1000).toFixed(1)}s mobile load time`
        : 'mobile load time not measured';

  const vars = {
    first_name: firstName,
    founder_name: founderNameDisplay,
    business_name: candidate.business_name || businessClean,
    business_name_clean: businessClean,
    city,
    county,
    niche,
    niche_lower: nicheLower,
    audience_noun: audienceNoun,
    business_noun: businessNoun,
    gbp_rank: gbpRankStr,
    review_count: reviewCountStr,
    rating: ratingStr,
    top_competitor_1: topComp1Name,
    top_competitor_1_reviews: topComp1Reviews,
    top_competitor_2: topComp2Name,
    top_competitor_2_reviews: topComp2Reviews,
    lcp_seconds: hasPositiveLcp ? (Number(lcpMs) / 1000).toFixed(1) : lcpSeconds,
    lcp_display: lcpDisplay,
    schema_gap: schemaGap,
    pain_hook: painHook,
    pain_short: painShort,
    pain_summary: candidate.pain_summary || scored.pain_summary,
    recommended_offer: `${tierMeta.label} (${tierMeta.shortLabel})`,
    service_term: nicheMeta.serviceTerm,
    top_service_queries: nicheMeta.topServiceQueries,
    lingo_services: nicheMeta.lingoServices,
    lingo_question: nicheMeta.lingoQuestion,
    searchers_count: searchersFormatted,
    doc_number: candidate.doc_number || ''
  };

  const replaceVars = (str) => {
    let out = String(str || '');
    if (!hasRank) {
      out = out
        .replace(/\{\{business_name_clean\}\}\s+—\s+#\{\{gbp_rank\}\}\s+in\s+\{\{city\}\}\s+Map Pack\s+vs\s+\{\{top_competitor_1\}\}/g, '{{business_name_clean}} — showing up on Google in {{city}}')
        .replace(/is sitting at \*\*#\{\{gbp_rank\}\}\*\*/g, 'is **not yet showing in the {{city}} Top 3 Map Pack**')
        .replace(/is sitting at #\{\{gbp_rank\}\} in \{\{city\}\}/g, 'is outside the Top 3 Map Pack in {{city}}')
        .replace(/at #\{\{gbp_rank\}\} in \{\{city\}\}/g, 'outside the Top 3 Map Pack in {{city}}')
        .replace(/Right now at \*\*#\{\{gbp_rank\}\}\*\*/g, 'Right now outside the **{{city}} Top 3 Map Pack**')
        .replace(/sitting at #\{\{gbp_rank\}\}/g, 'outside the Top 3 Map Pack')
        .replace(/#\{\{gbp_rank\}\} in \{\{city\}\} Map Pack/g, 'outside the Top 3 Map Pack in {{city}}')
        .replace(/at #\{\{gbp_rank\}\}/g, 'outside the Top 3 Map Pack')
        .replace(/#\{\{gbp_rank\}\}/g, '{{gbp_rank}}');
    }
    if (!hasReviews) {
      out = out
        .replace(/\s+with\s+\*\*\{\{review_count\}\}\s+reviews\*\*(?:\s*\(\{\{rating\}\}★\))?/g, '')
        .replace(/\s+with\s+\{\{review_count\}\}\s+reviews(?:\s*\(\{\{rating\}\}★\))?/g, '')
        .replace(/\s+despite\s+your\s+\{\{review_count\}\}\s+reviews/g, '')
        .replace(/Even\s+with\s+your\s+\{\{review_count\}\}\s+reviews,?\s*/g, '');
    }
    if (!comp1HasName) {
      out = out.replace(/#1\s+\{\{top_competitor_1\}\}/g, '{{top_competitor_1}}');
    }
    if (!comp1HasReviews) {
      out = out
        .replace(/\s*\(\{\{top_competitor_1_reviews\}\}\s+reviews\)/g, '')
        .replace(/\s+with\s+\{\{top_competitor_1_reviews\}\}\s+reviews/g, '');
    }
    if (!comp2HasName) {
      out = out.replace(/#2\s+\{\{top_competitor_2\}\}/g, '{{top_competitor_2}}');
    }
    if (!comp2HasReviews) {
      out = out
        .replace(/\s*\(\{\{top_competitor_2_reviews\}\}\s+reviews\)/g, '')
        .replace(/\s+with\s+\{\{top_competitor_2_reviews\}\}\s+reviews/g, '');
    }
    return out
      .replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : '')
      .replace(/\blocal\s+local\b/gi, (match) => match[0] === 'L' ? 'Local' : 'local');
  };

  return {
    templateId: tpl.id,
    channel: tpl.channel || 'email',
    cadenceStep: tpl.cadenceStep || 1,
    subject: replaceVars(tpl.subject),
    body: replaceVars(tpl.body)
  };
}

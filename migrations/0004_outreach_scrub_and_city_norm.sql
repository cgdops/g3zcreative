-- Migration 0004: Outreach Schema Indexes, Legacy Sample Scrub & South Florida City Normalization
-- Idempotent D1/SQLite migration moving runtime DDL and full-table scrubbing out of GET /api/crm/outreach.

-- 1. Ensure outreach_candidates table and indexes exist
CREATE TABLE IF NOT EXISTS outreach_candidates (
    id TEXT PRIMARY KEY,
    doc_number TEXT UNIQUE,
    business_name TEXT NOT NULL,
    business_name_clean TEXT NOT NULL,
    entity_type TEXT DEFAULT 'FL LLC',
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_candidates(outreach_status);
CREATE INDEX IF NOT EXISTS idx_outreach_score ON outreach_candidates(score DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_filing_date ON outreach_candidates(filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_city ON outreach_candidates(city);
CREATE INDEX IF NOT EXISTS idx_outreach_niche ON outreach_candidates(niche);
CREATE INDEX IF NOT EXISTS idx_outreach_lead_id ON outreach_candidates(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_sort ON outreach_candidates(outreach_status, score DESC, filing_date DESC, id ASC);
CREATE INDEX IF NOT EXISTS idx_outreach_city_status ON outreach_candidates(city, outreach_status);
CREATE INDEX IF NOT EXISTS idx_outreach_niche_status ON outreach_candidates(niche, outreach_status);

-- 2. One-time scrub of legacy sample-batch emails, google.com SERP pollution, boolean masks, and placeholder phones
UPDATE outreach_candidates
SET email = CASE WHEN email IN (
      'carlos@pinesapexroofing.com',
      'david@miramarbreezehvac.com',
      'dr.navarro@browardelitedental.com',
      'sofia@westonrhythmdance.com',
      'jorge@doraltropicallandscape.com',
      'paul.silva@google.com',
      'lazarob@google.com',
      'davidezekiel@google.com',
      'bryan.sanchez@innovativesys.com',
      'paul2uman@yahoo.com',
      'true',
      'false'
    ) OR LOWER(email) LIKE '%@google.com' THEN NULL ELSE email END,
    phone = CASE WHEN phone IN ('true', 'false', '+14154206461') THEN NULL ELSE phone END,
    website = CASE WHEN LOWER(website) = 'google.com' THEN NULL ELSE website END,
    updated_at = CURRENT_TIMESTAMP
WHERE email IN (
  'carlos@pinesapexroofing.com',
  'david@miramarbreezehvac.com',
  'dr.navarro@browardelitedental.com',
  'sofia@westonrhythmdance.com',
  'jorge@doraltropicallandscape.com',
  'paul.silva@google.com',
  'lazarob@google.com',
  'davidezekiel@google.com',
  'bryan.sanchez@innovativesys.com',
  'paul2uman@yahoo.com',
  'true',
  'false'
) OR LOWER(email) LIKE '%@google.com' OR phone IN ('true', 'false', '+14154206461') OR LOWER(website) = 'google.com';

-- Recalculate enrichment_status for rows whose fake email/phone was scrubbed
UPDATE outreach_candidates
SET enrichment_status = CASE
      WHEN email IS NOT NULL AND email != '' AND phone IS NOT NULL AND phone != '' THEN 'found'
      WHEN (email IS NOT NULL AND email != '') OR (phone IS NOT NULL AND phone != '') THEN 'partial'
      ELSE 'unattempted'
    END
WHERE enrichment_status IN ('found', 'partial')
  AND (email IS NULL OR email = '')
  AND (phone IS NULL OR phone = '');

-- 3a. Normalize punctuation separators (.,#-_/) and collapse whitespace on existing city values
UPDATE outreach_candidates
SET city = TRIM(
  REPLACE(REPLACE(REPLACE(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(city, '.', ' '), ',', ' '), '#', ' '), '-', ' '), '_', ' '), '/', ' '),
  '   ', ' '), '  ', ' '), '  ', ' ')
)
WHERE city IS NOT NULL AND (
  city != TRIM(city)
  OR city LIKE '%.%'
  OR city LIKE '%,%'
  OR city LIKE '%#%'
  OR city LIKE '%-%'
  OR city LIKE '%_%'
  OR city LIKE '%/%'
  OR city LIKE '%  %'
);

-- 3b. Strip trailing embedded 5-digit ZIP codes from city (e.g. "Miami FL 33175" -> "Miami FL")
UPDATE outreach_candidates
SET city = TRIM(SUBSTR(city, 1, LENGTH(city) - 6))
WHERE city IS NOT NULL AND city GLOB '* [0-9][0-9][0-9][0-9][0-9]';

-- 3c. Strip trailing state suffixes (" FL", " FLA", " FLORIDA") while preserving "Florida City"
UPDATE outreach_candidates
SET city = CASE
  WHEN UPPER(city) LIKE '% FLORIDA' AND LENGTH(city) > 8 THEN TRIM(SUBSTR(city, 1, LENGTH(city) - 8))
  WHEN UPPER(city) LIKE '% FLA' AND LENGTH(city) > 4 THEN TRIM(SUBSTR(city, 1, LENGTH(city) - 4))
  WHEN UPPER(city) LIKE '% FL' AND LENGTH(city) > 3 THEN TRIM(SUBSTR(city, 1, LENGTH(city) - 3))
  ELSE city
END
WHERE city IS NOT NULL AND (
  (UPPER(city) LIKE '% FLORIDA' AND LENGTH(city) > 8)
  OR (UPPER(city) LIKE '% FLA' AND LENGTH(city) > 4)
  OR (UPPER(city) LIKE '% FL' AND LENGTH(city) > 3)
);

-- 3d. Backfill missing or state-only city values from known South Florida 5-digit ZIPs
UPDATE outreach_candidates
SET city = CASE SUBSTR(TRIM(COALESCE(zip, '')), 1, 5)
  WHEN '33004' THEN 'Dania Beach'
  WHEN '33009' THEN 'Hallandale Beach'
  WHEN '33010' THEN 'Hialeah'
  WHEN '33012' THEN 'Hialeah'
  WHEN '33013' THEN 'Hialeah'
  WHEN '33014' THEN 'Miami Lakes'
  WHEN '33015' THEN 'Hialeah'
  WHEN '33016' THEN 'Hialeah Gardens'
  WHEN '33018' THEN 'Hialeah'
  WHEN '33019' THEN 'Hollywood'
  WHEN '33020' THEN 'Hollywood'
  WHEN '33021' THEN 'Hollywood'
  WHEN '33023' THEN 'Miramar'
  WHEN '33024' THEN 'Pembroke Pines'
  WHEN '33025' THEN 'Miramar'
  WHEN '33026' THEN 'Pembroke Pines'
  WHEN '33027' THEN 'Miramar'
  WHEN '33028' THEN 'Pembroke Pines'
  WHEN '33029' THEN 'Pembroke Pines'
  WHEN '33030' THEN 'Homestead'
  WHEN '33033' THEN 'Homestead'
  WHEN '33034' THEN 'Florida City'
  WHEN '33035' THEN 'Homestead'
  WHEN '33036' THEN 'Islamorada'
  WHEN '33037' THEN 'Key Largo'
  WHEN '33040' THEN 'Key West'
  WHEN '33050' THEN 'Marathon'
  WHEN '33054' THEN 'Opa Locka'
  WHEN '33055' THEN 'Miami Gardens'
  WHEN '33056' THEN 'Miami Gardens'
  WHEN '33060' THEN 'Pompano Beach'
  WHEN '33062' THEN 'Pompano Beach'
  WHEN '33063' THEN 'Margate'
  WHEN '33064' THEN 'Deerfield Beach'
  WHEN '33065' THEN 'Coral Springs'
  WHEN '33066' THEN 'Coconut Creek'
  WHEN '33067' THEN 'Parkland'
  WHEN '33068' THEN 'North Lauderdale'
  WHEN '33069' THEN 'Pompano Beach'
  WHEN '33070' THEN 'Tavernier'
  WHEN '33071' THEN 'Coral Springs'
  WHEN '33073' THEN 'Coconut Creek'
  WHEN '33076' THEN 'Parkland'
  WHEN '33122' THEN 'Doral'
  WHEN '33134' THEN 'Coral Gables'
  WHEN '33139' THEN 'Miami Beach'
  WHEN '33140' THEN 'Miami Beach'
  WHEN '33141' THEN 'Miami Beach'
  WHEN '33146' THEN 'Coral Gables'
  WHEN '33149' THEN 'Key Biscayne'
  WHEN '33154' THEN 'Bal Harbour'
  WHEN '33156' THEN 'Pinecrest'
  WHEN '33157' THEN 'Palmetto Bay'
  WHEN '33160' THEN 'Sunny Isles Beach'
  WHEN '33161' THEN 'North Miami'
  WHEN '33162' THEN 'North Miami Beach'
  WHEN '33166' THEN 'Doral'
  WHEN '33168' THEN 'North Miami'
  WHEN '33172' THEN 'Doral'
  WHEN '33178' THEN 'Doral'
  WHEN '33179' THEN 'North Miami Beach'
  WHEN '33180' THEN 'Aventura'
  WHEN '33189' THEN 'Cutler Bay'
  WHEN '33190' THEN 'Cutler Bay'
  WHEN '33301' THEN 'Fort Lauderdale'
  WHEN '33304' THEN 'Fort Lauderdale'
  WHEN '33305' THEN 'Fort Lauderdale'
  WHEN '33308' THEN 'Fort Lauderdale'
  WHEN '33309' THEN 'Fort Lauderdale'
  WHEN '33311' THEN 'Fort Lauderdale'
  WHEN '33312' THEN 'Fort Lauderdale'
  WHEN '33313' THEN 'Lauderhill'
  WHEN '33314' THEN 'Davie'
  WHEN '33315' THEN 'Fort Lauderdale'
  WHEN '33316' THEN 'Fort Lauderdale'
  WHEN '33317' THEN 'Plantation'
  WHEN '33319' THEN 'Lauderhill'
  WHEN '33321' THEN 'Tamarac'
  WHEN '33322' THEN 'Plantation'
  WHEN '33323' THEN 'Sunrise'
  WHEN '33324' THEN 'Plantation'
  WHEN '33325' THEN 'Davie'
  WHEN '33326' THEN 'Weston'
  WHEN '33327' THEN 'Weston'
  WHEN '33328' THEN 'Davie'
  WHEN '33330' THEN 'Cooper City'
  WHEN '33331' THEN 'Weston'
  WHEN '33332' THEN 'Southwest Ranches'
  WHEN '33334' THEN 'Fort Lauderdale'
  WHEN '33351' THEN 'Sunrise'
  WHEN '33401' THEN 'West Palm Beach'
  WHEN '33405' THEN 'West Palm Beach'
  WHEN '33407' THEN 'West Palm Beach'
  WHEN '33409' THEN 'West Palm Beach'
  WHEN '33410' THEN 'Palm Beach Gardens'
  WHEN '33411' THEN 'Royal Palm Beach'
  WHEN '33414' THEN 'Wellington'
  WHEN '33418' THEN 'Palm Beach Gardens'
  WHEN '33426' THEN 'Boynton Beach'
  WHEN '33428' THEN 'Boca Raton'
  WHEN '33431' THEN 'Boca Raton'
  WHEN '33432' THEN 'Boca Raton'
  WHEN '33433' THEN 'Boca Raton'
  WHEN '33434' THEN 'Boca Raton'
  WHEN '33435' THEN 'Boynton Beach'
  WHEN '33436' THEN 'Boynton Beach'
  WHEN '33437' THEN 'Boynton Beach'
  WHEN '33444' THEN 'Delray Beach'
  WHEN '33445' THEN 'Delray Beach'
  WHEN '33446' THEN 'Delray Beach'
  WHEN '33458' THEN 'Jupiter'
  WHEN '33460' THEN 'Lake Worth Beach'
  WHEN '33461' THEN 'Lake Worth Beach'
  WHEN '33463' THEN 'Lake Worth Beach'
  WHEN '33467' THEN 'Lake Worth Beach'
  WHEN '33477' THEN 'Jupiter'
  WHEN '33478' THEN 'Jupiter'
  WHEN '33480' THEN 'Palm Beach'
  WHEN '33483' THEN 'Delray Beach'
  WHEN '33484' THEN 'Delray Beach'
  WHEN '33486' THEN 'Boca Raton'
  WHEN '33487' THEN 'Boca Raton'
  WHEN '33496' THEN 'Boca Raton'
  WHEN '33498' THEN 'Boca Raton'
  ELSE city
END
WHERE city IS NULL OR TRIM(city) = '' OR UPPER(TRIM(city)) IN ('FL', 'FLA', 'FLORIDA');

-- 3e. Canonicalize all South Florida city variants, abbreviations, typos, and casing
UPDATE outreach_candidates
SET city = CASE UPPER(TRIM(city))
  -- Fort Lauderdale
  WHEN 'FORT LAUDERDALE' THEN 'Fort Lauderdale'
  WHEN 'FT LAUDERDALE' THEN 'Fort Lauderdale'
  WHEN 'FTLAUDERDALE' THEN 'Fort Lauderdale'
  WHEN 'FORT LAUDERALE' THEN 'Fort Lauderdale'
  WHEN 'FT LAUDERALE' THEN 'Fort Lauderdale'
  WHEN 'FORT LAUDEDALE' THEN 'Fort Lauderdale'
  WHEN 'FT LAUD' THEN 'Fort Lauderdale'
  WHEN 'FORT LAUD' THEN 'Fort Lauderdale'
  WHEN 'LAUDERDALE' THEN 'Fort Lauderdale'
  -- Miami
  WHEN 'MIAMI' THEN 'Miami'
  WHEN 'MIAMI DADE' THEN 'Miami'
  WHEN 'MIAM' THEN 'Miami'
  WHEN 'MAMI' THEN 'Miami'
  WHEN 'MAIMI' THEN 'Miami'
  WHEN 'CITY OF MIAMI' THEN 'Miami'
  -- Weston
  WHEN 'WESTON' THEN 'Weston'
  WHEN 'WESON' THEN 'Weston'
  WHEN 'WESTN' THEN 'Weston'
  -- West Palm Beach
  WHEN 'WEST PALM BEACH' THEN 'West Palm Beach'
  WHEN 'WEST PALM BEAH' THEN 'West Palm Beach'
  WHEN 'W PALM BEACH' THEN 'West Palm Beach'
  WHEN 'W PALM BCH' THEN 'West Palm Beach'
  WHEN 'WEST PALM BCH' THEN 'West Palm Beach'
  WHEN 'WPB' THEN 'West Palm Beach'
  WHEN 'W P B' THEN 'West Palm Beach'
  WHEN 'WEST PALM' THEN 'West Palm Beach'
  -- Opa Locka
  WHEN 'OPA LOCKA' THEN 'Opa Locka'
  WHEN 'OPALOCKA' THEN 'Opa Locka'
  WHEN 'OPA LOCK' THEN 'Opa Locka'
  -- Palmetto Bay
  WHEN 'PALMETTO BAY' THEN 'Palmetto Bay'
  WHEN 'PALMETO BAY' THEN 'Palmetto Bay'
  WHEN 'PALMETTO BY' THEN 'Palmetto Bay'
  -- Islamorada
  WHEN 'ISLAMORADA' THEN 'Islamorada'
  WHEN 'ISLA MORADA' THEN 'Islamorada'
  -- Broward municipalities
  WHEN 'MIRAMAR' THEN 'Miramar'
  WHEN 'PEMBROKE PINES' THEN 'Pembroke Pines'
  WHEN 'PEMBROKE PINE' THEN 'Pembroke Pines'
  WHEN 'PEMBROKE PNS' THEN 'Pembroke Pines'
  WHEN 'PEMBRK PINES' THEN 'Pembroke Pines'
  WHEN 'PEMB PINES' THEN 'Pembroke Pines'
  WHEN 'HOLLYWOOD' THEN 'Hollywood'
  WHEN 'HOLLYWOOD BEACH' THEN 'Hollywood'
  WHEN 'HOLLYWOOD BCH' THEN 'Hollywood'
  WHEN 'HOLLYWD' THEN 'Hollywood'
  WHEN 'DAVIE' THEN 'Davie'
  WHEN 'COOPER CITY' THEN 'Cooper City'
  WHEN 'SOUTHWEST RANCHES' THEN 'Southwest Ranches'
  WHEN 'SW RANCHES' THEN 'Southwest Ranches'
  WHEN 'S W RANCHES' THEN 'Southwest Ranches'
  WHEN 'SOUTH WEST RANCHES' THEN 'Southwest Ranches'
  WHEN 'PLANTATION' THEN 'Plantation'
  WHEN 'SUNRISE' THEN 'Sunrise'
  WHEN 'HALLANDALE BEACH' THEN 'Hallandale Beach'
  WHEN 'HALLANDALE' THEN 'Hallandale Beach'
  WHEN 'HALLANDALE BCH' THEN 'Hallandale Beach'
  WHEN 'HALLENDALE' THEN 'Hallandale Beach'
  WHEN 'HALLENDALE BEACH' THEN 'Hallandale Beach'
  WHEN 'DANIA BEACH' THEN 'Dania Beach'
  WHEN 'DANIA' THEN 'Dania Beach'
  WHEN 'DANIA BCH' THEN 'Dania Beach'
  WHEN 'CORAL SPRINGS' THEN 'Coral Springs'
  WHEN 'CORAL SPRING' THEN 'Coral Springs'
  WHEN 'CORAL SPGS' THEN 'Coral Springs'
  WHEN 'PARKLAND' THEN 'Parkland'
  WHEN 'POMPANO BEACH' THEN 'Pompano Beach'
  WHEN 'POMPANO' THEN 'Pompano Beach'
  WHEN 'POMPANO BCH' THEN 'Pompano Beach'
  WHEN 'COCONUT CREEK' THEN 'Coconut Creek'
  WHEN 'COCONUT CRK' THEN 'Coconut Creek'
  WHEN 'DEERFIELD BEACH' THEN 'Deerfield Beach'
  WHEN 'DEERFIELD' THEN 'Deerfield Beach'
  WHEN 'DEERFIELD BCH' THEN 'Deerfield Beach'
  WHEN 'TAMARAC' THEN 'Tamarac'
  WHEN 'MARGATE' THEN 'Margate'
  WHEN 'LAUDERHILL' THEN 'Lauderhill'
  WHEN 'OAKLAND PARK' THEN 'Oakland Park'
  WHEN 'WILTON MANORS' THEN 'Wilton Manors'
  WHEN 'LAUDERDALE LAKES' THEN 'Lauderdale Lakes'
  WHEN 'NORTH LAUDERDALE' THEN 'North Lauderdale'
  WHEN 'N LAUDERDALE' THEN 'North Lauderdale'
  WHEN 'NO LAUDERDALE' THEN 'North Lauderdale'
  WHEN 'LAUDERDALE BY THE SEA' THEN 'Lauderdale By The Sea'
  WHEN 'LAUD BY THE SEA' THEN 'Lauderdale By The Sea'
  WHEN 'LAUDERDALE BY SEA' THEN 'Lauderdale By The Sea'
  WHEN 'LIGHTHOUSE POINT' THEN 'Lighthouse Point'
  WHEN 'HILLSBORO BEACH' THEN 'Hillsboro Beach'
  WHEN 'WEST PARK' THEN 'West Park'
  WHEN 'PEMBROKE PARK' THEN 'Pembroke Park'
  WHEN 'SEA RANCH LAKES' THEN 'Sea Ranch Lakes'
  -- Miami-Dade municipalities
  WHEN 'MIAMI GARDENS' THEN 'Miami Gardens'
  WHEN 'MIAMI GRDNS' THEN 'Miami Gardens'
  WHEN 'MIAMI GDNS' THEN 'Miami Gardens'
  WHEN 'CAROL CITY' THEN 'Miami Gardens'
  WHEN 'MIAMI LAKES' THEN 'Miami Lakes'
  WHEN 'MIAMI SPRINGS' THEN 'Miami Springs'
  WHEN 'MIAMI SHORES' THEN 'Miami Shores'
  WHEN 'AVENTURA' THEN 'Aventura'
  WHEN 'DORAL' THEN 'Doral'
  WHEN 'CORAL GABLES' THEN 'Coral Gables'
  WHEN 'CORAL GABLE' THEN 'Coral Gables'
  WHEN 'MIAMI BEACH' THEN 'Miami Beach'
  WHEN 'MIAMI BCH' THEN 'Miami Beach'
  WHEN 'SOUTH BEACH' THEN 'Miami Beach'
  WHEN 'S MIAMI BEACH' THEN 'Miami Beach'
  WHEN 'NORTH MIAMI BEACH' THEN 'North Miami Beach'
  WHEN 'N MIAMI BEACH' THEN 'North Miami Beach'
  WHEN 'N MIAMI BCH' THEN 'North Miami Beach'
  WHEN 'NORTH MIAMI BCH' THEN 'North Miami Beach'
  WHEN 'NMB' THEN 'North Miami Beach'
  WHEN 'N M B' THEN 'North Miami Beach'
  WHEN 'NORTH MIAMI' THEN 'North Miami'
  WHEN 'N MIAMI' THEN 'North Miami'
  WHEN 'NO MIAMI' THEN 'North Miami'
  WHEN 'SOUTH MIAMI' THEN 'South Miami'
  WHEN 'S MIAMI' THEN 'South Miami'
  WHEN 'SO MIAMI' THEN 'South Miami'
  WHEN 'WEST MIAMI' THEN 'West Miami'
  WHEN 'SUNNY ISLES BEACH' THEN 'Sunny Isles Beach'
  WHEN 'SUNNY ISLES' THEN 'Sunny Isles Beach'
  WHEN 'SUNNY ISLES BCH' THEN 'Sunny Isles Beach'
  WHEN 'SUNNY ISLE BEACH' THEN 'Sunny Isles Beach'
  WHEN 'SUNNY ISLE' THEN 'Sunny Isles Beach'
  WHEN 'HIALEAH' THEN 'Hialeah'
  WHEN 'HIALEAH GARDENS' THEN 'Hialeah Gardens'
  WHEN 'HIALEAH GDNS' THEN 'Hialeah Gardens'
  WHEN 'HIALEAH GRDNS' THEN 'Hialeah Gardens'
  WHEN 'KENDALL' THEN 'Kendall'
  WHEN 'SWEETWATER' THEN 'Sweetwater'
  WHEN 'HOMESTEAD' THEN 'Homestead'
  WHEN 'CUTLER BAY' THEN 'Cutler Bay'
  WHEN 'CUTLER RIDGE' THEN 'Cutler Bay'
  WHEN 'PINECREST' THEN 'Pinecrest'
  WHEN 'KEY BISCAYNE' THEN 'Key Biscayne'
  WHEN 'KEY BISC' THEN 'Key Biscayne'
  WHEN 'SURFSIDE' THEN 'Surfside'
  WHEN 'BAL HARBOUR' THEN 'Bal Harbour'
  WHEN 'BAL HARBOR' THEN 'Bal Harbour'
  WHEN 'BAL HARBOUR VILLAGE' THEN 'Bal Harbour'
  WHEN 'BAY HARBOR ISLANDS' THEN 'Bay Harbor Islands'
  WHEN 'BAY HARBOR' THEN 'Bay Harbor Islands'
  WHEN 'BAY HARBOR ISLAND' THEN 'Bay Harbor Islands'
  WHEN 'BAY HARBOUR' THEN 'Bay Harbor Islands'
  WHEN 'BAY HARBOUR ISLANDS' THEN 'Bay Harbor Islands'
  WHEN 'FLORIDA CITY' THEN 'Florida City'
  WHEN 'MEDLEY' THEN 'Medley'
  WHEN 'VIRGINIA GARDENS' THEN 'Virginia Gardens'
  WHEN 'EL PORTAL' THEN 'El Portal'
  WHEN 'BISCAYNE PARK' THEN 'Biscayne Park'
  WHEN 'GOLDEN BEACH' THEN 'Golden Beach'
  -- Palm Beach municipalities
  WHEN 'BOCA RATON' THEN 'Boca Raton'
  WHEN 'BOCA' THEN 'Boca Raton'
  WHEN 'DELRAY BEACH' THEN 'Delray Beach'
  WHEN 'DELRAY' THEN 'Delray Beach'
  WHEN 'DELRAY BCH' THEN 'Delray Beach'
  WHEN 'BOYNTON BEACH' THEN 'Boynton Beach'
  WHEN 'BOYNTON' THEN 'Boynton Beach'
  WHEN 'BOYNTON BCH' THEN 'Boynton Beach'
  WHEN 'LAKE WORTH BEACH' THEN 'Lake Worth Beach'
  WHEN 'LAKE WORTH' THEN 'Lake Worth Beach'
  WHEN 'LK WORTH' THEN 'Lake Worth Beach'
  WHEN 'LAKE WORTH BCH' THEN 'Lake Worth Beach'
  WHEN 'WELLINGTON' THEN 'Wellington'
  WHEN 'JUPITER' THEN 'Jupiter'
  WHEN 'PALM BEACH GARDENS' THEN 'Palm Beach Gardens'
  WHEN 'PBG' THEN 'Palm Beach Gardens'
  WHEN 'P B G' THEN 'Palm Beach Gardens'
  WHEN 'PALM BCH GARDENS' THEN 'Palm Beach Gardens'
  WHEN 'PALM BEACH GDNS' THEN 'Palm Beach Gardens'
  WHEN 'ROYAL PALM BEACH' THEN 'Royal Palm Beach'
  WHEN 'ROYAL PALM BCH' THEN 'Royal Palm Beach'
  WHEN 'ROYAL PALM' THEN 'Royal Palm Beach'
  WHEN 'GREENACRES' THEN 'Greenacres'
  WHEN 'PALM BEACH' THEN 'Palm Beach'
  WHEN 'NORTH PALM BEACH' THEN 'North Palm Beach'
  WHEN 'N PALM BEACH' THEN 'North Palm Beach'
  WHEN 'N PALM BCH' THEN 'North Palm Beach'
  WHEN 'NORTH PALM BCH' THEN 'North Palm Beach'
  WHEN 'RIVIERA BEACH' THEN 'Riviera Beach'
  WHEN 'RIVIERA BCH' THEN 'Riviera Beach'
  WHEN 'LANTANA' THEN 'Lantana'
  WHEN 'PALM SPRINGS' THEN 'Palm Springs'
  WHEN 'TEQUESTA' THEN 'Tequesta'
  -- Monroe Keys municipalities
  WHEN 'KEY LARGO' THEN 'Key Largo'
  WHEN 'MARATHON' THEN 'Marathon'
  WHEN 'KEY WEST' THEN 'Key West'
  WHEN 'TAVERNIER' THEN 'Tavernier'
  ELSE city
END
WHERE city IS NOT NULL AND city != '';

-- 3f. Synchronize county for canonical South Florida cities where county is missing or mismatched
UPDATE outreach_candidates
SET county = CASE
  WHEN city IN (
    'Miramar', 'Pembroke Pines', 'Hollywood', 'Davie', 'Cooper City', 'Southwest Ranches',
    'Weston', 'Fort Lauderdale', 'Plantation', 'Sunrise', 'Hallandale Beach', 'Dania Beach',
    'Coral Springs', 'Parkland', 'Pompano Beach', 'Coconut Creek', 'Deerfield Beach',
    'Tamarac', 'Margate', 'Lauderhill', 'Oakland Park', 'Wilton Manors', 'Lauderdale Lakes',
    'North Lauderdale', 'Lauderdale By The Sea', 'Lighthouse Point', 'Hillsboro Beach',
    'West Park', 'Pembroke Park', 'Sea Ranch Lakes'
  ) THEN 'Broward County'
  WHEN city IN (
    'Miami Gardens', 'Miami Lakes', 'Miami Springs', 'Miami Shores', 'Aventura', 'Doral',
    'Coral Gables', 'Miami', 'Miami Beach', 'North Miami Beach', 'North Miami', 'South Miami',
    'West Miami', 'Sunny Isles Beach', 'Hialeah', 'Hialeah Gardens', 'Kendall', 'Sweetwater',
    'Homestead', 'Cutler Bay', 'Palmetto Bay', 'Pinecrest', 'Key Biscayne', 'Surfside',
    'Bal Harbour', 'Bay Harbor Islands', 'Opa Locka', 'Florida City', 'Medley',
    'Virginia Gardens', 'El Portal', 'Biscayne Park', 'Golden Beach'
  ) THEN 'Miami-Dade County'
  WHEN city IN (
    'Boca Raton', 'Delray Beach', 'Boynton Beach', 'West Palm Beach', 'Lake Worth Beach',
    'Wellington', 'Jupiter', 'Palm Beach Gardens', 'Royal Palm Beach', 'Greenacres',
    'Palm Beach', 'North Palm Beach', 'Riviera Beach', 'Lantana', 'Palm Springs', 'Tequesta'
  ) THEN 'Palm Beach County'
  WHEN city IN (
    'Islamorada', 'Key Largo', 'Marathon', 'Key West', 'Tavernier'
  ) THEN 'Monroe County'
  ELSE county
END
WHERE city IN (
  'Miramar', 'Pembroke Pines', 'Hollywood', 'Davie', 'Cooper City', 'Southwest Ranches',
  'Weston', 'Fort Lauderdale', 'Plantation', 'Sunrise', 'Hallandale Beach', 'Dania Beach',
  'Coral Springs', 'Parkland', 'Pompano Beach', 'Coconut Creek', 'Deerfield Beach',
  'Tamarac', 'Margate', 'Lauderhill', 'Oakland Park', 'Wilton Manors', 'Lauderdale Lakes',
  'North Lauderdale', 'Lauderdale By The Sea', 'Lighthouse Point', 'Hillsboro Beach',
  'West Park', 'Pembroke Park', 'Sea Ranch Lakes',
  'Miami Gardens', 'Miami Lakes', 'Miami Springs', 'Miami Shores', 'Aventura', 'Doral',
  'Coral Gables', 'Miami', 'Miami Beach', 'North Miami Beach', 'North Miami', 'South Miami',
  'West Miami', 'Sunny Isles Beach', 'Hialeah', 'Hialeah Gardens', 'Kendall', 'Sweetwater',
  'Homestead', 'Cutler Bay', 'Palmetto Bay', 'Pinecrest', 'Key Biscayne', 'Surfside',
  'Bal Harbour', 'Bay Harbor Islands', 'Opa Locka', 'Florida City', 'Medley',
  'Virginia Gardens', 'El Portal', 'Biscayne Park', 'Golden Beach',
  'Boca Raton', 'Delray Beach', 'Boynton Beach', 'West Palm Beach', 'Lake Worth Beach',
  'Wellington', 'Jupiter', 'Palm Beach Gardens', 'Royal Palm Beach', 'Greenacres',
  'Palm Beach', 'North Palm Beach', 'Riviera Beach', 'Lantana', 'Palm Springs', 'Tequesta',
  'Islamorada', 'Key Largo', 'Marathon', 'Key West', 'Tavernier'
);

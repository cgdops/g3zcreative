/**
 * Centralized Sunbiz Outreach Engine
 *
 * Handles:
 * 1. Sunbiz fixed-width (1440-byte cordata) & CSV/JSON parsing
 * 2. South Florida geographic filtering (35 Broward & Miami-Dade target cities + zip codes)
 * 3. Shell / holding LLC exclusion & operating-niche classification + priority scoring (0-100)
 * 4. Multi-stage contact enrichment waterfall (DataForSEO -> Hunter -> Apollo -> People Data Labs)
 * 5. CRO Outreach Email Templates ("Free Custom Homepage Mockup + GBP No-Suspension Checklist")
 */

import { enrichLead, normalizeDomain, splitName } from './_enrich.js';

// ---------------------------------------------------------------------------
// 1. South Florida Target Cities (Synchronized with data/cities.json)
// ---------------------------------------------------------------------------
export const SOUTH_FL_CITIES = new Map([
  ['MIRAMAR', { name: 'Miramar', county: 'Broward County', priority: 15, landmark: 'Miramar Regional Park' }],
  ['PEMBROKE PINES', { name: 'Pembroke Pines', county: 'Broward County', priority: 15, landmark: 'C.B. Smith Park' }],
  ['HOLLYWOOD', { name: 'Hollywood', county: 'Broward County', priority: 14, landmark: 'Hollywood Beach Broadwalk' }],
  ['DAVIE', { name: 'Davie', county: 'Broward County', priority: 14, landmark: 'Bergeron Rodeo Grounds' }],
  ['COOPER CITY', { name: 'Cooper City', county: 'Broward County', priority: 14, landmark: 'Brian Piccolo Sports Park' }],
  ['SOUTHWEST RANCHES', { name: 'Southwest Ranches', county: 'Broward County', priority: 14, landmark: 'Sunshine Ranches' }],
  ['WESTON', { name: 'Weston', county: 'Broward County', priority: 14, landmark: 'Weston Town Center' }],
  ['FORT LAUDERDALE', { name: 'Fort Lauderdale', county: 'Broward County', priority: 13, landmark: 'Las Olas Boulevard' }],
  ['FT LAUDERDALE', { name: 'Fort Lauderdale', county: 'Broward County', priority: 13, landmark: 'Las Olas Boulevard' }],
  ['FT. LAUDERDALE', { name: 'Fort Lauderdale', county: 'Broward County', priority: 13, landmark: 'Las Olas Boulevard' }],
  ['PLANTATION', { name: 'Plantation', county: 'Broward County', priority: 13, landmark: 'Plantation Central Park' }],
  ['SUNRISE', { name: 'Sunrise', county: 'Broward County', priority: 12, landmark: 'Sawgrass Mills' }],
  ['HALLANDALE BEACH', { name: 'Hallandale Beach', county: 'Broward County', priority: 12, landmark: 'Gulfstream Park' }],
  ['HALLANDALE', { name: 'Hallandale Beach', county: 'Broward County', priority: 12, landmark: 'Gulfstream Park' }],
  ['DANIA BEACH', { name: 'Dania Beach', county: 'Broward County', priority: 12, landmark: 'Dania Beach Pier' }],
  ['DANIA', { name: 'Dania Beach', county: 'Broward County', priority: 12, landmark: 'Dania Beach Pier' }],
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
  ['LAUDERDALE LAKES', { name: 'Lauderdale Lakes', county: 'Broward County', priority: 10, landmark: 'Vincent Torres Memorial Park' }],
  ['NORTH LAUDERDALE', { name: 'North Lauderdale', county: 'Broward County', priority: 10, landmark: 'Hampton Pines Park' }],
  ['MIAMI GARDENS', { name: 'Miami Gardens', county: 'Miami-Dade County', priority: 13, landmark: 'Hard Rock Stadium' }],
  ['MIAMI LAKES', { name: 'Miami Lakes', county: 'Miami-Dade County', priority: 13, landmark: 'Main Street Miami Lakes' }],
  ['AVENTURA', { name: 'Aventura', county: 'Miami-Dade County', priority: 13, landmark: 'Aventura Mall' }],
  ['DORAL', { name: 'Doral', county: 'Miami-Dade County', priority: 13, landmark: 'CityPlace Doral' }],
  ['CORAL GABLES', { name: 'Coral Gables', county: 'Miami-Dade County', priority: 13, landmark: 'Miracle Mile' }],
  ['MIAMI', { name: 'Miami', county: 'Miami-Dade County', priority: 12, landmark: 'Brickell Financial District' }],
  ['MIAMI BEACH', { name: 'Miami Beach', county: 'Miami-Dade County', priority: 12, landmark: 'South Beach' }],
  ['NORTH MIAMI BEACH', { name: 'North Miami Beach', county: 'Miami-Dade County', priority: 12, landmark: 'Ancient Spanish Monastery' }],
  ['NORTH MIAMI', { name: 'North Miami', county: 'Miami-Dade County', priority: 11, landmark: 'Oleta River State Park' }],
  ['SUNNY ISLES BEACH', { name: 'Sunny Isles Beach', county: 'Miami-Dade County', priority: 12, landmark: 'Newport Fishing Pier' }],
  ['HIALEAH', { name: 'Hialeah', county: 'Miami-Dade County', priority: 11, landmark: 'Amelia Earhart Park' }],
  ['HIALEAH GARDENS', { name: 'Hialeah Gardens', county: 'Miami-Dade County', priority: 11, landmark: 'Westland Gardens Park' }],
  ['KENDALL', { name: 'Kendall', county: 'Miami-Dade County', priority: 11, landmark: 'Dadeland Mall' }],
  ['SWEETWATER', { name: 'Sweetwater', county: 'Miami-Dade County', priority: 10, landmark: 'Dolphin Mall' }],
  ['BOCA RATON', { name: 'Boca Raton', county: 'Palm Beach County', priority: 11, landmark: 'Mizner Park' }],
  ['DELRAY BEACH', { name: 'Delray Beach', county: 'Palm Beach County', priority: 10, landmark: 'Atlantic Avenue' }],
  ['WEST PALM BEACH', { name: 'West Palm Beach', county: 'Palm Beach County', priority: 10, landmark: 'The Square' }]
]);

// ---------------------------------------------------------------------------
// 2. Niche Classification & Priority Scoring Rules
// ---------------------------------------------------------------------------
export const NICHE_RULES = [
  {
    niche: 'Roofing',
    boost: 38,
    serviceHook: 'roof replacements, storm damage inspections, and emergency leak repairs',
    pattern: /\b(ROOF|ROOFING|ROOFER|ROOFERS|SHINGLE|RE-ROOF)\b/i
  },
  {
    niche: 'HVAC',
    boost: 38,
    serviceHook: 'AC repair, HVAC installations, and emergency cooling calls',
    pattern: /\b(HVAC|AIR CONDITIONING|A\/C|COOLING|REFRIGERATION|CLIMATE CONTROL|DUCTWORK|MECHANICAL)\b/i
  },
  {
    niche: 'Plumbing',
    boost: 38,
    serviceHook: 'emergency plumbing, leak detection, water heaters, and drain clearing',
    pattern: /\b(PLUMB|PLUMBING|PLUMBER|DRAIN|ROOTER|SEWER|PIPING)\b/i
  },
  {
    niche: 'Electrical',
    boost: 38,
    serviceHook: 'panel upgrades, residential & commercial electrical, and EV/generator installs',
    pattern: /\b(ELECTRIC|ELECTRICAL|ELECTRICIAN|WIRING|LIGHTING|GENERATOR)\b/i
  },
  {
    niche: 'Landscaping & Lawn',
    boost: 35,
    serviceHook: 'landscape design, sod installation, tree service, and commercial lawn care',
    pattern: /\b(LANDSCAP|LAWN|TURF|TREE SERVICE|ARBOR|IRRIGATION|HARDSCAP|PAVER|SOD)\b/i
  },
  {
    niche: 'Construction & Remodeling',
    boost: 34,
    serviceHook: 'kitchen & bath remodeling, impact windows, flooring, and general contracting',
    pattern: /\b(REMODEL|RENOVAT|CONSTRUCTION|CONTRACTOR|BUILDERS|CABINET|FLOORING|DRYWALL|PAINTING|PAINTER|STUCCO|FENCE|FENCING|GLAZING|WINDOWS|DOORS|CONCRETE|MASONRY|HANDYMAN)\b/i
  },
  {
    niche: 'Pool & Outdoor',
    boost: 34,
    serviceHook: 'pool maintenance, resurfacing, patio enclosures, and outdoor kitchens',
    pattern: /\b(POOL|POOLS|SPA|PATIO|PERGOLA|SCREEN ENCLOSURE)\b/i
  },
  {
    niche: 'Pest Control & Mold',
    boost: 34,
    serviceHook: 'pest control, termite protection, mold remediation, and water damage restoration',
    pattern: /\b(PEST|EXTERMINAT|TERMITE|MOLD|RESTORATION|MITIGATION|BIOHAZARD)\b/i
  },
  {
    niche: 'Cleaning & Property Care',
    boost: 30,
    serviceHook: 'commercial janitorial, pressure washing, and residential maid services',
    pattern: /\b(CLEANING|CLEANERS|MAID|JANITORIAL|PRESSURE WASH|POWER WASH|SOFT WASH|WINDOW CLEANING|CARPET CLEANING)\b/i
  },
  {
    niche: 'Medical, Dental & Wellness',
    boost: 35,
    serviceHook: 'new patient bookings, local treatment searches, and high-trust clinic visibility',
    pattern: /\b(DENTAL|DENTIST|ORTHODONT|MEDICAL|CLINIC|HEALTH|WELLNESS|MEDSPA|AESTHETIC|CHIROPRACT|THERAPY|PHYSICAL THERAPY|COUNSELING|PEDIATRIC|DERMATOLOG|OPTOMETR|VISION|PHARMACY|CARE|NURSING)\b/i
  },
  {
    niche: 'Fitness & Studios',
    boost: 33,
    serviceHook: 'new class trials, studio memberships, and local parent/student signups',
    pattern: /\b(DANCE|STUDIO|GYM|FITNESS|PILATES|YOGA|MARTIAL ARTS|KARATE|JIU JITSU|BOXING|ACADEMY|CROSSFIT|TRAINING)\b/i
  },
  {
    niche: 'Legal & Accounting',
    boost: 32,
    serviceHook: 'high-intent client consultations, local practice visibility, and authority positioning',
    pattern: /\b(LAW|LEGAL|ATTORNEY|COUNSEL|ESQ|CPA|ACCOUNTING|TAX|BOOKKEEPING|ADVISOR|NOTARY)\b/i
  },
  {
    niche: 'Auto & Marine',
    boost: 28,
    serviceHook: 'mobile detailing, marine service, auto repair, and fleet care',
    pattern: /\b(AUTO|AUTOMOTIVE|DETAILING|CAR WASH|TOWING|MECHANIC|BODY SHOP|TIRES|MARINE|YACHT|BOAT)\b/i
  }
];

// Shell / Holding / Passive Entity Exclusion Patterns
const SHELL_ENTITY_PATTERNS = [
  /\b(HOLDINGS?|INVESTMENTS?|PROPERTIES|PROPERTY|VENTURES|CAPITAL|ASSET|ASSETS|EQUITY|EQUITIES|TRUST|ESTATE|ROYALTIES|ACQUISITIONS?|PORTFOLIO|FUND|SPV|SERIES|SYNDICATE)\b/i,
  // Street address named LLCs like "1245 SW 8TH ST LLC" or "400 BISCAYNE APT 1202 LLC"
  /^\d{2,6}\s+(NW|NE|SW|SE|N|S|E|W|NORTH|SOUTH|EAST|WEST|AVE|ST|RD|BLVD|TER|CT|LN|DR|WAY|PL|CIR|PKWY|HWY)\b/i,
  /\b(APT|UNIT|SUITE|LOT|PARCEL|CONDO)\s+#?\d+/i
];

// Known commercial Registered Agent mills to avoid mistaking for the founder
const CORPORATE_AGENT_PATTERNS = /\b(REGISTERED AGENTS? INC|NORTHWEST REGISTERED|LEGALINC|LEGALZOOM|BIZEFILE|ZENBUSINESS|INCFILE|UNITED STATES CORPORATION AGENTS|CORPORATION SERVICE COMPANY|CT CORPORATION|INCORP SERVICES|COGENCY GLOBAL|HARBOR COMPLIANCE|SUNBIZ FILING|CORPORATE CREATIONS)\b/i;

// ---------------------------------------------------------------------------
// 3. String & Name Normalization Helpers
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

export function matchSouthFloridaLocation(cityInput, zipInput, stateInput = 'FL') {
  const state = String(stateInput || 'FL').trim().toUpperCase();
  if (state && state !== 'FL' && state !== 'FLORIDA') {
    return { isSouthFlorida: false, city: toTitleCase(cityInput), county: 'Out of State', priority: 0 };
  }

  const cleanCity = String(cityInput || '').trim().toUpperCase().replace(/[^A-Z\s.]/g, '').replace(/\s+/g, ' ');
  const zip = String(zipInput || '').trim().slice(0, 5);

  if (SOUTH_FL_CITIES.has(cleanCity)) {
    const match = SOUTH_FL_CITIES.get(cleanCity);
    return {
      isSouthFlorida: true,
      city: match.name,
      county: match.county,
      landmark: match.landmark,
      priority: match.priority
    };
  }

  // Fallback by South Florida ZIP prefixes (330xx = South Broward / North Dade, 331xx-332xx = Miami-Dade, 333xx = Broward, 334xx = Palm Beach / North Broward)
  if (/^33[01234]\d{2}$/.test(zip)) {
    const prefix = zip.slice(0, 3);
    const county = (prefix === '330' || prefix === '333')
      ? 'Broward County'
      : (prefix === '331' || prefix === '332')
        ? 'Miami-Dade County'
        : 'Palm Beach County';
    return {
      isSouthFlorida: true,
      city: toTitleCase(cleanCity) || 'South Florida',
      county,
      landmark: 'South Florida',
      priority: 8
    };
  }

  return {
    isSouthFlorida: false,
    city: toTitleCase(cleanCity) || 'Florida',
    county: 'Florida',
    landmark: 'Florida',
    priority: 0
  };
}

export function classifyAndScoreBusiness(businessName, cityMeta) {
  const name = String(businessName || '');
  let matchedNiche = 'Local Business';
  let nicheBoost = 15;
  let serviceHook = 'local customers searching on Google and AI search';

  for (const rule of NICHE_RULES) {
    if (rule.pattern.test(name)) {
      matchedNiche = rule.niche;
      nicheBoost = rule.boost;
      serviceHook = rule.serviceHook;
      break;
    }
  }

  // Base 45 + city priority (0-15) + niche boost (15-38) = 60 to 98
  const rawScore = 45 + (cityMeta?.priority || 5) + nicheBoost;
  const score = Math.max(10, Math.min(99, rawScore));

  return {
    niche: matchedNiche,
    score,
    serviceHook,
    isHighPriorityNiche: nicheBoost >= 30
  };
}

// ---------------------------------------------------------------------------
// 4. Sunbiz Fixed-Width (1440-byte cordata) & CSV/JSON Record Parsers
// ---------------------------------------------------------------------------

/**
 * Parse a single 1440-byte fixed-width line from Sunbiz's daily corporate/LLC SFTP file
 * (`/Public/doc/cor/YYYYMMDDc.txt`).
 * Also supports tab/pipe-delimited or variable-length Sunbiz text lines.
 */
export function parseSunbizFixedWidthLine(line) {
  if (!line || line.length < 200) return null;

  const docNumber = line.slice(0, 12).trim();
  const rawBusinessName = line.slice(12, 204).trim();
  const status = line.slice(204, 205).trim();
  const filingType = line.slice(205, 220).trim();

  // Only active new Florida entities (DOMP = Domestic Profit, FLAL = Florida LLC, DOMNP = Non-Profit)
  if (status && status !== 'A') return null;
  if (!docNumber || !rawBusinessName) return null;

  const principalAddress = toTitleCase(line.slice(220, 324).trim().replace(/\s+/g, ' '));
  const principalCity = line.slice(324, 352).trim();
  const principalState = line.slice(352, 354).trim() || 'FL';
  const principalZip = line.slice(354, 364).trim();

  const mailingAddress = toTitleCase(line.slice(364, 468).trim().replace(/\s+/g, ' '));
  const mailingCity = line.slice(468, 496).trim();
  const mailingState = line.slice(496, 498).trim();
  const mailingZip = line.slice(498, 508).trim();

  // Filing date (MMDDYYYY or YYYYMMDD around offset 508-516)
  const rawDate = line.slice(508, 516).trim();
  let filingDate = new Date().toISOString().slice(0, 10);
  if (/^\d{8}$/.test(rawDate)) {
    if (rawDate.startsWith('202')) {
      filingDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    } else {
      filingDate = `${rawDate.slice(4, 8)}-${rawDate.slice(0, 2)}-${rawDate.slice(2, 4)}`;
    }
  }

  const registeredAgent = toTitleCase(line.slice(544, 586).trim());

  // Parse up to 6 Officer / Authorized Person / Manager blocks (starting at offset 668, 128 chars each)
  const officers = [];
  for (let i = 0; i < 6; i++) {
    const base = 668 + i * 128;
    if (line.length < base + 47) break;
    const title = line.slice(base, base + 4).trim();
    const personOrCorp = line.slice(base + 4, base + 5).trim().toUpperCase(); // 'P' = Person, 'C' = Corp
    const lastName = line.slice(base + 5, base + 25).trim();
    const firstName = line.slice(base + 25, base + 39).trim();
    const middleName = line.slice(base + 39, base + 47).trim();

    if (!lastName && !firstName) continue;
    if (personOrCorp === 'C') continue; // Skip corporate holding managers

    const full = toTitleCase([firstName, middleName, lastName].filter(Boolean).join(' '));
    if (CORPORATE_AGENT_PATTERNS.test(full)) continue;

    officers.push({
      title: title || 'MGR',
      firstName: toTitleCase(firstName),
      lastName: toTitleCase(lastName),
      fullName: full
    });
  }

  // Fallback to Registered Agent if it looks like an individual human (not a corporate agent mill)
  let primaryFounder = officers[0] || null;
  if (!primaryFounder && registeredAgent && !CORPORATE_AGENT_PATTERNS.test(registeredAgent) && !/\b(LLC|INC|CORP|PA|PLLC)\b/i.test(registeredAgent)) {
    // Sunbiz sometimes formats RA name as "LAST, FIRST" or "FIRST LAST"
    let formattedRa = registeredAgent;
    if (formattedRa.includes(',')) {
      const [last, first] = formattedRa.split(',').map(s => s.trim());
      formattedRa = [first, last].filter(Boolean).join(' ');
    }
    const split = splitName(formattedRa);
    if (split.ok) {
      primaryFounder = {
        title: 'RA / Founder',
        firstName: toTitleCase(split.firstName),
        lastName: toTitleCase(split.lastName),
        fullName: toTitleCase(formattedRa)
      };
    }
  }

  if (!primaryFounder) return null;

  const effectiveCity = principalCity || mailingCity;
  const effectiveZip = principalZip || mailingZip;
  const effectiveState = principalState || mailingState || 'FL';

  return buildCandidateRecord({
    doc_number: docNumber,
    business_name: rawBusinessName,
    entity_type: filingType.includes('LLC') || filingType === 'FLAL' || docNumber.startsWith('L') ? 'FL LLC' : 'FL Corp',
    filing_date: filingDate,
    founder_name: primaryFounder.fullName,
    founder_first_name: primaryFounder.firstName,
    founder_last_name: primaryFounder.lastName,
    founder_title: primaryFounder.title,
    secondary_officers: officers.slice(1),
    registered_agent: registeredAgent,
    principal_address: principalAddress || mailingAddress,
    mailing_address: mailingAddress,
    city: effectiveCity,
    state: effectiveState,
    zip: effectiveZip
  });
}

/**
 * Normalize & validate any raw candidate object (from fixed-width, CSV, or JSON)
 * into a scored, South-Florida-checked outreach candidate record.
 */
export function buildCandidateRecord(raw, options = { requireSouthFlorida: true, excludeShells: true }) {
  const businessName = String(raw.business_name || raw.businessName || raw.company || '').trim();
  if (!businessName) return null;

  if (options.excludeShells !== false && isShellOrHoldingEntity(businessName)) {
    return null;
  }

  let founderName = toTitleCase(raw.founder_name || raw.founderName || raw.officer_name || raw.name || '');
  if (founderName.includes(',')) {
    const [last, first] = founderName.split(',').map(s => s.trim());
    founderName = [first, last].filter(Boolean).join(' ');
  }

  if (!founderName || CORPORATE_AGENT_PATTERNS.test(founderName)) {
    return null;
  }

  const nameParts = splitName(founderName);
  const firstName = toTitleCase(raw.founder_first_name || (nameParts.ok ? nameParts.firstName : founderName.split(' ')[0]));
  const lastName = toTitleCase(raw.founder_last_name || (nameParts.ok ? nameParts.lastName : founderName.split(' ').slice(1).join(' ')));

  const cityMeta = matchSouthFloridaLocation(raw.city, raw.zip, raw.state || 'FL');
  if (options.requireSouthFlorida !== false && !cityMeta.isSouthFlorida) {
    return null;
  }

  const classification = classifyAndScoreBusiness(businessName, cityMeta);
  const docNumber = String(raw.doc_number || raw.docNumber || '').trim().toUpperCase() || `SBZ_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const email = String(raw.email || '').trim().toLowerCase() || null;
  const phone = String(raw.phone || '').trim() || null;
  const website = normalizeDomain(raw.website || raw.company_domain || '') || null;

  let enrichmentStatus = raw.enrichment_status || 'unattempted';
  if (email && phone) enrichmentStatus = 'found';
  else if (email || phone) enrichmentStatus = 'partial';

  return {
    id: raw.id || `sbz_${docNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    doc_number: docNumber,
    business_name: businessName.toUpperCase(),
    business_name_clean: cleanBusinessName(businessName),
    entity_type: raw.entity_type || (docNumber.startsWith('L') ? 'FL LLC' : 'FL Corp'),
    filing_date: raw.filing_date || new Date().toISOString().slice(0, 10),
    founder_name: founderName,
    founder_first_name: firstName,
    founder_last_name: lastName,
    founder_title: String(raw.founder_title || 'MGR').toUpperCase(),
    secondary_officers: JSON.stringify(raw.secondary_officers || []),
    registered_agent: toTitleCase(raw.registered_agent || founderName),
    principal_address: toTitleCase(raw.principal_address || raw.address || ''),
    mailing_address: toTitleCase(raw.mailing_address || ''),
    city: cityMeta.city,
    state: 'FL',
    zip: String(raw.zip || '').trim().slice(0, 10),
    county: cityMeta.county,
    niche: raw.niche || classification.niche,
    score: typeof raw.score === 'number' ? raw.score : classification.score,
    email,
    phone,
    website,
    enrichment_status: enrichmentStatus,
    enrichment_source: raw.enrichment_source || (email || phone ? 'manual' : null),
    enrichment_confidence: raw.enrichment_confidence || null,
    enrichment_meta: typeof raw.enrichment_meta === 'string' ? raw.enrichment_meta : JSON.stringify(raw.enrichment_meta || {}),
    outreach_status: raw.outreach_status || 'uncontacted',
    notes: raw.notes || null
  };
}

/**
 * Parse a bulk text payload (either Sunbiz 1440-byte fixed-width lines or CSV rows).
 */
export function parseSunbizBulkText(text, options = { requireSouthFlorida: true, excludeShells: true }) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Detect fixed-width Sunbiz cordata file (lines >= 500 chars starting with Doc Number like L26000... or P26000...)
  const firstLine = lines[0];
  if (firstLine.length >= 400 && /^[LPFN]\d{9,11}/i.test(firstLine.trim())) {
    const candidates = [];
    for (const line of lines) {
      const parsed = parseSunbizFixedWidthLine(line);
      if (!parsed) continue;
      if (options.requireSouthFlorida !== false) {
        const loc = matchSouthFloridaLocation(parsed.city, parsed.zip, parsed.state);
        if (!loc.isSouthFlorida) continue;
      }
      candidates.push(parsed);
    }
    return candidates;
  }

  // Otherwise parse as CSV
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

    const mapped = {
      doc_number: obj.doc_number || obj.document_number || obj.doc || obj.id,
      business_name: obj.business_name || obj.entity_name || obj.company || obj.corporation_name || obj.name,
      filing_date: obj.filing_date || obj.date_filed || obj.effective_date,
      founder_name: obj.founder_name || obj.officer_name || obj.manager_name || obj.authorized_person || obj.founder || obj.registered_agent,
      founder_title: obj.founder_title || obj.title || 'MGR',
      principal_address: obj.principal_address || obj.address || obj.street_address,
      city: obj.city || obj.principal_city,
      state: obj.state || obj.principal_state || 'FL',
      zip: obj.zip || obj.postal_code || obj.principal_zip,
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
// 5. Automated Multi-Stage Contact Enrichment Waterfall
// ---------------------------------------------------------------------------

/**
 * Waterfall stages:
 *   1. DataForSEO Google SERP / Maps check (resolves domain + business phone if already listed)
 *   2. Hunter.io Domain + Email Finder (if domain exists or Hunter can resolve company name)
 *   3. Apollo.io People Match (Founder Name + South FL Location + Business Name -> Email & Phone)
 *   4. People Data Labs Person Enrich (Founder Name + Principal Address + City/Zip -> Personal/Work Email & Mobile Phone)
 */
export async function enrichOutreachCandidate(candidate, env) {
  let email = candidate.email || null;
  let phone = candidate.phone || null;
  let website = normalizeDomain(candidate.website || '');
  let confidence = candidate.enrichment_confidence || null;
  let source = candidate.enrichment_source || null;
  const meta = {
    attempts: [],
    linkedin_url: null,
    job_title: candidate.founder_title || 'Founder',
    verification: null
  };

  // Stage 1: DataForSEO SERP / Maps Lookup (if configured and missing website or phone)
  if ((!website || !phone) && env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) {
    try {
      const dfs = await lookupViaDataForSeo(candidate, env);
      meta.attempts.push({ provider: 'dataforseo', foundWebsite: dfs.website, foundPhone: dfs.phone });
      if (dfs.website && !website) website = dfs.website;
      if (dfs.phone && !phone) {
        phone = dfs.phone;
        source = source || 'dataforseo';
      }
    } catch (err) {
      meta.attempts.push({ provider: 'dataforseo', error: err.message });
    }
  }

  // Stage 2: Hunter.io Domain + Email Finder (if ENRICHMENT_API_KEY is configured)
  if (!email && env.ENRICHMENT_API_KEY) {
    try {
      const hunterRes = await enrichLead({
        name: candidate.founder_name,
        company: candidate.business_name_clean,
        companyDomain: website
      }, env);
      meta.attempts.push({ provider: 'hunter', status: hunterRes.status, domain: hunterRes.domain });
      if (hunterRes.domain && !website) website = hunterRes.domain;
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

  // Stage 3: Apollo.io People Match (Founder First/Last + City, FL + Business Name)
  if ((!email || !phone) && env.APOLLO_API_KEY) {
    try {
      const apolloRes = await lookupViaApollo(candidate, website, env.APOLLO_API_KEY);
      meta.attempts.push({ provider: 'apollo', status: apolloRes.found ? 'found' : 'not_found' });
      if (apolloRes.email && !email) {
        email = apolloRes.email;
        confidence = 88;
        source = 'apollo';
      }
      if (apolloRes.phone && !phone) {
        phone = apolloRes.phone;
        source = source || 'apollo';
      }
      if (apolloRes.linkedinUrl) meta.linkedin_url = apolloRes.linkedinUrl;
      if (apolloRes.website && !website) website = apolloRes.website;
    } catch (err) {
      meta.attempts.push({ provider: 'apollo', error: err.message });
    }
  }

  // Stage 4: People Data Labs Person Enrich (Founder Name + Principal Street Address + City, FL + Zip)
  if ((!email || !phone) && env.PDL_API_KEY) {
    try {
      const pdlRes = await lookupViaPdl(candidate, env.PDL_API_KEY);
      meta.attempts.push({ provider: 'pdl', status: pdlRes.found ? 'found' : 'not_found' });
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
    } catch (err) {
      meta.attempts.push({ provider: 'pdl', error: err.message });
    }
  }

  let status = 'not_found';
  if (email && phone) status = 'found';
  else if (email || phone) status = 'partial';

  return {
    status,
    email,
    phone,
    website: website || null,
    confidence,
    source: source || (meta.attempts.length > 0 ? meta.attempts[0].provider : 'none'),
    meta
  };
}

async function lookupViaDataForSeo(candidate, env) {
  const authHeader = 'Basic ' + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);
  const query = `"${candidate.business_name_clean}" "${candidate.city}" FL`;
  const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      keyword: query,
      location_code: 2840,
      language_code: 'en',
      depth: 5
    }])
  });

  if (!res.ok) return { website: null, phone: null };
  const data = await res.json().catch(() => ({}));
  const items = data?.tasks?.[0]?.result?.[0]?.items || [];

  const directoryDomains = /(sunbiz\.org|bizprofile|opencorporates|yelp\.com|facebook\.com|instagram\.com|linkedin\.com|bbb\.org|yellowpages|mapquest|nextdoor|thumbtack|angi\.com|homeadvisor|dnb\.com|buzzfile)/i;
  let website = null;
  let phone = null;

  for (const item of items) {
    if (item.domain && !directoryDomains.test(item.domain) && !website) {
      website = normalizeDomain(item.domain);
    }
    const text = `${item.title || ''} ${item.description || ''}`;
    const phoneMatch = text.match(/\(?(305|786|954|754|561)\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch && !phone) {
      phone = phoneMatch[0];
    }
  }

  return { website, phone };
}

async function lookupViaApollo(candidate, domain, apiKey) {
  const res = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify({
      first_name: candidate.founder_first_name,
      last_name: candidate.founder_last_name,
      organization_name: candidate.business_name_clean,
      domain: domain || undefined,
      city: candidate.city,
      state: 'Florida',
      country: 'United States',
      reveal_personal_emails: true
    })
  });

  if (!res.ok) {
    throw new Error(`Apollo HTTP ${res.status}`);
  }

  const body = await res.json().catch(() => ({}));
  const person = body?.person;
  if (!person) return { found: false };

  const email = person.email || (Array.isArray(person.personal_emails) ? person.personal_emails[0] : null) || null;
  const phone = person.phone_numbers?.[0]?.sanitized_number || person.organization?.primary_phone?.sanitized_number || null;
  const website = normalizeDomain(person.organization?.website_url || '');

  return {
    found: Boolean(email || phone),
    email,
    phone,
    website,
    linkedinUrl: person.linkedin_url || null
  };
}

async function lookupViaPdl(candidate, apiKey) {
  const params = new URLSearchParams({
    first_name: candidate.founder_first_name || '',
    last_name: candidate.founder_last_name || '',
    locality: candidate.city || '',
    region: 'florida',
    country: 'united states',
    min_likelihood: '6'
  });
  if (candidate.principal_address) params.set('street_address', candidate.principal_address);
  if (candidate.zip) params.set('postal_code', candidate.zip);

  const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`, {
    method: 'GET',
    headers: {
      'X-Api-Key': apiKey,
      'Accept': 'application/json'
    }
  });

  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`PDL HTTP ${res.status}`);

  const body = await res.json().catch(() => ({}));
  const data = body?.data || body;
  const email = data?.work_email || data?.recommended_personal_email || (Array.isArray(data?.personal_emails) ? data.personal_emails[0] : null) || null;
  const phone = data?.mobile_phone || (Array.isArray(data?.phone_numbers) ? data.phone_numbers[0] : null) || null;

  return {
    found: Boolean(email || phone),
    email,
    phone,
    likelihood: body?.likelihood || null,
    linkedinUrl: data?.linkedin_url ? `https://${data.linkedin_url.replace(/^https?:\/\//, '')}` : null
  };
}

// ---------------------------------------------------------------------------
// 6. CRO Outreach Email Templates ("Irresistible Offer" System)
// ---------------------------------------------------------------------------
export const OUTREACH_TEMPLATES = {
  launchpad_mockup: {
    id: 'launchpad_mockup',
    name: '🔥 Default: Free Custom Homepage Mockup + GBP "No-Suspension" Checklist',
    subject: 'Congrats on {{business_name_clean}} ({{city}}) — built a quick homepage concept for you',
    body: `Hi {{first_name}},

Congrats on officially registering {{business_name_clean}} here in {{city}}!

When you file a new LLC on Sunbiz, two things usually happen in the first 30 days:
1. Your mailbox gets flooded with overpriced "official compliance" junk mail.
2. When you try to verify your Google Business Profile to show up on Google Maps in {{city}}, Google's automated filter often hits brand-new LLCs with an instant suspension if your domain, NAP citations, and entity records aren't aligned first.

I run G3Z Creative right here in South Florida (Miramar/Pembroke Pines). To say welcome to the local business community, I put together two free resources for {{business_name_clean}} — no strings attached:

1. **The Florida New-LLC Google Maps "No-Suspension" Checklist:** The exact 5-step sequence to get {{business_name_clean}} verified on Google Maps in {{city}} on the first try.
2. **A Custom 1-Page Homepage Mockup for {{business_name_clean}}:** A clean, conversion-ready homepage concept tailored for {{niche_lower}} in {{city}} so you can see exactly how your brand can look online before spending a dime on web design.

Want me to send over the checklist and your custom {{business_name_clean}} homepage preview link? Just reply **"SEND IT"** (or shoot me a text at 786-967-3699) and I'll drop both in your inbox today.

To a strong launch in {{city}},

Christian Gomez
Founder, G3Z Creative
https://g3zcreative.com | (786) 967-3699
South Florida Web Design & Local/AI SEO`
  },

  local_demand_snapshot: {
    id: 'local_demand_snapshot',
    name: '📊 Angle 2: Local {{city}} Search Demand + Fast-Track Launch',
    subject: '{{first_name}} — {{niche_lower}} searches in {{city}} right now',
    body: `Hi {{first_name}},

Saw the new filing for {{business_name_clean}} in {{city}} — congratulations on the launch!

Most new {{niche_lower}} businesses wait 3 to 6 months before setting up their Google Maps profile and conversion website, which leaves hundreds of local {{city}} searches on the table for older competitors.

Since we're right here in South Florida, I'd love to send you a **Free Custom Homepage Mockup for {{business_name_clean}}** along with a **60-Second Local Search Snapshot** showing:
• Exactly how many people in {{city}} & {{county}} search for {{niche_lower}} every month on Google & ChatGPT
• Our "No-Suspension" Google Business Profile launch checklist so {{business_name_clean}} ranks in the local Map Pack from Day 1

No pitch, no retainer required — if you like the homepage concept, we can launch it in 72 hours; if not, you keep the blueprint and checklist for free.

Reply **"SNAPSHOT"** and I'll send it right over.

Best,

Christian Gomez
Founder, G3Z Creative
https://g3zcreative.com | (786) 967-3699`
  },

  short_neighbor: {
    id: 'short_neighbor',
    name: '⚡ Angle 3: Ultra-Short 4-Sentence Neighbor Intro (Mobile-First)',
    subject: 'Welcome to the {{city}} business community, {{first_name}}!',
    body: `Hey {{first_name}},

Just saw {{business_name_clean}} come through on the new {{city}} business filings — congrats on making it official!

I'm a local founder here in South Florida (G3Z Creative), and whenever a great new local business launches nearby, I like to offer a **free custom homepage mockup** + our **Florida Google Business Profile "No-Suspension" Launch Checklist** so you don't get stuck in Google's new-LLC verification filter.

Mind if I send over the link to the homepage preview I drafted for {{business_name_clean}}?

Cheers,

Christian Gomez
G3Z Creative | https://g3zcreative.com
Call/Text: (786) 967-3699`
  }
};

export function renderOutreachTemplate(templateId, candidate) {
  const tpl = OUTREACH_TEMPLATES[templateId] || OUTREACH_TEMPLATES.launchpad_mockup;
  const firstName = candidate.founder_first_name || (candidate.founder_name || 'there').split(' ')[0];
  const businessClean = candidate.business_name_clean || cleanBusinessName(candidate.business_name) || 'your business';
  const city = candidate.city || 'South Florida';
  const county = candidate.county || 'South Florida';
  const niche = candidate.niche || 'Local Business';
  const nicheLower = niche === 'Local Business' ? 'local services' : niche.toLowerCase();

  const vars = {
    first_name: firstName,
    founder_name: candidate.founder_name || firstName,
    business_name: candidate.business_name || businessClean,
    business_name_clean: businessClean,
    city,
    county,
    niche,
    niche_lower: nicheLower,
    doc_number: candidate.doc_number || ''
  };

  const replaceVars = (str) => String(str).replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : '');

  return {
    templateId: tpl.id,
    subject: replaceVars(tpl.subject),
    body: replaceVars(tpl.body)
  };
}

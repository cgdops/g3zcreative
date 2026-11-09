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

import { enrichLead, isValidCompanyDomain, normalizeDomain, splitName } from './_enrich.js';

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
// 2. Niche Classification, Priority Scoring & Industry Lingo / Demand Rules
// ---------------------------------------------------------------------------
// Search volumes calibrated via DataForSEO Google Ads Search Volume API
// across Broward, Miami-Dade, and Palm Beach counties ($0.075/call).
export const NICHE_RULES = [
  {
    niche: 'Roofing',
    boost: 38,
    serviceTerm: 'roofing services',
    lingoServices: 'full re-roofs, tile & metal replacements, and storm leak repairs',
    lingoQuestion: 'Could you use a few more full re-roof or leak repair estimates coming in from online channels, or is your crew already booked out?',
    seedKeywords: ['roofer', 'roofing company', 'roof repair', 'roof replacement', 'roofer near me', 'roofing contractor'],
    searchDemand: {
      'Broward County': 3570,
      'Miami-Dade County': 6430,
      'Palm Beach County': 2630,
      default: 3570
    },
    serviceHook: 'roof replacements, storm damage inspections, and emergency leak repairs',
    pattern: /\b(ROOF|ROOFING|ROOFER|ROOFERS|SHINGLE|RE-ROOF)\b/i
  },
  {
    niche: 'HVAC',
    boost: 38,
    serviceTerm: 'AC & HVAC services',
    lingoServices: 'AC changeouts, emergency no-cool service calls, and maintenance agreements',
    lingoQuestion: 'Could you use more AC changeout and service calls from online channels right now, or are your techs already running at capacity?',
    seedKeywords: ['ac repair', 'air conditioning repair', 'hvac repair', 'ac installation', 'hvac company', 'ac repair near me'],
    searchDemand: {
      'Broward County': 8550,
      'Miami-Dade County': 12860,
      'Palm Beach County': 6340,
      default: 8550
    },
    serviceHook: 'AC repair, HVAC installations, and emergency cooling calls',
    pattern: /\b(HVAC|AIR CONDITIONING|A\/C|COOLING|REFRIGERATION|CLIMATE CONTROL|DUCTWORK|MECHANICAL)\b/i
  },
  {
    niche: 'Plumbing',
    boost: 38,
    serviceTerm: 'plumbing services',
    lingoServices: 'emergency service calls, slab leaks, repipes, and water heater installs',
    lingoQuestion: 'Could you use more high-ticket repipe, water heater, or emergency dispatch calls from online channels, or is your board already full?',
    seedKeywords: ['plumber', 'plumber near me', 'plumbing company', 'emergency plumber', 'drain cleaning', 'water heater repair'],
    searchDemand: {
      'Broward County': 11910,
      'Miami-Dade County': 17210,
      'Palm Beach County': 8540,
      default: 11910
    },
    serviceHook: 'emergency plumbing, leak detection, water heaters, and drain clearing',
    pattern: /\b(PLUMB|PLUMBING|PLUMBER|DRAIN|ROOTER|SEWER|PIPING)\b/i
  },
  {
    niche: 'Electrical',
    boost: 38,
    serviceTerm: 'electrical services',
    lingoServices: 'panel upgrades, whole-home generator installs, EV chargers, and commercial buildouts',
    lingoQuestion: 'Could you use more panel upgrade, generator install, or service calls from online channels, or are you mostly booked through GCs and referrals?',
    seedKeywords: ['electrician', 'electrician near me', 'electrical contractor', 'panel upgrade', 'generator installation'],
    searchDemand: {
      'Broward County': 3860,
      'Miami-Dade County': 6050,
      'Palm Beach County': 3450,
      default: 3860
    },
    serviceHook: 'panel upgrades, residential & commercial electrical, and EV/generator installs',
    pattern: /\b(ELECTRIC|ELECTRICAL|ELECTRICIAN|WIRING|LIGHTING|GENERATOR)\b/i
  },
  {
    niche: 'Landscaping & Lawn',
    boost: 35,
    serviceTerm: 'landscaping & hardscape services',
    lingoServices: 'HOA/commercial maintenance accounts, paver & travertine installs, and sod/design jobs',
    lingoQuestion: 'Are you looking to add more recurring route density and paver/design installs from online channels, or is your schedule already packed?',
    seedKeywords: ['landscaping', 'landscaping near me', 'lawn care', 'tree service', 'paver installation', 'sod installation'],
    searchDemand: {
      'Broward County': 2270,
      'Miami-Dade County': 3870,
      'Palm Beach County': 2030,
      default: 2270
    },
    serviceHook: 'landscape design, sod installation, tree service, and commercial lawn care',
    pattern: /\b(LANDSCAP|LAWN|TURF|TREE SERVICE|ARBOR|IRRIGATION|HARDSCAP|PAVER|SOD)\b/i
  },
  {
    niche: 'Construction & Remodeling',
    boost: 34,
    serviceTerm: 'remodeling & contracting services',
    lingoServices: 'kitchen & bath gut-remodels, impact windows & doors, and residential additions',
    lingoQuestion: 'Could you use more qualified homeowner estimates for remodels or impact jobs from online channels, or is your pipeline booked out on referrals?',
    seedKeywords: ['general contractor', 'home remodeling', 'kitchen remodeling', 'bathroom remodeling', 'impact windows'],
    searchDemand: {
      'Broward County': 3650,
      'Miami-Dade County': 4330,
      'Palm Beach County': 2330,
      default: 3650
    },
    serviceHook: 'kitchen & bath remodeling, impact windows, flooring, and general contracting',
    pattern: /\b(REMODEL|RENOVAT|CONSTRUCTION|CONTRACTOR|BUILDERS|CABINET|FLOORING|DRYWALL|PAINTING|PAINTER|STUCCO|FENCE|FENCING|GLAZING|WINDOWS|DOORS|CONCRETE|MASONRY|HANDYMAN)\b/i
  },
  {
    niche: 'Pool & Outdoor',
    boost: 34,
    serviceTerm: 'pool & outdoor living services',
    lingoServices: 'diamond brite resurfacing, custom pool builds, screen enclosures, and weekly route accounts',
    lingoQuestion: 'Could you use more pool resurfacing, remodel, or weekly route leads from online channels right now?',
    seedKeywords: ['pool service', 'pool cleaning', 'pool repair', 'pool builder', 'pool resurfacing'],
    searchDemand: {
      'Broward County': 1300,
      'Miami-Dade County': 1290,
      'Palm Beach County': 840,
      default: 1300
    },
    serviceHook: 'pool maintenance, resurfacing, patio enclosures, and outdoor kitchens',
    pattern: /\b(POOL|POOLS|SPA|PATIO|PERGOLA|SCREEN ENCLOSURE)\b/i
  },
  {
    niche: 'Pest Control & Mold',
    boost: 34,
    serviceTerm: 'pest control & remediation services',
    lingoServices: 'recurring pest routes, termite treatments, water mitigation, and mold remediation jobs',
    lingoQuestion: 'Could you use more emergency mitigation calls or recurring pest route signups from online channels?',
    seedKeywords: ['pest control', 'exterminator', 'termite control', 'mold remediation', 'water damage restoration'],
    searchDemand: {
      'Broward County': 3000,
      'Miami-Dade County': 4690,
      'Palm Beach County': 2530,
      default: 3000
    },
    serviceHook: 'pest control, termite protection, mold remediation, and water damage restoration',
    pattern: /\b(PEST|EXTERMINAT|TERMITE|MOLD|RESTORATION|MITIGATION|BIOHAZARD)\b/i
  },
  {
    niche: 'Cleaning & Property Care',
    boost: 30,
    serviceTerm: 'cleaning & property care services',
    lingoServices: 'commercial janitorial contracts, recurring residential cleanings, and roof/paver soft-washing',
    lingoQuestion: 'Could you use more commercial walkthroughs or recurring residential bookings from online channels?',
    seedKeywords: ['house cleaning', 'commercial cleaning', 'pressure washing', 'maid service', 'janitorial services'],
    searchDemand: {
      'Broward County': 3350,
      'Miami-Dade County': 4070,
      'Palm Beach County': 2750,
      default: 3350
    },
    serviceHook: 'commercial janitorial, pressure washing, and residential maid services',
    pattern: /\b(CLEANING|CLEANERS|MAID|JANITORIAL|PRESSURE WASH|POWER WASH|SOFT WASH|WINDOW CLEANING|CARPET CLEANING)\b/i
  },
  {
    niche: 'Medical, Dental & Wellness',
    boost: 35,
    serviceTerm: 'dental, medical & wellness services',
    lingoServices: 'high-value Cash/PPO patient bookings, implant & cosmetic consults, and aesthetic treatments',
    lingoQuestion: 'Could you use more private-pay consults and new patient bookings coming in from online search?',
    seedKeywords: ['dentist near me', 'med spa', 'chiropractor near me', 'physical therapy', 'dental implants'],
    searchDemand: {
      'Broward County': 20700,
      'Miami-Dade County': 24500,
      'Palm Beach County': 17280,
      default: 20700
    },
    serviceHook: 'new patient bookings, local treatment searches, and high-trust clinic visibility',
    pattern: /\b(DENTAL|DENTIST|ORTHODONT|MEDICAL|CLINIC|HEALTH|WELLNESS|MEDSPA|AESTHETIC|CHIROPRACT|THERAPY|PHYSICAL THERAPY|COUNSELING|PEDIATRIC|DERMATOLOG|OPTOMETR|VISION|PHARMACY|CARE|NURSING)\b/i
  },
  {
    niche: 'Fitness & Studios',
    boost: 33,
    serviceTerm: 'classes & studio memberships',
    lingoServices: 'paid intro trials, recurring monthly memberships, and youth/adult class enrollments',
    lingoQuestion: 'Could you use more local intro-trial bookings and monthly members from online search as you fill up your class schedule?',
    seedKeywords: ['dance studio', 'pilates studio', 'gym near me', 'martial arts', 'yoga studio'],
    searchDemand: {
      'Broward County': 20350,
      'Miami-Dade County': 31000,
      'Palm Beach County': 11790,
      default: 20350
    },
    serviceHook: 'new class trials, studio memberships, and local parent/student signups',
    pattern: /\b(DANCE|STUDIO|GYM|FITNESS|PILATES|YOGA|MARTIAL ARTS|KARATE|JIU JITSU|BOXING|ACADEMY|CROSSFIT|TRAINING)\b/i
  },
  {
    niche: 'Legal & Accounting',
    boost: 32,
    serviceTerm: 'legal & accounting services',
    lingoServices: 'qualified client retainers, business tax/advisory engagements, and high-intent case consults',
    lingoQuestion: 'Could your practice use more qualified local client consultations coming in from online search?',
    seedKeywords: ['cpa near me', 'tax accountant', 'real estate attorney', 'personal injury lawyer', 'bookkeeping services'],
    searchDemand: {
      'Broward County': 1030,
      'Miami-Dade County': 1330,
      'Palm Beach County': 790,
      default: 1030
    },
    serviceHook: 'high-intent client consultations, local practice visibility, and authority positioning',
    pattern: /\b(LAW|LEGAL|ATTORNEY|COUNSEL|ESQ|CPA|ACCOUNTING|TAX|BOOKKEEPING|ADVISOR|NOTARY)\b/i
  },
  {
    niche: 'Auto & Marine',
    boost: 28,
    serviceTerm: 'auto & marine services',
    lingoServices: 'ceramic coating & detailing packages, marine/outboard service, and high-ticket repair tickets',
    lingoQuestion: 'Could you use more high-ticket service bays or mobile bookings coming in from online channels?',
    seedKeywords: ['auto detailing', 'mobile detailing', 'auto repair', 'mechanic near me', 'boat repair'],
    searchDemand: {
      'Broward County': 5420,
      'Miami-Dade County': 6280,
      'Palm Beach County': 3690,
      default: 5420
    },
    serviceHook: 'mobile detailing, marine service, auto repair, and fleet care',
    pattern: /\b(AUTO|AUTOMOTIVE|DETAILING|CAR WASH|TOWING|MECHANIC|BODY SHOP|TIRES|MARINE|YACHT|BOAT)\b/i
  }
];

export function getNicheOutreachMeta(nicheName, countyName = 'Broward County') {
  const rule = NICHE_RULES.find(r => r.niche === nicheName);
  const rawMeta = {};
  if (!rule) {
    return {
      serviceTerm: 'local services',
      lingoServices: 'new customer inquiries and local bookings',
      lingoQuestion: 'Could you use any more leads from online channels?',
      searchersCount: 1850,
      searchersFormatted: '1,850'
    };
  }
  const count = (rule.searchDemand && (rule.searchDemand[countyName] || rule.searchDemand.default)) || 2500;
  return {
    serviceTerm: rule.serviceTerm,
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

  // Only active Florida entities (DOMP = Domestic Profit, FLAL = Florida LLC, DOMNP = Non-Profit)
  if (status && status !== 'A') return null;
  if (!docNumber || !rawBusinessName) return null;

  // Official Sunbiz 1440-byte Corporate Data File offsets (1-indexed -> 0-indexed):
  // Principal Address 1 (221, len 42) + Address 2 (263, len 42) => slice(220, 304)
  // Principal City (305, len 28) => slice(304, 332)
  // Principal State (333, len 2) => slice(332, 334)
  // Principal Zip (335, len 10) => slice(334, 344)
  const principalAddress = toTitleCase(line.slice(220, 304).trim().replace(/\s+/g, ' '));
  const principalCity = line.slice(304, 332).trim();
  const principalState = line.slice(332, 334).trim() || 'FL';
  const principalZip = line.slice(334, 344).trim();

  // Mailing Address 1 (347, len 42) + Address 2 (389, len 42) => slice(346, 430)
  // Mailing City (431, len 28) => slice(430, 458)
  // Mailing State (459, len 2) => slice(458, 460)
  // Mailing Zip (461, len 10) => slice(460, 470)
  const mailingAddress = toTitleCase(line.slice(346, 430).trim().replace(/\s+/g, ' '));
  const mailingCity = line.slice(430, 458).trim();
  const mailingState = line.slice(458, 460).trim();
  const mailingZip = line.slice(460, 470).trim();

  // File Date (473, len 8) => slice(472, 480)
  const rawDate = line.slice(472, 480).trim();
  let filingDate = new Date().toISOString().slice(0, 10);
  if (/^\d{8}$/.test(rawDate)) {
    if (rawDate.startsWith('20') || rawDate.startsWith('19')) {
      filingDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    } else {
      filingDate = `${rawDate.slice(4, 8)}-${rawDate.slice(0, 2)}-${rawDate.slice(2, 4)}`;
    }
  }

  // Registered Agent Name (545, len 42) => slice(544, 586), RA Type (587, len 1) => slice(586, 587)
  // RA Address (588, len 42) => slice(587, 629), RA City (630, len 28) => slice(629, 657)
  const registeredAgent = toTitleCase(line.slice(544, 586).trim());
  const raType = line.slice(586, 587).trim().toUpperCase(); // 'P' = Person, 'C' = Corporation
  const raCity = line.slice(629, 657).trim();
  const raState = line.slice(657, 659).trim();
  const raZip = line.slice(659, 668).trim();

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

  // Fallback to Registered Agent if it is an individual person (not a corporate/law-firm RA)
  const nonHumanRaPattern = /\b(LLC|L\.L\.C|INC|CORP|CORPORATION|COMPANY|PA|P\.A|PLLC|P\.L\.L\.C|LLP|L\.L\.P|PL|P\.L|LP|L\.P|LAW GROUP|LAW FIRM|ATTORNEYS|ASSOCIATES|ACCOUNTING|CPA|TRUST|SERVICES|SOLUTIONS|MANAGEMENT|AGENCY)\b/i;
  let primaryFounder = officers[0] || null;
  if (
    !primaryFounder &&
    raType !== 'C' &&
    registeredAgent &&
    !CORPORATE_AGENT_PATTERNS.test(registeredAgent) &&
    !nonHumanRaPattern.test(registeredAgent)
  ) {
    const rawRaLastField = line.slice(544, 564);
    const raLast = rawRaLastField.trim();
    const raFirst = line.slice(564, 578).trim();
    const raMiddle = line.slice(578, 586).trim();
    // Sunbiz 42-char RA Name is fixed-width (Last 20 + First 14 + Middle 8) when 544..564 has trailing column padding
    const isFixedWidthRa = Boolean(raLast && raFirst && /\s{2,}$/.test(rawRaLastField));

    if (isFixedWidthRa) {
      primaryFounder = {
        title: 'RA / Founder',
        firstName: toTitleCase(raFirst.split(/\s+/)[0]),
        lastName: toTitleCase(raLast),
        fullName: toTitleCase([raFirst, raMiddle, raLast].filter(Boolean).join(' '))
      };
    } else {
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
  }

  if (!primaryFounder) return null;

  const effectiveCity = principalCity || mailingCity || raCity;
  const effectiveZip = principalZip || mailingZip || raZip;
  const effectiveState = principalState || mailingState || raState || 'FL';

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
  const rawWebsite = normalizeDomain(raw.website || raw.company_domain || '');
  const website = isValidCompanyDomain(rawWebsite) ? rawWebsite : null;

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
    secondary_officers: typeof raw.secondary_officers === 'string' ? raw.secondary_officers : JSON.stringify(raw.secondary_officers || []),
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
/**
 * Verify that an email address's domain actually exists in DNS and has MX or A records
 * using Cloudflare DNS-over-HTTPS (1.1.1.1). Prevents sending to nonexistent domains
 * (550 5.4.310 InfoDomainNonexistent bounces).
 */
export async function verifyEmailDomainDns(emailOrDomain) {
  const domain = normalizeDomain(emailOrDomain);
  if (!domain) {
    return { valid: false, domain: '', reason: 'Invalid domain format' };
  }

  try {
    const mxRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { 'Accept': 'application/dns-json' }
    });
    if (mxRes.ok) {
      const mxData = await mxRes.json().catch(() => ({}));
      // Status 3 = NXDOMAIN (domain does not exist in DNS)
      if (mxData.Status === 3) {
        return { valid: false, domain, reason: `Domain "${domain}" does not exist in DNS (NXDOMAIN)` };
      }
      if (Array.isArray(mxData.Answer) && mxData.Answer.length > 0) {
        return { valid: true, domain, hasMx: true };
      }
    }

    // Fallback check for A record (RFC 5321 allows mail delivery to A record if no MX is present, though rare)
    const aRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
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
    // If DNS query fails due to network issue, don't block unnecessarily
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
  const words = String(businessNameClean || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !GENERIC_BUSINESS_STOPWORDS.has(w));
  return words;
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

  // Match if the primary distinctive brand word (>=3 chars as whole word or >=4 chars substring) is in the org name,
  // or if at least 2 distinctive keywords match (e.g. "windows" + "doors").
  if (brandWord && brandWord.length >= 4 && orgLower.includes(brandWord)) return true;
  if (brandWord && brandWord.length === 3 && new RegExp(`\\b${brandWord}\\b`, 'i').test(orgLower)) return true;
  if (matchedKeywords.length >= 2) return true;
  return false;
}

/**
 * Fix legacy or inverted fixed-width RA names (e.g. "Novo Martinez Gabriela" -> first: "Gabriela", last: "Novo Martinez")
 */
export function resolveFounderNameParts(candidate) {
  let firstName = String(candidate.founder_first_name || '').trim();
  let lastName = String(candidate.founder_last_name || '').trim();
  let fullName = String(candidate.founder_name || '').trim();

  // Detect unflipped 3+ word RA names where first + last skipped middle tokens (e.g. "Novo Martinez Gabriela" with first="Novo", last="Gabriela")
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

export async function enrichOutreachCandidate(candidate, env) {
  let email = (candidate.email && !/@google\.com$/i.test(candidate.email)) ? candidate.email : null;
  let phone = candidate.phone || null;
  const initialDomain = normalizeDomain(candidate.website || '');
  let website = isValidCompanyDomain(initialDomain) ? initialDomain : '';
  let confidence = candidate.enrichment_confidence || null;
  let source = candidate.enrichment_source || null;

  const resolvedNames = resolveFounderNameParts(candidate);
  const effectiveCandidate = {
    ...candidate,
    founder_name: resolvedNames.fullName,
    founder_first_name: resolvedNames.firstName,
    founder_last_name: resolvedNames.lastName
  };

  // Pre-populate calibrated county/niche search volume immediately without a blocking live API call
  const calibratedMeta = getNicheOutreachMeta(effectiveCandidate.niche, effectiveCandidate.county);
  const meta = {
    attempts: [],
    linkedin_url: null,
    job_title: effectiveCandidate.founder_title || 'Founder',
    verification: null,
    live_search_volume: calibratedMeta.searchersCount
  };

  // Stage 1: DataForSEO Organic SERP Lookup (resolves verified company website + phone)
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

  // Stage 2: People Data Labs Person Enrich (runs BEFORE Hunter & Apollo so PDL's LinkedIn URL / company website can bridge into Apollo & Hunter)
  let pdlHints = null;
  const pdlKey = env.PDL_API_KEY || env.PDL_API;
  if ((!email || !phone) && pdlKey) {
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

  // Stage 3: Hunter.io Domain + Email Finder (if ENRICHMENT_API_KEY / HUNTER_API_KEY is configured)
  const hunterKey = env.ENRICHMENT_API_KEY || env.HUNTER_API_KEY || env.HUNTER_API;
  if (!email && hunterKey) {
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

  // Stage 4: Apollo.io People Match + South FL API Search (with PDL LinkedIn/Employer bridge & strict anti-collision guards)
  const apolloKey = env.APOLLO_API_KEY || env.APOLLO_API;
  if ((!email || !phone) && apolloKey) {
    try {
      const apolloRes = await lookupViaApollo(effectiveCandidate, website, pdlHints, apolloKey);
      meta.attempts.push({
        provider: 'apollo',
        status: apolloRes.found ? 'found' : 'not_found',
        matchedOrg: apolloRes.matchedOrg || null,
        matchConfidence: apolloRes.matchConfidence || null
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
      if (apolloRes.linkedinUrl && !meta.linkedin_url) meta.linkedin_url = apolloRes.linkedinUrl;
      if (apolloRes.website && isValidCompanyDomain(apolloRes.website) && !website) {
        website = apolloRes.website;
      }
    } catch (err) {
      meta.attempts.push({ provider: 'apollo', error: err.message });
    }
  }

  // Stage 5: Verify DNS MX records on any discovered email so we never store a nonexistent domain
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

    // Capture founder LinkedIn profile if surfaced in organic results
    if (!linkedinUrl && /linkedin\.com\/in\//i.test(itemUrl) && founderLastLower && combinedText.includes(founderLastLower)) {
      linkedinUrl = itemUrl.split('?')[0];
    }

    // Require the SERP snippet/title to actually reference the candidate's distinctive brand keyword
    // so Google fallback results for generic city+niche terms don't pollute website or phone.
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
      if (isValidCompanyDomain(candidateDomain)) {
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

  const callPeopleMatch = async (payload) => {
    const res = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
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

  let person = await callPeopleMatch({
    first_name: candidate.founder_first_name,
    last_name: candidate.founder_last_name,
    organization_name: effectiveOrgName,
    domain: effectiveDomain,
    linkedin_url: pdlHints?.linkedinUrl || undefined,
    city: candidate.city,
    state: 'Florida',
    country: 'United States'
  });

  // Fallback: If brand-new LLC name didn't match in Apollo (or returned a low-confidence nationwide guess),
  // search Apollo's free /v1/mixed_people/api_search in the candidate's South Florida city.
  if (!person || person.result !== 'Matched' || person.match_confidence === 'low') {
    try {
      const searchRes = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey
        },
        body: JSON.stringify({
          q_person_name: `${candidate.founder_first_name} ${candidate.founder_last_name}`.trim(),
          person_locations: [`${candidate.city}, Florida`],
          per_page: 5
        })
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json().catch(() => ({}));
        const people = Array.isArray(searchData?.people) ? searchData.people : [];
        const matchingCandidate = people.find(p =>
          p.id &&
          (p.has_email || p.has_direct_phone === 'Yes') &&
          doesOrgMatchCandidate(p.organization?.name, candidate.business_name_clean)
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
  const orgMatchesCandidate = doesOrgMatchCandidate(orgName, candidate.business_name_clean);
  const isFloridaPerson = personState === 'florida' || personState === 'fl';
  const matchConfidence = String(person.match_confidence || '').toLowerCase();

  // Reject low-confidence nationwide guesses that lack verified Florida location or matching organization
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

  // If the matched person's organization doesn't match the newly filed Sunbiz LLC,
  // never use a corporate email from an unrelated employer; only allow personal email providers
  // when the person is confirmed in the exact same Florida city with medium/high confidence.
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

  // Only keep organization HQ phone/website if the organization actually matches the candidate
  const rawPersonalPhone = person.phone_numbers?.[0]?.sanitized_number;
  const personalPhone = (typeof rawPersonalPhone === 'string' && /\d{7,}/.test(rawPersonalPhone) && (isFloridaPerson || orgMatchesCandidate))
    ? rawPersonalPhone
    : null;
  const rawOrgPhone = orgMatchesCandidate ? person.organization?.primary_phone?.sanitized_number : null;
  const orgPhone = (typeof rawOrgPhone === 'string' && /\d{7,}/.test(rawOrgPhone)) ? rawOrgPhone : null;
  const phone = personalPhone || orgPhone;
  const rawOrgWebsite = orgMatchesCandidate ? normalizeDomain(person.organization?.website_url || '') : '';
  const website = isValidCompanyDomain(rawOrgWebsite) ? rawOrgWebsite : '';

  return {
    found: Boolean(email || phone),
    email,
    phone,
    website,
    matchedOrg: orgName || null,
    matchConfidence: matchConfidence || null,
    linkedinUrl: typeof person.linkedin_url === 'string' ? person.linkedin_url : null
  };
}

async function lookupViaPdl(candidate, apiKey) {
  const baseParams = {
    first_name: candidate.founder_first_name || '',
    last_name: candidate.founder_last_name || '',
    locality: candidate.city || '',
    region: 'florida',
    country: 'united states',
    min_likelihood: '6'
  };

  const queryPdl = async (extraParams = {}) => {
    const params = new URLSearchParams({ ...baseParams, ...extraParams });
    return fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'Accept': 'application/json'
      }
    });
  };

  // Strip apartment/unit/suite numbers so residential unit formatting doesn't cause false 404s
  const cleanStreet = String(candidate.principal_address || '')
    .replace(/\s+\b(apt|apartment|unit|ste|suite|bldg|building|fl|floor|rm|room|#)\b.*$/i, '')
    .replace(/\s+\d{3,5}$/, '')
    .trim();

  let res = await queryPdl(
    cleanStreet
      ? { street_address: cleanStreet, ...(candidate.zip ? { postal_code: candidate.zip } : {}) }
      : {}
  );

  // If street_address caused a 404 (person's home street address not indexed in PDL), retry with locality + region
  if (res.status === 404 && cleanStreet) {
    res = await queryPdl({});
  }

  if (res.status === 404) return { found: false, personMatched: false };
  if (!res.ok) throw new Error(`PDL HTTP ${res.status}`);

  const body = await res.json().catch(() => ({}));
  const data = body?.data || body;

  // Note: PDL free/starter tiers return boolean `true` when a field exists but is masked.
  // Only accept actual string values containing '@' (for email) or >=7 digits (for phone).
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
// 6. Authentic Owner-to-Owner Outreach Email Templates (DataForSEO Calibrated)
// ---------------------------------------------------------------------------
export const OUTREACH_TEMPLATES = {
  launchpad_mockup: {
    id: 'launchpad_mockup',
    name: '🤝 Default: Direct Owner-to-Owner + Industry Lingo Question',
    subject: '{{business_name_clean}}',
    body: `Hi {{first_name}}, I saw you recently incorporated {{business_name_clean}}.

I see {{searchers_count}} people a month are searching for {{service_term}} online around {{city}} ({{lingo_services}}). {{lingo_question}}

Let me know,

Christian`
  },

  local_demand_snapshot: {
    id: 'local_demand_snapshot',
    name: '⚡ Angle 2: Ultra-Short Exact Baseline (3 Sentences)',
    subject: 'Quick question re: {{business_name_clean}}',
    body: `Hi {{first_name}}, I saw you recently incorporated {{business_name_clean}}.

I see {{searchers_count}} people are searching for {{service_term}} online. Could you use any more leads from online channels?

Let me know,

Christian`
  },

  short_neighbor: {
    id: 'short_neighbor',
    name: '📍 Angle 3: Local South FL Owner Intro + Capacity Check',
    subject: '{{first_name}} / {{business_name_clean}}',
    body: `Hi {{first_name}}, saw {{business_name_clean}} come through on the new {{city}} filings—congrats on getting it up and running.

There are roughly {{searchers_count}} local searches a month right now for {{lingo_services}}. Are you guys taking on more work from online channels yet, or still getting settled in?

Let me know,

Christian`
  }
};

export function renderOutreachTemplate(templateId, candidate) {
  const tpl = OUTREACH_TEMPLATES[templateId] || OUTREACH_TEMPLATES.launchpad_mockup;
  const firstName = candidate.founder_first_name || (candidate.founder_name || 'there').split(' ')[0];
  const businessClean = candidate.business_name_clean || cleanBusinessName(candidate.business_name) || 'your business';
  const city = candidate.city || 'South Florida';
  const county = candidate.county || 'Broward County';
  const niche = candidate.niche || 'Local Business';
  const nicheLower = niche === 'Local Business' ? 'local services' : niche.toLowerCase();

  const nicheMeta = getNicheOutreachMeta(niche, county);

  // Allow live override if enrichment_meta has live_search_volume from DataForSEO
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

  const vars = {
    first_name: firstName,
    founder_name: candidate.founder_name || firstName,
    business_name: candidate.business_name || businessClean,
    business_name_clean: businessClean,
    city,
    county,
    niche,
    niche_lower: nicheLower,
    service_term: nicheMeta.serviceTerm,
    lingo_services: nicheMeta.lingoServices,
    lingo_question: nicheMeta.lingoQuestion,
    searchers_count: searchersFormatted,
    doc_number: candidate.doc_number || ''
  };

  const replaceVars = (str) => String(str).replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : '');

  return {
    templateId: tpl.id,
    subject: replaceVars(tpl.subject),
    body: replaceVars(tpl.body)
  };
}

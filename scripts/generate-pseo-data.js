const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const niches = [
  {
    slug: 'roofers',
    name: 'Roofing Contractors',
    singular: 'Roofing Contractor',
    serviceType: 'Roofing Services',
    description: 'residential and commercial roof replacements, repairs, leak detection, and maintenance.'
  },
  {
    slug: 'hvac',
    name: 'HVAC Specialists',
    singular: 'HVAC Contractor',
    serviceType: 'HVAC Services',
    description: 'air conditioning repairs, furnace installations, heat pump tuning, and air quality audits.'
  },
  {
    slug: 'plumbers',
    name: 'Plumbing Experts',
    singular: 'Plumbing Service',
    serviceType: 'Plumbing Services',
    description: 'emergency drain cleaning, water heater installations, pipe leak repairs, and commercial plumbing.'
  },
  {
    slug: 'electricians',
    name: 'Electrical Contractors',
    singular: 'Electrician',
    serviceType: 'Electrical Services',
    description: 'panel upgrades, residential wiring, commercial lighting, generator setups, and emergency repairs.'
  },
  {
    slug: 'landscapers',
    name: 'Landscape Designers',
    singular: 'Landscaping Service',
    serviceType: 'Landscaping Services',
    description: 'custom patio installations, landscape lighting, sod installations, tree care, and weekly lawn maintenance.'
  }
];

const cities = [
  // Florida
  {
    name: 'Miramar',
    stateAbbr: 'FL',
    state: 'Florida',
    county: 'Broward County',
    localDetails: 'sub-tropical climate, high hurricane wind codes, and heavy seasonal summer rains',
     landmark: 'Miramar Regional Park'
  },
  {
    name: 'Pembroke Pines',
    stateAbbr: 'FL',
    state: 'Florida',
    county: 'Broward County',
    localDetails: 'sub-tropical humidity, intense sun exposure, and strict HOA building guidelines',
    landmark: 'C.B. Smith Park'
  },
  {
    name: 'Hollywood',
    stateAbbr: 'FL',
    state: 'Florida',
    county: 'Broward County',
    localDetails: 'coastal salt-air corrosion, high water table, and historical commercial district standards',
    landmark: 'Hollywood Beach Broadwalk'
  },
  {
    name: 'Davie',
    stateAbbr: 'FL',
    state: 'Florida',
    county: 'Broward County',
    localDetails: 'semi-rural acreage, horse farm drainage needs, and rapid college town commercial expansion',
    landmark: 'Bergeron Rodeo Grounds'
  },
  {
    name: 'Miami Lakes',
    stateAbbr: 'FL',
    state: 'Florida',
    county: 'Miami-Dade County',
    localDetails: 'planned community aesthetics, strict architectural control committees, and limestone base layers',
    landmark: 'Main Street Miami Lakes'
  },
  // Ontario
  {
    name: 'Toronto',
    stateAbbr: 'ON',
    state: 'Ontario',
    county: 'Greater Toronto Area',
    localDetails: 'harsh winter freeze-thaw cycles, heavy lake-effect snow loads, and dense metropolitan building codes',
    landmark: 'CN Tower'
  },
  {
    name: 'Mississauga',
    stateAbbr: 'ON',
    state: 'Ontario',
    county: 'Peel Region',
    localDetails: 'rapid industrial development, massive transit corridor requirements, and varying suburban soil compositions',
    landmark: 'Celebration Square'
  },
  {
    name: 'Oakville',
    stateAbbr: 'ON',
    state: 'Ontario',
    county: 'Halton Region',
    localDetails: 'historic lakeside aesthetic regulations, premium residential property requirements, and strict urban tree canopy bylaws',
    landmark: 'Oakville Harbour'
  },
  {
    name: 'Vaughan',
    stateAbbr: 'ON',
    state: 'Ontario',
    county: 'York Region',
    localDetails: 'high-density business park logistics, clay-heavy soils, and rapid suburban commercial construction standards',
    landmark: 'Canada\'s Wonderland'
  },
  {
    name: 'Richmond Hill',
    stateAbbr: 'ON',
    state: 'Ontario',
    county: 'York Region',
    localDetails: 'Oak Ridges Moraine environmental protection acts, steep grading drainage regulations, and premium residential design aesthetics',
    landmark: 'David Dunlap Observatory'
  }
];

function generatePainPoints(nicheSlug, city) {
  const isFL = city.stateAbbr === 'FL';
  if (nicheSlug === 'roofers') {
    return isFL
      ? `Given ${city.name}'s susceptibility to tropical storms and intense UV degradation, local roofers must adhere to rigid South Florida Building Codes. We focus on ranking you for high-ticket metal and tile roof replacements.`
      : `With ${city.name}'s heavy snow accumulation and seasonal freeze-thaw cycles, ice damming is a primary concern for local property owners. We capture high-intent searches for leak detection, structural repair, and winter roofing prep.`;
  }
  if (nicheSlug === 'hvac') {
    return isFL
      ? `In ${city.name}, high humidity puts extreme strain on air conditioning coils and compressor units year-round. Our SEO strategy targets homeowners facing sudden system failures who need immediate, same-day repairs.`
      : `From humid summers to sub-zero winter temperatures, ${city.name} homes require highly efficient, dual-season heat pumps and furnace systems. We target customers searching for heating updates and energy efficiency audits.`;
  }
  if (nicheSlug === 'plumbers') {
    return isFL
      ? `The high water table and sandy soil in ${city.name} make slab leaks and main line sewer backups a frequent issue. We target emergency plumbing queries to book jobs for you instantly.`
      : `Winter freezes in ${city.name} regularly lead to burst copper pipes and water heater breakdowns. We optimize your local presence to capture high-margin emergency service requests during temperature drops.`;
  }
  if (nicheSlug === 'electricians') {
    return isFL
      ? `Frequent lightning strikes and storm surges in ${city.name} demand robust whole-home surge protection and standby generator setups. We rank your services for generator installs and panel upgrades.`
      : `${city.name}'s older housing stock requires Knob & Tube remediation, aluminum wiring upgrades, and EV charger installations. We structure your SEO to capture modern home electrification projects.`;
  }
  if (nicheSlug === 'landscapers') {
    return isFL
      ? `Maintaining turf quality against aggressive weeds, chinch bugs, and dry winter spells in ${city.name} requires expert local knowledge. We drive leads for landscape design, sod installation, and commercial contracts.`
      : `Developing custom brick patios, outdoor kitchens, and grading yards to prevent ice accumulation are primary requirements in ${city.name}. We rank you for hardscaping and spring cleanup projects.`;
  }
  return '';
}

const records = [];

for (const city of cities) {
  for (const niche of niches) {
    const slug = `${niche.slug}-in-${city.name.toLowerCase().replace(/\s+/g, '-')}-${city.stateAbbr.toLowerCase()}`;
    const title = `Digital Marketing & SEO for ${niche.name} in ${city.name}, ${city.stateAbbr} | G3Z Creative`;
    const metaDescription = `Grow your ${niche.singular.toLowerCase()} business in ${city.name}, ${city.stateAbbr}. G3Z Creative drives qualified local leads with custom websites and programmatic SEO.`;
    const painPoints = generatePainPoints(niche.slug, city);
    
    records.push({
      slug,
      title,
      metaDescription,
      city: `${city.name}, ${city.stateAbbr}`,
      cityName: city.name,
      state: city.state,
      stateAbbr: city.stateAbbr,
      county: city.county,
      nicheName: niche.name,
      nicheSingular: niche.singular,
      nicheSlug: niche.slug,
      serviceType: niche.serviceType,
      description: niche.description,
      localDetails: city.localDetails,
      landmark: city.landmark,
      painPoints
    });
  }
}

fs.writeFileSync(path.join(DATA_DIR, 'pseo-data.json'), JSON.stringify(records, null, 2), 'utf8');
console.log(`Successfully generated ${records.length} programmatic data rows in data/pseo-data.json`);

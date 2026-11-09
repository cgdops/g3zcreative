/**
 * Lead Enrichment Provider
 *
 * Resolves a lead's email from first name + last name + company domain.
 * Hunter.io is the only provider today; ENRICHMENT_PROVIDER selects it so a
 * second one can be added without touching the endpoint.
 *
 * Nothing here writes to the database, and nothing here decides that a result
 * is good enough to use. It returns what the provider said, and the caller
 * presents it for confirmation.
 */

const HUNTER_BASE = 'https://api.hunter.io/v2';

/**
 * Domains that are search engines, directories, social networks, registries, or
 * consumer webmail providers — never valid as a B2B company website domain.
 */
export const NON_COMPANY_DOMAINS = /(^|\.)(google\.com|gstatic\.com|googleapis\.com|goo\.gl|youtube\.com|youtu\.be|bing\.com|yahoo\.com|duckduckgo\.com|apple\.com|icloud\.com|outlook\.com|hotmail\.com|live\.com|msn\.com|aol\.com|gmail\.com|protonmail\.com|comcast\.net|att\.net|verizon\.net|sunbiz\.org|floridados\.gov|myfloridalicense\.com|flhealthsource\.gov|bizprofile\.net|opencorporates\.com|corporationwiki\.com|bizapedia\.com|company-information\.service\.gov\.uk|yelp\.com|facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|pinterest\.com|nextdoor\.com|reddit\.com|bbb\.org|yellowpages\.com|superpages\.com|mapquest\.com|manta\.com|chamberofcommerce\.com|merchantcircle\.com|angi\.com|homeadvisor\.com|thumbtack\.com|porch\.com|buildzoom\.com|houzz\.com|bark\.com|networx\.com|birdeye\.com|trustpilot\.com|dnb\.com|buzzfile\.com|zoominfo\.com|rocketreach\.co|apollo\.io|signalhire\.com|lusha\.com|contactout\.com|hunter\.io|peopledatalabs\.com|whitepages\.com|fastpeoplesearch\.com|truepeoplesearch\.com|spokeo\.com|beenverified\.com|radaris\.com|clustrmaps\.com|officialusa\.com|npidb\.org|npino\.com|hipaaspace\.com|healthgrades\.com|vitals\.com|zocdoc\.com|webmd\.com|psychologytoday\.com|care\.com|wikipedia\.org|wikidata\.org)$/i;

export function isValidCompanyDomain(input) {
  const d = normalizeDomain(input);
  if (!d) return false;
  if (NON_COMPANY_DOMAINS.test(d)) return false;
  if (/\.(gov|mil|edu)$/i.test(d)) return false;
  return true;
}

/**
 * Split a single `name` column into first/last. The schema has no separate
 * fields, so this is best-effort: a middle name or initial is dropped, and
 * anything that doesn't yield two parts is rejected rather than guessed at.
 */
export function splitName(fullName) {
  const cleaned = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (cleaned.length < 2) {
    return { ok: false, error: 'Need both a first and last name to enrich.' };
  }

  // Drop trailing suffixes and middle initials so the provider gets a clean pair.
  const suffixes = /^(jr|sr|ii|iii|iv|md|phd|esq|cpa|pa|pllc|llc|inc)\.?$/i;
  const words = cleaned.filter(w => !suffixes.test(w));
  const withoutInitials = words.filter((w, i) => i === 0 || i === words.length - 1 || !/^[A-Za-z]\.?$/.test(w));

  if (withoutInitials.length < 2) {
    return { ok: false, error: 'Need both a first and last name to enrich.' };
  }

  return {
    ok: true,
    firstName: withoutInitials[0],
    lastName: withoutInitials[withoutInitials.length - 1]
  };
}

/**
 * Normalize whatever was typed into the domain field. Accepts a bare domain,
 * a URL, or an email address.
 */
export function normalizeDomain(input) {
  let value = String(input || '').trim().toLowerCase();
  if (!value) return '';
  if (value.includes('@')) value = value.split('@').pop();
  value = value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value) ? value : '';
}

/**
 * Look up a company's domain by name. Separate call, separate cost — the
 * endpoint only reaches for this when no domain is stored on the lead.
 */
async function hunterDomainSearch(companyName, apiKey) {
  const url = `${HUNTER_BASE}/domain-search?company=${encodeURIComponent(companyName)}&limit=1&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = body?.errors?.[0]?.details || `Hunter domain search failed (${res.status})`;
    throw new Error(message);
  }

  const candidateDomain = body?.data?.domain ? normalizeDomain(body.data.domain) : '';
  return isValidCompanyDomain(candidateDomain) ? candidateDomain : '';
}

/**
 * Find an email for a person at a domain.
 * Returns { status, email, confidence, ... } — `not_found` is a normal
 * outcome, not an error.
 */
async function hunterEmailFinder({ firstName, lastName, domain }, apiKey) {
  const url = `${HUNTER_BASE}/email-finder`
    + `?domain=${encodeURIComponent(domain)}`
    + `&first_name=${encodeURIComponent(firstName)}`
    + `&last_name=${encodeURIComponent(lastName)}`
    + `&api_key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = body?.errors?.[0]?.details || `Hunter email finder failed (${res.status})`;
    throw new Error(message);
  }

  const data = body?.data || {};

  if (!data.email) {
    return {
      status: 'not_found',
      email: null,
      confidence: null,
      verification: null,
      jobTitle: null,
      linkedinUrl: null,
      domain,
      raw: body
    };
  }

  return {
    status: 'found',
    email: data.email,
    confidence: typeof data.score === 'number' ? data.score : null,
    verification: data.verification?.status || null,
    jobTitle: data.position || null,
    linkedinUrl: data.linkedin_url || null,
    domain,
    raw: body
  };
}

/**
 * Provider-agnostic entry point used by the enrich endpoint.
 *
 * @param {{ name: string, firstName?: string, lastName?: string, company: string, companyDomain: string }} lead
 * @param {object} env  Worker env (reads ENRICHMENT_API_KEY, ENRICHMENT_PROVIDER)
 */
export async function enrichLead(lead, env) {
  const provider = (env.ENRICHMENT_PROVIDER || 'hunter').toLowerCase();
  if (provider !== 'hunter') {
    throw new Error(`Unsupported enrichment provider: ${provider}`);
  }

  const apiKey = env.ENRICHMENT_API_KEY;
  if (!apiKey) {
    throw new Error('ENRICHMENT_API_KEY is not configured.');
  }

  let firstName = String(lead.firstName || '').trim();
  let lastName = String(lead.lastName || '').trim();
  if (!firstName || !lastName) {
    const nameParts = splitName(lead.name);
    if (!nameParts.ok) {
      const err = new Error(nameParts.error);
      err.userError = true;
      throw err;
    }
    firstName = firstName || nameParts.firstName;
    lastName = lastName || nameParts.lastName;
  }

  let domain = isValidCompanyDomain(lead.companyDomain) ? normalizeDomain(lead.companyDomain) : '';
  let domainResolved = false;

  if (!domain && lead.company) {
    domain = await hunterDomainSearch(lead.company, apiKey);
    domainResolved = Boolean(domain);
  }

  if (!domain) {
    const err = new Error('No company domain. Add a domain (or a company name Hunter can resolve) and try again.');
    err.userError = true;
    throw err;
  }

  const result = await hunterEmailFinder({
    firstName,
    lastName,
    domain
  }, apiKey);

  return { ...result, provider, domainResolved };
}

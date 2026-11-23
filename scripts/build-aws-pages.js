#!/usr/bin/env node
/**
 * Managed AWS South Florida Location Page Builder — G3Z Creative
 *
 * Reads data/aws-locations.json and templates/aws-location-template.html,
 * injects shared nav, footer, and author-bio templates at depth 2 (prefix '../../'),
 * and compiles static location pages into services/managed-aws/<slug>.html.
 *
 * Run: node scripts/build-aws-pages.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'aws-locations.json');
const TEMPLATE_FILE = path.join(ROOT, 'templates', 'aws-location-template.html');
const NAV_FILE = path.join(ROOT, 'templates', 'nav.html');
const FOOTER_FILE = path.join(ROOT, 'templates', 'footer.html');
const AUTHOR_FILE = path.join(ROOT, 'templates', 'author-bio.html');
const OUTPUT_DIR = path.join(ROOT, 'services', 'managed-aws');

const PREFIX = '../../';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildServiceSchema(loc) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      '@id': `https://g3zcreative.com/services/managed-aws/${loc.slug}#service`,
      name: `G3Z Creative — Managed AWS Cloud Services in ${loc.city}, ${loc.stateAbbr}`,
      serviceType: 'Managed AWS Cloud Services',
      description: loc.metaDescription,
      url: `https://g3zcreative.com/services/managed-aws/${loc.slug}`,
      telephone: '+1-786-967-3699',
      email: 'hello@g3zcreative.com',
      priceRange: '$1,500-$3,500+/mo',
      image: 'https://g3zcreative.com/images/webclip.png',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '2751 SW 116th Ave',
        addressLocality: 'Miramar',
        addressRegion: 'FL',
        postalCode: '33025',
        addressCountry: 'US'
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: loc.geo.lat,
        longitude: loc.geo.lng
      },
      provider: {
        '@type': 'Organization',
        '@id': 'https://g3zcreative.com/#organization',
        name: 'G3Z Creative',
        url: 'https://g3zcreative.com/'
      },
      areaServed: [
        { '@type': 'City', name: loc.city },
        { '@type': 'AdministrativeArea', name: loc.county },
        { '@type': 'State', name: loc.state }
      ],
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: `Managed AWS Cloud Solutions in ${loc.city}, ${loc.stateAbbr}`,
        itemListElement: [
          {
            '@type': 'Offer',
            name: 'AWS Architecture & FinOps Audit',
            price: '1500',
            priceCurrency: 'USD',
            itemOffered: {
              '@type': 'Service',
              name: 'AWS Well-Architected & FinOps Cost Audit',
              description: '6-pillar AWS security, resilience, and cost-reduction audit with a prioritized 90-day roadmap.'
            }
          },
          {
            '@type': 'Offer',
            name: 'Managed AWS Core',
            price: '1500',
            priceCurrency: 'USD',
            itemOffered: {
              '@type': 'Service',
              name: 'Managed AWS Core Retainer',
              description: '24/7 CloudWatch monitoring, automated backups and patching, IAM hardening, and monthly FinOps.'
            }
          },
          {
            '@type': 'Offer',
            name: 'Managed AWS Scale & Compliance',
            price: '3500',
            priceCurrency: 'USD',
            itemOffered: {
              '@type': 'Service',
              name: 'Managed AWS Scale & Compliance Retainer',
              description: 'Multi-AZ and cross-region hurricane DR, Terraform IaC, CI/CD, HIPAA/SOC 2/PCI guardrails, and ECS/EKS/Bedrock operations.'
            }
          }
        ]
      }
    },
    null,
    2
  );
}

function buildFaqSchema(loc) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `https://g3zcreative.com/services/managed-aws/${loc.slug}#faq`,
      mainEntity: loc.faqs.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a
        }
      }))
    },
    null,
    2
  );
}

function buildBreadcrumbSchema(loc) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://g3zcreative.com/' },
        { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://g3zcreative.com/services/' },
        { '@type': 'ListItem', position: 3, name: 'Managed AWS Cloud', item: 'https://g3zcreative.com/services/managed-aws/' },
        {
          '@type': 'ListItem',
          position: 4,
          name: `${loc.city}, ${loc.stateAbbr}`,
          item: `https://g3zcreative.com/services/managed-aws/${loc.slug}`
        }
      ]
    },
    null,
    2
  );
}

function buildIndustryCards(loc) {
  return loc.keyIndustries
    .map(
      (ind) => `        <article class="aws-card">
          <div>
            <div class="aws-icon-box"><span class="material-symbols-outlined">domain</span></div>
            <h3>${escapeHtml(ind.name)}</h3>
            <p>${escapeHtml(ind.workload)}</p>
          </div>
        </article>`
    )
    .join('\n');
}

function buildFaqItems(loc) {
  return loc.faqs
    .map(
      (item) => `        <div class="aws-faq-item">
          <h3>${escapeHtml(item.q)}</h3>
          <p>${escapeHtml(item.a)}</p>
        </div>`
    )
    .join('\n');
}

function buildNearbyLinks(loc, bySlug) {
  return loc.nearbySlugs
    .filter((slug) => bySlug.has(slug))
    .map((slug) => {
      const target = bySlug.get(slug);
      return `            <li><a href="${target.slug}.html" style="color: #475569; text-decoration: none;">Managed AWS in ${escapeHtml(target.city)}, ${escapeHtml(target.stateAbbr)}</a></li>`;
    })
    .join('\n');
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const locations = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  const nav = fs.readFileSync(NAV_FILE, 'utf8').trim().replace(/\{\{prefix\}\}/g, PREFIX);
  const footer = fs.readFileSync(FOOTER_FILE, 'utf8').trim().replace(/\{\{prefix\}\}/g, PREFIX);
  const authorBio = fs.existsSync(AUTHOR_FILE)
    ? fs.readFileSync(AUTHOR_FILE, 'utf8').trim().replace(/\{\{prefix\}\}/g, PREFIX)
    : '';

  const bySlug = new Map(locations.map((l) => [l.slug, l]));
  let built = 0;

  for (const loc of locations) {
    const replacements = {
      nav,
      footer,
      authorBio,
      slug: loc.slug,
      title: escapeHtml(loc.title),
      metaDescription: escapeHtml(loc.metaDescription),
      h1: escapeHtml(loc.h1),
      badge: escapeHtml(loc.badge),
      heroSubheading: escapeHtml(loc.heroSubheading),
      city: escapeHtml(loc.city),
      county: escapeHtml(loc.county),
      stateAbbr: escapeHtml(loc.stateAbbr),
      businessCorridors: escapeHtml(loc.businessCorridors),
      complianceFocus: escapeHtml(loc.complianceFocus),
      localPainPoint: escapeHtml(loc.localPainPoint),
      localSolutionAngle: escapeHtml(loc.localSolutionAngle),
      drAndLatencyNote: escapeHtml(loc.drAndLatencyNote),
      industryCardsHtml: buildIndustryCards(loc),
      faqItemsHtml: buildFaqItems(loc),
      nearbyLinksHtml: buildNearbyLinks(loc, bySlug),
      serviceSchemaJson: buildServiceSchema(loc),
      faqSchemaJson: buildFaqSchema(loc),
      breadcrumbSchemaJson: buildBreadcrumbSchema(loc)
    };

    let html = template;
    for (const [key, val] of Object.entries(replacements)) {
      html = html.split(`{{${key}}}`).join(val);
    }

    const unresolved = html.match(/\{\{[^}]+\}\}/g);
    if (unresolved) {
      throw new Error(`Unresolved template tokens in ${loc.slug}: ${unresolved.join(', ')}`);
    }

    // Validate all JSON-LD scripts parse cleanly
    const ldMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    for (const m of ldMatches) {
      JSON.parse(m[1]);
    }

    const outPath = path.join(OUTPUT_DIR, `${loc.slug}.html`);
    fs.writeFileSync(outPath, html, 'utf8');
    built++;
  }

  console.log(`✓ Built ${built} Managed AWS South Florida location pages in ${path.relative(ROOT, OUTPUT_DIR)}`);
}

main();

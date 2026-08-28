const fs = require('fs');
const path = require('path');

const SERVICES_DIR = path.join(__dirname, '..', 'services');
const TEMPLATE_PAGE = path.join(SERVICES_DIR, 'website-development-miramar.html');

const pagesToBuild = [
  {
    filename: 'digital-marketing-miramar.html',
    title: 'Miramar Digital Marketing Agency | #1 ROI-Driven Marketing | G3Z Creative',
    metaDesc: 'Looking for the top digital marketing agency in Miramar, FL? G3Z Creative drives high-intent customer leads with custom SEO, web design, and Google Ads. Free audit!',
    canonical: 'https://g3zcreative.com/services/digital-marketing-miramar',
    serviceType: 'Digital Marketing Agency',
    h1: 'Top-Rated Miramar Digital Marketing Agency',
    subheading: 'Stop losing high-intent local customers to competitors. G3Z Creative delivers custom search engine optimization, high-speed website design, and high-ROI Google Ads campaigns engineered for businesses in Miramar and South Florida.',
    primaryCity: 'Miramar, FL',
    challenge1: { title: 'Invisible to Local Buyers', desc: 'Your business isn\'t appearing in the top 3 Google Maps positions or organic Page 1 when customers search for your services in Miramar.' },
    challenge2: { title: 'Wasted Ad Spend', desc: 'PPC campaigns draining your budget with unqualified clicks and zero attributable phone calls or booked appointments.' },
    challenge3: { title: 'Low-Converting Website', desc: 'Visitors land on your page and bounce immediately because the design is slow, cluttered, or lacks a clear call-to-action.' },
    serviceCards: [
      { title: 'Local & Programmatic SEO', desc: 'Rank #1 across Miramar, Pembroke Pines, and South Florida for high-intent search queries that drive paying customers.' },
      { title: 'Custom Web Design', desc: 'Modern, mobile-first websites with 100/100 Lighthouse speed scores engineered specifically to convert local traffic into leads.' },
      { title: 'Google Ads & PPC Management', desc: 'Hyper-targeted search campaigns that capture ready-to-buy customers at the lowest cost per acquisition.' },
      { title: 'Google Business Profile Domination', desc: 'Comprehensive GBP optimization, local citation building, and review acquisition to dominate Google Maps 3-packs.' }
    ],
    faqs: [
      { q: 'Why choose G3Z Creative as your Miramar digital marketing agency?', a: 'Unlike generic national agencies, G3Z Creative is based right here in Miramar, FL. We build custom high-speed web assets and ROI-driven search campaigns tailored specifically to the South Florida market.' },
      { q: 'How quickly can I see results from digital marketing in Miramar?', a: 'Google Ads and Google Business Profile optimizations can generate calls within 7 to 14 days. Organic SEO and programmatic landing pages typically compound over 30 to 90 days to deliver consistent inbound leads.' },
      { q: 'What industries do you serve in Miramar and Broward County?', a: 'We specialize in local service businesses, home contractors (roofing, HVAC, plumbing), professional practices (legal, medical, accounting), and B2B companies across Miramar and South Florida.' }
    ]
  },
  {
    filename: 'digital-marketing-pembroke-pines.html',
    title: 'Digital Marketing Agency Pembroke Pines FL | G3Z Creative',
    metaDesc: 'Dominate search results in Pembroke Pines. G3Z Creative is your local digital marketing agency for custom SEO, high-converting web design, and Google Ads.',
    canonical: 'https://g3zcreative.com/services/digital-marketing-pembroke-pines',
    serviceType: 'Digital Marketing Agency',
    h1: 'Pembroke Pines Digital Marketing Agency',
    subheading: 'Capture ready-to-buy customers across Pembroke Pines and Southwest Broward. We build high-performance digital marketing systems that turn local search traffic into booked clients.',
    primaryCity: 'Pembroke Pines, FL',
    challenge1: { title: 'Local Search Invisibility', desc: 'Competitors are capturing all the top Google Maps and organic spots in Pembroke Pines and surrounding neighborhoods.' },
    challenge2: { title: 'High Cost Per Lead', desc: 'Generic ad agencies driving up your cost per click without delivering verified, high-ticket customer appointments.' },
    challenge3: { title: 'Outdated Web Presence', desc: 'Your website fails to communicate trust, authority, and modern responsiveness to discerning Pembroke Pines residents.' },
    serviceCards: [
      { title: 'Pembroke Pines Local SEO', desc: 'Dominate localized searches like "services near me" and geographic keywords across Pembroke Pines and Pines Blvd corridors.' },
      { title: 'Conversion-First Web Design', desc: 'High-speed, beautiful websites designed to turn local visitors into phone calls and quote requests.' },
      { title: 'Targeted Local PPC', desc: 'Precise Google Ads campaigns targeting high-income zip codes and ready-to-buy local searchers.' },
      { title: 'Reputation & Review Growth', desc: 'Automated review capture systems to build 5-star social proof on Google and Yelp.' }
    ],
    faqs: [
      { q: 'How does G3Z Creative help businesses rank in Pembroke Pines?', a: 'We optimize your local SEO footprint, Google Business Profile, high-intent localized content, and schema markup to ensure your business captures top spots in Pembroke Pines search results.' },
      { q: 'Do you offer monthly marketing packages?', a: 'Yes, we provide transparent, performance-focused monthly digital marketing and SEO growth retainers with zero long-term lock-in.' }
    ]
  },
  {
    filename: 'google-ads-miramar.html',
    title: 'Google Ads Agency Miramar FL | PPC & Search Ads | G3Z Creative',
    metaDesc: 'Stop wasting money on bad clicks. Partner with G3Z Creative for high-ROI Google Ads management and PPC campaigns in Miramar, FL. Get a free audit!',
    canonical: 'https://g3zcreative.com/services/google-ads-miramar',
    serviceType: 'Google Ads Management',
    h1: 'Google Ads & PPC Management in Miramar, FL',
    subheading: 'Turn paid search into predictable revenue. We design, manage, and optimize hyper-targeted Google Ads campaigns that capture high-intent buyer searches at the lowest cost per call.',
    primaryCity: 'Miramar, FL',
    challenge1: { title: 'Click Fraud & Junk Leads', desc: 'Paying for clicks from price-shoppers, competitors, and bots that never turn into paying customers.' },
    challenge2: { title: 'Poor Quality Scores', desc: 'Low Google Quality Scores driving up your average CPC and pushing your ads below competitors.' },
    challenge3: { title: 'Unoptimized Landing Pages', desc: 'Sending expensive paid traffic to slow, generic homepages that fail to convert visitors into phone calls.' },
    serviceCards: [
      { title: 'Search & Call-Only Ads', desc: 'Target bottom-of-funnel searchers actively seeking emergency or high-ticket services in Miramar and South Florida.' },
      { title: 'Dedicated Landing Page Funnels', desc: 'Custom, high-speed landing pages with 100/100 Lighthouse scores engineered exclusively to convert ad clicks.' },
      { title: 'Negative Keyword Scrubbing', desc: 'Aggressive negative keyword filtering to eliminate wasted ad spend on irrelevant search terms.' },
      { title: 'Full Conversion Tracking', desc: 'Direct call tracking, form submission attribution, and CRM revenue integration.' }
    ],
    faqs: [
      { q: 'How much should a small business spend on Google Ads in Miramar?', a: 'Most local service businesses see strong returns starting at $1,000 to $3,000 per month in ad spend, paired with our conversion-engineered landing pages.' },
      { q: 'How fast do Google Ads start generating leads?', a: 'Google Ads can begin delivering qualified inbound phone calls within 24 to 48 hours of campaign launch.' }
    ]
  },
  {
    filename: 'graphic-design-pembroke-pines.html',
    title: 'Graphic Design & Branding Pembroke Pines FL | G3Z Creative',
    metaDesc: 'Elevate your brand with professional graphic design and logo creation in Pembroke Pines, FL. G3Z Creative builds memorable brand identities for businesses.',
    canonical: 'https://g3zcreative.com/services/graphic-design-pembroke-pines',
    serviceType: 'Graphic Design & Branding',
    h1: 'Graphic Design & Branding in Pembroke Pines, FL',
    subheading: 'Stand out from competitors with custom visual branding, modern logo design, and high-impact marketing collateral tailored for businesses in Pembroke Pines and South Florida.',
    primaryCity: 'Pembroke Pines, FL',
    challenge1: { title: 'Generic Visual Identity', desc: 'Using template logos or outdated graphics that fail to establish credibility with premium clients.' },
    challenge2: { title: 'Inconsistent Brand Assets', desc: 'Mismatched colors, typography, and styles across your website, social media, and printed collateral.' },
    challenge3: { title: 'Low Brand Recall', desc: 'Prospective customers forgetting your brand because your visual presence blends into the crowd.' },
    serviceCards: [
      { title: 'Custom Logo & Identity Design', desc: 'Distinctive, memorable brand marks designed with comprehensive typography and color guideline systems.' },
      { title: 'Digital & Social Media Graphics', desc: 'High-converting social ad creatives, banners, and digital assets tailored for maximum engagement.' },
      { title: 'Marketing & Print Collateral', desc: 'Brochures, business cards, vehicle wraps, and presentation decks built for professional impact.' },
      { title: 'Brand Strategy & Positioning', desc: 'Strategic messaging and visual positioning to attract high-value clients in your market.' }
    ],
    faqs: [
      { q: 'What is included in a G3Z Creative branding package?', a: 'Our branding packages include custom logo design, vector file formats, brand style guides, color palettes, typography rules, and social media/print templates.' },
      { q: 'How long does a graphic design project take?', a: 'Standard brand identity projects typically take 2 to 3 weeks from kickoff to final asset delivery.' }
    ]
  },
  {
    filename: 'social-media-marketing-miramar.html',
    title: 'Social Media Marketing Agency Miramar FL | G3Z Creative',
    metaDesc: 'Grow your reach and engage local customers. G3Z Creative delivers high-impact social media marketing and paid ads in Miramar, FL. Get a free consultation!',
    canonical: 'https://g3zcreative.com/services/social-media-marketing-miramar',
    serviceType: 'Social Media Marketing',
    h1: 'Social Media Marketing Agency in Miramar, FL',
    subheading: 'Turn social media into a reliable customer acquisition channel. We create engaging content, build community authority, and manage high-converting Meta and Instagram ad campaigns in Miramar.',
    primaryCity: 'Miramar, FL',
    challenge1: { title: 'Zero Engagement', desc: 'Posting content that receives no likes, comments, or actual customer inquiries from local residents.' },
    challenge2: { title: 'Inconsistent Posting', desc: 'Running out of time to create high-quality graphic assets and video reels consistently.' },
    challenge3: { title: 'Wasted Boosted Posts', desc: 'Clicking "Boost Post" without strategic audience targeting, funnel retargeting, or conversion tracking.' },
    serviceCards: [
      { title: 'Content Creation & Management', desc: 'Custom graphics, reels, and video storytelling tailored to your brand and published on a consistent schedule.' },
      { title: 'Targeted Meta & Instagram Ads', desc: 'Hyper-localized paid advertising campaigns designed to capture leads and booked consultations in Miramar.' },
      { title: 'Local Community Engagement', desc: 'Active community outreach, reputation monitoring, and direct message lead qualification.' },
      { title: 'Retargeting Funnels', desc: 'Re-engage website visitors and social followers with high-converting promotional offers.' }
    ],
    faqs: [
      { q: 'Which social media platforms should my Miramar business be on?', a: 'For most local B2C businesses, Instagram and Facebook drive the highest ROI. For B2B and professional services, LinkedIn and Google Business Profile are essential.' }
    ]
  },
  {
    filename: 'small-business-web-design.html',
    title: 'Small Business Web Design & Redesign Near Me | G3Z Creative',
    metaDesc: 'Need a custom small business website that ranks and converts? G3Z Creative builds high-speed websites and redesigns in Miramar, Pembroke Pines & South Florida.',
    canonical: 'https://g3zcreative.com/services/small-business-web-design',
    serviceType: 'Small Business Web Design',
    h1: 'Custom Small Business Web Design & Redesign',
    subheading: 'Your website should be your #1 lead generator. We design custom, high-speed websites engineered to rank on Google and convert local search traffic into paying customers.',
    primaryCity: 'Miramar & South Florida',
    challenge1: { title: 'Outdated & Slow Website', desc: 'Clunky templates with slow load times that fail Google Core Web Vitals and frustrate mobile visitors.' },
    challenge2: { title: 'Not Mobile Optimized', desc: 'Over 65% of local searches happen on mobile devices; a non-responsive design loses customers instantly.' },
    challenge3: { title: 'Zero Search Visibility', desc: 'A pretty website that nobody can find because it lacks technical SEO and schema markup.' },
    serviceCards: [
      { title: '100/100 Lighthouse Performance', desc: 'Lightning-fast load times on Cloudflare Edge that boost search rankings and maximize conversion rates.' },
      { title: 'Mobile-First UI/UX Design', desc: 'Flawless user experience across iPhones, Androids, tablets, and desktops.' },
      { title: 'Built-In Local SEO & Schema', desc: 'Complete on-page SEO, JSON-LD schema, and keyword optimization built directly into every page.' },
      { title: 'Lead Capture & CRM Sync', desc: 'Integrated click-to-call buttons, quote request forms, and automated CRM notifications.' }
    ],
    faqs: [
      { q: 'How much does a custom small business website cost?', a: 'We offer flexible packages starting from straightforward 5-page business websites to advanced programmatic SEO platforms with transparent pricing.' },
      { q: 'How long does a website redesign take?', a: 'Most small business website redesigns are completed and launched within 2 to 3 weeks.' }
    ]
  }
];

function generateHtml(page) {
  const faqSchema = page.faqs ? `
    {
      "@type": "FAQPage",
      "@id": "${page.canonical}#faq",
      "mainEntity": [
        ${page.faqs.map(f => `
        {
          "@type": "Question",
          "name": "${f.q.replace(/"/g, '\\"')}",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "${f.a.replace(/"/g, '\\"')}"
          }
        }`).join(',')}
      ]
    },` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${page.title}</title>
  <meta content="${page.metaDesc}" name="description">
  <meta content="${page.title}" property="og:title">
  <meta content="${page.metaDesc}" property="og:description">
  <meta content="https://cdn.prod.website-files.com/6837ae7e314e91dd48e1e240/683f4f74b41aa99bb6a4ed23_Web%20Development.jpg" property="og:image">
  <meta content="${page.title}" property="twitter:title">
  <meta content="${page.metaDesc}" property="twitter:description">
  <meta property="og:type" content="website">
  <meta content="summary_large_image" name="twitter:card">
  <meta content="width=device-width, initial-scale=1" name="viewport">
  <link href="../css/normalize.css" rel="stylesheet" type="text/css">
  <link href="../css/webflow.css" rel="stylesheet" type="text/css">
  <link href="../css/g3zc.webflow.css" rel="stylesheet" type="text/css">
  <link href="https://fonts.googleapis.com" rel="preconnect">
  <link href="https://fonts.gstatic.com" rel="preconnect" crossorigin="anonymous">
  <script src="https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js" type="text/javascript"></script>
  <script type="text/javascript">WebFont.load({ google: { families: ["Figtree:regular","Young Serif:regular"] } });</script>
  <link href="../images/favicon.png" rel="shortcut icon" type="image/x-icon">
  <link href="../images/webclip.png" rel="apple-touch-icon">
  <link href="${page.canonical}" rel="canonical">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined">
  <script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://www.g3zcreative.com/#organization",
      "name": "G3Z Creative",
      "url": "https://www.g3zcreative.com/",
      "logo": "https://cdn.prod.website-files.com/6837ae7e314e91dd48e1e240/6838992456d122a34dff9a62_Webclip-8.png",
      "telephone": "+17868300833",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "2751 SW 116th Ave, Suite 308",
        "addressLocality": "Miramar",
        "addressRegion": "FL",
        "postalCode": "33025",
        "addressCountry": "US"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "25.9860",
        "longitude": "-80.3036"
      },
      "areaServed": ["Miramar, FL", "Pembroke Pines, FL", "Hollywood, FL", "Davie, FL", "South Florida"]
    },
    {
      "@type": "Service",
      "@id": "${page.canonical}#service",
      "serviceType": "${page.serviceType}",
      "name": "${page.h1}",
      "description": "${page.subheading.replace(/"/g, '\\"')}",
      "url": "${page.canonical}",
      "provider": {
        "@id": "https://www.g3zcreative.com/#organization"
      },
      "areaServed": ["Miramar", "Pembroke Pines", "Hollywood", "Davie", "South Florida"]
    }${faqSchema ? ',' + faqSchema : ''}
  ]
}
</script>
</head>
<body>
  <header class="nav">
    <div data-duration="400" data-animation="default" data-easing2="ease" data-easing="ease" data-collapse="medium" role="banner" data-no-scroll="1" class="nav-container w-nav">
      <div class="nav-left">
        <a href="../index.html" class="nav-logo w-inline-block">
          <div class="nav-logo-icon"><img src="../images/g-brand-primary.svg" loading="lazy" width="Auto" height="38" alt="" class="logo-image"></div>
          <div class="paragraph-lg utility-margin-bottom-0">G3Z Creative</div>
        </a>
      </div>
      <div class="nav-center">
        <nav role="navigation" class="nav-menu w-nav-menu">
          <ul role="list" class="nav-menu-list w-list-unstyled">
            <li class="nav-menu-list-item"><a href="../index.html" class="nav-link w-inline-block"><div>Home</div></a></li>
            <li class="nav-menu-list-item"><a href="https://g3zcreative.com#about" class="nav-link w-inline-block"><div>About</div></a></li>
            <li class="nav-menu-list-item"><a href="../pricing.html" class="nav-link w-inline-block"><div>Pricing</div></a></li>
            <li class="nav-menu-list-item"><a href="../roi-calculator.html" class="nav-link w-inline-block"><div>ROI Calculator</div></a></li>
            <li class="nav-menu-list-item"><a href="https://g3zcreative.com#contact" class="nav-link w-inline-block"><div>Contact</div></a></li>
          </ul>
        </nav>
      </div>
      <div class="nav-right">
        <div class="button-group utility-margin-top-0">
          <a href="https://41a1zw.share-na2.hsforms.com/2iOcvXRtCSD6WiMajwyNmDA" target="_blank" class="button w-inline-block">
            <div class="button-label">Request a Quote</div>
          </a>
        </div>
      </div>
    </div>
  </header>

  <main>
    <!-- Hero Section -->
    <header class="section utility-overflow-hidden" style="padding-top: 4rem; padding-bottom: 3.5rem;">
      <div class="container">
        <div class="w-layout-grid grid-layout desktop-5-column tablet-1-column grid-gap-md y-center">
          <div class="utility-container-cqw" style="grid-column: span 3;">
            <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(218, 16, 77, 0.1); color: #da104d; font-weight: 700; font-size: 0.8rem; padding: 4px 12px; border-radius: 999px; margin-bottom: 1rem;">
              📍 Serving ${page.primaryCity} &amp; South Florida
            </div>
            <h1 class="heading-responsive-lg utility-margin-bottom-1rem" style="font-size: clamp(2.2rem, 3.5vw, 3.2rem); line-height: 1.15;">${page.h1}</h1>
            <p class="subheading" style="color: #475569; font-size: 1.1rem; line-height: 1.6; margin-bottom: 2rem;">${page.subheading}</p>
            <div class="button-group">
              <a href="https://meetings-na2.hubspot.com/christian-gomez" target="_blank" class="button w-button">Book a FREE Strategy Call</a>
              <a href="https://41a1zw.share-na2.hsforms.com/2iOcvXRtCSD6WiMajwyNmDA" target="_blank" class="button secondary-button w-button">Get a Fast Quote</a>
            </div>
          </div>
          <div style="grid-column: span 2; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">
            <div style="font-family: 'Young Serif', serif; font-size: 1.35rem; color: #0f172a; margin-bottom: 0.5rem;">Schedule Your Discovery Session</div>
            <p style="font-size: 0.88rem; color: #64748b; margin-bottom: 1.5rem;">See how we help businesses in ${page.primaryCity} dominate local search and turn web traffic into consistent revenue.</p>
            <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem; color: #334155;">
              <li style="display: flex; align-items: center; gap: 8px;">✓ <strong>100% Free</strong> Local SEO &amp; Website Audit</li>
              <li style="display: flex; align-items: center; gap: 8px;">✓ Competitor Ranking Analysis</li>
              <li style="display: flex; align-items: center; gap: 8px;">✓ Customized 90-Day Growth Plan</li>
            </ul>
            <a href="https://meetings-na2.hubspot.com/christian-gomez" target="_blank" class="button w-button" style="width: 100%; text-align: center; justify-content: center;">
              Claim Your Free Audit
            </a>
          </div>
        </div>
      </div>
    </header>

    <!-- Challenges Section -->
    <section class="section secondary-section" style="padding: 4rem 0;">
      <div class="container">
        <div class="utility-text-align-center utility-margin-bottom-3rem">
          <div class="eyebrow">The Bottlenecks Holding You Back</div>
          <h2 class="h2-heading">Common Marketing Challenges in ${page.primaryCity}</h2>
        </div>
        <div class="w-layout-grid grid-layout desktop-3-column tablet-1-column grid-gap-md utility-text-align-center">
          <div class="card card-body" style="background: #ffffff; padding: 2rem; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h3 class="h4-heading" style="color: #da104d; margin-bottom: 0.75rem;">${page.challenge1.title}</h3>
            <p style="color: #475569; font-size: 0.95rem; line-height: 1.6;">${page.challenge1.desc}</p>
          </div>
          <div class="card card-body" style="background: #ffffff; padding: 2rem; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h3 class="h4-heading" style="color: #da104d; margin-bottom: 0.75rem;">${page.challenge2.title}</h3>
            <p style="color: #475569; font-size: 0.95rem; line-height: 1.6;">${page.challenge2.desc}</p>
          </div>
          <div class="card card-body" style="background: #ffffff; padding: 2rem; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h3 class="h4-heading" style="color: #da104d; margin-bottom: 0.75rem;">${page.challenge3.title}</h3>
            <p style="color: #475569; font-size: 0.95rem; line-height: 1.6;">${page.challenge3.desc}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Services Core Section -->
    <section class="section" style="padding: 4.5rem 0;">
      <div class="container">
        <div class="utility-text-align-center utility-margin-bottom-3rem">
          <div class="eyebrow">Proven Growth Solutions</div>
          <h2 class="h2-heading">How G3Z Creative Drives Measurable Revenue</h2>
        </div>
        <div class="w-layout-grid grid-layout desktop-2-column tablet-1-column grid-gap-md">
          ${page.serviceCards.map(s => `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2rem;">
            <h3 class="h4-heading" style="margin-bottom: 0.5rem; color: #0f172a;">${s.title}</h3>
            <p style="color: #475569; font-size: 0.95rem; line-height: 1.6; margin-bottom: 0;">${s.desc}</p>
          </div>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- FAQs Section -->
    ${page.faqs ? `
    <section class="section secondary-section" style="padding: 4rem 0;">
      <div class="container">
        <div class="utility-text-align-center utility-margin-bottom-3rem">
          <div class="eyebrow">Frequently Asked Questions</div>
          <h2 class="h2-heading">Questions About Marketing in ${page.primaryCity}</h2>
        </div>
        <div style="max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem;">
          ${page.faqs.map(f => `
          <details style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1.25rem 1.5rem; cursor: pointer;">
            <summary style="font-weight: 600; color: #0f172a; font-size: 1.05rem;">${f.q}</summary>
            <div style="margin-top: 0.75rem; color: #475569; font-size: 0.95rem; line-height: 1.6; border-top: 1px solid #f1f5f9; padding-top: 0.75rem;">
              ${f.a}
            </div>
          </details>
          `).join('')}
        </div>
      </div>
    </section>
    ` : ''}

    <!-- CTA Section -->
    <section class="section" style="padding: 4.5rem 0; background: #0f172a; color: #ffffff;">
      <div class="container utility-text-align-center">
        <h2 style="font-family: 'Young Serif', serif; font-size: clamp(2rem, 3.5vw, 2.75rem); color: #ffffff; margin-bottom: 1rem;">
          Ready to Dominate Search in ${page.primaryCity}?
        </h2>
        <p style="color: #94a3b8; font-size: 1.1rem; max-width: 600px; margin: 0 auto 2rem auto;">
          Partner with South Florida's trusted digital growth agency. Let's build your custom search roadmap today.
        </p>
        <div class="button-group align-center">
          <a href="https://meetings-na2.hubspot.com/christian-gomez" target="_blank" class="button w-button" style="background: #da104d;">
            Book Your Free Consultation
          </a>
        </div>
      </div>
    </section>
  </main>

  <footer class="section secondary-section footer">
    <div class="container">
      <div class="w-layout-grid grid-layout desktop-4-column tablet-2-column mobile-landscape-1-column grid-gap-lg">
        <div>
          <div class="paragraph-lg utility-margin-bottom-1rem" style="font-weight: 700;">G3Z Creative</div>
          <p class="paragraph-sm utility-text-secondary">Empowering small and medium-sized businesses in Miramar, Pembroke Pines, and South Florida with custom web design, SEO, and local marketing.</p>
          <div class="paragraph-xs utility-text-secondary" style="margin-top: 1rem;">📍 2751 SW 116th Ave, Suite 308, Miramar, FL 33025<br>📞 (786) 830-0833</div>
        </div>
        <div>
          <div class="eyebrow">Services</div>
          <ul role="list" class="w-list-unstyled" style="font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.5rem;">
            <li><a href="../services/digital-marketing-miramar.html" class="utility-text-secondary">Digital Marketing Miramar</a></li>
            <li><a href="../services/digital-marketing-pembroke-pines.html" class="utility-text-secondary">Digital Marketing Pembroke Pines</a></li>
            <li><a href="../services/website-development-miramar.html" class="utility-text-secondary">Web Development Miramar</a></li>
            <li><a href="../services/seo.html" class="utility-text-secondary">Local SEO Services</a></li>
            <li><a href="../services/google-ads-miramar.html" class="utility-text-secondary">Google Ads Management</a></li>
            <li><a href="../services/graphic-design-pembroke-pines.html" class="utility-text-secondary">Graphic Design Pembroke Pines</a></li>
            <li><a href="../services/social-media-marketing-miramar.html" class="utility-text-secondary">Social Media Marketing</a></li>
            <li><a href="../services/small-business-web-design.html" class="utility-text-secondary">Small Business Web Design</a></li>
          </ul>
        </div>
        <div>
          <div class="eyebrow">Local Areas Served</div>
          <ul role="list" class="w-list-unstyled" style="font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.5rem;">
            <li><a href="../services/digital-marketing-miramar.html" class="utility-text-secondary">Miramar, FL</a></li>
            <li><a href="../services/web-design-pembroke-pines.html" class="utility-text-secondary">Pembroke Pines, FL</a></li>
            <li><a href="../services/web-design-hollywood-fl.html" class="utility-text-secondary">Hollywood, FL</a></li>
            <li><a href="../services/web-design-davie.html" class="utility-text-secondary">Davie, FL</a></li>
            <li><a href="../services/seo-davie.html" class="utility-text-secondary">Cooper City &amp; Miami Lakes</a></li>
          </ul>
        </div>
        <div>
          <div class="eyebrow">Get Started</div>
          <p class="paragraph-sm utility-text-secondary">Claim your free website &amp; SEO audit today.</p>
          <a href="https://meetings-na2.hubspot.com/christian-gomez" target="_blank" class="button w-button" style="margin-top: 0.5rem; font-size: 0.85rem;">Schedule Audit</a>
        </div>
      </div>
      <div style="border-top: 1px solid #e2e8f0; margin-top: 3rem; padding-top: 1.5rem; text-align: center; font-size: 0.82rem; color: #94a3b8;">
        © 2026 G3Z Creative LLC. All rights reserved. | <a href="../privacy-policy.html" style="color: inherit;">Privacy Policy</a> | <a href="../terms-of-service.html" style="color: inherit;">Terms of Service</a>
      </div>
    </div>
  </footer>
  <script src="https://d3e54v103j8qbb.cloudfront.net/js/jquery-3.5.1.min.dc5e7f18c8.js?site=6837ae7e314e91dd48e1e240" type="text/javascript"></script>
  <script src="../js/webflow.js" type="text/javascript"></script>
</body>
</html>`;
}

let count = 0;
for (const p of pagesToBuild) {
  const filePath = path.join(SERVICES_DIR, p.filename);
  fs.writeFileSync(filePath, generateHtml(p), 'utf8');
  console.log(`✓ Built dedicated service page: services/${p.filename}`);
  count++;
}

console.log(`\nSuccessfully generated ${count} dedicated service landing pages for top GSC queries.`);

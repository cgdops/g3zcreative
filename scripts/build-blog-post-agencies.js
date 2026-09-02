/**
 * One-off generator for blog/best-seo-agencies-pembroke-pines.html
 * Pulls nav + footer from templates/ so sync-templates.js keeps the page in step.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PREFIX = '../';

const nav = fs.readFileSync(path.join(ROOT, 'templates', 'nav.html'), 'utf8')
  .replace(/\{\{prefix\}\}/g, PREFIX);
const footer = fs.readFileSync(path.join(ROOT, 'templates', 'footer.html'), 'utf8')
  .replace(/\{\{prefix\}\}/g, PREFIX);

const TITLE = '5 Best SEO &amp; Digital Marketing Agencies in Pembroke Pines for 2026';
const TITLE_PLAIN = '5 Best SEO & Digital Marketing Agencies in Pembroke Pines for 2026';
const DESC = 'An honest comparison of the top SEO and digital marketing agencies serving Pembroke Pines, FL — who each one is best for, what they offer, and how to choose.';
const URL = 'https://g3zcreative.com/blog/best-seo-agencies-pembroke-pines.html';
const IMAGE_FILE = 'best-seo-agencies-pembroke-pines.jpg';
const IMAGE = 'https://g3zcreative.com/images/' + IMAGE_FILE;
const IMAGE_ALT = 'The 5 Best SEO and Digital Marketing Agencies in Pembroke Pines, a 2026 guide by G3Z Creative';
const CHECKLIST_FILE = 'how-to-choose-digital-marketing-agency.jpg';
const CHECKLIST_ALT = 'Checklist of five questions to ask before hiring a digital marketing agency: who does the work, what it costs, contract length, their own site speed, and what they measure';
const PUBLISHED = '2026-08-28';

const agencies = [
  {
    n: 1,
    name: 'G3Z Creative',
    best: 'Home service and trade businesses in Pembroke Pines that want inbound leads from organic search without paying for ads.',
    body: [
      `G3Z Creative is based in Miramar, minutes from Pembroke Pines, and works primarily with roofing, HVAC, plumbing, and electrical contractors across South Florida. It&#x27;s a small, hands-on operation &mdash; Christian, a web developer with 12 years of experience, and Leah, who spent two decades in sales and business development. Those are the people who do the work. No account manager relaying your questions to a team you never meet.`,
      `The technical approach separates them from most local shops. Rather than building one website and hoping it ranks, they build programmatic SEO systems &mdash; structured sets of landing pages targeting every profitable service-and-city combination a business can realistically serve. For a contractor covering twenty municipalities across Broward and Miami-Dade, that&#x27;s a real difference in search real estate. They pair it with AI search optimization aimed at getting cited in ChatGPT, Perplexity, and Google&#x27;s AI Overviews.`,
      `Pricing is <a href="../pricing.html">productized rather than hourly</a>: a static landing page starts at $500 one-time, a dynamic platform with built-in CRM runs $3,000, and the growth retainer is $2,500 monthly with no lock-in. Sites are built for 100/100 Lighthouse scores on Cloudflare&#x27;s edge &mdash; page speed is a ranking signal and a conversion factor at once.`
    ],
    alt: 'Choose someone else if:',
    altText: `you need heavy social content production, print materials, or a large team for a national brand campaign. G3Z is deliberately narrow, and that focus is the point.`
  },
  {
    n: 2,
    name: 'Lince Digital Marketing Agency',
    best: 'Pembroke Pines practices and clinics wanting social, ads, and SEO from one local team.',
    body: [
      `Lince is genuinely local &mdash; based in Pembroke Pines &mdash; operating as a company since 2012, with the founder citing 35 years in the industry and over 200 clients served, many long-term.`,
      `Their service list is broader than most: social media management, website design, SEO, CRM management, Google Maps optimization, email marketing, and paid ads. They name specific verticals they know well &mdash; dental practices, education services, family law, chiropractors and wellness clinics, and roofing.`,
      `That breadth is the reason to consider them. If you&#x27;d rather one team handle your Instagram, Google Business Profile, and email list than coordinate three vendors, Lince is built for it.`
    ],
    alt: 'Choose them over G3Z if:',
    altText: `social presence is central to how you get clients, or you want ads and organic managed together.`
  },
  {
    n: 3,
    name: 'SEO Smooth',
    best: 'Businesses that want paid search and AI automation handled alongside SEO, without a monthly retainer.',
    body: [
      `SEO Smooth is headquartered in Boynton Beach &mdash; not Pembroke Pines, but firmly South Florida, and they list Miami and Fort Lauderdale among the markets they serve. Their copyright notice dates the company to 2008, making them the most established agency here.`,
      `Their range is wide: SEO across technical, on-page, and off-page work; PPC on Google, Microsoft, YouTube, and Amazon; organic and paid social; local SEO and Google Business Profile optimization; and website development. They also build AI agents and voice automation, and say they run those systems internally before recommending them to clients.`,
      `The billing model is the real differentiator. They work in prepaid hour blocks rather than monthly subscriptions &mdash; no subscription, no recurring fees. If you&#x27;ve been burned by a retainer that kept charging after the work slowed, that&#x27;s worth a conversation.`
    ],
    alt: 'Choose them over G3Z if:',
    altText: `paid search is a major channel for you, or you&#x27;d rather buy hours as you need them than commit to a monthly retainer.`
  },
  {
    n: 4,
    name: 'Hashtag Digital Marketing Group',
    best: 'Dental practices in Pembroke Pines building around video and social content.',
    body: [
      `Hashtag Digital Marketing Group is based in Pembroke Pines and positions itself squarely around dental marketing, alongside social content creation and video production, plus general marketing and SEO services.`,
      `The specialization is the draw. Dental marketing has its own rhythm &mdash; new patient acquisition, insurance messaging, before-and-after visuals, review generation &mdash; and an agency in that lane daily starts ahead of a generalist. Their video emphasis also fits how many practices win patients now, where a short clip of the office does more than a paragraph of copy. Their site doesn&#x27;t state years in business or team size, so ask on a call.`
    ],
    alt: 'Choose them over G3Z if:',
    altText: `you run a dental or similar patient-facing practice and video is where you want your budget going.`
  },
  {
    n: 5,
    name: 'Harmony Technologies (HarmonyTec)',
    best: 'Budget-conscious small businesses that want paid, earned, and social media coordinated under one strategy.',
    body: [
      `HarmonyTec operates out of Margate, about half an hour north of Pembroke Pines, and works across multiple South Florida counties. They focus explicitly on small and mid-sized businesses rather than enterprise accounts.`,
      `Their services cover AI-assisted SEO, AEO, and GEO optimization, paid media across Google, Facebook, and LinkedIn, predictive analytics, social media management, and programmatic display &mdash; organized around what they call three pillars: paid, earned, and social media, coordinated rather than run as separate campaigns.`,
      `That framing is the appeal. Plenty of small businesses end up with a Google Ads vendor, a social freelancer, and an SEO contractor who never talk to each other. Their site calls their pricing affordable for budget-conscious SMBs but doesn&#x27;t publish rates, and doesn&#x27;t state years in business or team size &mdash; ask about all three.`
    ],
    alt: 'Choose them over G3Z if:',
    altText: `you want paid ads, social, and organic coordinated under one roof at the smaller end of the budget range.`
  }
];

const tips = [
  ['Ask who actually does the work.', 'Plenty of agencies sell you on a founder and hand you to a junior. Ask who writes your content and builds your pages, and whether any of it is subcontracted.'],
  ['Get pricing before the proposal call.', 'Agencies that won&#x27;t discuss numbers until the second meeting are usually pricing based on what they think you&#x27;ll pay.'],
  ['Watch the contract length.', 'A twelve-month SEO lock-in removes the incentive to show results in month three. Month-to-month puts the pressure where it belongs.'],
  ['Check their own site.', 'Run it through Google&#x27;s PageSpeed Insights. An SEO agency with a slow website is telling you something.'],
  ['Ask what they&#x27;d measure.', 'The right answer involves leads and booked jobs. Impressions and rankings alone don&#x27;t pay for the retainer. An <a href="../roi-calculator.html">ROI calculation</a> should be part of the conversation.']
];

const agencySections = agencies.map(a => `
        <section class="post-entry">
          <h2 class="post-h2"><span class="post-rank">${a.n}</span>${a.name}</h2>
          <p class="post-bestfor"><strong>Best for:</strong> ${a.best}</p>
${a.body.map(p => `          <p>${p}</p>`).join('\n')}
          <p class="post-alt"><strong>${a.alt}</strong> ${a.altText}</p>
        </section>`).join('\n');

const tipItems = tips.map(([h, b]) => `          <div class="post-tip">
            <h3 class="post-h3">${h}</h3>
            <p>${b}</p>
          </div>`).join('\n');

const itemListSchema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: TITLE_PLAIN,
  itemListOrder: 'https://schema.org/ItemListOrderDescending',
  numberOfItems: agencies.length,
  itemListElement: agencies.map(a => ({
    '@type': 'ListItem',
    position: a.n,
    name: a.name.replace(/&#x27;/g, "'")
  }))
};

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: TITLE_PLAIN,
  description: DESC,
  image: { '@type': 'ImageObject', url: IMAGE, width: 1200, height: 630 },
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  mainEntityOfPage: { '@type': 'WebPage', '@id': URL },
  author: { '@type': 'Organization', name: 'G3Z Creative', url: 'https://g3zcreative.com/' },
  publisher: {
    '@type': 'Organization',
    name: 'G3Z Creative',
    url: 'https://g3zcreative.com/',
    telephone: '+17869673699',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '2751 SW 116th Ave, Suite 308',
      addressLocality: 'Miramar',
      addressRegion: 'FL',
      postalCode: '33025',
      addressCountry: 'US'
    }
  }
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      q: 'How much does an SEO agency in Pembroke Pines cost?',
      a: 'Pricing varies widely by model. G3Z Creative publishes productized rates: $500 one-time for a static landing page, $3,000 for a dynamic platform with built-in CRM, and $2,500 per month for a growth retainer with no long-term contract. Some agencies bill hourly, some in prepaid hour blocks, and many do not publish rates at all.'
    },
    {
      q: 'Should I hire a local Pembroke Pines agency or a national one?',
      a: 'A local agency knows your competitors and which neighborhoods your customers come from, which leads to better decisions on targeting. National agencies bring deeper paid media capability and larger teams. For local service businesses competing in the map pack, local knowledge usually matters more.'
    },
    {
      q: 'How long does SEO take to work in South Florida?',
      a: 'Most local SEO work takes three to six months to show meaningful ranking movement, longer in competitive verticals. Be cautious of any agency promising first-page rankings in weeks, and prefer month-to-month terms so the agency stays accountable early.'
    },
    {
      q: 'What questions should I ask before hiring an SEO agency?',
      a: 'Ask who actually does the work and whether it is subcontracted, what the pricing is before the proposal call, how long the contract runs, and what metrics they report on. Leads and booked jobs are the right answers; impressions and keyword rankings alone are not.'
    }
  ].map(x => ({
    '@type': 'Question',
    name: x.q,
    acceptedAnswer: { '@type': 'Answer', text: x.a }
  }))
};

const faqHtml = faqSchema.mainEntity.map(x => `
          <div class="post-faq">
            <h3 class="post-h3">${x.name}</h3>
            <p>${x.acceptedAnswer.text}</p>
          </div>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${TITLE} | G3Z Creative</title>
  <meta content="${DESC}" name="description">
  <meta content="${TITLE}" property="og:title">
  <meta content="${DESC}" property="og:description">
  <meta content="article" property="og:type">
  <meta content="${URL}" property="og:url">
  <meta content="${TITLE}" property="twitter:title">
  <meta content="${DESC}" property="twitter:description">
  <meta content="summary_large_image" name="twitter:card">
  <meta content="${IMAGE}" property="og:image">
  <meta content="1200" property="og:image:width">
  <meta content="630" property="og:image:height">
  <meta content="${IMAGE_ALT}" property="og:image:alt">
  <meta content="${IMAGE}" property="twitter:image">
  <meta content="${IMAGE_ALT}" name="twitter:image:alt">
  <meta content="width=device-width, initial-scale=1" name="viewport">
  <link href="${URL}" rel="canonical">
  <link href="${PREFIX}css/normalize.css" rel="stylesheet" type="text/css">
  <link href="${PREFIX}css/webflow.css" rel="stylesheet" type="text/css">
  <link href="${PREFIX}css/g3zc.webflow.css" rel="stylesheet" type="text/css">
  <link href="https://fonts.googleapis.com" rel="preconnect">
  <link href="https://fonts.gstatic.com" rel="preconnect" crossorigin="anonymous">
  <script src="https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js" type="text/javascript"></script>
  <script type="text/javascript">WebFont.load({  google: {    families: ["Figtree:regular","Young Serif:regular"]  }});</script>
  <script type="text/javascript">!function(o,c){var n=c.documentElement,t=" w-mod-";n.className+=t+"js",("ontouchstart"in o||o.DocumentTouch&&c instanceof DocumentTouch)&&(n.className+=t+"touch")}(window,document);</script>
  <link href="${PREFIX}images/favicon.png" rel="shortcut icon" type="image/x-icon">
  <link href="${PREFIX}images/webclip.png" rel="apple-touch-icon">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined">
  <style>
    /* Scoped article typography. Deliberately not using .heading-responsive-lg —
       that class is 10cqw and only shrinks inside .utility-container-cqw, so it
       renders enormous on a long editorial title. */
    .post-wrap {
      --post-measure: 40rem;
      --post-rule: #e2e8f0;
      --post-muted: #64748b;
    }
    .post-shell {
      max-width: var(--post-measure);
      margin-left: auto;
      margin-right: auto;
    }
    .post-hero {
      padding-top: 3.5rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--post-rule);
    }
    .post-eyebrow {
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: #da104d;
      margin-bottom: 0.85rem;
    }
    .post-title {
      font-family: 'Young Serif', Georgia, serif;
      font-size: clamp(1.95rem, 3.6vw, 3rem);
      line-height: 1.14;
      letter-spacing: -0.015em;
      margin: 0 0 1rem;
      text-wrap: balance;
    }
    .post-lede {
      font-size: clamp(1.05rem, 1.5vw, 1.2rem);
      line-height: 1.62;
      color: var(--post-muted);
      margin: 0 0 1.25rem;
      text-wrap: pretty;
    }
    .post-meta {
      font-size: 0.85rem;
      color: var(--post-muted);
      margin: 0;
    }
    .post-figure {
      padding-top: 2rem;
    }
    .post-figure img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 1200 / 630;
      border-radius: 10px;
      background: #0f172a;
    }
    .post-inline-figure {
      margin: 0 0 1.9rem;
    }
    .post-inline-figure img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 1200 / 860;
      border: 1px solid var(--post-rule);
      border-radius: 10px;
      background: #f8fafc;
    }
    .post-body {
      padding-top: 2.5rem;
      padding-bottom: 3rem;
      font-size: 1.0625rem;
      line-height: 1.72;
    }
    .post-body p {
      margin: 0 0 1.15rem;
      text-wrap: pretty;
    }
    /* Exclude .button — the Webflow button sets its own accent background and
       white label, and an unscoped link rule here outranks it. */
    .post-body a:not(.button) {
      color: #da104d;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .post-intro {
      font-size: 1.15rem;
      line-height: 1.65;
    }
    .post-disclosure {
      border-left: 3px solid #da104d;
      background: #f8fafc;
      padding: 1rem 1.15rem;
      margin: 1.75rem 0 0;
      font-size: 0.95rem;
      line-height: 1.6;
      color: #475569;
      border-radius: 0 6px 6px 0;
    }
    .post-disclosure p { margin: 0; }
    .post-entry {
      padding-top: 2.75rem;
      margin-top: 2.75rem;
      border-top: 1px solid var(--post-rule);
    }
    .post-h2 {
      font-family: 'Young Serif', Georgia, serif;
      font-size: clamp(1.5rem, 2.4vw, 2rem);
      line-height: 1.22;
      letter-spacing: -0.01em;
      margin: 0 0 1rem;
      display: flex;
      align-items: baseline;
      gap: 0.7rem;
    }
    .post-rank {
      flex: none;
      font-family: 'Figtree', system-ui, sans-serif;
      font-size: 0.82rem;
      font-weight: 700;
      line-height: 1;
      color: #fff;
      background: #da104d;
      border-radius: 999px;
      width: 1.75rem;
      height: 1.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transform: translateY(-0.15em);
    }
    .post-bestfor {
      font-size: 1.05rem;
      line-height: 1.6;
      padding-bottom: 1.15rem;
      margin-bottom: 1.15rem !important;
      border-bottom: 1px dashed var(--post-rule);
    }
    .post-alt {
      background: #f8fafc;
      border-radius: 8px;
      padding: 0.95rem 1.1rem;
      font-size: 0.97rem;
      line-height: 1.6;
      margin-top: 1.4rem !important;
      margin-bottom: 0 !important;
    }
    .post-section {
      padding-top: 2.75rem;
      margin-top: 2.75rem;
      border-top: 1px solid var(--post-rule);
    }
    .post-section > .post-h2 { margin-bottom: 1.5rem; }
    .post-h3 {
      font-size: 1.08rem;
      font-weight: 700;
      line-height: 1.4;
      margin: 0 0 0.45rem;
    }
    .post-tip, .post-faq { margin-bottom: 1.6rem; }
    .post-tip p, .post-faq p { margin-bottom: 0 !important; }
    .post-cta {
      margin-top: 1.75rem;
      padding: 1.5rem;
      background: #0f172a;
      border-radius: 10px;
      color: #fff;
    }
    .post-cta p { color: #cbd5e1; margin-bottom: 1rem !important; }
    .post-cta .button { margin: 0; }
    .post-related {
      margin-top: 1.5rem;
      font-size: 0.92rem;
      color: var(--post-muted);
    }
    @media (max-width: 767px) {
      .post-hero { padding-top: 2.25rem; padding-bottom: 1.5rem; }
      .post-figure { padding-top: 1.25rem; }
      .post-figure img { border-radius: 7px; }
      .post-body { padding-top: 1.75rem; font-size: 1.02rem; }
      .post-intro { font-size: 1.08rem; }
      .post-entry, .post-section { padding-top: 2rem; margin-top: 2rem; }
      .post-h2 { gap: 0.55rem; }
      .post-cta { padding: 1.25rem; }
    }
  </style>
  <script type="application/ld+json">
${JSON.stringify(articleSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(itemListSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(faqSchema, null, 2)}
  </script>
</head>
<body>
${nav}
  <main class="post-wrap">
    <article>
      <header class="post-hero">
        <div class="container">
          <div class="post-shell">
            <div class="post-eyebrow">Local SEO Guide</div>
            <h1 class="post-title">${TITLE}</h1>
            <p class="post-lede">${DESC}</p>
            <p class="post-meta">By G3Z Creative &middot; <time datetime="${PUBLISHED}">August 28, 2026</time> &middot; 6 min read</p>
          </div>
        </div>
      </header>

      <div class="post-figure">
        <div class="container">
          <div class="post-shell">
            <img src="${PREFIX}images/${IMAGE_FILE}" width="1200" height="630"
                 alt="${IMAGE_ALT}" fetchpriority="high" decoding="async">
          </div>
        </div>
      </div>

      <div class="post-body">
        <div class="container">
          <div class="post-shell">

            <p class="post-intro">If you run a business in Pembroke Pines, you&#x27;ve noticed how crowded search results have gotten. A homeowner looking for a roofer, a parent looking for a dentist, a property manager looking for an electrician &mdash; they all start the same way, and most never scroll past the map pack.</p>

            <p>That&#x27;s why so many local owners end up comparing agencies. The hard part isn&#x27;t finding one &mdash; it&#x27;s figuring out which do the work in-house, which understand South Florida&#x27;s competition, and which fit the size of business you&#x27;re running. Here are five worth a look in 2026, with an honest read on who each one suits.</p>

            <div class="post-disclosure">
              <p><strong>Disclosure:</strong> G3Z Creative publishes this site. We&#x27;ve listed ourselves first because we believe we&#x27;re the strongest fit for local service businesses here &mdash; but we&#x27;ve been straight about where each of the other four is the better call.</p>
            </div>
${agencySections}

            <section class="post-section">
              <h2 class="post-h2">How To Choose the Right Digital Marketing Agency</h2>
              <figure class="post-inline-figure">
                <img src="${PREFIX}images/${CHECKLIST_FILE}" width="1200" height="860"
                     alt="${CHECKLIST_ALT}" loading="lazy" decoding="async">
              </figure>
${tipItems}
            </section>

            <section class="post-section">
              <h2 class="post-h2">Frequently Asked Questions</h2>
${faqHtml}
            </section>

            <section class="post-section">
              <h2 class="post-h2">Final Thoughts</h2>
              <p>Any of these five could be right depending on what you&#x27;re solving for. Social content, Lince or Hashtag. Paid search without a retainer, SEO Smooth. Paid and social coordinated on a smaller budget, HarmonyTec.</p>
              <p>But if you&#x27;re a contractor or home service business in Pembroke Pines trying to turn organic search into a steady stream of calls, G3Z Creative is built for exactly that &mdash; local, small enough that you work directly with the people doing the work, transparent pricing, no long-term contract, and an approach that captures buyers at the moment they search, including in the AI tools more of your customers now start with.</p>
              <div class="post-cta">
                <p>See what your search opportunity actually looks like &mdash; no cost, no commitment.</p>
                <a href="tel:+17869673699" data-open-inquiry="true" class="button w-button">Start a Conversation</a>
              </div>
              <p class="post-related">See our <a href="../services/seo-pembroke-pines.html">SEO services in Pembroke Pines</a>, <a href="../services/web-design-pembroke-pines.html">web design in Pembroke Pines</a>, or <a href="../pricing.html">full pricing</a>.</p>
            </section>

          </div>
        </div>
      </div>
    </article>
  </main>
${footer}

  <script src="https://d3e54v103j8qbb.cloudfront.net/js/jquery-3.5.1.min.dc5e7f18c8.js?site=6837ae7e314e91dd48e1e240" type="text/javascript"></script>
  <script src="${PREFIX}js/webflow.js" type="text/javascript"></script>
  <script src="/js/quick-connect.js" type="text/javascript"></script>
</body>
</html>
`;

const OUT = path.join(ROOT, 'blog', 'best-seo-agencies-pembroke-pines.html');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('Wrote ' + path.relative(ROOT, OUT) + ' (' + html.length + ' bytes)');

/* Blog index — the nav already links to /blog/, so it needs a landing page. */
const posts = [
  {
    href: 'best-ai-seo-agencies-south-florida.html',
    title: 'Best AI SEO Agencies in South Florida (2026)',
    desc: 'An honest, data-backed comparison of the top AI SEO and Generative Engine Optimization (GEO) agencies serving South Florida — who each one is best for, pricing bands, and how to choose.',
    date: '2026-09-02',
    img: 'best-ai-seo-agencies-south-florida.jpg',
    imgAlt: 'The Best AI SEO Agencies in South Florida, a 2026 buyer guide by G3Z Creative',
    dateLabel: 'September 2, 2026'
  },
  {
    href: 'best-seo-agencies-pembroke-pines.html',
    title: TITLE,
    desc: DESC,
    date: PUBLISHED,
    img: IMAGE_FILE,
    imgAlt: IMAGE_ALT,
    dateLabel: new Date(PUBLISHED + 'T12:00:00Z').toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    })
  }
];

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Blog | G3Z Creative &mdash; Local SEO &amp; Web Design Insights</title>
  <meta content="Practical guides on local SEO, web design, and programmatic search for South Florida service businesses." name="description">
  <meta content="Blog | G3Z Creative" property="og:title">
  <meta content="Practical guides on local SEO, web design, and programmatic search for South Florida service businesses." property="og:description">
  <meta content="width=device-width, initial-scale=1" name="viewport">
  <link href="https://g3zcreative.com/blog/" rel="canonical">
  <link href="${PREFIX}css/normalize.css" rel="stylesheet" type="text/css">
  <link href="${PREFIX}css/webflow.css" rel="stylesheet" type="text/css">
  <link href="${PREFIX}css/g3zc.webflow.css" rel="stylesheet" type="text/css">
  <link href="https://fonts.googleapis.com" rel="preconnect">
  <link href="https://fonts.gstatic.com" rel="preconnect" crossorigin="anonymous">
  <script src="https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js" type="text/javascript"></script>
  <script type="text/javascript">WebFont.load({  google: {    families: ["Figtree:regular","Young Serif:regular"]  }});</script>
  <script type="text/javascript">!function(o,c){var n=c.documentElement,t=" w-mod-";n.className+=t+"js",("ontouchstart"in o||o.DocumentTouch&&c instanceof DocumentTouch)&&(n.className+=t+"touch")}(window,document);</script>
  <link href="${PREFIX}images/favicon.png" rel="shortcut icon" type="image/x-icon">
  <link href="${PREFIX}images/webclip.png" rel="apple-touch-icon">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined">
</head>
<body>
${nav}
  <section class="intro-section section utility-overflow-hidden">
    <div class="container utility-max-width-90">
      <div class="utility-max-width-md">
        <div class="eyebrow">Blog</div>
        <h1 class="heading-responsive-lg utility-margin-bottom-1rem">Local SEO &amp; Web Design Insights</h1>
        <p class="subheading">Practical guides for South Florida service businesses competing in local search.</p>
      </div>
    </div>
  </section>
  <section class="section">
    <div class="container">
      <div class="utility-max-width-md">
${posts.map(p => `        <div class="card utility-margin-bottom-1rem">
          <a href="${p.href}" class="w-inline-block"><img src="${PREFIX}images/${p.img}" width="1200" height="630" alt="${p.imgAlt}" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;aspect-ratio:1200/630;border-radius:8px 8px 0 0;"></a>
          <div class="card-body">
            <p class="paragraph-sm utility-text-secondary utility-margin-bottom-0-5rem"><time datetime="${p.date}">${p.dateLabel}</time></p>
            <h2 class="h5-heading"><a href="${p.href}">${p.title}</a></h2>
            <p class="paragraph-sm utility-margin-bottom-0">${p.desc}</p>
          </div>
        </div>`).join('\n')}
      </div>
    </div>
  </section>
${footer}

  <script src="https://d3e54v103j8qbb.cloudfront.net/js/jquery-3.5.1.min.dc5e7f18c8.js?site=6837ae7e314e91dd48e1e240" type="text/javascript"></script>
  <script src="${PREFIX}js/webflow.js" type="text/javascript"></script>
  <script src="/js/quick-connect.js" type="text/javascript"></script>
</body>
</html>
`;

const IDX = path.join(ROOT, 'blog', 'index.html');
fs.writeFileSync(IDX, indexHtml, 'utf8');
console.log('Wrote ' + path.relative(ROOT, IDX) + ' (' + indexHtml.length + ' bytes)');

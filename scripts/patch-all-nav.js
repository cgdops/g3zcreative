const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function getPrefix(filePath) {
  const rel = path.relative(ROOT, filePath);
  const depth = rel.split(path.sep).length - 1;
  return depth > 0 ? '../'.repeat(depth) : '';
}

function getHeaderNavDropdown(prefix) {
  return `<div class="mega-nav-dropdown-list-wrapper">
                    <ul role="list" class="grid-layout desktop-3-column tablet-1-column grid-gap-sm utility-margin-bottom-0 w-list-unstyled">
                      <li class="w-node-_3bbc2dd5-d796-11e5-3c1c-e8b9ada0b750-ada0b73b">
                        <div class="w-layout-grid grid-layout services-megamenu-grid">
                          <div>
                            <div class="eyebrow">Marketing For:</div>
                            <ul role="list" class="nav-mega-menu-list w-list-unstyled">
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}marketing-for/roofers.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>Roofing Contractors</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Capture high-ticket roof replacements.</div>
                                  </div>
                                </a>
                              </li>
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}marketing-for/hvac.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>HVAC Specialists</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Drive AC installs &amp; emergency repairs.</div>
                                  </div>
                                </a>
                              </li>
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}marketing-for/plumbers.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>Plumbing Experts</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Scale emergency &amp; repiping calls.</div>
                                  </div>
                                </a>
                              </li>
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}marketing-for/electricians.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>Electrical Contractors</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Win panel upgrades &amp; commercial jobs.</div>
                                  </div>
                                </a>
                              </li>
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}marketing-for/home-service-providers.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>Home Service Providers</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Growth systems for trade businesses.</div>
                                  </div>
                                </a>
                              </li>
                            </ul>
                          </div>
                          <div>
                            <div class="eyebrow">Top Services:</div>
                            <ul role="list" class="nav-mega-menu-list w-list-unstyled">
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}services/seo.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>AI &amp; Programmatic SEO</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Dominate Google AI Overviews &amp; search.</div>
                                  </div>
                                </a>
                              </li>
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}services/local-marketing.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>Local SEO &amp; Google Maps</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Capture top 3 Map Pack rankings.</div>
                                  </div>
                                </a>
                              </li>
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}services/workflow-automation.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>Workflow Automation</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Automate lead dispatch &amp; follow-ups.</div>
                                  </div>
                                </a>
                              </li>
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}services/custom-crm.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>Custom CRM &amp; Tools</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Bespoke software tailored to your workflow.</div>
                                  </div>
                                </a>
                              </li>
                              <li class="utility-margin-bottom-0">
                                <a href="${prefix}services/website-development-miramar.html" class="mega-nav-link-item w-inline-block">
                                  <div>
                                    <div><strong>Website Development</strong></div>
                                    <div class="paragraph-sm utility-text-secondary">Fast, high-converting digital assets.</div>
                                  </div>
                                </a>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </li>
                      <li class="flex-horizontal w-node-_3bbc2dd5-d796-11e5-3c1c-e8b9ada0b7c3-ada0b73b">
                        <a href="https://outlook.office.com/bookwithme/user/7f6a66ac828344eb9670c6cb66bedc6b@g3zcreative.com?anonymous&amp;ismsaljsauthenabled&amp;ep=plink" class="card-link inverse-card-link flex-child-expand w-inline-block">
                          <div class="card-body">
                            <div class="h3-heading">Grow your business online</div>
                            <p class="paragraph-sm utility-text-inverse-secondary">See how custom automations eliminate overhead and scale your service revenue.</p>
                            <div class="utility-margin-top-auto">
                              <div class="button-group">
                                <div class="text-button secondary-text-button text-button-on-inverse">
                                  <div>Schedule a call</div>
                                  <div class="button-icon"><svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewbox="0 0 16 16" fill="none"><path d="M2 8H14.5M14.5 8L8.5 2M14.5 8L8.5 14" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      </li>
                    </ul>
                  </div>`;
}

function getFooterColumns(prefix) {
  return `<ul role="list" id="w-node-dc6886a5-5e1c-56fd-8999-bf22927e3f26-927e3ee2" class="utility-margin-bottom-0 w-list-unstyled">
          <li>
            <h3 class="h5-heading">Top Services</h3>
          </li>
          <li>
            <a href="${prefix}services/seo.html" class="footer-link w-inline-block">
              <div>AI &amp; Programmatic SEO</div>
            </a>
          </li>
          <li>
            <a href="${prefix}services/local-marketing.html" class="footer-link w-inline-block">
              <div>Local SEO &amp; Google Maps</div>
            </a>
          </li>
          <li>
            <a href="${prefix}services/workflow-automation.html" class="footer-link w-inline-block">
              <div>Workflow Automation</div>
            </a>
          </li>
          <li>
            <a href="${prefix}services/custom-crm.html" class="footer-link w-inline-block">
              <div>Custom CRM &amp; Tools</div>
            </a>
          </li>
          <li>
            <a href="${prefix}services/website-development-miramar.html" class="footer-link w-inline-block">
              <div>Website Development</div>
            </a>
          </li>
          <li>
            <a href="${prefix}pricing.html" class="footer-link w-inline-block">
              <div>Pricing</div>
            </a>
          </li>
          <li>
            <a href="${prefix}roi-calculator.html" class="footer-link w-inline-block">
              <div>ROI Calculator</div>
            </a>
          </li>
        </ul>
        <ul role="list" id="w-node-b9167970-46c6-7223-0220-a7abdfb13a88-927e3ee2" class="utility-margin-bottom-0 w-list-unstyled">
          <li>
            <h3 class="h5-heading">Marketing For</h3>
          </li>
          <li>
            <a href="${prefix}marketing-for/roofers.html" class="footer-link w-inline-block">
              <div>Roofing Contractors</div>
            </a>
          </li>
          <li>
            <a href="${prefix}marketing-for/hvac.html" class="footer-link w-inline-block">
              <div>HVAC Specialists</div>
            </a>
          </li>
          <li>
            <a href="${prefix}marketing-for/plumbers.html" class="footer-link w-inline-block">
              <div>Plumbing Experts</div>
            </a>
          </li>
          <li>
            <a href="${prefix}marketing-for/electricians.html" class="footer-link w-inline-block">
              <div>Electrical Contractors</div>
            </a>
          </li>
          <li>
            <a href="${prefix}marketing-for/home-service-providers.html" class="footer-link w-inline-block">
              <div>Home Service Providers</div>
            </a>
          </li>
        </ul>`;
}

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const prefix = getPrefix(filePath);
  let modified = false;

  // 1. Replace mega-nav-dropdown-list-wrapper
  const megaWrapperRegex = /<div class="mega-nav-dropdown-list-wrapper">[\s\S]*?<\/div>\s*<\/nav>/i;
  if (megaWrapperRegex.test(content)) {
    content = content.replace(megaWrapperRegex, `${getHeaderNavDropdown(prefix)}\n                </nav>`);
    modified = true;
  }

  // 2. Replace footer services & marketing for columns
  const footerServicesRegex = /<ul role="list" id="w-node-dc6886a5-5e1c-56fd-8999-bf22927e3f26-927e3ee2"[\s\S]*?<ul role="list" id="w-node-b9167970-46c6-7223-0220-a7abdfb13a88-927e3ee2"[\s\S]*?<\/ul>/i;
  if (footerServicesRegex.test(content)) {
    content = content.replace(footerServicesRegex, getFooterColumns(prefix));
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Patched: ${path.relative(ROOT, filePath)}`);
  } else {
    console.log(`ℹ️ Skipped (no match): ${path.relative(ROOT, filePath)}`);
  }
}

function scanAndPatch(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'blog') {
        scanAndPatch(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'crm.html' && entry.name !== 'privacy-policy.html') {
      patchFile(fullPath);
    }
  }
}

console.log('Starting full navigation & footer patching...');
scanAndPatch(ROOT);
console.log('Done patching standalone files.');

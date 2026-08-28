/**
 * G3Z Creative — Universal Quick Connect & High-Converting Lead Capture Engine
 * Replaces external HubSpot friction with direct click-to-call, click-to-text, and 1-minute inquiry modals.
 */

(function () {
  'use strict';

  // Configuration
  const PHONE_NUMBER = '+1 (786) 967-3699';
  const PHONE_RAW = '+17869673699';
  const EMAIL_ADDRESS = 'hello@g3zcreative.com';
  const API_ENDPOINT = '/api/leads';

  // Inject Styles for Modal and Floating Actions
  const styles = `
    /* Quick Connect Overlay & Modal */
    .qc-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.25s ease, visibility 0.25s ease;
      padding: 1rem;
      box-sizing: border-box;
    }
    .qc-modal-overlay.qc-active {
      opacity: 1;
      visibility: visible;
    }
    .qc-modal-card {
      background: #ffffff;
      border-radius: 20px;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8);
      position: relative;
      transform: translateY(20px) scale(0.97);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: 'Figtree', system-ui, -apple-system, sans-serif;
      color: #0f172a;
    }
    .qc-modal-overlay.qc-active .qc-modal-card {
      transform: translateY(0) scale(1);
    }
    .qc-close-btn {
      position: absolute;
      top: 1.25rem;
      right: 1.25rem;
      background: #f1f5f9;
      border: none;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #64748b;
      font-size: 1.25rem;
      transition: all 0.2s ease;
      z-index: 10;
    }
    .qc-close-btn:hover {
      background: #e2e8f0;
      color: #0f172a;
    }
    .qc-modal-header {
      padding: 2rem 2rem 1.25rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .qc-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(218, 16, 77, 0.1);
      color: #da104d;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .qc-modal-title {
      font-family: 'Young Serif', serif;
      font-size: 1.65rem;
      line-height: 1.2;
      margin: 0 0 0.5rem 0;
      color: #0f172a;
    }
    .qc-modal-desc {
      font-size: 0.92rem;
      color: #64748b;
      margin: 0;
      line-height: 1.45;
    }

    /* Fast Direct Connect Options */
    .qc-fast-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      padding: 1.25rem 2rem;
      background: #f8fafc;
      border-bottom: 1px solid #f1f5f9;
    }
    .qc-fast-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 0.65rem 0.85rem;
      border-radius: 12px;
      font-size: 0.88rem;
      font-weight: 600;
      color: #1e293b;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .qc-fast-btn:hover {
      border-color: #da104d;
      color: #da104d;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(218, 16, 77, 0.1);
    }
    .qc-fast-btn svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    /* Form Styles */
    .qc-modal-body {
      padding: 1.5rem 2rem 2rem;
    }
    .qc-form-group {
      margin-bottom: 1rem;
    }
    .qc-label {
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      color: #334155;
      margin-bottom: 0.4rem;
    }
    .qc-input, .qc-select, .qc-textarea {
      width: 100%;
      padding: 0.75rem 0.9rem;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font-size: 0.92rem;
      color: #0f172a;
      background: #ffffff;
      box-sizing: border-box;
      font-family: inherit;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .qc-input:focus, .qc-select:focus, .qc-textarea:focus {
      outline: none;
      border-color: #da104d;
      box-shadow: 0 0 0 3px rgba(218, 16, 77, 0.15);
    }
    .qc-textarea {
      min-height: 80px;
      resize: vertical;
    }
    .qc-service-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 1rem;
    }
    .qc-pill {
      font-size: 0.78rem;
      padding: 5px 11px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid transparent;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .qc-pill:hover {
      background: #e2e8f0;
      color: #0f172a;
    }
    .qc-pill.qc-pill-active {
      background: #da104d;
      color: #ffffff;
      font-weight: 600;
    }
    .qc-submit-btn {
      width: 100%;
      background: #da104d;
      color: #ffffff;
      border: none;
      padding: 0.85rem 1.25rem;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .qc-submit-btn:hover {
      background: #b90b3f;
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(218, 16, 77, 0.25);
    }
    .qc-submit-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .qc-privacy-note {
      font-size: 0.75rem;
      color: #94a3b8;
      text-align: center;
      margin-top: 0.75rem;
    }

    /* Success State */
    .qc-success-view {
      text-align: center;
      padding: 2.5rem 1.5rem;
      display: none;
    }
    .qc-success-icon {
      width: 60px;
      height: 60px;
      background: #dcfce7;
      color: #16a34a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
      font-size: 1.75rem;
    }
    .qc-success-title {
      font-family: 'Young Serif', serif;
      font-size: 1.6rem;
      margin: 0 0 0.5rem 0;
      color: #0f172a;
    }
    .qc-success-desc {
      font-size: 0.95rem;
      color: #475569;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }

    /* Floating Contact Widget on Bottom-Right */
    .qc-floating-widget {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Figtree', sans-serif;
    }
    .qc-floating-btn {
      background: #da104d;
      color: #ffffff;
      border: none;
      padding: 0.7rem 1.1rem;
      border-radius: 999px;
      font-size: 0.88rem;
      font-weight: 600;
      box-shadow: 0 10px 25px -5px rgba(218, 16, 77, 0.4), 0 0 0 1px rgba(255,255,255,0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      text-decoration: none;
    }
    .qc-floating-btn:hover {
      background: #b90b3f;
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 15px 30px -5px rgba(218, 16, 77, 0.5);
    }
    .qc-phone-badge {
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #e2e8f0;
      padding: 0.7rem 1rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
      box-shadow: 0 4px 15px rgba(0,0,0,0.06);
      display: flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .qc-phone-badge:hover {
      border-color: #da104d;
      color: #da104d;
    }
    @media (max-width: 640px) {
      .qc-phone-badge {
        display: none;
      }
      .qc-floating-widget {
        bottom: 16px;
        right: 16px;
      }
    }
  `;

  // HTML for Modal and Floating Actions
  const modalHTML = `
    <div class="qc-modal-overlay" id="qcModalOverlay" aria-hidden="true">
      <div class="qc-modal-card" role="dialog" aria-modal="true">
        <button class="qc-close-btn" id="qcCloseBtn" aria-label="Close modal">&times;</button>
        
        <div id="qcFormView">
          <div class="qc-modal-header">
            <div class="qc-badge">⚡ Instant Connect</div>
            <h3 class="qc-modal-title" id="qcModalTitle">Let's Discuss Your Project</h3>
            <p class="qc-modal-desc">Reach Christian directly or send a 1-minute inquiry. No automated phone trees or spam.</p>
          </div>

          <div class="qc-fast-options">
            <a href="tel:${PHONE_RAW}" class="qc-fast-btn">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
              <span>Call Christian</span>
            </a>
            <a href="sms:${PHONE_RAW}" class="qc-fast-btn">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              <span>Send Text / SMS</span>
            </a>
          </div>

          <div class="qc-modal-body">
            <form id="qcLeadForm">
              <!-- Honeypot -->
              <input type="text" name="_gotcha" style="display:none !important;" tabindex="-1" autocomplete="off">
              
              <div class="qc-form-group">
                <label class="qc-label">I'm interested in:</label>
                <div class="qc-service-pills" id="qcServicePills">
                  <button type="button" class="qc-pill qc-pill-active" data-service="Programmatic SEO / GEO">Programmatic SEO</button>
                  <button type="button" class="qc-pill" data-service="Website Design & Build">Website Design</button>
                  <button type="button" class="qc-pill" data-service="AI Workflow Automations">AI Automations</button>
                  <button type="button" class="qc-pill" data-service="General Consultation">General Inquiry</button>
                </div>
                <input type="hidden" name="service_interest" id="qcServiceInput" value="Programmatic SEO / GEO">
              </div>

              <div class="qc-form-group">
                <label class="qc-label" for="qcName">Your Name *</label>
                <input type="text" id="qcName" name="name" class="qc-input" placeholder="e.g. Alex Smith" required>
              </div>

              <div class="qc-form-group">
                <label class="qc-label" for="qcContact">Phone Number or Email *</label>
                <input type="text" id="qcContact" name="contact_info" class="qc-input" placeholder="e.g. (305) 555-0199 or alex@company.com" required>
              </div>

              <div class="qc-form-group">
                <label class="qc-label" for="qcCompany">Company / Website (Optional)</label>
                <input type="text" id="qcCompany" name="company" class="qc-input" placeholder="e.g. Acme Services or acme.com">
              </div>

              <div class="qc-form-group">
                <label class="qc-label" for="qcMessage">What are your main goals? (Optional)</label>
                <textarea id="qcMessage" name="message" class="qc-textarea" placeholder="Tell us what you'd like to achieve..."></textarea>
              </div>

              <button type="submit" class="qc-submit-btn" id="qcSubmitBtn">
                <span>Start Conversation</span>
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
              </button>

              <div class="qc-privacy-note">🔒 Zero spam guarantee. We’ll only reach out regarding your inquiry.</div>
            </form>
          </div>
        </div>

        <!-- Success View -->
        <div id="qcSuccessView" class="qc-success-view">
          <div class="qc-success-icon">✓</div>
          <h3 class="qc-success-title">Message Received!</h3>
          <p class="qc-success-desc" id="qcSuccessDesc">Thank you! Christian has received your details and will call or message you promptly to start the conversation.</p>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <a href="tel:${PHONE_RAW}" class="qc-fast-btn" style="background:#da104d; color:white; border-color:#da104d;">
              <span>Need an immediate answer? Call ${PHONE_NUMBER}</span>
            </a>
            <button type="button" class="qc-fast-btn" id="qcDoneBtn">Done</button>
          </div>
        </div>

      </div>
    </div>

    <!-- Floating Direct Call Widget -->
    <div class="qc-floating-widget" id="qcFloatingWidget">
      <a href="tel:${PHONE_RAW}" class="qc-phone-badge" title="Direct Phone">
        <span>📞 ${PHONE_NUMBER}</span>
      </a>
      <button type="button" class="qc-floating-btn" id="qcFloatingBtn" aria-label="Start conversation">
        <span>💬 Start Conversation</span>
      </button>
    </div>
  `;

  function init() {
    // Inject CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    // Inject HTML
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHTML;
    document.body.appendChild(wrapper);

    // Grab elements
    const overlay = document.getElementById('qcModalOverlay');
    const closeBtn = document.getElementById('qcCloseBtn');
    const doneBtn = document.getElementById('qcDoneBtn');
    const form = document.getElementById('qcLeadForm');
    const formView = document.getElementById('qcFormView');
    const successView = document.getElementById('qcSuccessView');
    const submitBtn = document.getElementById('qcSubmitBtn');
    const serviceInput = document.getElementById('qcServiceInput');
    const pills = document.querySelectorAll('#qcServicePills .qc-pill');
    const floatingBtn = document.getElementById('qcFloatingBtn');

    // Service pill toggle
    pills.forEach(pill => {
      pill.addEventListener('click', function () {
        pills.forEach(p => p.classList.remove('qc-pill-active'));
        this.classList.add('qc-pill-active');
        serviceInput.value = this.getAttribute('data-service') || 'General Inquiry';
      });
    });

    // Open / Close modal helpers
    function openModal(customTitle, defaultService) {
      if (customTitle) {
        const titleEl = document.getElementById('qcModalTitle');
        if (titleEl) titleEl.textContent = customTitle;
      }
      if (defaultService) {
        serviceInput.value = defaultService;
        pills.forEach(p => {
          if (p.getAttribute('data-service') === defaultService) {
            p.classList.add('qc-pill-active');
          } else {
            p.classList.remove('qc-pill-active');
          }
        });
      }
      formView.style.display = 'block';
      successView.style.display = 'none';
      overlay.classList.add('qc-active');
      overlay.setAttribute('aria-hidden', 'false');
      const nameInput = document.getElementById('qcName');
      if (nameInput) setTimeout(() => nameInput.focus(), 150);
    }

    function closeModal() {
      overlay.classList.remove('qc-active');
      overlay.setAttribute('aria-hidden', 'true');
    }

    closeBtn.addEventListener('click', closeModal);
    doneBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('qc-active')) closeModal();
    });

    if (floatingBtn) {
      floatingBtn.addEventListener('click', () => openModal());
    }

    // Intercept clicks on any CTA buttons or old HubSpot links
    document.addEventListener('click', function (e) {
      const target = e.target.closest('a, button');
      if (!target) return;

      const href = target.getAttribute('href') || '';
      const dataInquiry = target.hasAttribute('data-open-inquiry') || target.classList.contains('open-inquiry');

      if (dataInquiry || href.includes('hubspot.com') || href.includes('meetings-na2')) {
        e.preventDefault();
        const text = target.textContent.trim();
        let service = 'General Inquiry';
        if (text.toLowerCase().includes('strategy') || text.toLowerCase().includes('matrix')) {
          service = 'Programmatic SEO / GEO';
        } else if (text.toLowerCase().includes('consultation')) {
          service = 'Website Design & Build';
        }
        openModal(null, service);
      }
    });

    // Form Submission Handling
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Sending...</span>';

      // Capture URL parameters & context
      const urlParams = new URLSearchParams(window.location.search);
      const payload = {
        name: form.name.value.trim(),
        contact_info: form.contact_info.value.trim(),
        company: form.company.value.trim(),
        service_interest: serviceInput.value,
        message: form.message.value.trim(),
        source_page: window.location.pathname + window.location.search,
        utm_source: urlParams.get('utm_source') || '',
        utm_medium: urlParams.get('utm_medium') || '',
        utm_campaign: urlParams.get('utm_campaign') || '',
        referrer: document.referrer || '',
        _gotcha: form._gotcha.value
      };

      try {
        const res = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          formView.style.display = 'none';
          successView.style.display = 'block';
          form.reset();
        } else {
          alert(data.error || 'Could not submit your inquiry. Please call or text +1 (786) 967-3699 directly!');
        }
      } catch (err) {
        console.error('Submission error:', err);
        // Fallback friendly alert
        alert('Thank you for reaching out! If your submission does not go through, feel free to call or text Christian at +1 (786) 967-3699.');
        formView.style.display = 'none';
        successView.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Start Conversation</span><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>`;
      }
    });

    // Expose open function globally
    window.openQuickConnect = openModal;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

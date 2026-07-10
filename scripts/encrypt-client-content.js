const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Configuration
const ITERATIONS = 100000;
const KEY_LEN = 32; // 256 bits for AES-256
const DIGEST = 'sha256';

function encrypt(plainText, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12); // 12 bytes is standard for AES-GCM

  // Derive key using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST);

  // Encrypt
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag,
    encryptedData: encrypted,
    iterations: ITERATIONS
  };
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const password = args[0] || 'g3z-partner-2026';
  const inputFile = args[1] || path.join(__dirname, 'private-client-content.html');

  if (!fs.existsSync(inputFile)) {
    // Create a default file if it doesn't exist
    const defaultHTML = `
<div class="unlocked-container">
  <div class="client-header">
    <span class="badge">Partner Access</span>
    <h2>Client Strategy Portal</h2>
    <p>Welcome back! Below are your active marketing pitch decks, site audits, and design prototypes.</p>
  </div>

  <div class="deck-grid">
    <!-- Deck 1 -->
    <div class="deck-card">
      <div class="deck-preview intro-deck">
        <div class="glow-orb"></div>
        <span class="material-symbols-outlined icon">presentation_play</span>
      </div>
      <div class="deck-info">
        <h3>G3Z Creative Introduction</h3>
        <p>Overview of our custom static web architecture, local SEO strategy, and client onboarding workflow.</p>
        <div class="deck-meta">
          <span>Format: Google Slides</span>
          <span>Updated: July 2026</span>
        </div>
        <div class="deck-actions">
          <a href="https://docs.google.com/presentation/d/e/2PACX-1vT5nS7uW-QjXvW21M4U5Q8XzK5E5W9/pub?start=false&loop=false&delayms=3000" target="_blank" class="deck-btn primary">
            <span class="material-symbols-outlined">visibility</span> View Deck
          </a>
        </div>
      </div>
    </div>

    <!-- Deck 2 -->
    <div class="deck-card">
      <div class="deck-preview seo-deck">
        <div class="glow-orb"></div>
        <span class="material-symbols-outlined icon">query_stats</span>
      </div>
      <div class="deck-info">
        <h3>Local SEO & GSC Strategy Pitch</h3>
        <p>A deep dive into ranking signals, Miramar local citation building, and custom schema markups.</p>
        <div class="deck-meta">
          <span>Format: PDF Presentation</span>
          <span>Updated: June 2026</span>
        </div>
        <div class="deck-actions">
          <a href="#" class="deck-btn primary">
            <span class="material-symbols-outlined">visibility</span> View Presentation
          </a>
          <a href="#" class="deck-btn secondary">
            <span class="material-symbols-outlined">download</span> Download PDF
          </a>
        </div>
      </div>
    </div>

    <!-- Deck 3 -->
    <div class="deck-card">
      <div class="deck-preview cro-deck">
        <div class="glow-orb"></div>
        <span class="material-symbols-outlined icon">percent</span>
      </div>
      <div class="deck-info">
        <h3>Conversion Optimization Framework</h3>
        <p>Case study analysis showing how 100/100 Lighthouse scores lead to 40%+ drop in bounce rates.</p>
        <div class="deck-meta">
          <span>Format: Figma Mockup</span>
          <span>Updated: May 2026</span>
        </div>
        <div class="deck-actions">
          <a href="https://figma.com" target="_blank" class="deck-btn primary">
            <span class="material-symbols-outlined">open_in_new</span> Open Figma
          </a>
        </div>
      </div>
    </div>
  </div>

  <div class="client-footer">
    <p>Need support or ready to discuss details? <a href="https://meetings-na2.hubspot.com/christian-gomez" target="_blank">Book a Strategy Session</a> or email <a href="mailto:christian@g3zcreative.com">christian@g3zcreative.com</a>.</p>
  </div>
</div>
`;
    fs.writeFileSync(inputFile, defaultHTML.trim(), 'utf8');
    console.log(`Created default unencrypted file at: ${inputFile}`);
  }

  const plainText = fs.readFileSync(inputFile, 'utf8');
  const result = encrypt(plainText, password);

  console.log('\n--- ENCRYPTED PAYLOAD GENERATED ---');
  console.log(`Password used: "${password}"`);
  console.log(`Input File: ${inputFile}`);
  console.log('\nCopy and paste this config object into clients.html:\n');
  console.log(JSON.stringify(result, null, 2));
  console.log('-----------------------------------\n');
}

if (require.main === module) {
  main();
}

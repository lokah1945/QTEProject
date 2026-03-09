/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DEVICE MANAGER V7.16.2 — SESSION SEED ROTATION (ANTI-FORENSIC FINGERPRINT)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 🔥 CHANGELOG V7.16.2 (2026-03-05):
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * V7.16.2 (2026-03-05): MARKET SHARE SOURCE → BrowserMarketshare COLLECTION
 *   - loadMarketShare(): Rewritten to read from BrowserMarketshare (flat OS structure)
 *   - constructor: Added browserMarketshareCollection config
 *   - initialize(): Added BrowserMarketshare collection setup
 *   - acquireFingerprint(): osKey mapping updated for flat OS keys (Windows 11/10, macOS, Linux)
 *   - selectBrowserByMarketShareWithOSValidation(): Fallback key updated
 *   - normalizeBrowserMarketShare(): field priority: market_share > marketshare > market_agent
 *
 * V7.16.1 (2026-03-05): OPERA & BRAVE BROWSER SUPPORT (CHROMIUM-NATIVE)
 *   - Opera & Brave are Chromium-based → use fingerprints_chrome (no separate collections)
 *   - acquireFingerprint(): FP_COLLECTION_MAP maps opera/brave → 'chrome' for collection lookup
 *   - toFingerprintObject(): Nullifies userAgentData for opera/brave (native UA, no spoof)
 *   - OS_BROWSER_COMPATIBILITY_MATRIX: Added brave to all OS entries
 *   - getDefaultMarketShare(): Added brave to windows/linux/macos
 *   - getBrowserName(): Added opera & brave PascalCase mapping + UA fallback (OPR/Brave)
 *
 * V7.15.0 PATCH A (P0 CRITICAL): SESSION SEED → FONT SYSTEM PROPAGATION
 *   ROOT CAUSE: toFingerprintObject() passed raw dbEntry to generateFontProfile()
 *     → dbEntry has no fingerprintSeed field → sessionSeed always null in font system
 *     → buildFontList() session subset NEVER activated → font list fully deterministic
 *     → Font profile not database-driven per session
 *   SOLUTION: Create shallow clone with fingerprintSeed = sessionSeed before passing
 *     → Object.assign({}, dbEntry, { fingerprintSeed: sessionSeed })
 *     → sessionSeed now flows: toFingerprintObject → generateFontProfile → buildFontList
 *
 * 📋 PREVIOUS V7.14.0 (2026-03-02 03:36 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * FULL NEW CONCEPT — QTE DATABASE DRIVEN FINGERPRINTING WITH 100% STEALTH
 * NO BACKWARD COMPATIBILITY, NO OBSOLETE CODE
 *
 *   PATCH A (P0 CRITICAL): SESSION SEED ROTATION — ROOT CAUSE FIX
 *     ROOT CAUSE: fingerprintSeed = dbEntry._id (MongoDB ObjectId, STATIC FOREVER)
 *       → ALL noise functions downstream produce IDENTICAL hashes every session
 *       → Canvas, audio, font, DOMRect, mediaDevices, storage = SAME across sessions
 *       → Trivial cross-session tracking by anti-bot (FPjs, CreepJS)
 *     SOLUTION (Brave-inspired dual-key architecture):
 *       → NEW: _generateSessionSeed(dbEntryId, sessionId) class method
 *         * Formula: hash(String(dbEntry._id) + '|' + sessionId + '|' + Date.now())
 *         * dbEntry._id = persistence anchor (same profile = related base)
 *         * sessionId = session differentiator (changes every session)
 *         * Date.now() = uniqueness guarantee even if sessionId reused
 *         * Output: 16-char hex string (deterministic per call inputs + timestamp)
 *         * Uses Math.imul(31, h) + Math.imul(37, h2) dual hash for 64-bit coverage
 *         * Same hash pattern as _deterministicJitter (v7.10.0) and extensions merge (v7.13.0)
 *       → MODIFIED: acquireFingerprint() — generates sessionSeed, passes to toFingerprintObject
 *       → MODIFIED: generateIdentity() — now delegates to acquireFingerprint (auto-inherits)
 *       → MODIFIED: toFingerprintObject(dbEntry, sessionSeed) — NEW second parameter
 *
 *   PATCH B (P0 CRITICAL): fingerprintSeed NOW = sessionSeed
 *     BEFORE: fingerprintSeed: dbEntry._id  (STATIC — same every session)
 *     AFTER:  fingerprintSeed: sessionSeed   (ROTATED — different every session)
 *     DOWNSTREAM IMPACT:
 *       → stealth_api.js Layer 2: Noise.seed will use HW.identity.sessionSeed (needs separate update)
 *       → BrowserLauncher.js: fpEmulationConfig.identityId = fp.fingerprintSeed → AUTO-UPDATES
 *       → workerStealthScript: seed from fpEmulationConfig.identityId → AUTO-UPDATES
 *       → alignIdentityWithNetwork: fp.fingerprintSeed used in DICS → AUTO-UPDATES
 *       → _deterministicJitter: uses fp.fingerprintSeed → AUTO-UPDATES
 *
 *   PATCH C (P0 CRITICAL): canvas.noise_seed NOW = sessionSeed-derived
 *     BEFORE: noise_seed: dbEntry.canvas?.noise_seed || dbEntry._id + '-canvas'  (STATIC)
 *     AFTER:  noise_seed: sessionSeed + '-canvas'  (ROTATED per session)
 *
 *   PATCH D (P0 CRITICAL): audio.noise_seed NOW = sessionSeed-derived
 *     BEFORE: noise_seed: dbEntry.audio?.noise_seed || dbEntry._id + '-audio'  (STATIC)
 *     AFTER:  noise_seed: sessionSeed + '-audio'  (ROTATED per session)
 *
 *   PATCH E (P0 CRITICAL): NEW identity block in fpObject
 *     BEFORE: No identity block. fingerprintSeed was the only seed reference.
 *     AFTER:  fp.identity = { id: dbEntry._id, sessionSeed: sessionSeed }
 *       → id: STATIC persistence anchor (MongoDB ObjectId, for logging/DB ref)
 *       → sessionSeed: ROTATED per session (for ALL noise functions downstream)
 *
 *   PATCH F (P1 HIGH): _writeFingerprintLog updated for sessionSeed tracking
 *     BEFORE: logEntry.fingerprintSeed = dbEntry._id (always static)
 *     AFTER:  logEntry.fingerprintSeed = sessionSeed (shows actual rotated seed)
 *             logEntry.persistenceAnchor = dbEntry._id (preserved for DB reference)
 *             logEntry.normalizedFP.identity = { id, sessionSeed } (full identity block)
 *
 *   WHAT MUST NOT CHANGE (anti-bot consistency check values — STATIC from DB):
 *     → WebGL vendor/renderer, Screen resolution, hardwareConcurrency,
 *       deviceMemory, navigator.platform, userAgentData, Locale/timezone/languages
 *
 *   UNCHANGED VERBATIM (v7.13.0):
 *     constructor, close, _deterministicJitter,
 *     alignIdentityWithNetwork, getHardwareSample, getHostPlatform,
 *     validateOSBrowserCompatibility, filterCompatibleBrowsers,
 *     loadMarketShare, normalizeBrowserMarketShare, getDefaultMarketShare,
 *     selectBrowserByMarketShareWithOSValidation,
 *     weightedRandomSelect, updateFingerprintStats, releaseFingerprint,
 *     getBrowserName, getStats,
 *     bucketizeDeviceMemory, normalizeHardwareConcurrency, validateCpuRamCoherence,
 *     migrateWebGLParameters, initialize (except version string), OS_BROWSER_COMPATIBILITY_MATRIX
 *
 *   CROSS-CODE IMPACT:
 *     → BrowserLauncher.js v8.20.0: fpEmulationConfig.identityId = fp.fingerprintSeed
 *       fp.fingerprintSeed is now sessionSeed → identityId auto-rotates. NO CHANGE NEEDED.
 *     → stealth_api.js v1.17.1: Layer 2 Noise.seed = HW.identity.id
 *       NEEDS SEPARATE UPDATE: change to HW.identity.sessionSeed
 *     → workerStealthScript: seed from fpEmulationConfig.identityId → auto-rotates
 *
 *   Synced: stealth_apiHelper.js v2.1.0, stealth_api.js v1.17.1,
 *           stealth_patches.js v12.0.0, stealth_chromium.js v3.2.0,
 *           stealth_firefox.js v3.0.0, BrowserLauncher.js v8.20.0,
 *           stealth_font.js v7.2.0
 *
 * 📋 PREVIOUS V7.13.0 (2026-02-28 05:38 WIB):
 *   DB IMMUTABILITY + FP LOG + EXTENSIONS FIX
 *     PATCH A-L: See v7.13.0 changelog for full details
 *
 * 📋 PREVIOUS V7.12.0 (2026-02-28 04:21 WIB):
 *   DB WEBGL COHERENCE VALIDATION — Phase 3 Database Cleanup
 *
 * 📋 PREVIOUS V7.11.0 (2026-02-22 06:42 WIB):
 *   DA-v3 PATCH PLAN — Fingerprint Persistence Across Sessions
 *
 * 📋 PREVIOUS V7.10.0 (2026-02-22 03:15 WIB):
 *   DA-v2 Bug #5 FIX: Deterministic Accept-Language Q-factor
 *
 * 📋 PREVIOUS V7.9.0 — V7.5.1: See previous changelogs
 *
 * 🎯 STATUS: PRODUCTION READY
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { MongoClient } = require('mongodb');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const StealthFont = require('./stealth_font'); // V15.0.0
const StealthLanguage = require('./stealth_language'); // V7.5.1: DICS Engine

// ═══════════════════════════════════════════════════════════════════════════════
// OS-BROWSER COMPATIBILITY MATRIX (HARD RULES)
// ═══════════════════════════════════════════════════════════════════════════════
const OS_BROWSER_COMPATIBILITY_MATRIX = {
  windows: { chrome: true, edge: true, firefox: true, safari: false, opera: true, brave: true },
  macos: { chrome: true, edge: true, firefox: true, safari: true, opera: true, brave: true },
  linux: { chrome: true, edge: true, firefox: true, safari: false, opera: true, brave: true }
};

// ═══════════════════════════════════════════════════════════════════════════════
// V7.16.1: CHROMIUM-BASED BROWSER → FP COLLECTION MAPPING
// Opera & Brave are Chromium-native, so they share fingerprints_chrome.
// No UA spoofing — browser runs natively with its own real UA.
// ═══════════════════════════════════════════════════════════════════════════════
const FP_COLLECTION_MAP = {
  opera: 'chrome',
  brave: 'chrome'
};

// ═══════════════════════════════════════════════════════════════════════════════
// DA-v3 PATCH 2: Chromium deviceMemory Bucketization
// ═══════════════════════════════════════════════════════════════════════════════
function bucketizeDeviceMemory(rawGB) {
  const BUCKETS = [0.25, 0.5, 1, 2, 4, 8];
  if (!rawGB || rawGB <= 0) return 8;
  if (rawGB >= 8) return 8;
  for (let i = BUCKETS.length - 1; i >= 0; i--) {
    if (rawGB >= BUCKETS[i]) return BUCKETS[i];
  }
  return 0.25;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DA-v3 PATCH 3: Normalize hardwareConcurrency to Common Values
// ═══════════════════════════════════════════════════════════════════════════════
function normalizeHardwareConcurrency(cores) {
  const COMMON_VALUES = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32];
  if (!cores || cores <= 0) return 4;
  if (cores > 32) return 32;
  let closest = COMMON_VALUES[0];
  for (const v of COMMON_VALUES) {
    if (Math.abs(v - cores) <= Math.abs(closest - cores)) closest = v;
  }
  return closest;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DA-v3 PATCH 4: CPU↔RAM Coherence Validation
// ═══════════════════════════════════════════════════════════════════════════════
function validateCpuRamCoherence(cores, memoryGB) {
  if (memoryGB <= 2 && cores > 4) {
    console.warn(`[DeviceManager] CPU/RAM anomaly: ${memoryGB}GB + ${cores}cores → capped to 4`);
    return 4;
  }
  if (memoryGB <= 4 && cores > 8) {
    console.warn(`[DeviceManager] CPU/RAM anomaly: ${memoryGB}GB + ${cores}cores → capped to 8`);
    return 8;
  }
  return cores;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════
class DeviceManager {
  constructor(config) {
    this.config = {
      mongoUri: config.mongoUri || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017',
      dbName: config.dbName || 'QuantumTrafficDB',
      hardwareCollection: config.hardwareCollection || 'hardware_profiles',
      fingerprintsCollections: config.fingerprintsCollections || {
        chrome: 'fingerprints_chrome',
        edge: 'fingerprints_edge',
        firefox: 'fingerprints_firefox',
        safari: 'fingerprints_safari'
      },
      useragentCollection: config.useragentCollection || 'useragent_selector',
      browserMarketshareCollection: config.browserMarketshareCollection || 'BrowserMarketshare',
      fontDatabaseCollection: config.fontDatabaseCollection || 'font_database',
      fontPersonaCollection: config.fontPersonaCollection || 'font_persona',
      browserSelectionMode: config.browserSelectionMode || 'auto',
      tierWeights: config.tierWeights || { 0: 50, 1: 30, 2: 12, 3: 5, 4: 2, 5: 1 }
    };

    this.client = null;
    this.db = null;
    this.collections = {};
    this.hostPlatform = null;
    this.marketShareCache = null;
    this.fontManager = null;
    this.osCompatibilityMatrix = OS_BROWSER_COMPATIBILITY_MATRIX;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // INITIALIZATION — V7.13.0: REMOVED Step 6 (validateWebGLCoherence)
  // ═════════════════════════════════════════════════════════════════════════════
  async initialize() {
    if (this.client) {
      console.log('[DeviceManager] Already initialized');
      return;
    }

    console.log('[DeviceManager] Initializing V7.15.0 (Session Seed Rotation + DA-v3 FP Persistence + DICS)...');

    // 1. Detect host platform
    try {
      this.hostPlatform = this.getHostPlatform();
      console.log(`[DeviceManager] Host: ${this.hostPlatform.platform} ${this.hostPlatform.version} ${this.hostPlatform.arch}`);
    } catch (error) {
      console.error(`[DeviceManager] Platform detection failed: ${error.message}`);
      throw new Error(`Platform detection failed: ${error.message}`);
    }

    // 2. Connect to MongoDB
    const mongoUri = process.env.DB_CONNECTION_STRING || this.config.mongoUri;
    try {
      this.client = new MongoClient(mongoUri);
      await this.client.connect();
      this.db = this.client.db(this.config.dbName);
      console.log(`[DeviceManager] Connected to ${this.config.dbName}`);
    } catch (err) {
      console.error(`[DeviceManager] MongoDB Connection Failed: ${err.message}`);
      throw new Error(`MongoDB connection failed: ${err.message}`);
    }

    // 3. Setup collections
    try {
      this.collections.hardware = this.db.collection(this.config.hardwareCollection);
      this.collections.useragent = this.db.collection(this.config.useragentCollection);
      this.collections.browserMarketshare = this.db.collection(this.config.browserMarketshareCollection);
      for (const [browser, collName] of Object.entries(this.config.fingerprintsCollections)) {
        this.collections[browser] = this.db.collection(collName);
      }
      console.log(`[DeviceManager] Collections mapped: ${Object.keys(this.collections).length} collections`);
    } catch (error) {
      console.error(`[DeviceManager] Collection setup failed: ${error.message}`);
      throw new Error(`Collection setup failed: ${error.message}`);
    }

    // 4. Load market share data
    try {
      await this.loadMarketShare();
    } catch (error) {
      console.warn(`[DeviceManager] Market share load failed, using defaults: ${error.message}`);
      this.marketShareCache = this.getDefaultMarketShare();
    }

    // 5. Initialize font manager
    try {
      this.fontManager = new StealthFont({
        mongoUri: mongoUri,
        dbName: this.config.dbName,
        fontDatabaseCollection: this.config.fontDatabaseCollection,
        fontPersonaCollection: this.config.fontPersonaCollection,
        tierWeights: this.config.tierWeights
      });
      await this.fontManager.initialize();
      console.log('[DeviceManager] FontManager initialized');
    } catch (fontErr) {
      console.warn(`[DeviceManager] FontManager initialization warning: ${fontErr.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // V7.13.0 PATCH A: Step 6 (validateWebGLCoherence) REMOVED
    // ═══════════════════════════════════════════════════════════════════════════

    // 6. Verify availability
    try {
      const stats = await this.getStats();
      console.log(`[DeviceManager] Available hardware: ${stats.hardwareByPlatform[this.hostPlatform.platform] || 0}`);
      console.log('[DeviceManager] Available browsers:');
      for (const [browser, count] of Object.entries(stats.fingerprintsByBrowser)) {
        console.log(`  - ${browser}: ${count}`);
      }
      if ((stats.hardwareByPlatform[this.hostPlatform.platform] || 0) === 0) {
        console.warn(`[DeviceManager] No hardware profiles found for ${this.hostPlatform.platform}. Fingerprinting may fail.`);
      }
    } catch (statsErr) {
      console.warn(`[DeviceManager] Could not fetch initial stats: ${statsErr.message}`);
    }

    console.log('[DeviceManager] Initialization complete v7.15.0 - Session Seed Rotation + DA-v3 FP Persistence + DICS ready');
  }

  async close() {
    if (this.fontManager) {
      try {
        await this.fontManager.close();
        console.log('[DeviceManager] FontManager closed');
      } catch (error) {
        console.warn(`[DeviceManager] FontManager close warning: ${error.message}`);
      }
    }

    if (this.client) {
      try {
        await this.client.close();
        this.client = null;
        console.log('[DeviceManager] MongoDB connection closed');
      } catch (error) {
        console.error(`[DeviceManager] Connection close failed: ${error.message}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // v7.10.0: DETERMINISTIC JITTER — DA-v2 Bug #5 FIX
  // ═══════════════════════════════════════════════════════════════════════════
  _deterministicJitter(seed, index) {
    let h = 0;
    const str = String(seed) + '-header-q-' + String(index);
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return ((Math.abs(h) % 80) - 40) / 1000;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // V7.14.0 PATCH A: SESSION SEED GENERATOR (NEW METHOD)
  // ═══════════════════════════════════════════════════════════════════════════
  // Generates a unique session seed per acquireFingerprint() call.
  // Formula: dualHash(dbEntryId + '|' + sessionId + '|' + timestamp)
  // - dbEntryId: persistence anchor (same profile → related seed base)
  // - sessionId: session differentiator (changes every session)
  // - timestamp: uniqueness guarantee (Date.now() at generation time)
  // Output: 16-char hex string
  // Uses Math.imul(31, h) + Math.imul(37, h2) dual hash for 64-bit coverage
  // Same hash pattern as _deterministicJitter (v7.10.0)
  // ═══════════════════════════════════════════════════════════════════════════
  _generateSessionSeed(dbEntryId, sessionId) {
    const raw = String(dbEntryId) + '|' + String(sessionId) + '|' + String(Date.now());
    let h1 = 0;
    let h2 = 0;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      h1 = Math.imul(31, h1) + ch | 0;
      h2 = Math.imul(37, h2) + ch | 0;
    }
    const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return part1 + part2;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // V7.5.1: DICS IDENTITY GENERATOR (HUMAN BEHAVIOR MODELING)
  // ═════════════════════════════════════════════════════════════════════════════
  async alignIdentityWithNetwork(fp, networkData) {
    const WID = '[DeviceManager:DICS]';

    const safeCountryCode = (networkData.country || '').trim().toUpperCase();
    const safeTimezone = (networkData.timezone || '').trim();

    console.log(`${WID} Generating Dynamic Identity for IP: ${networkData.ip} (${safeCountryCode} | ${safeTimezone})`);

    try {
      // ═════════════════════════════════════════════════════════════════════════
      // STEP 1: Cross-Check Database Regions (Timezone Validation)
      // ═════════════════════════════════════════════════════════════════════════
      const regionsCollection = this.db.collection('regions');
      const regionDoc = await regionsCollection.findOne({ regionCode: safeCountryCode });

      let databaseValidatedLocale = null;
      let targetTimezone = safeTimezone;

      if (regionDoc) {
        console.log(`${WID} Region found in database: ${regionDoc.regionName} (${safeCountryCode})`);

        const locationMatch = regionDoc.locations?.find(loc => 
          loc.timezone.trim() === safeTimezone
        );

        if (locationMatch) {
          databaseValidatedLocale = locationMatch.locale;
          console.log(`${WID} Database confirmed timezone & locale: ${targetTimezone} → ${databaseValidatedLocale}`);
        } else {
          if (regionDoc.locations && regionDoc.locations.length > 0) {
            databaseValidatedLocale = regionDoc.locations[0].locale;
            console.warn(`${WID} Timezone mismatch within Region. Using first region locale: ${databaseValidatedLocale} (keeping IP Timezone: ${targetTimezone})`);
          } else {
            databaseValidatedLocale = regionDoc.locale || null;
            console.warn(`${WID} Empty locations array. Using region default locale: ${databaseValidatedLocale}`);
          }
        }
      } else {
        console.warn(`${WID} Region DB not found for code '${safeCountryCode}'. Will use DICS default for this country.`);
      }

      // ═════════════════════════════════════════════════════════════════════════
      // STEP 2: Generate Dynamic Identity via DICS Engine
      // ═════════════════════════════════════════════════════════════════════════
      const identity = StealthLanguage.getIdentity(safeCountryCode, fp.fingerprintSeed);

      console.log(`${WID} Persona: ${identity.persona}`);
      console.log(`${WID} Generated Locale: ${identity.locale}`);
      console.log(`${WID} Languages: ${JSON.stringify(identity.languages)}`);
      console.log(`${WID} Accept-Language Header: ${identity.header.substring(0, 60)}...`);

      // ═════════════════════════════════════════════════════════════════════════
      // STEP 3: Validate Against Database (If Available)
      // ═════════════════════════════════════════════════════════════════════════
      let finalLocale = identity.locale;

      if (databaseValidatedLocale) {
        finalLocale = databaseValidatedLocale;
        console.log(`${WID} Override primary locale with DB: ${identity.locale} → ${finalLocale}`);

        identity.languages[0] = finalLocale;

        const shortLang = finalLocale.split('-')[0];
        if (identity.languages.length > 1 && identity.languages[1] !== shortLang) {
          identity.languages[1] = shortLang;
        }

        identity.header = identity.languages.map((lang, i) => {
          if (i === 0) return lang;
          const baseQ = 1.0 - (i * 0.1);
          const jitter = this._deterministicJitter(fp.fingerprintSeed, i);
          let finalQ = baseQ + jitter;
          if (finalQ < 0.1) finalQ = 0.1;
          if (finalQ > 0.95) finalQ = 0.95;
          finalQ = finalQ.toFixed(1);
          return `${lang};q=${finalQ}`;
        }).join(',');

        console.log(`${WID} Regenerated Header: ${identity.header.substring(0, 60)}...`);
      }

      // ═════════════════════════════════════════════════════════════════════════
      // STEP 4: Apply Identity to Fingerprint (HARD OVERRIDE)
      // ═════════════════════════════════════════════════════════════════════════
      fp.locale = finalLocale;
      fp.timezone = targetTimezone;
      fp.languages = identity.languages;
      fp.geolocation = {
        latitude: parseFloat(networkData.lat),
        longitude: parseFloat(networkData.lon),
        accuracy: 100
      };
      fp._meta = fp._meta || {};
      fp._meta.headerLanguage = identity.header;
      fp._meta.persona = identity.persona;

      console.log(`${WID} Identity Normalized (DICS v1.0):`);
      console.log(`${WID}    Persona: ${fp._meta.persona}`);
      console.log(`${WID}    Locale: ${fp.locale}`);
      console.log(`${WID}    Timezone: ${fp.timezone}`);
      console.log(`${WID}    Languages: ${JSON.stringify(fp.languages)}`);
      console.log(`${WID}    Header: ${fp._meta.headerLanguage.substring(0, 70)}...`);
      console.log(`${WID}    Geo: ${fp.geolocation.latitude}, ${fp.geolocation.longitude}`);

      return fp;

    } catch (error) {
      console.error(`${WID} Normalization Failed: ${error.message}`);
      console.error(`${WID} Stack: ${error.stack}`);

      console.warn(`${WID} Falling back to static identity (locale: en-US)`);

      fp.locale = 'en-US';
      fp.timezone = safeTimezone || 'America/New_York';
      fp.languages = fp.navigator?.languages || ['en-US', 'en'];
      fp.geolocation = {
        latitude: parseFloat(networkData.lat) || 0,
        longitude: parseFloat(networkData.lon) || 0,
        accuracy: 100
      };
      fp._meta = fp._meta || {};
      fp._meta.headerLanguage = 'en-US,en;q=0.9';
      fp._meta.persona = 'FALLBACK';

      return fp;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // V15.2.0: GET HARDWARE SAMPLE (FOR "TYPICAL" FLAG LOOKUP)
  // ═════════════════════════════════════════════════════════════════════════════
  async getHardwareSample(osName) {
    try {
      if (!osName || typeof osName !== 'string') {
        console.warn(`[DeviceManager] Invalid osName: ${osName}, using fallback`);
        return null;
      }
      const osLower = osName.toLowerCase();
      const sample = await this.collections.hardware.findOne({ os: osLower });
      return sample;
    } catch (error) {
      console.warn(`[DeviceManager] Failed to get hardware sample for ${osName}: ${error.message}`);
      return null;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PLATFORM DETECTION
  // ═════════════════════════════════════════════════════════════════════════════
  getHostPlatform() {
    const platform = os.platform();
    const arch = os.arch();
    const release = os.release();

    const result = {
      platform: null,
      version: null,
      arch: arch,
      distribution: null
    };

    if (platform === 'win32') {
      result.platform = 'windows';
      const parts = release.split('.');
      if (parts.length >= 3) {
        const build = parseInt(parts[2], 10);
        result.version = (build >= 22000) ? '11' : '10';
      } else {
        result.version = '10';
      }
      return result;
    }

    if (platform === 'linux') {
      result.platform = 'linux';
      try {
        const osRelease = execSync('cat /etc/os-release', { encoding: 'utf8' });
        const idMatch = osRelease.match(/ID="?([^"\n]+)"?/i);
        if (idMatch) {
          result.distribution = idMatch[1].replace(/"/g, '').toLowerCase();
        }
        const versionMatch = osRelease.match(/VERSION_ID="?([^"\n]+)"?/i);
        if (versionMatch) {
          result.version = versionMatch[1].replace(/"/g, '');
        }
      } catch (e) {
        console.warn('[DeviceManager] Cannot detect Linux distribution, using generic');
        result.distribution = 'linux';
      }
      return result;
    }

    if (platform === 'darwin') {
      result.platform = 'macos';
      const darwinVersion = parseInt(release.split('.')[0], 10);
      const versionMap = {
        23: '14',
        22: '13',
        21: '12',
        20: '11',
        19: '10.15',
        18: '10.14'
      };
      result.version = versionMap[darwinVersion] || '14';
      return result;
    }

    console.warn(`[DeviceManager] Unsupported platform: ${platform}, defaulting to windows`);
    result.platform = 'windows';
    result.version = '10';
    return result;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // V15.0.0: OS-BROWSER COMPATIBILITY VALIDATION
  // ═════════════════════════════════════════════════════════════════════════════
  validateOSBrowserCompatibility(browserName, osName) {
    if (!browserName || !osName) {
      console.warn(`[DeviceManager] Invalid compatibility check: browser=${browserName}, os=${osName}`);
      return true;
    }

    const browserLower = browserName.toLowerCase();
    const osLower = osName.toLowerCase();

    if (!this.osCompatibilityMatrix[osLower]) {
      console.warn(`[DeviceManager] Unknown OS: ${osName}, allowing compatibility`);
      return true;
    }

    const isCompatible = this.osCompatibilityMatrix[osLower][browserLower];
    if (isCompatible === false) {
      console.warn(`[DeviceManager] OS-BROWSER MISMATCH: ${osName} + ${browserName} = NOT COMPATIBLE`);
      return false;
    }

    return true;
  }

  filterCompatibleBrowsers(marketShare, osName) {
    if (!marketShare || typeof marketShare !== 'object') {
      console.warn('[DeviceManager] Invalid marketShare data, returning empty array');
      return [];
    }

    const osLower = osName.toLowerCase();
    const compatible = Object.entries(marketShare)
      .filter(([name, info]) => {
        if (!info || info.available !== true) return false;
        const isCompatible = this.validateOSBrowserCompatibility(name, osLower);
        if (!isCompatible) return false;
        return true;
      })
      .map(([name, info]) => ({
        name,
        marketshare: info.marketshare || 0
      }));

    return compatible;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // MARKET SHARE MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════════
  // V7.16.2: Read from BrowserMarketshare collection (flat OS structure)
  async loadMarketShare() {
    let doc = null;

    // Primary: BrowserMarketshare collection
    try {
      doc = await this.collections.browserMarketshare.findOne({});
    } catch (e) {
      console.warn(`[DeviceManager] Failed to load BrowserMarketshare: ${e.message}`);
    }

    if (!doc || !doc.operating_systems) {
      console.warn('[DeviceManager] BrowserMarketshare not found, using defaults');
      this.marketShareCache = this.getDefaultMarketShare();
      return;
    }

    this.marketShareCache = {};
    const osdata = doc.operating_systems;

    // V7.16.2: Flat OS structure — keys are "Windows 11", "Windows 10", "macOS", "Linux"
    for (const [osName, osData] of Object.entries(osdata)) {
      if (!osData.browsers) continue;

      const normalized = this.normalizeBrowserMarketShare(osData.browsers);
      const osLower = osName.toLowerCase();

      // Store with the exact OS name as key (lowercase for lookup)
      this.marketShareCache[osLower] = normalized;

      // Also store platform-specific aliases for acquireFingerprint() osKey resolution
      if (osLower.startsWith('windows')) {
        const pv = osData.platformVersion;
        if (pv) {
          this.marketShareCache[`windows_${pv}`] = normalized;
        }
      } else if (osLower === 'macos' && osData.platformVersion) {
        this.marketShareCache[`macos_${osData.platformVersion}`] = normalized;
      } else if (osLower === 'linux' && osData.platformVersion) {
        this.marketShareCache[`linux_${osData.platformVersion}`] = normalized;
      }
    }

    const version = doc.metadata?.version || 'unknown';
    const source = doc.metadata?.source || 'unknown';
    console.log(`[DeviceManager] Loaded market share v${version} (${source}) — ${Object.keys(this.marketShareCache).length} OS entries`);
  }

  normalizeBrowserMarketShare(browsers) {
    if (!browsers || typeof browsers !== 'object') {
      console.warn('[DeviceManager] Invalid browsers data for normalization');
      return {};
    }

    const normalized = {};
    for (const [browserName, browserData] of Object.entries(browsers)) {
      const name = browserName.toLowerCase();
      const share = browserData.market_share || browserData.marketshare || browserData.market_agent || 0;

      let mappedName = name;
      if (name === 'internet explorer') mappedName = 'ie';
      if (name === 'other') continue;

      normalized[mappedName] = {
        available: true,
        marketshare: share
      };
    }

    return normalized;
  }

  // V7.16.2: Default keys match BrowserMarketshare flat structure
  getDefaultMarketShare() {
    return {
      'windows 11': {
        chrome: { available: true, marketshare: 64.5 },
        edge: { available: true, marketshare: 18.2 },
        firefox: { available: true, marketshare: 7.8 },
        opera: { available: true, marketshare: 3.5 },
        brave: { available: true, marketshare: 2.8 }
      },
      'windows 10': {
        chrome: { available: true, marketshare: 63.8 },
        edge: { available: true, marketshare: 17.5 },
        firefox: { available: true, marketshare: 8.2 },
        opera: { available: true, marketshare: 3.8 },
        brave: { available: true, marketshare: 2.5 }
      },
      'linux': {
        firefox: { available: true, marketshare: 42.5 },
        chrome: { available: true, marketshare: 38.2 },
        edge: { available: true, marketshare: 4.3 },
        opera: { available: true, marketshare: 2.8 },
        brave: { available: true, marketshare: 2.2 }
      },
      'macos': {
        safari: { available: true, marketshare: 52.3 },
        chrome: { available: true, marketshare: 31.5 },
        firefox: { available: true, marketshare: 7.8 },
        edge: { available: true, marketshare: 4.2 },
        brave: { available: true, marketshare: 2.1 },
        opera: { available: true, marketshare: 1.3 }
      }
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // V15.2.0: ENHANCED SELECTION
  // ═════════════════════════════════════════════════════════════════════════════
  async selectBrowserByMarketShareWithOSValidation(osKey, osName) {
    // V7.16.2: Fallback chain — exact key → platform name → 'windows 11' default
    const marketShare = this.marketShareCache[osKey] 
      || this.marketShareCache[osKey.split('_')[0]] 
      || this.marketShareCache['windows 11'];
    const compatible = this.filterCompatibleBrowsers(marketShare, osName);

    if (compatible.length === 0) {
      console.warn(`[DeviceManager] No OS-compatible browsers found for ${osName}, defaulting to Chrome`);
      return 'chrome';
    }

    const hardwareSample = await this.getHardwareSample(osName);
    const boosted = compatible.map(browser => {
      let isTypical = false;
      if (hardwareSample && hardwareSample.browser_compatibility) {
        const browserCompat = hardwareSample.browser_compatibility[browser.name];
        isTypical = browserCompat?.typical === true;
      }
      const adjustedShare = browser.marketshare * (isTypical ? 1.2 : 1.0);
      return { ...browser, is_typical: isTypical, adjusted_share: adjustedShare };
    });

    const totalShare = boosted.reduce((sum, b) => sum + b.adjusted_share, 0);
    if (totalShare === 0) {
      console.warn('[DeviceManager] Total market share is 0, defaulting to first browser');
      return boosted[0].name;
    }

    const rand = Math.random() * totalShare;
    let cumulative = 0;
    for (const browser of boosted) {
      cumulative += browser.adjusted_share;
      if (rand <= cumulative) {
        return browser.name;
      }
    }

    return boosted[0].name;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // V7.3.0: ENHANCED ACQUIRE FINGERPRINT (INPUT VALIDATION + ERROR HANDLING)
  // V7.14.0 PATCH A: NOW GENERATES sessionSeed and passes to toFingerprintObject
  // ═════════════════════════════════════════════════════════════════════════════
  async acquireFingerprint(workerId, sessionId, browserType = 'auto') {
    if (!workerId) throw new Error('acquireFingerprint: workerId is required');
    if (!sessionId) throw new Error('acquireFingerprint: sessionId is required');
    if (!this.collections.hardware) {
      throw new Error('DeviceManager not initialized. Call initialize() first.');
    }

    const now = new Date();

    if (!this.hostPlatform) {
      try {
        this.hostPlatform = this.getHostPlatform();
      } catch (error) {
        throw new Error(`Platform detection failed: ${error.message}`);
      }
    }

    const hardwareQuery = { os: this.hostPlatform.platform };
    let hardwareCandidates;
    try {
      hardwareCandidates = await this.collections.hardware.find(hardwareQuery).toArray();
    } catch (error) {
      throw new Error(`Hardware query failed for ${this.hostPlatform.platform}: ${error.message}`);
    }

    if (!hardwareCandidates || hardwareCandidates.length === 0) {
      throw new Error(`No hardware profiles available for ${this.hostPlatform.platform}`);
    }

    if (browserType === 'auto') {
      // V7.16.2: osKey resolution for BrowserMarketshare flat structure
      let osKey = this.hostPlatform.platform;
      if (this.hostPlatform.platform === 'windows') {
        const sampleHw = hardwareCandidates[0];
        const buildNum = sampleHw.os_version || this.hostPlatform.version || '';
        // Detect Windows 11 vs 10 by build number (22000+ = Win11)
        const buildParts = buildNum.split('.');
        const buildMajor = parseInt(buildParts[2] || '0');
        if (buildMajor >= 22000) {
          osKey = 'windows 11';
        } else {
          osKey = 'windows 10';
        }
      } else if (this.hostPlatform.platform === 'linux') {
        osKey = 'linux';
      } else if (this.hostPlatform.platform === 'macos') {
        osKey = 'macos';
      }

      try {
        browserType = await this.selectBrowserByMarketShareWithOSValidation(osKey, this.hostPlatform.platform);
        console.log(`[${workerId}] Auto-selected browser: ${browserType}`);
      } catch (error) {
        console.warn(`[${workerId}] Browser selection failed: ${error.message}, defaulting to chrome`);
        browserType = 'chrome';
      }
    } else {
      if (typeof browserType !== 'string') {
        throw new Error(`Invalid browserType: must be string, got ${typeof browserType}`);
      }
      browserType = browserType.toLowerCase().trim();
      if (!browserType) {
        throw new Error('Invalid browserType: empty string');
      }
      if (!this.validateOSBrowserCompatibility(browserType, this.hostPlatform.platform)) {
        throw new Error(`OS-Browser mismatch: ${this.hostPlatform.platform} + ${browserType} = NOT COMPATIBLE!`);
      }
      console.log(`[${workerId}] Manual browser: ${browserType} (validated for ${this.hostPlatform.platform})`);
    }

    // V7.16.1: Chromium-native browsers (Opera/Brave) → use chrome FP collection
    const fpCollectionKey = FP_COLLECTION_MAP[browserType] || browserType;
    if (!this.collections[fpCollectionKey]) {
      throw new Error(`Invalid browser type: ${browserType} (collection: ${fpCollectionKey}). Available: ${Object.keys(this.collections).filter(k => !['hardware', 'useragent'].includes(k)).join(', ')}`);
    }

    // V7.16.1: For Chromium-native (Opera/Brave), fallback to chrome compatibility
    //          when hardware_profiles don't have opera/brave-specific entries
    const hwCompatKey = (FP_COLLECTION_MAP[browserType]) ? (hw) => {
      return hw.browser_compatibility[browserType] || hw.browser_compatibility[FP_COLLECTION_MAP[browserType]];
    } : (hw) => hw.browser_compatibility[browserType];

    const compatibleHardware = hardwareCandidates
      .filter(hw => {
        if (!hw || !hw.browser_compatibility) return false;
        const browserCompat = hwCompatKey(hw);
        return browserCompat?.available === true;
      })
      .sort((a, b) => {
        const aCompat = hwCompatKey(a);
        const bCompat = hwCompatKey(b);
        const aTypical = aCompat?.typical === true ? 1 : 0;
        const bTypical = bCompat?.typical === true ? 1 : 0;
        if (aTypical !== bTypical) return bTypical - aTypical;
        const aRarity = a.population?.rarity_score || 0;
        const bRarity = b.population?.rarity_score || 0;
        return aRarity - bRarity;
      });

    if (compatibleHardware.length === 0) {
      throw new Error(`No compatible ${browserType} hardware profiles found for ${this.hostPlatform.platform}`);
    }

    const hardwareIds = compatibleHardware.map(hw => hw._id);
    const fpCollection = this.collections[fpCollectionKey];

    let candidates;
    try {
      candidates = await fpCollection.aggregate([
        { $match: { hardware_id: { $in: hardwareIds } } },
        {
          $lookup: {
            from: this.config.hardwareCollection,
            localField: 'hardware_id',
            foreignField: '_id',
            as: 'hardware'
          }
        },
        { $unwind: '$hardware' },
        { $sort: { last_used: 1, usage_count: 1 } },
        { $limit: 100 }
      ]).toArray();
    } catch (error) {
      throw new Error(`Fingerprint aggregation failed for ${browserType}: ${error.message}`);
    }

    if (!candidates || candidates.length === 0) {
      throw new Error(`No ${browserType} fingerprints available for selected hardware!`);
    }

    const selected = this.weightedRandomSelect(candidates);

    try {
      await fpCollection.updateOne(
        { _id: selected._id },
        { $inc: { usage_count: 1 }, $set: { last_used: now } }
      );
    } catch (error) {
      console.warn(`[${workerId}] Failed to update fingerprint stats: ${error.message}`);
    }

    // V7.16.1: For Chromium-native browsers, check chrome compatibility as fallback
    const compatKey = selected.hardware.browser_compatibility?.[browserType] 
      ? browserType 
      : fpCollectionKey;
    const typicalFlag = selected.hardware.browser_compatibility?.[compatKey]?.typical === true ? '(typical)' : '';
    console.log(
      `[${workerId}] Selected ${browserType}: ${selected._id}, ` +
      `hw: ${selected.hardware._id}, tier: ${selected.hardware.population?.tier || 0}, ` +
      `usage: ${selected.usage_count || 0} ${typicalFlag}`
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // V7.14.0 PATCH A: Generate sessionSeed and pass to toFingerprintObject
    // ═══════════════════════════════════════════════════════════════════════════
    const sessionSeed = this._generateSessionSeed(selected._id, sessionId);
    console.log(`[${workerId}] Session seed generated: ${sessionSeed} (anchor: ${selected._id})`);

    return this.toFingerprintObject(selected, sessionSeed, browserType);
  }

  weightedRandomSelect(candidates) {
    if (!candidates || candidates.length === 0) {
      throw new Error('weightedRandomSelect: candidates array is empty');
    }

    const tierGroups = {};
    candidates.forEach(fp => {
      const tier = fp.hardware?.population?.tier || 0;
      if (!tierGroups[tier]) tierGroups[tier] = [];
      tierGroups[tier].push(fp);
    });

    let totalWeight = 0;
    for (const tier in tierGroups) {
      const weight = this.config.tierWeights[tier] || 1;
      totalWeight += weight * tierGroups[tier].length;
    }

    if (totalWeight === 0) {
      console.warn('[DeviceManager] Total weight is 0, returning random candidate');
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    let random = Math.random() * totalWeight;
    for (const tier in tierGroups) {
      const weight = this.config.tierWeights[tier] || 1;
      const groupWeight = weight * tierGroups[tier].length;
      if (random <= groupWeight) {
        return tierGroups[tier][Math.floor(Math.random() * tierGroups[tier].length)];
      }
      random -= groupWeight;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  async updateFingerprintStats(fingerprintId, browserType, success = true) {
    if (!fingerprintId) {
      console.warn('[DeviceManager] Invalid fingerprintId, skipping stats update');
      return;
    }
    // V7.16.1: Map Chromium-native browsers to chrome collection
    const statsCollectionKey = FP_COLLECTION_MAP[browserType] || browserType;
    if (!statsCollectionKey || !this.collections[statsCollectionKey]) {
      console.warn(`[DeviceManager] Invalid browser type: ${browserType} (collection: ${statsCollectionKey}), skipping stats update`);
      return;
    }

    const collection = this.collections[statsCollectionKey];
    const now = new Date();
    const update = { $set: { last_used: now } };

    if (success) {
      update.$inc = { success_count: 1 };
    } else {
      update.$inc = { fail_count: 1 };
    }

    try {
      await collection.updateOne({ _id: fingerprintId }, update);
      console.log(`[DeviceManager] Updated stats: ${fingerprintId}, success: ${success}`);
    } catch (error) {
      console.warn(`[DeviceManager] Stats update failed for ${fingerprintId}: ${error.message}`);
    }
  }

  async releaseFingerprint(fingerprintId, browserType, success = true) {
    return this.updateFingerprintStats(fingerprintId, browserType, success);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // V7.14.0: ENHANCED LOGICAL MAPPING (ALL PATCHES + SESSION SEED)
  // ═════════════════════════════════════════════════════════════════════════════
  toFingerprintObject(dbEntry, sessionSeed, actualBrowserType = null) {
    if (!dbEntry) {
      throw new Error('toFingerprintObject: dbEntry is required');
    }
    if (!sessionSeed) {
      throw new Error('toFingerprintObject: sessionSeed is required (v7.14.0)');
    }

    let font_profile = null;
    if (this.fontManager && dbEntry.hardware) {
      try {
        // V7.15.0 PATCH A: Pass sessionSeed to font system (was: dbEntry without fingerprintSeed → null)
        const fontFP = Object.assign({}, dbEntry, { fingerprintSeed: sessionSeed });
        font_profile = this.fontManager.generateFontProfile(dbEntry.hardware, fontFP);
      } catch (error) {
        console.warn(`[DeviceManager] Font profile generation failed: ${error.message}`);
      }
    }

    const hardwareData = dbEntry.hardware?.hardware;

    // DA-v3 PATCH 2+3+4: Hardware Normalization Pipeline
    const rawMemory = hardwareData?.ram_gb || dbEntry.navigator?.deviceMemory || 8;
    const rawCores = hardwareData?.cpu?.logical_processors || dbEntry.navigator?.hardwareConcurrency || 4;
    const hardwareMemory = bucketizeDeviceMemory(rawMemory);
    let hardwareCores = normalizeHardwareConcurrency(rawCores);
    hardwareCores = validateCpuRamCoherence(hardwareCores, hardwareMemory);

    const hardwareGPU = hardwareData?.gpu 
      ? `${hardwareData.gpu.vendor} ${hardwareData.gpu.model}`.trim()
      : 'Intel Corporation';

    // V7.16.1: Use actualBrowserType if provided (Opera/Brave from chrome FP)
    const dbBrowserType = dbEntry.browserType || dbEntry.browser?.type || 'chromium';
    const browserType = actualBrowserType || dbBrowserType;
    // Engine is always from the DB entry (chrome FP → chromium engine for Opera/Brave)
    const engine = dbEntry.browser?.engine || (dbBrowserType === 'firefox' ? 'gecko' : (dbBrowserType === 'safari' ? 'webkit' : 'chromium'));

    let defaultVendor = 'Google Inc. (NVIDIA)';
    let defaultRenderer = 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)';

    if (engine === 'gecko') {
      defaultVendor = 'NVIDIA Corporation';
      defaultRenderer = 'NVIDIA GeForce GTX 1650';
    } else if (engine === 'webkit') {
      defaultVendor = 'Apple Inc.';
      defaultRenderer = 'Apple M1';
    }

    // V7.13.0 PATCH B+E: extensions_base + extensions_optional merge
    const dbExtensionsBase = dbEntry.webgl?.extensions_base || dbEntry.webgl?.extensions || [];
    const dbExtensionsOptional = dbEntry.webgl?.extensions_optional || [];

    let mergedExtensions = [...dbExtensionsBase];

    if (dbExtensionsOptional.length > 0) {
      const seed = String(dbEntry._id || 'default');
      let h = 0;
      for (let i = 0; i < seed.length; i++) {
        h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
      }
      for (let i = 0; i < dbExtensionsOptional.length; i++) {
        const threshold = Math.abs((h * (i + 7919))) % 100;
        if (threshold < 75) {
          mergedExtensions.push(dbExtensionsOptional[i]);
        }
      }
      mergedExtensions.sort();
    }

    // V7.13.0 PATCH F: DPR fallback chain
    const deviceScaleFactor = dbEntry.device?.scale_factor || dbEntry.display?.dpr || dbEntry.deviceScaleFactor || 1.0;

    // V7.13.0 PATCH J: Safari deviceMemory = undefined
    const finalDeviceMemory = (engine === 'webkit') ? undefined : hardwareMemory;

    const fpObject = {
      _id: dbEntry._id,
      // V7.16.1: Override browserName for Chromium-native (Opera/Brave using chrome FP)
      browserName: actualBrowserType 
        ? this.getBrowserName({ browser: { type: actualBrowserType } }) 
        : this.getBrowserName(dbEntry),
      browserType: browserType,
      engine: engine,
      webgl: {
        vendor: dbEntry.webgl?.vendor || defaultVendor,
        renderer: dbEntry.webgl?.renderer || defaultRenderer,
        extensions: mergedExtensions,
        parameters: dbEntry.webgl?.parameters || {},
        shaderPrecisions: dbEntry.webgl?.shader_precisions || dbEntry.webgl?.shaderPrecisions || null,
        contextAttributes: dbEntry.webgl?.context_attributes || dbEntry.webgl?.contextAttributes || null
      },
      vendorWebGL: dbEntry.webgl?.vendor || defaultVendor,
      rendererWebGL: dbEntry.webgl?.renderer || defaultRenderer,
      canvas: {
        ...(dbEntry.canvas || {}),
        // V7.14.0 PATCH C: noise_seed NOW = sessionSeed + '-canvas' (was: static dbEntry._id)
        noise_seed: sessionSeed + '-canvas',
        capabilities: dbEntry.canvas?.capabilities || null
      },
      audio: {
        ...(dbEntry.audio || {}),
        // V7.14.0 PATCH D: noise_seed NOW = sessionSeed + '-audio' (was: static dbEntry._id)
        noise_seed: sessionSeed + '-audio',
        capabilities: dbEntry.audio?.capabilities || null
      },
      hardware: {
        cores: hardwareCores,
        memory: hardwareMemory,
        gpu: hardwareGPU
      },
      navigator: {
        hardwareConcurrency: hardwareCores,
        deviceMemory: finalDeviceMemory,
        platform: dbEntry.navigator?.platform || 'Win32',
        oscpu: dbEntry.navigator?.oscpu || dbEntry.browser?.oscpu || undefined,
        buildID: dbEntry.navigator?.buildID || dbEntry.browser?.buildID || undefined,
        // V7.16.1: Nullify userAgentData for Chromium-native browsers (Opera/Brave)
        // Chrome FP's userAgentData contains Chrome-specific brands — not valid for Opera/Brave
        // Native browser will provide its own real userAgentData
        userAgentData: (FP_COLLECTION_MAP[browserType]) ? null : (dbEntry.navigator?.userAgentData || null),
        maxTouchPoints: dbEntry.navigator?.maxTouchPoints ?? (dbEntry.device?.has_touch ? 1 : 0),
        languages: dbEntry.navigator?.languages || ['en-US', 'en']
      },
      hardwareConcurrency: hardwareCores,
      deviceMemory: finalDeviceMemory,
      // V7.16.1: UA is ALWAYS null — native browser provides its own real UA (no spoofing)
      userAgent: null,
      viewport: {
        width: dbEntry.viewport?.width || 1920,
        height: dbEntry.viewport?.height || 1080
      },
      screen: {
        width: dbEntry.display?.width || dbEntry.screen?.width || 1920,
        height: dbEntry.display?.height || dbEntry.screen?.height || 1080,
        availWidth: dbEntry.display?.avail_width || dbEntry.screen?.availWidth || dbEntry.display?.width || dbEntry.screen?.width || 1920,
        availHeight: dbEntry.display?.avail_height || dbEntry.screen?.availHeight || (function(){
          const h = dbEntry.display?.height || dbEntry.screen?.height || 1080;
          const osName = (dbEntry.hardware?.os || 'windows').toLowerCase();
          if (osName === 'macos' || osName === 'darwin') return h - 25;
          if (osName === 'linux') return h - 27;
          return h - 40;
        })(),
        availTop: dbEntry.display?.avail_top || dbEntry.screen?.availTop || 0,
        availLeft: dbEntry.display?.avail_left || dbEntry.screen?.availLeft || 0,
        colorDepth: dbEntry.display?.color_depth || dbEntry.screen?.colorDepth || 24,
        pixelDepth: dbEntry.display?.color_depth || dbEntry.screen?.pixelDepth || dbEntry.screen?.colorDepth || 24
      },
      deviceScaleFactor: deviceScaleFactor,
      hasTouch: dbEntry.device?.has_touch || dbEntry.hasTouch || false,
      isMobile: dbEntry.device?.is_mobile || dbEntry.isMobile || false,
      locale: undefined,
      timezone: undefined,
      // V7.14.0 PATCH B: fingerprintSeed NOW = sessionSeed (was: dbEntry._id STATIC)
      fingerprintSeed: sessionSeed,
      // V7.14.0 PATCH E: NEW identity block for seed propagation
      identity: {
        id: dbEntry._id,
        sessionSeed: sessionSeed
      },
      font_profile: font_profile,
      speech: {
        voices: (dbEntry.speech && dbEntry.speech.voices) ? dbEntry.speech.voices : null
      },
      _meta: {
        hardware_id: dbEntry.hardware_id,
        os: {
          name: dbEntry.hardware?.os || dbEntry._meta?.os?.name || 'unknown',
          version: dbEntry.hardware?.os_version || dbEntry._meta?.os?.version || null
        },
        tier: dbEntry.hardware?.population?.tier || dbEntry._meta?.tier || 0,
        rarity: dbEntry.hardware?.population?.rarity_score || dbEntry._meta?.rarity || 0,
        usage_count: dbEntry.usage_count || 0,
        last_used: dbEntry.last_used || null,
        ua_mode: 'native'
      }
    };

    // V7.14.0 PATCH F: Write FP Log with sessionSeed tracking
    this._writeFingerprintLog('db_raw', dbEntry, fpObject, sessionSeed);

    return fpObject;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // V7.14.0 PATCH F: FP Log Writer — Updated for sessionSeed tracking
  // ═════════════════════════════════════════════════════════════════════════════
  _writeFingerprintLog(stage, dbEntry, fpObject, sessionSeed) {
    try {
      const logDir = process.env.FP_LOG_DIR || path.join('D:', 'QuantumTrafficEngine', 'logs', 'Fingerprint');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fpId = dbEntry._id || fpObject._id || 'unknown';
      const browser = fpObject.browserName || fpObject.browserType || 'unknown';
      const filename = `${stage}_${browser}_${fpId}_${timestamp}.json`;
      const filepath = path.join(logDir, filename);

      const logEntry = {
        stage: stage,
        timestamp: new Date().toISOString(),
        // V7.14.0 PATCH F: Log both sessionSeed and persistence anchor
        fingerprintSeed: sessionSeed,
        persistenceAnchor: String(dbEntry._id),
        originalDB: {
          _id: dbEntry._id,
          hardware_id: dbEntry.hardware_id,
          browser: dbEntry.browser,
          webgl: {
            vendor: dbEntry.webgl?.vendor,
            renderer: dbEntry.webgl?.renderer,
            extensions_base: dbEntry.webgl?.extensions_base || dbEntry.webgl?.extensions,
            extensions_optional: dbEntry.webgl?.extensions_optional,
            parameters: dbEntry.webgl?.parameters
          },
          navigator: dbEntry.navigator,
          viewport: dbEntry.viewport,
          canvas: dbEntry.canvas,
          audio: dbEntry.audio,
          display: dbEntry.display || dbEntry.screen
        },
        normalizedFP: {
          _id: fpObject._id,
          browserName: fpObject.browserName,
          browserType: fpObject.browserType,
          engine: fpObject.engine,
          fingerprintSeed: fpObject.fingerprintSeed,
          // V7.14.0 PATCH F: Log full identity block
          identity: fpObject.identity,
          webgl_vendor: fpObject.webgl?.vendor,
          webgl_renderer: fpObject.webgl?.renderer,
          extensions_count: fpObject.webgl?.extensions?.length || 0,
          hardware: fpObject.hardware,
          navigator: {
            hardwareConcurrency: fpObject.navigator?.hardwareConcurrency,
            deviceMemory: fpObject.navigator?.deviceMemory,
            platform: fpObject.navigator?.platform,
            maxTouchPoints: fpObject.navigator?.maxTouchPoints,
            userAgentData: fpObject.navigator?.userAgentData ? 'present' : null
          },
          screen: fpObject.screen,
          deviceScaleFactor: fpObject.deviceScaleFactor
        }
      };

      fs.writeFileSync(filepath, JSON.stringify(logEntry, null, 2), 'utf8');
      console.log(`[DeviceManager] FP log written: ${filename}`);
    } catch (logErr) {
      console.warn(`[DeviceManager] FP log write failed (non-fatal): ${logErr.message}`);
    }
  }

  getBrowserName(dbEntry) {
    if (!dbEntry) return 'Chrome';

    if (dbEntry.browser && dbEntry.browser.type) {
      const type = dbEntry.browser.type.toLowerCase();
      if (type === 'chrome') return 'Chrome';
      if (type === 'edge') return 'Edge';
      if (type === 'firefox') return 'Firefox';
      if (type === 'safari') return 'Safari';
      if (type === 'opera') return 'Opera';
      if (type === 'brave') return 'Brave';
    }

    if (dbEntry.browserName) return dbEntry.browserName;

    if (dbEntry.navigator && dbEntry.navigator.userAgent) {
      const ua = dbEntry.navigator.userAgent;
      if (ua.includes('Edg')) return 'Edge';
      if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
      if (ua.includes('Brave')) return 'Brave';
      if (ua.includes('Firefox')) return 'Firefox';
      if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
      if (ua.includes('Chrome')) return 'Chrome';
    }

    return 'Chrome';
  }

  async getStats() {
    if (!this.collections.hardware) {
      throw new Error('DeviceManager not initialized');
    }

    try {
      const totalHardware = await this.collections.hardware.countDocuments({});
      const hardwareByPlatform = {
        windows: await this.collections.hardware.countDocuments({ os: 'windows' }),
        linux: await this.collections.hardware.countDocuments({ os: 'linux' }),
        macos: await this.collections.hardware.countDocuments({ os: 'macos' })
      };

      const fingerprintsByBrowser = {};
      for (const [browser, collection] of Object.entries(this.collections)) {
        if (['hardware', 'useragent'].includes(browser)) continue;
        fingerprintsByBrowser[browser] = await collection.countDocuments({});
      }

      const usageStats = {};
      for (const [browser, collection] of Object.entries(this.collections)) {
        if (['hardware', 'useragent'].includes(browser)) continue;
        const stats = await collection.aggregate([
          {
            $facet: {
              neverUsed: [{ $match: { last_used: null } }, { $count: 'count' }],
              avgUsage: [{ $group: { _id: null, avg: { $avg: '$usage_count' } } }]
            }
          }
        ]).toArray();
        const result = stats[0];
        usageStats[browser] = {
          neverUsed: result.neverUsed[0]?.count || 0,
          avgUsage: result.avgUsage[0]?.avg || 0
        };
      }

      return {
        totalHardware,
        hardwareByPlatform,
        fingerprintsByBrowser,
        usageStats,
        hostPlatform: this.hostPlatform
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // V7.14.0: generateIdentity NOW delegates to acquireFingerprint (auto-inherits sessionSeed)
  // ═════════════════════════════════════════════════════════════════════════════
  async generateIdentity(forceBrowser = null) {
    const sessionId = `legacy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const workerId = 'LEGACY';
    const browserType = forceBrowser ? forceBrowser.toLowerCase() : 'auto';

    try {
      return await this.acquireFingerprint(workerId, sessionId, browserType);
    } catch (error) {
      throw new Error(`generateIdentity failed: ${error.message}`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // V7.13.0 PATCH A: ONE-TIME DB MIGRATION (replaces validateWebGLCoherence)
  // ═════════════════════════════════════════════════════════════════════════════
  async migrateWebGLParameters() {
    if (!this.client) {
      await this.initialize();
    }

    console.log('[DeviceManager] Starting one-time WebGL parameter migration...');
    let totalFixed = 0;
    let totalScanned = 0;

    for (const [name, collection] of Object.entries(this.collections)) {
      if (['hardware', 'useragent'].includes(name)) continue;

      const entries = await collection.find(
        { 'webgl.renderer': { $exists: true }, 'webgl.parameters': { $exists: true } }
      ).toArray();

      let fixed = 0;

      for (const entry of entries) {
        const renderer = (entry.webgl?.renderer || '').toUpperCase();
        const params = entry.webgl?.parameters;

        const currentMaxTex = params?.['3379'] || 0;

        let expectedMaxTex = null;
        let expectedCombined = null;
        let expectedMax3D = null;

        if (/NVIDIA.*(GEFORCE|RTX|GTX|QUADRO)/i.test(renderer)) {
          expectedMaxTex = 32768;
          expectedCombined = 192;
          expectedMax3D = 16384;
        } else if (/INTEL.*(UHD|IRIS|HD GRAPHICS)/i.test(renderer)) {
          expectedMaxTex = 16384;
          expectedCombined = 128;
          expectedMax3D = 2048;
        } else if (/AMD|RADEON|ATI/i.test(renderer)) {
          expectedMaxTex = 16384;
          expectedCombined = 128;
          expectedMax3D = 8192;
        }

        if (expectedMaxTex && currentMaxTex !== expectedMaxTex) {
          await collection.updateOne(
            { _id: entry._id },
            {
              $set: {
                'webgl.parameters.3379': expectedMaxTex,
                'webgl.parameters.3386': [expectedMaxTex, expectedMaxTex],
                'webgl.parameters.36161': expectedMaxTex,
                'webgl.parameters.34076': expectedMaxTex,
                'webgl.parameters.35661': expectedCombined,
                'webgl.parameters.32883': expectedMax3D
              },
              $unset: {
                'webgl.parameters.maxtexturesize': '',
                'webgl.parameters.maxviewportdims': '',
                'webgl.parameters.maxrenderbuffersize': '',
                'webgl.parameters.maxcubemaptexturesize': ''
              }
            }
          );
          console.log(`[Migration] Fixed ${entry._id} (${renderer.substring(0, 50)}) maxTex ${currentMaxTex} → ${expectedMaxTex}`);
          fixed++;
        } else if (expectedMaxTex && currentMaxTex === expectedMaxTex) {
          const hasGhostKeys = params.maxtexturesize !== undefined || params.maxviewportdims !== undefined;
          if (hasGhostKeys) {
            await collection.updateOne(
              { _id: entry._id },
              {
                $unset: {
                  'webgl.parameters.maxtexturesize': '',
                  'webgl.parameters.maxviewportdims': '',
                  'webgl.parameters.maxrenderbuffersize': '',
                  'webgl.parameters.maxcubemaptexturesize': ''
                }
              }
            );
            console.log(`[Migration] Cleaned ghost keys: ${entry._id}`);
          }
        }
      }

      totalFixed += fixed;
      totalScanned += entries.length;
      console.log(`[Migration] Collection ${name}: scanned ${entries.length}, fixed ${fixed}`);
    }

    console.log(`[DeviceManager] Migration complete: scanned ${totalScanned}, fixed ${totalFixed}`);
    return { totalScanned, totalFixed };
  }
}

module.exports = new DeviceManager({});

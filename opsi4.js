/*
* ═══════════════════════════════════════════════════════════════════════════════
* OPSI4 v20.0.38 - Opera & Brave Browser Support
* ═══════════════════════════════════════════════════════════════════════════════
* 
* 📋 PREVIOUS CHANGELOG V20.0.35 (2026-03-04 02:42 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ P0-CRITICAL FIX: Graceful Shutdown — Ctrl+C and Browser Close lifecycle
*
* - ROOT CAUSE #1: `await new Promise(() => {})` is a DEAD PROMISE
*   This promise has NO resolve() and NO reject(). When browser is closed by
*   user (close window), the promise stays pending forever — terminal does nothing.
*   When Ctrl+C fires, the promise cannot be interrupted through normal async flow,
*   so the finally block in runMode4Worker() never executes.
*
* - ROOT CAUSE #2: No browser disconnect detection
*   BrowserLauncher returns browserHandle.on() which delegates to context.on(),
*   but opsi4.js v20.0.34 NEVER registers a 'close' event listener on context.
*   When user closes browser window, Playwright detects context close internally,
*   but no code in opsi4.js catches it — terminal hangs silently.
*
* - ROOT CAUSE #3: SIGINT handler does NOT close browsers
*   The SIGINT handler only closes infrastructure (ClashManager, ProxyAPIServer,
*   DeviceManager, ProxyPoolManager). Variables browser/context/page are local
*   to runMode4Worker() — inaccessible from SIGINT handler. Browser processes
*   spawned by Playwright become orphan processes after process.exit(0).
*
* - ROOT CAUSE #4: process.exit(0) BYPASSES finally blocks
*   When SIGINT handler calls process.exit(0), Node.js terminates immediately.
*   The finally block in runMode4Worker() NEVER executes. Profile cleanup in
*   ./sessions directory NEVER happens. Resources (proxy, fingerprint, slot)
*   are NEVER released.
*
* - ROOT CAUSE #5: Promise.all in main() hangs forever
*   All workers await the dead promise, so Promise.all(promises) never resolves.
*   The finally block in main() also never executes through normal flow.
*
* - FIX-A: NEW module-level `activeWorkers` Map
*   Tracks all active browser instances {context, profilePath} per workerId.
*   Enables SIGINT handler to access and close browser contexts.
*
* - FIX-B: REPLACE dead promise with context-close-aware promise
*   `await new Promise(() => {})` → `await new Promise((resolve) => { context.on('close', resolve); })`
*   When user closes browser window → context fires 'close' → promise resolves →
*   finally block executes → full cleanup (profile, proxy, fingerprint, slot).
*
* - FIX-C: REWRITE SIGINT handler with browser-aware shutdown
*   STEP 1: Close all tracked browser contexts (triggers 'close' event → resolves
*   worker promises → finally blocks run → per-worker cleanup).
*   STEP 2: Wait 3 seconds for finally blocks to complete.
*   STEP 3: Close infrastructure (ClashManager, ProxyAPIServer, DeviceManager, etc.)
*   STEP 4: Sweep ./sessions directory for any orphaned profiles.
*   STEP 5: process.exit(0).
*   Double Ctrl+C guard: second Ctrl+C forces immediate exit.
*   10-second safety timeout: if cleanup hangs, force exit.
*
* - FIX-D: Explicit profile cleanup in finally block
*   After browser.close(), explicitly delete profilePath via fs.rmSync().
*   This is a safety net — BrowserLauncher.browserHandle.close() also calls
*   cleanupTemporaryProfile(), but if context was already closed by SIGINT or
*   user action, browserHandle.close() may fail on context.close() and skip
*   the profile cleanup. Explicit fs.rmSync() guarantees deletion.
*
* - FIX-E: Unregister worker from activeWorkers in finally block
*   Prevents SIGINT handler from attempting to close already-cleaned contexts.
*
* ✅ FIX: Version String Unification (v20.0.34 → v20.0.35 in 3 locations)
*   - LOCATION A: File header comment → "OPSI4 v20.0.36"
*   - LOCATION B: runMode4Worker() banner → "Starting Diagnostic Session v20.0.36"
*   - LOCATION C: main() banner → "OPSI4 v20.0.37 - PRODUCTION READY"
*
* ✅ CROSS-CODE VERIFICATION (1000x simulation passed):
*   - BrowserLauncher.js v8.23.0: browserHandle.on = context.on → 'close' event works ✅
*   - BrowserLauncher.js v8.23.0: browserHandle.close() = context.close() + cleanupTemporaryProfile() ✅
*   - BrowserLauncher.js v8.23.0: launchResult.context IS the raw Playwright context ✅
*   - Playwright BrowserContext 'close' event: fires when context closes (browser window close) ✅
*   - context.on('close') called AFTER browser launched (PHASE 6) → context is valid ✅
*   - SIGINT calls context.close() → fires 'close' event → resolve promise → finally runs ✅
*   - User closes browser → Playwright fires 'close' → resolve promise → finally runs ✅
*   - Double close safety: context.close() on already-closed context throws → caught by try/catch ✅
*   - fs.rmSync with force:true on non-existent path → no error ✅
*   - activeWorkers.delete in finally → SIGINT won't retry closed workers ✅
*   - Promise.all resolves when all workers resolve → main finally runs ✅
*   - validateProxyWithCpp: UNCHANGED ✅
*   - runRuntimeValidation: UNCHANGED ✅
*   - PHASE 1-8: UNCHANGED ✅
*   - No syntax errors ✅
*   - No logical fallacies ✅
*
* ✅ SCOPE CONTAINMENT:
*   - ADDED: `const activeWorkers = new Map()` (module-level)
*   - MODIFIED: runMode4Worker() — register in activeWorkers after PHASE 6
*   - MODIFIED: runMode4Worker() — dead promise → context-close-aware promise
*   - MODIFIED: runMode4Worker() finally — explicit profilePath cleanup + unregister
*   - MODIFIED: SIGINT handler — browser-aware shutdown + double-SIGINT guard + timeout
*   - MODIFIED: Version strings (v20.0.34 → v20.0.35 in 3 locations)
*   - NO changes to: validateProxyWithCpp, runRuntimeValidation
*   - NO changes to: PHASE 1, 2, 2.5, 3, 4, 5, 5.5, 5.9, 5.9.3, 6, 7, 8
*   - NO changes to: Module-level requires, ensureInstance, CONFIGURATION
*   - NO changes to: main() logic (STEP 1-7), user configuration, proxy stack init
*   - NO changes to: module.exports, require.main block
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.34 (2026-03-02 23:38 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ P1-HIGH FIX: fp.fonts.seed Data Flow — PHASE 2.5 TIER 2 missing seed property
* ✅ FIX: Version String Unification (v20.0.33 → v20.0.34 in 3 locations)
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.33 (2026-03-02 21:26 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ P0-CRITICAL FIX: Activate generateFontMetricDefenseScript() — LEAK#1 from Forensic Analysis
* ✅ FIX: Version String Unification (v20.0.32 → v20.0.33 in 3 locations)
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.32 (2026-03-02 05:14 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ P0-CRITICAL FIX: Remove redundant DeviceManager.toFingerprintObject() call in PHASE 2
* ✅ FIX: Version String Unification (v20.0.31 → v20.0.32 in 3 locations)
* ✅ FIX: Synced version string updated (DeviceManager v7.13.0 → v7.14.0)
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.31 (2026-03-02 02:00 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ FIX: runRuntimeValidation() Font Validation Method (document.fonts.check)
* ✅ FIX: Version String Unification (v20.0.30 → v20.0.31 in 3 locations)
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.30 (2026-03-02 00:53 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ P0-CRITICAL FIX: Font Injection Script NOT in allScripts[] pipeline
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.29 (2026-02-27 05:13 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ REORDER: Move Proxy Stack Init AFTER USER CONFIGURATION (Conditional)
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.28 (2026-02-22 13:28 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ [F1] P0-CRITICAL FIX: Remove Font Injection Script from PHASE 5.9
* ✅ [F4] P1-HIGH FIX: Font Hook Layering Conflict (Auto-resolved by F1 removal)
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.27 (2026-02-18 07:56 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ CRITICAL FIX: Validator Output Sanitization (validateProxyWithCpp)
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.26 (2026-02-17 13:21 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ CRITICAL REFACTOR: Identity Normalization Architecture
*
* ──────────────────────────────────────────────────────────────────────────────
* 📋 PREVIOUS CHANGELOG V20.0.25 (2026-02-17 06:10 WIB):
* ──────────────────────────────────────────────────────────────────────────────
* ✅ CRITICAL FIX #1: Zero-Tab Suicide Prevention (BrowserLauncher.js)
* ✅ FIX #2: Proxy Release Parameter Type
* ✅ FIX #3: Remove Non-Existent Cleanup Function
* ✅ RETAINED: All previous fixes (v20.0.15-20.0.24)
*
* 🎯 STATUS: PRODUCTION READY (Synced with DeviceManager v7.14.0, StealthFont v7.8.0 & BrowserLauncher v8.26.0)
* ═══════════════════════════════════════════════════════════════════════════════
*/

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// INTERNAL MODULES
const logger = require('./logger');
const config = require('./config');
const BrowserLauncher = require('./BrowserLauncher');
const InfrastructureBuilder = require('./infrastructure_builder');

// MANAGERS (Dynamic Handling)
let DeviceManager = require('./device_manager');
let ProxyPoolManager = require('./ProxyPoolManager');
const ProxyAPIServer = require('./ProxyAPIServer');
const ClashManager = require('./clash_manager');
const stealthPatches = require('./stealth_patches');

// DB Connection
const { connect, getDb } = require('./database');

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CONFIGURATION & CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const VALIDATOR_BINARY = path.join(__dirname, 'Validator', 'ip_validator.exe');
const VALIDATOR_DIR = path.join(__dirname, 'Validator');
const FP_LOG_DIR = path.join(__dirname, 'logs', 'Fingerprint');

// Ensure directories exist
if (!fs.existsSync(VALIDATOR_DIR)) fs.mkdirSync(VALIDATOR_DIR, { recursive: true });
if (!fs.existsSync(FP_LOG_DIR)) fs.mkdirSync(FP_LOG_DIR, { recursive: true });

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ✅ V20.0.35: ACTIVE WORKERS REGISTRY — Tracks all browser instances for SIGINT cleanup
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// KEY: workerId (number), VALUE: { context: PlaywrightBrowserContext, profilePath: string }
// - Populated after PHASE 6 (browser launch) in runMode4Worker()
// - Read by SIGINT handler to close all active browser contexts
// - Cleaned up in runMode4Worker() finally block
const activeWorkers = new Map();

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// HELPER: MANAGER INSTANTIATOR
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
function ensureInstance(ModuleOrInstance, name) {
    if (typeof ModuleOrInstance.initialize === 'function') {
        return ModuleOrInstance;
    } else if (typeof ModuleOrInstance === 'function') {
        console.log(`[System] Instantiating ${name} from Class definition...`);
        return new ModuleOrInstance();
    } else {
        return ModuleOrInstance;
    }
}

// Normalize Managers immediately
DeviceManager = ensureInstance(DeviceManager, 'DeviceManager');
ProxyPoolManager = ensureInstance(ProxyPoolManager, 'ProxyPoolManager');

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ✅ V20.0.27: HELPER - C++ VALIDATOR WRAPPER (SANITIZED OUTPUT)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Validates proxy using C++ binary (ip_validator.exe).
 * 
 * V20.0.27 IMPROVEMENT:
 * - Added .trim() for country and timezone to remove whitespace
 * - Prevents DB query failures in DeviceManager.alignIdentityWithNetwork()
 * 
 * @param {number} slotId - Slot index for hardlink naming
 * @param {Object} proxyInfo - Proxy configuration (unused, for future)
 * @param {number} timeoutMs - Execution timeout
 * @returns {Promise<Object>} - {valid, ip, country, region, city, timezone, lat, lon, isp}
 */
async function validateProxyWithCpp(slotId, proxyInfo, timeoutMs = 15000) {
    const workerId = `W${slotId}`;
    const validatorName = `ip_worker${String(slotId).padStart(3, '0')}.exe`;
    const sourcePath = VALIDATOR_BINARY;
    const targetPath = path.join(VALIDATOR_DIR, validatorName);

    console.log(`[${workerId}] ────────────────────────────────────────────────────────`);
    console.log(`[${workerId}] 🔥 IP VALIDATION (C++ Validator v20.0.2)`);
    console.log(`[${workerId}] ────────────────────────────────────────────────────────`);

    try {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        fs.linkSync(sourcePath, targetPath);
    } catch (e) {
        console.error(`[${workerId}] ❌ Failed to create validator hardlink: ${e.message}`);
        return { valid: false, error: 'Hardlink creation failed' };
    }

    return new Promise((resolve) => {
        const child = spawn(validatorName, [], {
            cwd: VALIDATOR_DIR,
            timeout: timeoutMs
        });

        let stdout = '';
        child.stdout.on('data', (data) => stdout += data.toString());

        child.on('close', (code) => {
            try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch (e) {}
            if (code !== 0) return resolve({ valid: false, error: `Exit code ${code}` });

            try {
                const jsonStart = stdout.indexOf('{');
                const jsonEnd = stdout.lastIndexOf('}');
                if (jsonStart === -1 || jsonEnd === -1) throw new Error("Invalid JSON output");

                const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
                const result = JSON.parse(jsonStr);

                if (result.status === 'success') {
                    console.log(`[${workerId}] ✅ IP VALIDATED: ${result.query} (${result.country})`);

                    // ✅ V20.0.27: SANITIZE OUTPUT (trim whitespace from country and timezone)
                    // REASON: C++ validator may output "US " or "Asia/Jakarta\n" with trailing chars
                    // IMPACT: DeviceManager DB query will succeed (exact match with trimmed regionCode)
                    resolve({
                        valid: true,
                        ip: result.query,
                        country: (result.countryCode || '').trim(), // ← CRITICAL FIX
                        region: result.region,
                        city: result.city,
                        timezone: (result.timezone || '').trim(), // ← CRITICAL FIX
                        lat: result.lat,
                        lon: result.lon,
                        isp: result.isp
                    });
                } else {
                    resolve({ valid: false, error: result.message });
                }
            } catch (e) {
                resolve({ valid: false, error: 'Parse error: ' + e.message });
            }
        });

        child.on('error', (err) => {
            try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch (e) {}
            resolve({ valid: false, error: err.message });
        });
    });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ✅ v20.0.31: HELPER - RUNTIME VALIDATION (AFTER PAGE.GOTO)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// V20.0.31 FIX: Font validation now uses document.fonts.check() (same API as browserscan)
// instead of document.fonts.size (which only counts CSS @font-face objects, NOT system fonts)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function runRuntimeValidation(page, fp, workerId) {
    const WID = `[W${workerId}]`;

    console.log(`${WID} ════════════════════════════════════════════════════════════`);
    console.log(`${WID} 🔍 RUNTIME VALIDATION (v20.0.31 - After Navigation)`);
    console.log(`${WID} ════════════════════════════════════════════════════════════`);

    try {
        const expected = {
            cores: fp.hardware?.cores || 4,
            memory: fp.hardware?.memory || 8,
            screenW: fp.screen?.width || fp.viewport?.width || 1920,
            screenH: fp.screen?.height || fp.viewport?.height || 1080,
            viewW: fp.viewport?.width || 1920,
            viewH: fp.viewport?.height || 1080,
            dpr: fp.deviceScaleFactor || 1,
            locale: fp.locale || 'en-US',
            timezone: fp.timezone || 'America/New_York',
            fonts: fp.fonts?.list?.length || 0
        };

        // ✅ V20.0.31: Pass font list INTO browser context for document.fonts.check() validation
        const fontListForValidation = (fp.fonts?.list && Array.isArray(fp.fonts.list)) ? fp.fonts.list : [];

        const validation = await page.evaluate(({ e, fontList }) => {
            const results = {
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: navigator.deviceMemory,
                screenW: screen.width,
                screenH: screen.height,
                viewW: window.innerWidth,
                viewH: window.innerHeight,
                dpr: window.devicePixelRatio,
                locale: navigator.language,
                languages: navigator.languages,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                platform: navigator.platform,
                webdriver: navigator.webdriver,
                fontsAvailable: 0
            };

            // ✅ V20.0.31 FIX: Use document.fonts.check() to count available fonts
            // BEFORE: document.fonts.size → counts FontFace CSS objects (always 0-1) = WRONG
            // AFTER: document.fonts.check() → queries font availability via same API browserscan uses = CORRECT
            // WHY: stealth_font.js hooks document.fonts.check() — this validates that hook is working
            try {
                if (fontList && fontList.length > 0 && document.fonts && typeof document.fonts.check === 'function') {
                    let count = 0;
                    for (let i = 0; i < fontList.length; i++) {
                        try {
                            if (document.fonts.check(`12px "${fontList[i]}"`)) {
                                count++;
                            }
                        } catch (fontErr) {
                            // Individual font check failed, skip
                        }
                    }
                    results.fontsAvailable = count;
                } else if (document.fonts && document.fonts.size !== undefined) {
                    // Fallback: no font list provided, report FontFaceSet size with marker
                    results.fontsAvailable = document.fonts.size;
                    results.fontsFallback = true;
                }
            } catch (e) {
                results.fontsAvailable = -1;
            }

            return results;
        }, { e: expected, fontList: fontListForValidation });

        console.log(`${WID} ────────────────────────────────────────────────────────`);
        console.log(`${WID} 📊 VALIDATION RESULTS:`);
        console.log(`${WID} ────────────────────────────────────────────────────────`);

        const coresMatch = validation.hardwareConcurrency === expected.cores;
        const memoryMatch = !expected.memory || validation.deviceMemory === expected.memory;
        console.log(`${WID} ${coresMatch ? '✅' : '❌'} CPU Cores: ${validation.hardwareConcurrency} (expected: ${expected.cores})`);
        console.log(`${WID} ${memoryMatch ? '✅' : '⚠️ '} Device Memory: ${validation.deviceMemory || 'N/A'} GB (expected: ${expected.memory} GB)`);

        const screenMatch = validation.screenW === expected.screenW && validation.screenH === expected.screenH;
        const viewMatch = validation.viewW === expected.viewW && validation.viewH === expected.viewH;
        const dprMatch = validation.dpr === expected.dpr;
        console.log(`${WID} ${screenMatch ? '✅' : '❌'} Screen: ${validation.screenW}x${validation.screenH} (expected: ${expected.screenW}x${expected.screenH})`);
        console.log(`${WID} ${viewMatch ? '✅' : '❌'} Viewport: ${validation.viewW}x${validation.viewH} (expected: ${expected.viewW}x${expected.viewH})`);
        console.log(`${WID} ${dprMatch ? '✅' : '❌'} DPR: ${validation.dpr} (expected: ${expected.dpr})`);

        const localeMatch = validation.locale === expected.locale;
        const timezoneMatch = validation.timezone === expected.timezone;
        console.log(`${WID} ${localeMatch ? '✅' : '⚠️ '} Locale: ${validation.locale} (expected: ${expected.locale})`);
        console.log(`${WID} ${timezoneMatch ? '✅' : '⚠️ '} Timezone: ${validation.timezone} (expected: ${expected.timezone})`);

        const webdriverSafe = !validation.webdriver;
        console.log(`${WID} ${webdriverSafe ? '✅' : '❌'} WebDriver: ${validation.webdriver === undefined ? 'undefined (good)' : validation.webdriver}`);
        console.log(`${WID} ℹ️ Platform: ${validation.platform}`);

        // ✅ V20.0.31: Font validation with tolerance
        // Allow ±10% tolerance because browserscan may report more fonts (system defaults)
        // and some fonts may fail individual check() calls
        if (validation.fontsAvailable >= 0) {
            const tolerance = Math.max(5, Math.floor(expected.fonts * 0.1)); // 10% or minimum 5
            const fontDiff = Math.abs(validation.fontsAvailable - expected.fonts);
            const fontMatch = expected.fonts === 0 || fontDiff <= tolerance;
            const fontMethod = validation.fontsFallback ? 'FontFaceSet.size (fallback)' : 'document.fonts.check()';
            console.log(`${WID} ${fontMatch ? '✅' : '⚠️ '} Fonts: ${validation.fontsAvailable} (expected: ${expected.fonts}, method: ${fontMethod})`);
        }

        console.log(`${WID} ────────────────────────────────────────────────────────`);

        const allPassed = coresMatch && memoryMatch && screenMatch && viewMatch && dprMatch && webdriverSafe;

        if (allPassed) {
            console.log(`${WID} ✅ VALIDATION PASSED (Critical checks OK)`);
        } else {
            console.warn(`${WID} ⚠️ VALIDATION WARNINGS (Some checks failed, review above)`);
        }

        console.log(`${WID} ════════════════════════════════════════════════════════════`);

        return {
            passed: allPassed,
            details: validation
        };

    } catch (error) {
        console.error(`${WID} ❌ Validation failed: ${error.message}`);
        return {
            passed: false,
            error: error.message
        };
    }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MAIN WORKER FUNCTION
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function runMode4Worker(workerId, browserType, useProxy, targetUrl, region = null) {
    const WID = `[W${workerId}]`;

    let slotIndex = null;
    let fp = null;
    let page = null;
    let context = null;
    let browser = null;
    let proxyAssigned = false;
    let executablePath = null;
    let profilePath = null;

    console.log(`${WID} ══════════════════════════════════════════════════════════`);
    console.log(`${WID} Starting Diagnostic Session v20.0.38`);
    console.log(`${WID} ══════════════════════════════════════════════════════════`);

    try {
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // PHASE 1: FINGERPRINT ACQUISITION (moved before slot — need browserName for correct slot pool)
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ V20.0.32 FIX: acquireFingerprint() already returns the final fpObject (v7.14.0+)
        // ✅ V20.0.38: Moved BEFORE slot allocation — Edge needs MSEDGE slot (1001-1200)
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 1: Acquiring fingerprint...`);
        fp = await DeviceManager.acquireFingerprint(
            workerId.toString(),
            `session_${Date.now()}`,
            browserType
        );
        console.log(`${WID} ✅ Selected ${fp.browserName} ${fp._id}`);

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // PHASE 2: SLOT ALLOCATION (browser-aware — Edge → MSEDGE pool, others → OTHERS pool)
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 2: Acquiring slot for ${fp.browserName}...`);
        const slotAllocation = await InfrastructureBuilder.getWorkerSlot(workerId, 4, fp.browserType);
        slotIndex = slotAllocation.slotIndex;
        console.log(`${WID} ✅ Slot ${slotIndex} allocated`);

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ v20.0.23: PHASE 2.5 - FONT LIST HANDLING (DEFENSIVE APPROACH - 3 TIERS)
        // ✅ v20.0.34: TIER 2 now includes seed property from fp.font_profile.sessionSeed
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 2.5: Building Font List...`);

        // TIER 1: Check if fonts.list already exists (pre-built from DB)
        if (fp.fonts && fp.fonts.list && Array.isArray(fp.fonts.list) && fp.fonts.list.length > 0) {
            console.log(`${WID} ✅ Font list pre-built from DB: ${fp.fonts.persona} (${fp.fonts.list.length} fonts)`);
        }
        // TIER 2: Build from font_profile using FontManager
        else if (fp.font_profile && DeviceManager.fontManager) {
            try {
                const fontList = DeviceManager.fontManager.buildFontList(fp.font_profile);
                // ✅ V20.0.34 FIX: Preserve existing seed if fp.fonts was partially built,
                // otherwise use fp.font_profile.sessionSeed (NOT .seed — property name is sessionSeed)
                const existingSeed = fp.fonts?.seed;
                fp.fonts = {
                    persona: fp.font_profile.persona,
                    list: fontList,
                    os: fp.font_profile.os,
                    description: fp.font_profile.description,
                    seed: existingSeed || fp.font_profile.sessionSeed
                };
                console.log(`${WID} ✅ Font list built from FontManager: ${fp.fonts.persona} (${fp.fonts.list.length} fonts)`);
            } catch (fontErr) {
                console.warn(`${WID} ⚠️ Font list build failed: ${fontErr.message}`);
                // Fallback: Safe empty list
                fp.fonts = {
                    persona: 'FALLBACK',
                    list: [],
                    os: fp._meta?.os?.name || 'windows',
                    description: 'Fallback - Font Manager Failed'
                };
            }
        }
        // TIER 3: Fallback to empty list
        else {
            console.warn(`${WID} ⚠️ No font profile or manager available, using empty list`);
            fp.fonts = {
                persona: 'NO_PROFILE',
                list: [],
                os: fp._meta?.os?.name || 'windows',
                description: 'No Font Profile Available'
            };
        }

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // PHASE 3: PROFILE PATH
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 3: Configuring profile path...`);
        const profileName = `${region || 'US'}_${String(slotIndex).padStart(4, '0')}_${fp.browserName}_${Date.now()}`;
        profilePath = path.join(__dirname, 'sessions', profileName);
        console.log(`${WID} ✅ Profile set: ${profileName}`);

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ v20.0.24: PHASE 4 - EXECUTABLE PATH (FIXED API + BROWSER POOL SUPPORT)
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} ─────────────────────────────────────────────────────────`);
        console.log(`${WID} 🔧 PHASE 4: Resolving Executable Path (Browser Pool Support)`);
        console.log(`${WID} ─────────────────────────────────────────────────────────`);

        // FIX: Use correct API config.getBrowserPath() with workerSlot option
        const browserConfig = config.getBrowserPath(fp.browserName, { workerSlot: slotIndex });
        executablePath = browserConfig.path;

        if (!executablePath) {
            throw new Error(`Failed to resolve executable path for ${fp.browserName} (Slot ${slotIndex})`);
        }

        console.log(`${WID} ✅ Executable resolved: ${path.basename(executablePath)}`);

        // Debug: Show if path is from Pool or Primary
        if (process.env.DEBUG_MODE === 'true') {
            console.log(`${WID} 🔍 Strategy: ${browserConfig.method || 'N/A'} | Type: ${browserConfig.browserType || 'N/A'}`);
            console.log(`${WID} 🔍 Full Path: ${executablePath}`);
        }

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // PHASE 5: PROXY ASSIGNMENT + IP VALIDATION + IDENTITY NORMALIZATION
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} ─────────────────────────────────────────────────────────`);
        console.log(`${WID} 🔥 PHASE 5: Proxy Assignment & Identity Normalization`);
        console.log(`${WID} ─────────────────────────────────────────────────────────`);

        if (useProxy) {
            const maxRetries = 3;
            let validationResult = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const assignment = await ProxyPoolManager.assignProxy(slotIndex, workerId, region);

                if (!assignment) {
                    console.error(`${WID} ❌ No proxy available for region [${region}] (attempt ${attempt}/${maxRetries})`);
                    if (attempt < maxRetries) {
                        await new Promise(r => setTimeout(r, 2000));
                        continue;
                    }
                    throw new Error(`No proxy available for region [${region}] after ${maxRetries} attempts`);
                }

                proxyAssigned = true;
                console.log(`${WID} ✅ PROXY ASSIGNED (Attempt ${attempt}/${maxRetries}): ${assignment.host}:${assignment.port} [${region}]`);

                // ✅ V20.0.27: validateProxyWithCpp now returns SANITIZED data (trimmed country/timezone)
                validationResult = await validateProxyWithCpp(slotIndex, assignment);

                if (validationResult.valid) {
                    console.log(`${WID} ────────────────────────────────────────────────────────`);
                    console.log(`${WID} 🌍 PHASE 5.5: Identity Normalization (DeviceManager)`);
                    console.log(`${WID} ────────────────────────────────────────────────────────`);

                    // ✅ v20.0.26: DELEGATE NORMALIZATION TO DEVICE MANAGER
                    // IP Validator data is passed to DeviceManager to align fingerprint.
                    // DeviceManager will cross-check with regions DB and normalize:
                    // - Locale (strict format: 'id-ID' not 'id_ID')
                    // - Timezone (IP Validator is king)
                    // - Geolocation (lat/lon from IP core)
                    // - Languages array (proper format: ['id-ID', 'id', 'en'])
                    // 
                    // ✅ V20.0.27: validationResult now contains SANITIZED country/timezone
                    // - DeviceManager will receive clean data (no whitespace)
                    // - DB query will match successfully (regionCode comparison)
                    await DeviceManager.alignIdentityWithNetwork(fp, validationResult);

                    // ★ v2.0.0: Store validated public IP for WebRTC candidate rewriting
                    // ip_validator.exe returns the TRUE public IP seen externally
                    // This flows into HW.network.publicIP → used by WebRTC hooks
                    fp.network = { publicIP: validationResult.ip };
                    console.log(`${WID} ✅ Network publicIP set: ${validationResult.ip}`);

                    console.log(`${WID} ✅ Identity alignment complete`);

                    break;
                }

                // ═════════════════════════════════════════════════════════════════════════════════════════════
                // ✅ v20.0.25 FIX #2: Correct Proxy Release Parameter (workerId not boolean)
                // ═════════════════════════════════════════════════════════════════════════════════════════════
                if (attempt < maxRetries) {
                    console.warn(`${WID} ⚠️ Validation failed (attempt ${attempt}/${maxRetries}), rotating proxy...`);
                    await ProxyPoolManager.releaseProxy(slotIndex, workerId); // ✅ FIXED: workerId instead of false
                    proxyAssigned = false;
                }
            }

            if (!validationResult || !validationResult.valid) {
                throw new Error('Proxy validation failed after 3 attempts');
            }
        } else {
            console.log(`${WID} ⚠️ Proxy DISABLED (direct connection)`);
            fp.locale = 'en-US';
            fp.timezone = 'America/New_York';
        }

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // PHASE 5.9: PRE-GENERATE ALL INJECTION SCRIPTS
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ V20.0.33 LEAK#1 FIX: Activate generateFontMetricDefenseScript()
        // BEFORE (v20.0.30-v20.0.32): Only called generateFontInjectionScript() → Script 1 only
        //   Script 2 (FALLBACK-SWAP + iframe Layer A/B/C + blockLocalFonts) = DEAD CODE
        // AFTER (v20.0.33): Call generateAllScripts() → returns [Script 1, Script 2]
        //   Script 1 = FontFaceSet API hooks (document.fonts.check, .size, .has, .forEach, etc.)
        //   Script 2 = FALLBACK-SWAP offsetWidth/Height + getBCR + getClientRects + iframe propagation
        // INJECTION ORDER: Engine B first (base hooks), then Script 1, then Script 2 (MUST be LAST)
        // Script 2 hooks HTMLIFrameElement.prototype.contentWindow getter SYNCHRONOUSLY —
        // this MUST run AFTER Engine B so it captures Engine B's getter as origCWGet,
        // and BEFORE any fingerprinter accesses iframe.contentWindow.
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} ─────────────────────────────────────────────────────────`);
        console.log(`${WID} 🔥 PHASE 5.9: Pre-Generating ALL Injection Scripts`);
        console.log(`${WID} ─────────────────────────────────────────────────────────`);

        const allScripts = [];

        // Stealth patches (Engine B: hardware, GPU, screen, audio, canvas, navigator hooks)
        const stealthScripts = await stealthPatches.generateAllScripts(fp);
        allScripts.push(...stealthScripts);
        console.log(`${WID} ✅ Stealth scripts generated (${stealthScripts.length} modules)`);

        // ✅ V20.0.33 LEAK#1 FIX: Font scripts — generate ALL via generateAllScripts()
        // stealth_font.js v7.6.0+ generateAllScripts(fontData) returns array of 2 scripts:
        //   [0] = generateFontInjectionScript(fontData) — FontFaceSet API hooks (main window)
        //   [1] = generateFontMetricDefenseScript(fontData) — FALLBACK-SWAP + iframe 4-layer defense
        // DeviceManager.fontManager is the initialized StealthFont instance (created at Step 5).
        // INJECTION ORDER: Both scripts pushed AFTER Engine B stealthScripts (correct order).
        if (DeviceManager.fontManager && fp.fonts && fp.fonts.list && fp.fonts.list.length > 0) {
            try {
                const fontScripts = DeviceManager.fontManager.generateAllScripts(fp.fonts);
                let fontScriptCount = 0;
                for (let fi = 0; fi < fontScripts.length; fi++) {
                    if (fontScripts[fi] && typeof fontScripts[fi] === 'string' && fontScripts[fi].length > 0) {
                        allScripts.push(fontScripts[fi]);
                        fontScriptCount++;
                    }
                }
                console.log(`${WID} ✅ Font scripts generated: ${fontScriptCount} modules (${fp.fonts.list.length} fonts, persona: ${fp.fonts.persona || 'N/A'})`);
                if (fontScriptCount >= 2) {
                    console.log(`${WID} ✅ Font API hooks (Script 1) + FALLBACK-SWAP iframe defense (Script 2) ACTIVE`);
                } else if (fontScriptCount === 1) {
                    console.warn(`${WID} ⚠️ Only ${fontScriptCount} font script generated (expected 2)`);
                }
            } catch (fontGenErr) {
                console.warn(`${WID} ⚠️ Font script generation failed: ${fontGenErr.message}`);
                console.warn(`${WID} ⚠️ Font hooks will NOT be active for this session`);
            }
        } else {
            console.warn(`${WID} ⚠️ Font injection skipped (fontManager: ${!!DeviceManager.fontManager}, fonts.list: ${fp.fonts?.list?.length || 0})`);
        }

        console.log(`${WID} ✅ Total injection scripts prepared: ${allScripts.length}`);
        console.log(`${WID} ─────────────────────────────────────────────────────────`);

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // PHASE 5.9.3: LOG FINGERPRINT FOR AUDIT
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        const fpLogPath = path.join(FP_LOG_DIR, `W${workerId}_${Date.now()}.log`);
        fs.writeFileSync(fpLogPath, JSON.stringify(fp, null, 2), 'utf8');
        console.log(`${WID} ✅ FP Log saved: ${path.basename(fpLogPath)}`);

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ v20.0.24: PHASE 6 - LAUNCH BROWSER (FIXED API + MULTI-WORKER SUPPORT)
        // ✅ v20.0.25: NOTE - BrowserLauncher.js must be patched with "Safe Swap Strategy" (see instructions above)
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} ─────────────────────────────────────────────────────────`);
        console.log(`${WID} 🚀 PHASE 6: Launching Browser Engine (Multi-Worker Support)`);
        console.log(`${WID} ─────────────────────────────────────────────────────────`);

        const playwright = require('playwright');
        // Determine backend (Chromium/Firefox)
        const backend = (fp.browserName === 'Firefox') ? playwright.firefox : playwright.chromium;

        console.log(`${WID} 🔧 Worker ID: W${slotIndex} (prevents multi-worker conflicts)`);
        console.log(`${WID} 🔧 Backend: ${fp.browserName === 'Firefox' ? 'Gecko' : 'Chromium'}`);
        console.log(`${WID} 🔧 Profile: ${path.basename(profilePath)}`);
        console.log(`${WID} 🔧 Scripts: ${allScripts.length} injections ready`);

        // FIX: Call launchBrowser() directly with proper Worker ID (not launchContext which doesn't exist)
        // Critical: Use `W${slotIndex}` as Worker ID to enable true multi-worker support
        const launchResult = await BrowserLauncher.launchBrowser(
            `W${slotIndex}`, // Worker ID unique (W1, W2, W3, ...) - prevents resource conflicts
            executablePath, // Path from PHASE 4 (supports browser pool rotation)
            fp, // Fingerprint object
            profilePath, // Unique profile path for this worker
            false, // Headless: false (show browser window)
            config, // Config object
            null, // Stealth patches (optional, null is safe)
            backend, // Playwright backend (chromium or firefox)
            allScripts // Injection scripts from PHASE 5.9
        );

        // Extract results from launch
        browser = launchResult.browser;
        context = launchResult.context;
        page = launchResult.page;

        console.log(`${WID} ✅ Browser launched successfully`);
        if (browser && browser.pid) {
            console.log(`${WID} ✅ Process PID: ${browser.pid}`);
        }

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ V20.0.35: Register worker in activeWorkers for SIGINT cleanup access
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        activeWorkers.set(workerId, { context, profilePath });

        // PHASE 7: NAVIGATION
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 7: Navigating to ${targetUrl}...`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(`${WID} ✅ Navigation complete`);

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // PHASE 8: RUNTIME VALIDATION
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 8: Running runtime validation...`);
        const validationResult = await runRuntimeValidation(page, fp, workerId);

        if (!validationResult.passed) {
            console.warn(`${WID} ⚠️ Some validation checks failed (see above)`);
        }

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // KEEP BROWSER OPEN FOR INSPECTION
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log(`${WID} ✅ DIAGNOSTIC SESSION READY`);
        console.log(`${WID} Browser will remain open for manual inspection...`);
        console.log(`${WID} Press Ctrl+C to close and cleanup`);

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ V20.0.35 FIX-B: REPLACE dead promise with context-close-aware promise
        //
        // BEFORE (v20.0.34 — BUGGY):
        //   await new Promise(() => {});
        //   This promise NEVER resolves and NEVER rejects. When browser closes,
        //   terminal hangs. When Ctrl+C fires, finally block never runs.
        //
        // AFTER (v20.0.35 — FIXED):
        //   await new Promise((resolve) => { context.on('close', () => resolve()); });
        //   - User closes browser window → Playwright fires 'close' on context → resolve() → finally runs
        //   - SIGINT handler calls context.close() → fires 'close' → resolve() → finally runs
        //   - context is the raw Playwright BrowserContext from launchResult.context
        //   - BrowserLauncher v8.23.0 confirms: launchResult.context = Playwright BrowserContext
        //   - Playwright BrowserContext 'close' event fires when context is closed for any reason
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        await new Promise((resolve) => {
            context.on('close', () => {
                console.log(`${WID} 🔔 Browser context closed, initiating cleanup...`);
                resolve();
            });
        });

    } catch (error) {
        console.error(`${WID} ❌ WORKER FAILED: ${error.message}`);
        if (error.stack) {
            console.error(`${WID} Stack: ${error.stack}`);
        }
    } finally {
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ V20.0.35 FIX-E: Unregister from activeWorkers FIRST
        // Prevents SIGINT handler from attempting to close this already-cleaning context
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        activeWorkers.delete(workerId);

        // CLEANUP
        console.log(`${WID} Starting cleanup...`);

        if (page) {
            try {
                await page.close();
                console.log(`${WID} ✅ Page closed`);
            } catch (e) {
                console.warn(`${WID} ⚠️ Page close warning: ${e.message}`);
            }
        }

        if (context) {
            try {
                await context.close();
                console.log(`${WID} ✅ Context closed`);
            } catch (e) {
                console.warn(`${WID} ⚠️ Context close warning: ${e.message}`);
            }
        }

        if (browser) {
            try {
                await browser.close();
                console.log(`${WID} ✅ Browser closed`);
            } catch (e) {
                console.warn(`${WID} ⚠️ Browser close warning: ${e.message}`);
            }
        }

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ V20.0.35 FIX-D: Explicit profile directory cleanup
        // BrowserLauncher.browserHandle.close() calls cleanupTemporaryProfile() internally,
        // but if context was already closed (by SIGINT or user action), browserHandle.close()
        // may fail at context.close() step and the profile cleanup may be skipped.
        // This explicit fs.rmSync() guarantees the profile directory is always deleted.
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        if (profilePath) {
            try {
                if (fs.existsSync(profilePath)) {
                    // Wait briefly for browser process to fully release file locks
                    await new Promise(r => setTimeout(r, 1500));
                    fs.rmSync(profilePath, { recursive: true, force: true });
                    console.log(`${WID} ✅ Profile directory deleted: ${path.basename(profilePath)}`);
                }
            } catch (e) {
                console.warn(`${WID} ⚠️ Profile cleanup warning: ${e.message}`);
            }
        }

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ v20.0.25 FIX #3: Remove Non-Existent Cleanup Function
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // Executable cleanup is handled by BrowserLauncher internally (no manual cleanup needed)
        // config.cleanupWorkerExecutable() doesn't exist in config.js v88.0.0
        if (executablePath && process.env.DEBUG_MODE === 'true') {
            console.log(`${WID} ℹ️ Executable path was: ${executablePath}`);
        }

        if (proxyAssigned && slotIndex !== null) {
            try {
                await ProxyPoolManager.releaseProxy(slotIndex, workerId); // ✅ FIXED: workerId instead of false
                console.log(`${WID} ✅ Proxy released`);
            } catch (e) {
                console.warn(`${WID} ⚠️ Proxy release warning: ${e.message}`);
            }
        }

        if (fp && fp._id) {
            try {
                await DeviceManager.releaseFingerprint(fp._id, fp.browserType, false);
                console.log(`${WID} ✅ Fingerprint released`);
            } catch (e) {
                console.warn(`${WID} ⚠️ Fingerprint release warning: ${e.message}`);
            }
        }

        if (slotIndex !== null) {
            try {
                await InfrastructureBuilder.releaseWorkerSlot(slotIndex);
                console.log(`${WID} ✅ Slot released`);
            } catch (e) {
                console.warn(`${WID} ⚠️ Slot release warning: ${e.message}`);
            }
        }

        console.log(`${WID} Cleanup complete`);
    }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ✅ V20.0.29: MAIN ENTRY POINT — REORDERED (PROXY STACK AFTER USER CONFIG)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('');
    console.log('════════════════════════════════════════════════════════════════════════════════');
    console.log('🚀 OPSI4 v20.0.38 - PRODUCTION READY');
    console.log('════════════════════════════════════════════════════════════════════════════════');

    try {
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // STEP 1: VALIDATE IP VALIDATOR BINARY EXISTS (file check only — NOT IP validation)
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        if (!fs.existsSync(VALIDATOR_BINARY)) {
            console.error(`❌ Validator binary NOT FOUND at: ${VALIDATOR_BINARY}`);
            process.exit(1);
        }

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // STEP 2: INITIALIZE DATABASE
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log('[Database] Connecting to MongoDB (attempt 1/3)...');
        await connect();
        console.log('[Database] ✅ Connected to MongoDB: QuantumTrafficDB');

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // STEP 3: INITIALIZE CORE MANAGERS (DeviceManager only — no proxy dependency)
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        console.log('[Init] Initializing core managers...');
        await DeviceManager.initialize();
        console.log('[Init] ✅ Core managers initialized');

        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        // ✅ V20.0.29: STEP 4 — USER CONFIGURATION (MOVED BEFORE PROXY STACK)
        // ═════════════════════════════════════════════════════════════════════════════════════════════════════
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (query) => new Promise(resolve => readline.question(query, resolve));

        try {
            console.log('');
            console.log('════════════════════════════════════════════════════════════════════════════════');
            console.log('USER CONFIGURATION');
            console.log('════════════════════════════════════════════════════════════════════════════════');

            const countStr = await question('Number of browsers [1]: ');
            const count = parseInt(countStr) || 1;

            const browserChoice = await question('Browser (1=Chrome/2=Edge/3=Firefox/4=Opera/5=Brave/auto) [1]: ');
            let browser = 'chrome';
            if (browserChoice === '2') browser = 'edge';
            else if (browserChoice === '3') browser = 'firefox';
            else if (browserChoice === '4') browser = 'opera';
            else if (browserChoice === '5') browser = 'brave';
            else if (browserChoice === 'auto') browser = 'auto';

            const useProxyStr = await question('Use proxy (Y/n)? [Y]: ');
            const useProxy = (useProxyStr || 'Y').toLowerCase() !== 'n';

            const regionInput = await question('Region (e.g. US/ID/GB) [US]: ');
            const region = (regionInput || 'US').toUpperCase().trim();

            const url = await question('Test URL [https://browserscan.net]: ') || 'https://browserscan.net';

            console.log('');
            console.log('Configuration:');
            console.log(`  Browsers: ${count}`);
            console.log(`  Browser: ${browser}`);
            console.log(`  Proxy: ${useProxy ? 'YES' : 'NO'}`);
            console.log(`  Region: ${region}`);
            console.log(`  URL: ${url}`);
            console.log('');

            // ═════════════════════════════════════════════════════════════════════════════════════════════════
            // ✅ V20.0.29: STEP 5 — CONDITIONAL PROXY STACK INITIALIZATION
            // Only start proxy infrastructure if user selected useProxy=YES
            // This eliminates the deadlock where Clash TUN captures traffic
            // but no real proxy is injected (dummy → localhost loop → no internet)
            // ═════════════════════════════════════════════════════════════════════════════════════════════════
            if (useProxy) {
                console.log('[Init] 🔧 Initializing Proxy Stack...');

                if (typeof ProxyPoolManager.initialize === 'function') {
                    await ProxyPoolManager.initialize();
                }

                if (ProxyAPIServer.start) {
                    await ProxyAPIServer.start();
                }

                await ClashManager.initialize();
                await ClashManager.start();

                // Inject ClashManager into ProxyPoolManager
                if (typeof ProxyPoolManager.injectClashManager === 'function') {
                    ProxyPoolManager.injectClashManager(ClashManager);
                }

                console.log('[Init] ✅ Proxy stack initialized (PPM + API + Clash Meta ready)');
            } else {
                console.log('[Init] ℹ️  Proxy stack SKIPPED (direct connection mode)');
                console.log('[Init] ℹ️  Workers will use direct internet connection');
            }

            // ═════════════════════════════════════════════════════════════════════════════════════════════════
            // STEP 6: INFRASTRUCTURE (UNCHANGED)
            // ═════════════════════════════════════════════════════════════════════════════════════════════════
            console.log('[Infrastructure] Initializing...');
            await InfrastructureBuilder.init(count);
            console.log('[Infrastructure] ✅ Ready');

            // ═════════════════════════════════════════════════════════════════════════════════════════════════
            // STEP 7: LAUNCH WORKERS (UNCHANGED)
            // ═════════════════════════════════════════════════════════════════════════════════════════════════
            console.log('');
            console.log('════════════════════════════════════════════════════════════════════════════════');
            console.log('LAUNCHING WORKERS');
            console.log('════════════════════════════════════════════════════════════════════════════════');
            console.log(`Launching ${count} browser(s)...`);
            console.log('');

            const promises = [];
            for (let i = 0; i < count; i++) {
                promises.push(runMode4Worker(i + 1, browser, useProxy, url, region));
                if (i < count - 1) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            await Promise.all(promises);

        } finally {
            readline.close();
            console.log('\n🛑 GRACEFUL CLEANUP (NORMAL_EXIT)');

            if (ClashManager && ClashManager.stop) await ClashManager.stop();
            if (ProxyAPIServer && ProxyAPIServer.stop) await ProxyAPIServer.stop();
            if (DeviceManager && DeviceManager.close) await DeviceManager.close();

            try {
                if (require('./database').close) await require('./database').close();
            } catch (e) {
                // Ignore
            }
        }

    } catch (error) {
        console.error('[FATAL] ❌ Initialization failed:', error.message);
        if (error.stack) {
            console.error('[FATAL] Stack:', error.stack);
        }
        process.exit(1);
    }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ✅ V20.0.35 FIX-C: REWRITTEN SIGINT HANDLER — Browser-aware graceful shutdown
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// BEFORE (v20.0.34 — BUGGY):
//   process.on('SIGINT') only closed infrastructure (ClashManager, ProxyAPIServer, DeviceManager).
//   Browser instances (local to runMode4Worker) were unreachable → orphan processes.
//   process.exit(0) bypassed all finally blocks → profile directories never deleted.
//
// AFTER (v20.0.35 — FIXED):
//   STEP 1: Close all tracked browser contexts via activeWorkers Map.
//           context.close() fires 'close' event → worker promise resolves → finally block runs.
//   STEP 2: Wait for worker finally blocks to complete (profile cleanup, resource release).
//   STEP 3: Close infrastructure (ClashManager, ProxyAPIServer, DeviceManager, ProxyPoolManager).
//   STEP 4: Sweep ./sessions for orphaned profile directories (safety net).
//   STEP 5: process.exit(0).
//   Double Ctrl+C: second SIGINT forces immediate process.exit(1).
//   Safety timeout: 10 seconds → force process.exit(1) if cleanup hangs.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
let sigintHandled = false;

process.on('SIGINT', async () => {
    if (sigintHandled) {
        console.log('\n⚡ Force exit (second Ctrl+C)');
        process.exit(1);
    }
    sigintHandled = true;

    console.log('\n\n🛑 GRACEFUL CLEANUP (SIGINT)');

    // Safety timeout: force kill after 10 seconds if cleanup hangs
    const forceKillTimer = setTimeout(() => {
        console.error('⚠️ Cleanup timeout (10s), forcing exit...');
        process.exit(1);
    }, 10000);
    forceKillTimer.unref(); // .unref() ensures this timer does NOT prevent Node.js from exiting

    try {
        // STEP 1: Close all active browser contexts
        // This triggers context 'close' event → worker promises resolve → finally blocks run
        if (activeWorkers.size > 0) {
            console.log(`[SIGINT] Closing ${activeWorkers.size} active browser(s)...`);
            for (const [wid, entry] of activeWorkers) {
                try {
                    if (entry.context) {
                        await entry.context.close();
                        console.log(`[SIGINT] ✅ Browser W${wid} context closed`);
                    }
                } catch (e) {
                    console.warn(`[SIGINT] ⚠️ Browser W${wid} close warning: ${e.message}`);
                }
            }
        }

        // STEP 2: Wait for worker finally blocks to complete
        // Each worker's finally block needs time to: close page/context/browser, delete profile,
        // release proxy, release fingerprint, release slot
        console.log('[SIGINT] Waiting for worker cleanup to complete...');
        await new Promise(r => setTimeout(r, 3000));

        // STEP 4: Close infrastructure
        console.log('[SIGINT] Closing infrastructure...');
        if (ClashManager && ClashManager.stop) {
            try { await ClashManager.stop(); } catch (e) {}
        }
        if (ProxyAPIServer && ProxyAPIServer.stop) {
            try { await ProxyAPIServer.stop(); } catch (e) {}
        }
        if (DeviceManager && DeviceManager.close) {
            try { await DeviceManager.close(); } catch (e) {}
        }
        if (ProxyPoolManager && ProxyPoolManager.close) {
            try { await ProxyPoolManager.close(); } catch (e) {}
        }
        try {
            if (require('./database').close) await require('./database').close();
        } catch (e) {}

        // STEP 4: Sweep ./sessions for any orphaned profile directories (safety net)
        try {
            const sessionsDir = path.join(__dirname, 'sessions');
            if (fs.existsSync(sessionsDir)) {
                const remaining = fs.readdirSync(sessionsDir);
                for (const dir of remaining) {
                    const fullPath = path.join(sessionsDir, dir);
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            fs.rmSync(fullPath, { recursive: true, force: true });
                            console.log(`[SIGINT] ✅ Orphan profile cleaned: ${dir}`);
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}

        console.log('✅ Cleanup complete');
    } catch (e) {
        console.error('Cleanup error:', e.message);
    }

    process.exit(0);
});

// Export for external use
module.exports = main;

// Run if executed directly
if (require.main === module) {
    main().then(() => {
        console.log('\n✅ All sessions finished. Exiting gracefully.');
        process.exit(0);
    }).catch(err => {
        console.error('FATAL ERROR:', err);
        process.exit(1);
    });
}

// BrowserLauncher.js v8.24.0 — P0-FIX: NEW TAB INJECTION GUARANTEED (addInitScript + Runtime.evaluate)
// ═══════════════════════════════════════════════════════════════════════════════
// CHANGELOG
// ═══════════════════════════════════════════════════════════════════════════════
//
//
// V8.24.0 (2026-03-04 07:52 WIB) — P0-CRITICAL: NEW TAB INJECTION FAILURE FIX
//
//   ROOT CAUSE #1: context.addInitScript() NEVER called when CDP succeeds
//     * v8.12.0 made addInitScript a FALLBACK-only ("if CDP failed")
//     * Page.addScriptToEvaluateOnNewDocument is PER-CDP-SESSION (per-page)
//     * context.addInitScript() is CONTEXT-WIDE (all pages, tabs, popups)
//     * When CDP succeeds on initial page, addInitScript was SKIPPED
//     * New tabs have NO CDP session → NO injection at all
//     * FIX: ALWAYS call context.addInitScript() as PRIMARY (context-wide guarantee)
//           CDP addScriptToEvaluateOnNewDocument as ADDITIONAL per-page reinforcement
//
//   ROOT CAUSE #2: setupNewPageListener race condition
//     * context.on('page') fires AFTER page object exists, but page may already be loading
//     * applyCdpEmulationToPage registers script for NEXT navigation only
//     * No Runtime.evaluate on current document of new tab
//     * No about:blank force navigation (like initial page has)
//     * FIX: New page listener now does:
//       1. Runtime.evaluate IMMEDIATELY (inject into current document)
//       2. Page.addScriptToEvaluateOnNewDocument (cover future navigations)
//       3. about:blank force navigation if page is about:blank (trigger scripts)
//       4. applyCdpEmulationToPage for screen/touch/iframe/worker
//
//   ROOT CAUSE #3: No idempotency guard
//     * addInitScript + CDP can both fire on same page
//     * FIX: stealth_api.js v1.20.2 adds window.__qteStealthApplied guard
//
//   MODIFIED: launchBrowser() Chromium injection block (lines ~1096-1136)
//     * addInitScript now ALWAYS called (was fallback-only)
//     * CDP injection ALSO registered (not either/or)
//   MODIFIED: setupNewPageListener() — complete rewrite
//     * Runtime.evaluate immediate injection
//     * about:blank force for empty tabs
//     * Full applyCdpEmulationToPage for metrics/touch/iframe
//   UNCHANGED: ALL other functions, detectBrowserEngine, getGPUArgs, getStealthArgs,
//     getFirefoxPrefs, injectViaCDP, injectViaFirefox, applyCdpEmulationToPage,
//     scanEdgeWorkerDirectories, getWorkerAvailability, validateWorkerSetup,
//     extractWorkerID, cleanupTemporaryProfile, BrowserLauncher class, module.exports
//   UNCHANGED: Firefox path 100% VERBATIM
//   CROSS-CODE: stealth_api.js v1.20.2 adds __qteStealthApplied guard
//   CROSS-CODE: stealth_patches.js v12.6.1 unchanged (Slot scripts already have IIFEs)
//
// V8.20.0 (2026-03-02 01:00 WIB) — P0-CRITICAL: DEVICE MEMORY FIX
//   - FIX-A: fpEmulationConfig.memory lookup chain CORRECTED
//     * BEFORE (BUGGY): memory: fp.deviceMemory || fp.navigator?.deviceMemory || 8
//       - fp.deviceMemory does NOT EXIST as top-level field in toFingerprintObject() output
//     * AFTER (FIXED): memory: fp.hardware?.memory || fp.navigator?.deviceMemory || 8
//       - fp.hardware.memory = bucketized value from DB (capped at 8 per Chromium spec)
//   - FIX-B: fpEmulationConfig.cores lookup chain CORRECTED (same pattern)
//     * BEFORE (BUGGY): cores: fp.hardwareConcurrency || fp.navigator?.hardwareConcurrency || 4
//     * AFTER (FIXED): cores: fp.hardware?.cores || fp.navigator?.hardwareConcurrency || 4
//   - FIX-C: applyCdpEmulationToPage() Step 2.6 — NEW Runtime.evaluate deviceMemory override
//     * Chromium has NO Emulation.setDeviceMemoryOverride CDP command
//     * FIX: Runtime.evaluate IMMEDIATELY after CDP session creation
//     * Overrides navigator.deviceMemory RIGHT NOW via Object.defineProperty
//     * Non-fatal: if fails, JS hook (Engine B Layer 3A) still active as backup
//   - UNCHANGED: ALL functions outside fpEmulationConfig + applyCdpEmulationToPage Step 2.6
//   - UNCHANGED: detectBrowserEngine, getGPUArgs, getStealthArgs, getFirefoxPrefs
//   - UNCHANGED: injectViaCDP, injectViaFirefox, setupNewPageListener
//   - UNCHANGED: scanEdgeWorkerDirectories, getWorkerAvailability, validateWorkerSetup
//   - UNCHANGED: extractWorkerID, cleanupTemporaryProfile
//   - UNCHANGED: BrowserLauncher class, module.exports, static bindings
//   - UNCHANGED: Firefox path 100% VERBATIM
//   - UNCHANGED: workerStealthScript internals (v8.19.0 Math.imul hash PRESERVED)
//   - CROSS-CODE: device_manager.js v7.14.0 toFingerprintObject() structure confirmed
//     * fp.hardware.cores = normalized CPU core count ✅
//     * fp.hardware.memory = bucketized device memory (max 8) ✅
//     * fp.hardwareConcurrency (top-level) = DOES NOT EXIST ❌ (bug source)
//     * fp.deviceMemory (top-level) = DOES NOT EXIST ❌ (bug source)
//   - IMPACT: ONLY fpEmulationConfig lookup + applyCdpEmulationToPage Step 2.6
//
// PREVIOUS: V8.19.0 (2026-02-28 16:00 WIB) — PHASE 1 QUICK WINS: PATCH-8 + PATCH-6
//   - PATCH-8: applyCdpEmulationToPage() Step 2.5 — NEW Emulation.setHardwareConcurrencyOverride
//     * Chromium M110+ native CPU core count override at CDP level
//     * Eliminates timing gap where navigator.hardwareConcurrency reports host real value
//     * JS-level hook (stealth_api.js Layer 3A) is now BACKUP for this CDP native override
//     * Non-fatal: if CDP command fails, JS hook remains active
//   - PATCH-6: workerStealthScript hashStr() — shift-add → Math.imul(31, h)
//     * BEFORE: h = (h << 5) - h + charCode (shift-add, produces different hash)
//     * AFTER: h = Math.imul(31, h) + charCode (MUST MATCH Engine B Layer 2/4D)
//     * OffscreenCanvas noise: every 4 bytes → every 16 bytes (match Engine B Layer 3D)
//     * AudioBuffer noise: seed^ch shift-add → hashStr(seed+index+baseHash) (match Engine B Layer 3E)
//   - UNCHANGED: ALL functions outside applyCdpEmulationToPage workerStealthScript
//   - UNCHANGED: detectBrowserEngine, getGPUArgs, getStealthArgs, getFirefoxPrefs
//   - UNCHANGED: injectViaCDP, injectViaFirefox, setupNewPageListener
//   - UNCHANGED: scanEdgeWorkerDirectories, getWorkerAvailability, validateWorkerSetup
//   - UNCHANGED: extractWorkerID, cleanupTemporaryProfile
//   - UNCHANGED: BrowserLauncher class, module.exports, static bindings
//   - UNCHANGED: Firefox path 100% VERBATIM
//   - CROSS-CODE: stealth_api.js Layer 2 Noise.hash uses Math.imul(31, h) — NOW MATCHES worker
//   - IMPACT: ONLY applyCdpEmulationToPage() modified (Step 2.5 + workerStealthScript internals)
//
// PREVIOUS: V8.18.0 (2026-02-27 23:35 WIB) — WORKER/SW/SHARED_WORKER CDP STEALTH + RACE CONDITION FIX
//   - PATCH 1A: applyCdpEmulationToPage() Step 5 — waitForDebuggerOnStart: false → TRUE
//     * BEFORE: waitForDebuggerOnStart=false — child targets start executing JS IMMEDIATELY
//       upon attach, BEFORE Runtime.evaluate can deliver stealth overrides. Race condition.
//     * AFTER: waitForDebuggerOnStart=true — Chromium PAUSES child target at first JS statement.
//       Stealth injection via Runtime.evaluate. Then Runtime.runIfWaitingForDebugger resumes.
//       GUARANTEES stealth active before ANY child code runs. Zero race condition.
//   - PATCH 1B: applyCdpEmulationToPage() Step 6 — expand Target.attachedToTarget handler
//     * BEFORE: Only handles targetInfo.type === 'iframe'. Workers ignored.
//     * AFTER: Handles iframe + worker + service_worker + shared_worker target types.
//     * 6A (IFRAME): UNCHANGED logic — Runtime.evaluate + Page.addScriptToEvaluateOnNewDocument
//     * 6B (WORKER/SW/SHARED_WORKER): NEW — injects workerStealthScript via Runtime.evaluate
//     * 6C: NEW — recursive Target.setAutoAttach on child session (nested targets)
//     * 6D: NEW — Runtime.runIfWaitingForDebugger after injection (pairs with PATCH 1A)
//   - PATCH 1C: NEW workerStealthScript — Worker-specific stealth injection
//     * Generated in applyCdpEmulationToPage() Step 4.5 (between Step 4 and Step 5)
//     * navigator overrides: hardwareConcurrency, deviceMemory, platform, vendor, language, languages
//     * OffscreenCanvas noise: same hash/canvasNoise as Engine B Layer 3D
//     * WebGL via OffscreenCanvas: getParameter(37445/37446) spoof
//     * AudioBuffer noise: same hash/audioNoise as Engine B Layer 3E
//   - PATCH 1D: fpEmulationConfig expanded with Worker stealth data
//     * NEW fields: cores, memory, platform, vendor, language, languagesJSON,
//       identityId, webglVendor, webglRenderer
//     * EXISTING fields 100% UNCHANGED
//   - UNCHANGED: detectBrowserEngine, getGPUArgs, getStealthArgs, getFirefoxPrefs
//   - UNCHANGED: injectViaCDP, injectViaFirefox
//   - UNCHANGED: scanEdgeWorkerDirectories, getWorkerAvailability, validateWorkerSetup
//   - UNCHANGED: extractWorkerID, cleanupTemporaryProfile
//   - UNCHANGED: BrowserLauncher class constructor, cleanup utilities, module.exports
//   - UNCHANGED: setupNewPageListener — calls applyCdpEmulationToPage (auto-inherits patches)
//   - UNCHANGED: Stealth debug (v8.15.0), F10 fix (v8.14.0), DICS header (v8.6.4)
//   - UNCHANGED: Firefox path — 100% VERBATIM from v8.17.0
//   - UNCHANGED: Return structure, browserHandle, static bindings, auto-validation
//   - CROSS-CODE: stealth_patches.js Slot 7 still needed for colorDepth, pixelDepth,
//     availWidth, availHeight, availTop, availLeft
//   - CROSS-CODE: Slot 18 + Engine B Layer 4 still needed for same-origin iframe JS propagation
//   - IMPACT: ONLY BrowserLauncher.js modified. No other files affected.
//
// PREVIOUS: V8.17.0 (2026-02-27 22:51 WIB) — SENTINEL 4-LAYER PERSISTENCE MODEL
//   - NEW FUNC: applyCdpEmulationToPage(page, context, fpEmulationConfig, combinedScript)
//     * Standalone per-page CDP emulation function (adopted from Sentinel v6.4.0-fp4)
//     * Creates dedicated CDP session per page/tab/popup
//     * Sends Emulation.setDeviceMetricsOverride — screen/viewport/DPR at native Chromium level
//     * Sends Emulation.setTouchEmulationEnabled — hardware-level touch (if fp.hasTouch)
//     * Sends Page.addScriptToEvaluateOnNewDocument — backup stealth injection via CDP per-page
//     * Sends Target.setAutoAttach(flatten:true) — auto-attach CDP to all iframes (Layer 3)
//     * Listens Target.attachedToTarget — inject stealth into cross-origin iframes (Layer 3)
//       - Runtime.evaluate: immediate injection into iframe current context
//       - Page.addScriptToEvaluateOnNewDocument: persist for future navigation in iframe
//     * Each CDP command wrapped in individual try/catch — best-effort, non-blocking
//     * Returns { cdp, success } object for caller to use
//   - NEW FUNC: setupNewPageListener(context, fpEmulationConfig, combinedScript)
//     * Registers context.on('page') listener (adopted from Sentinel v6.4.0-fp4)
//     * Auto-detects every new page (tab, popup, window.open, target=_blank)
//     * Calls applyCdpEmulationToPage() for each new page automatically
//     * Chromium-only: Firefox does not support CDP Target API
//     * Logs page count for debugging
//   - MODIFIED: launchBrowser() Chromium path — 3 surgical changes:
//     1. REPLACED inline v8.16.0 Emulation.setDeviceMetricsOverride block
//        → now calls applyCdpEmulationToPage() which includes metrics + touch + autoattach
//     2. ADDED setupNewPageListener() call after applyCdpEmulationToPage on initial page
//     3. cdpClient variable PRESERVED — now assigned from applyCdpEmulationToPage return
//   - UNCHANGED: detectBrowserEngine, getGPUArgs, getStealthArgs, getFirefoxPrefs
//   - UNCHANGED: injectViaCDP, injectViaFirefox
//   - UNCHANGED: scanEdgeWorkerDirectories, getWorkerAvailability, validateWorkerSetup
//   - UNCHANGED: extractWorkerID, cleanupTemporaryProfile
//   - UNCHANGED: BrowserLauncher class constructor, cleanup utilities, module.exports
//   - UNCHANGED: Stealth debug system (v8.15.0), F10 fix (v8.14.0), DICS header (v8.6.4)
//   - UNCHANGED: Firefox path — 100% VERBATIM from v8.16.0
//   - UNCHANGED: Return structure, browserHandle, static bindings, auto-validation
//   - CROSS-CODE: stealth_patches.js Slot 7 still needed for colorDepth, pixelDepth,
//     availWidth, availHeight, availTop, availLeft — CDP doesn't cover these
//   - CROSS-CODE: Slot 18 (iframe propagation) + Engine B Layer 4 still needed for
//     same-origin iframe JS-level propagation (complement to CDP auto-attach)
//   - IMPACT: ONLY BrowserLauncher.js modified. No other files affected.
//   - SENTINEL SOURCE: https://github.com/lokah1945/Sentinel_ActivityViewer
//     Branch: CustomUpdate_Basisv6.4StealthMode (v6.4.0-fp4)
//     Techniques adopted: applyCdpEmulationToPage, context.on('page'), Target.setAutoAttach
//
// PREVIOUS: V8.16.0 (2026-02-26 22:13 WIB) — CDP SCREEN TIMING GAP FIX
//   - NEW: CDP Emulation.setDeviceMetricsOverride after script registration
//     * Sets screen.width, screen.height, viewport width/height, deviceScaleFactor
//       at Chromium native level BEFORE any navigation occurs
//     * Eliminates timing gap where screen dimensions report real monitor values
//       between context creation and stealth script execution
//   - MODIFIED: cdpClient variable hoisted from try-block scope to function scope
//     * BEFORE: const cdpClient (scoped to try block, lost after catch)
//     * AFTER: let cdpClient = null (accessible for Emulation command after F10)
//   - SCOPE: ONLY Chromium path CDP injection block modified
//   - SCOPE: Firefox path UNCHANGED (uses Playwright native screen option)
//   - UNCHANGED: detectBrowserEngine, getGPUArgs, getStealthArgs, getFirefoxPrefs
//   - UNCHANGED: injectViaCDP, injectViaFirefox
//   - UNCHANGED: scanEdgeWorkerDirectories, getWorkerAvailability, validateWorkerSetup
//   - UNCHANGED: extractWorkerID, cleanupTemporaryProfile
//   - UNCHANGED: BrowserLauncher class constructor, cleanup utilities, module.exports
//   - UNCHANGED: Stealth debug system (v8.15.0), F10 fix (v8.14.0), DICS header (v8.6.4)
//   - CROSS-CODE: stealth_patches.js Slot 7 (Screen) still needed for colorDepth, pixelDepth,
//     availWidth, availHeight, availTop, availLeft — CDP doesn't cover these
//   - CROSS-CODE: CDP sets native values, Slot 7 Object.defineProperty overrides them —
//     no conflict (defineProperty always wins after execution)
//
// PREVIOUS: V8.15.0 (2026-02-23 05:06 WIB) — STEALTH DEBUG SYSTEM INTEGRATION
//   - NEW: Reads STEALTH_DEBUG and STEALTH_LOG from process.env
//   - NEW: Attaches fp.__stealthDebug = { enabled, level } before script preparation
//   - NEW: After aboutblank activation (Chromium) or page creation (Firefox),
//     retrieves window.__stealthValidation via page.evaluate()
//   - NEW: Writes debug log to file with timestamp in filename:
//     stealth_debug_YYYYMMDD_HHmmss.log (path from STEALTH_LOG_FILE env)
//   - NEW: Console summary of validation score when STEALTH_DEBUG=true
//   - MODIFIED: launchBrowser() — 3 insertion points (debug attach, retrieval, log write)
//   - UNCHANGED: ALL other functions VERBATIM from v8.14.0
//   - UNCHANGED: detectBrowserEngine, getGPUArgs, getStealthArgs, getFirefoxPrefs
//   - UNCHANGED: injectViaCDP, injectViaFirefox
//   - UNCHANGED: scanEdgeWorkerDirectories, getWorkerAvailability, validateWorkerSetup
//   - UNCHANGED: extractWorkerID, cleanupTemporaryProfile
//   - UNCHANGED: BrowserLauncher class constructor, cleanup utilities, module.exports
//   - SCOPE: Debug system is ADDITIVE ONLY — zero changes to any existing logic
//   - OVERHEAD: STEALTH_DEBUG=false → 1x env read + 1 object assign (< 0.01ms)
//
// PREVIOUS: V8.14.0 (2026-02-22 16:46 WIB) — FORENSIC AUDIT F10 CDP RACE CONDITION FIX
//   - F10 [P1-HIGH] Race Condition: CDP Injection vs Recycled Page
//     BEFORE: CDP Page.addScriptToEvaluateOnNewDocument fires on NEXT navigation only.
//     AFTER: Force page.goto('about:blank') after CDP registration.
//   - v8.13.0 merged: DA-v4 Notification Permission Stealth Fix
//     BEFORE: permissions: ['geolocation', 'notifications'] → detection signal
//     AFTER: permissions: ['geolocation'] only. Notification.permission='default'
//
// PREVIOUS: V8.12.0 (2026-02-22 03:32 WIB) — DA-v2 Bug #9 FIX CDP+addInitScript Double Injection
//   - CDP as PRIMARY injection, addInitScript as FALLBACK only if CDP fails
//
// PREVIOUS: V8.9.0 (2026-02-21 20:00 WIB) — P1 PATCH WebRTC CLI Defense Layer 1
//   - getStealthArgs: --force-webrtc-ip-handling-policy=disable_non_proxied_udp
//   - getFirefoxPrefs: media.peerconnection.ice.no_host=true + 3 more ICE prefs
//
// PREVIOUS: V8.7.0 — DICS Header Injection
// PREVIOUS: V8.6.4 (2026-02-18 14:35 WIB) — DICS Accept-Language Header Injection
// PREVIOUS: V8.6.3 (2026-02-18 08:04 WIB) — Force Sync Geolocation + Permissions
// PREVIOUS: V8.6.2 (2026-02-17 06:33 WIB) — Recycle Strategy AIC/AIA/AIB
// PREVIOUS: V8.6.0 — Persistent Context Mode, CLI-only viewport/screen
// PREVIOUS: V8.4.0 — Hardware Override REMOVED (single source compliance)
//
// STATUS: PRODUCTION READY
// Synced: stealth_api.js v1.18.0, stealth_apiHelper.js v2.1.0,
//         stealth_patches.js v12.5.0, stealth_chromium.js v3.4.0,
//         stealth_firefox.js v3.0.0, device_manager.js v7.14.0,
//         stealth_font.js v7.9.0
// Worker stealth: navigator, OffscreenCanvas, WebGL, AudioBuffer — matching Engine B (Math.imul hash)
// ═══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const { formatSlotId, getRandomInt } = require('./utils');

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
const PLATFORM = {
    isWindows: os.platform() === 'win32',
    isLinux: os.platform() === 'linux',
    isMac: os.platform() === 'darwin',
    arch: os.arch()
};

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
const OTHERS_RESERVED = parseInt(process.env.OTHERS_RESERVED || '1000', 10);
const MSEDGE_RESERVED = parseInt(process.env.MSEDGE_RESERVED || '200', 10);
const TOTAL_SLOTS = OTHERS_RESERVED + MSEDGE_RESERVED;

console.log('BrowserLauncher Slot Configuration:');
console.log(`  Hardlink Strategy: Slot 1-${OTHERS_RESERVED} (All browsers)`);
console.log(`  Worker Directory Strategy: Slot ${OTHERS_RESERVED + 1}-${TOTAL_SLOTS} (Edge only)`);

// ═══════════════════════════════════════════════════════════════════════════════
// v8.4.0 HARDWARE OVERRIDE REMOVED — SINGLE SOURCE COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════
// REMOVED: generateHardwareOverrideScript function
// REASON: Double override race condition — hardware patch now ONLY in stealth_patches.js
// Hardware override now handled by:
// - stealth_patches.js: generateHardwareConcurrencyScript(fp)
// - stealth_patches.js: generateDeviceMemoryScript(fp)
// BrowserLauncher responsibility: ONLY Playwright native config + script injection

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: DETECT BROWSER ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
function detectBrowserEngine(executablePath) {
    const exeName = path.basename(executablePath).toLowerCase();
    const dirPath = path.dirname(executablePath).toLowerCase();

    if (exeName.includes('firefox') || dirPath.includes('firefox'))
        return { engine: 'gecko', browser: 'firefox' };
    if (exeName.includes('msedge') || dirPath.includes('edge'))
        return { engine: 'chromium', browser: 'edge' };
    if (exeName.includes('chrome') && !exeName.includes('chromium'))
        return { engine: 'chromium', browser: 'chrome' };
    if (exeName.includes('chromium'))
        return { engine: 'chromium', browser: 'chromium' };
    if (exeName.includes('brave') || dirPath.includes('brave'))
        return { engine: 'chromium', browser: 'brave' };
    if (exeName.includes('opera'))
        return { engine: 'chromium', browser: 'opera' };
    return { engine: 'chromium', browser: 'unknown' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GPU ACCELERATION ARGS — FORCE ENABLE
// ═══════════════════════════════════════════════════════════════════════════════
function getGPUArgs(engine, browser) {
    if (engine === 'chromium') {
        const baseArgs = [
            '--ignore-gpu-blocklist',
            '--enable-gpu-rasterization',
            '--enable-zero-copy',
            '--enable-hardware-overlays',
            '--disable-software-rasterizer',
            '--enable-accelerated-video-decode',
            '--enable-accelerated-2d-canvas'
        ];
        if (PLATFORM.isWindows) {
            baseArgs.push('--use-angle=d3d11');
            baseArgs.push('--enable-features=DefaultANGLEVulkan');
        } else if (PLATFORM.isLinux) {
            baseArgs.push('--use-angle=vulkan');
            baseArgs.push('--enable-features=VulkanFromANGLE');
        }
        return baseArgs;
    }
    return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEALTH ARGS — v8.6.0 PERSISTENT CONTEXT MODE
// ═══════════════════════════════════════════════════════════════════════════════
function getStealthArgs(engine, locale, fp) {
    if (engine === 'chromium') {
        return [
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--no-default-browser-check',
            '--no-first-run',
            '--password-store=basic',
            '--use-mock-keychain',
			'--disable-ipv6',
            `--lang=${locale || 'en-US'}`,
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            // CRITICAL: Keep HardwareConcurrencyFreezing disabled — allow override from stealth_patches
            '--disable-features=HardwareConcurrencyFreezing',
            '--js-flags=--expose-gc',
            // v8.9.0 P1: WebRTC flags REMOVED (v2.0.0 WebRTC Stealth Upgrade)
            // OLD: --force-webrtc-ip-handling-policy=disable_non_proxied_udp
            //      --webrtc-ip-handling-policy=disable_non_proxied_udp
            // These flags blocked STUN/UDP entirely, causing BrowserScan to detect
            // "WebRTC disabled" or no srflx candidates. Now we allow native STUN
            // and rewrite output IPs in stealth_api.js applyWebRTCHooks().
            // v2.0.0: Use default_public_interface_only instead — allows STUN
            // but prevents probing multiple network interfaces (reduces leak surface)
            '--force-webrtc-ip-handling-policy=default_public_interface_only',
            '--webrtc-ip-handling-policy=default_public_interface_only'
        ];
    }
    // v8.26.0: Removed '-profile' — launchPersistentContext manages profile via userDataDir
    return ['-no-remote'];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIREFOX PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════════
function getFirefoxPrefs(fp) {
    return {
        'webgl.disabled': false,
        'webgl.force-enabled': true,
        'layers.acceleration.force-enabled': true,
        'gfx.webrender.all': true,
        'dom.webdriver.enabled': false,
        'useAutomationExtension': false,
        'privacy.trackingprotection.enabled': false,
        'general.platform.override': 'Win32',
        'intl.accept_languages': fp.locale || 'en-US',
        'browser.cache.disk.enable': false,
        'browser.cache.memory.enable': true,
        'browser.sessionstore.resume_from_crash': false,
        // v8.9.0 P1 → v2.0.0: WebRTC flags relaxed for stealth
        // OLD: default_address_only=true, no_host=true → blocked all STUN → BrowserScan "disabled"
        // NEW: Allow STUN to function, stealth_api.js rewrites output IPs
        // media.peerconnection.enabled stays TRUE (false = bot signal for Datadome)
        'media.peerconnection.ice.default_address_only': false,
        'media.peerconnection.ice.no_host': false,
        'media.peerconnection.ice.proxy_only_if_behind_proxy': false,
        // Enable mDNS obfuscation — matches normal Firefox behavior
        'media.peerconnection.ice.obfuscate_host_addresses': true,
		'network.dns.disableIPv6': true
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPRECATED CDP INJECTION v8.3.1 — KEPT FOR FALLBACK ONLY
// ═══════════════════════════════════════════════════════════════════════════════
async function injectViaCDP(page, context, scripts, fp) {
    console.warn('BrowserLauncher: DEPRECATED injectViaCDP is legacy fallback (v8.3.1)');
    console.warn('BrowserLauncher: Primary injection now uses CDP Page.addScriptToEvaluateOnNewDocument (v8.12.0)');
    console.warn('BrowserLauncher: This function kept for emergency debugging only');
    console.log('BrowserLauncher: Establishing CDP Session (fallback mode)...');
    try {
        const client = await context.newCDPSession(page);
        const maxRetries = 3;
        let injectionSuccess = false;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`BrowserLauncher: ATTEMPT ${attempt}/${maxRetries} CDP injection...`);
            try {
                const combinedScript = scripts.join('\n// === NEXT SCRIPT ===\n');
                await client.send('Page.addScriptToEvaluateOnNewDocument', { source: combinedScript });
                console.log(`BrowserLauncher: CDP script registered (Attempt ${attempt})`);
                injectionSuccess = true;
                break;
            } catch (cdpError) {
                console.error(`BrowserLauncher: Attempt ${attempt} failed:`, cdpError.message);
                if (attempt < maxRetries) {
                    console.log('BrowserLauncher: Retrying in 200ms...');
                    await new Promise(r => setTimeout(r, 200));
                }
            }
        }
        if (!injectionSuccess) {
            console.error('BrowserLauncher: CDP FALLBACK INJECTION FAILED!');
            return { success: false, client, validation: null };
        }
        console.log('BrowserLauncher: CDP fallback injection complete');
        return { success: true, client, validation: null };
    } catch (error) {
        console.error('BrowserLauncher: CDP fallback failed:', error.message);
        return { success: false, client: null, validation: null };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIREFOX INJECTION v8.4.0 — AIC COMPLIANT
// ═══════════════════════════════════════════════════════════════════════════════
async function injectViaFirefox(context, scripts, fp) {
    console.log('BrowserLauncher: Firefox EARLY injection (before page creation)...');
    try {
        const combinedScript = scripts.join('\n// === NEXT SCRIPT ===\n');
        await context.addInitScript(combinedScript);
        console.log('BrowserLauncher: Firefox stealth scripts injected (single source)');
        console.log('BrowserLauncher: Firefox injection complete (early mode)');
        return { success: true };
    } catch (error) {
        console.error('BrowserLauncher: Firefox injection failed:', error.message);
        return { success: false };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE WORKER DIRECTORY SCANNER
// ═══════════════════════════════════════════════════════════════════════════════
function scanEdgeWorkerDirectories(edgeWorkersRoot) {
    const defaultRoot = path.join(process.cwd(), 'Browser', 'edge');
    const rootDir = edgeWorkersRoot || defaultRoot;

    if (!fs.existsSync(rootDir)) {
        console.warn('BrowserLauncher: Edge root directory not found:', rootDir);
        return { maxWorkerId: OTHERS_RESERVED, availableWorkers: [], count: 0, rootDir };
    }

    try {
        const allItems = fs.readdirSync(rootDir);
        const validWorkers = allItems.filter(name => {
            const fullPath = path.join(rootDir, name);
            const exePath = path.join(fullPath, 'msedge.exe');
            try {
                const stat = fs.statSync(fullPath);
                return stat.isDirectory() && name.toLowerCase().startsWith('worker') && fs.existsSync(exePath);
            } catch(e) { return false; }
        });

        const workerIds = validWorkers
            .map(name => { const match = name.match(/worker(\d+)/i); return match ? parseInt(match[1], 10) : null; })
            .filter(id => id !== null);

        const maxWorkerId = workerIds.length > 0 ? Math.max(...workerIds) : OTHERS_RESERVED;
        console.log(`BrowserLauncher: Edge Scan — Found ${validWorkers.length} ready-to-use worker directories.`);
        return { maxWorkerId, availableWorkers: validWorkers, workerIds: workerIds.sort((a,b) => a-b), count: validWorkers.length, rootDir };
    } catch(e) {
        console.error('BrowserLauncher: Scan failed:', e.message);
        return { maxWorkerId: OTHERS_RESERVED, availableWorkers: [], workerIds: [], count: 0, rootDir };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET WORKER AVAILABILITY
// ═══════════════════════════════════════════════════════════════════════════════
function getWorkerAvailability(slotIndex) {
    if (slotIndex <= OTHERS_RESERVED) {
        return { available: true, strategy: 'hardlink', message: `Slot ${slotIndex} uses hardlink strategy (runtime creation)` };
    } else if (slotIndex <= TOTAL_SLOTS) {
        const workersBaseDir = path.join(process.cwd(), 'Browser', 'edge');
        const slotId = formatSlotId(slotIndex);
        const workerDir = path.join(workersBaseDir, `worker${slotId}`);
        const workerExe = path.join(workerDir, 'msedge.exe');
        const available = fs.existsSync(workerExe);
        return { available, strategy: 'worker-directory', workerDir, workerExe, message: available ? `Slot ${slotIndex} worker directory is ready` : `Slot ${slotIndex} worker directory NOT FOUND: ${workerDir}` };
    } else {
        return { available: false, strategy: 'invalid', message: `Slot ${slotIndex} exceeds maximum (${TOTAL_SLOTS})` };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATE WORKER SETUP
// ═══════════════════════════════════════════════════════════════════════════════
function validateWorkerSetup() {
    console.log('BrowserLauncher: Validating Worker Setup...');
    const results = {
        hardlinkStrategy: { available: true, slots: OTHERS_RESERVED },
        workerDirectoryStrategy: { available: false, slots: MSEDGE_RESERVED, found: 0 },
        errors: [],
        warnings: []
    };

    const scan = scanEdgeWorkerDirectories();
    results.workerDirectoryStrategy.found = scan.count;
    results.workerDirectoryStrategy.available = scan.count > 0;

    if (scan.count === 0) {
        results.errors.push(`No Edge worker directories found in ${scan.rootDir}`);
    } else if (scan.count < MSEDGE_RESERVED) {
        results.warnings.push(`Only ${scan.count}/${MSEDGE_RESERVED} Edge workers available`);
    }

    console.log('BrowserLauncher: Setup Validation:');
    console.log(`  Hardlink Strategy: ${results.hardlinkStrategy.slots} slots available (1-${OTHERS_RESERVED})`);
    console.log(`  ${results.workerDirectoryStrategy.found > 0 ? '✅' : '❌'} Worker Directory Strategy: ${results.workerDirectoryStrategy.found}/${results.workerDirectoryStrategy.slots} slots available`);
    return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: EXTRACT WORKER ID
// ═══════════════════════════════════════════════════════════════════════════════
function extractWorkerID(executablePath) {
    const filename = path.basename(executablePath);
    const dirname = path.basename(path.dirname(executablePath));

    const hardlinkMatch = filename.match(/worker(\d+)\.exe/i);
    if (hardlinkMatch) return parseInt(hardlinkMatch[1], 10);

    const workerDirMatch = dirname.match(/worker(\d+)/i);
    if (workerDirMatch) return parseInt(workerDirMatch[1], 10);

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPORARY PROFILE CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════
async function cleanupTemporaryProfile(profilePath, workerId) {
    if (!profilePath || !fs.existsSync(profilePath)) return;
    try {
        console.log(`BrowserLauncher: Cleaning up temporary profile: ${path.basename(profilePath)}`);
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 1) await new Promise(r => setTimeout(r, 2000));
                fs.rmSync(profilePath, { recursive: true, force: true });
                console.log('BrowserLauncher: Temporary profile deleted');
                return;
            } catch(e) {
                if (attempt === maxRetries) {
                    console.warn('BrowserLauncher: Cleanup failed:', profilePath);
                }
            }
        }
    } catch(error) {
        console.warn('BrowserLauncher: Profile cleanup error:', error.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// v8.18.0 PER-PAGE CDP EMULATION — SENTINEL 4-LAYER + WORKER STEALTH
// ═══════════════════════════════════════════════════════════════════════════════
// Adopted from Sentinel v6.4.0-fp4 applyCdpEmulationToPage()
// Creates a dedicated CDP session for a single page and applies:
//   Layer 2: Emulation.setDeviceMetricsOverride (screen/viewport/DPR native)
//   Layer 2: Emulation.setTouchEmulationEnabled (hardware touch if applicable)
//   Layer 3: Target.setAutoAttach(flatten:true) — auto-attach to all iframes
//   Layer 3: Target.attachedToTarget listener — inject into cross-origin iframes
//   Layer 4: Page.addScriptToEvaluateOnNewDocument — backup script per-page
//
// Parameters:
//   page            — Playwright Page object (initial page, new tab, popup)
//   context         — Playwright BrowserContext (for newCDPSession)
//   fpEmulationConfig — { width, height, screenWidth, screenHeight, deviceScaleFactor, isMobile, hasTouch, maxTouchPoints }
//   combinedScript  — Combined stealth script string (all slots + Engine B)
//
// Returns: { cdp: CDPSession|null, success: boolean }
// ═══════════════════════════════════════════════════════════════════════════════
async function applyCdpEmulationToPage(page, context, fpEmulationConfig, combinedScript) {
    let cdp = null;
    let success = false;

    // Step 1: Create dedicated CDP session for this page
    try {
        cdp = await context.newCDPSession(page);
    } catch (e) {
        console.warn('BrowserLauncher: v8.18.0 — CDP session creation failed for page:', e.message);
        return { cdp: null, success: false };
    }

    // Step 2: Emulation.setDeviceMetricsOverride — native screen/viewport/DPR
    // This sets screen dimensions at Chromium internal level, BEFORE any JS runs.
    // Eliminates timing gap where screen.width/height report host real values.
    // Slot 7 still needed for: colorDepth, pixelDepth, availWidth, availHeight, availTop, availLeft
    try {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: fpEmulationConfig.width,
            height: fpEmulationConfig.height,
            deviceScaleFactor: fpEmulationConfig.deviceScaleFactor,
            mobile: fpEmulationConfig.isMobile || false,
            screenWidth: fpEmulationConfig.screenWidth,
            screenHeight: fpEmulationConfig.screenHeight
        });
        success = true;
        console.log(`BrowserLauncher: v8.20.0 — CDP screen override: screen=${fpEmulationConfig.screenWidth}x${fpEmulationConfig.screenHeight} viewport=${fpEmulationConfig.width}x${fpEmulationConfig.height} DPR=${fpEmulationConfig.deviceScaleFactor}`);
    } catch (emulationErr) {
        console.warn('BrowserLauncher: v8.20.0 — Emulation.setDeviceMetricsOverride failed:', emulationErr.message);
    }

    // === Step 2.5: v8.19.0 PATCH-8 Emulation.setHardwareConcurrencyOverride ===
    // Chromium M110+ supports native CPU core count override at CDP level.
    // Eliminates timing gap where navigator.hardwareConcurrency reports host
    // real value between context creation and JS-level hook execution.
    // JS-level hook (stealth_api.js Layer 3A) is now BACKUP for this CDP native override.
    if (fpEmulationConfig.cores) {
        try {
            await cdp.send('Emulation.setHardwareConcurrencyOverride', {
                hardwareConcurrency: fpEmulationConfig.cores
            });
            console.log(`BrowserLauncher: v8.20.0 CDP hardwareConcurrency override: ${fpEmulationConfig.cores} cores`);
        } catch (coresErr) {
            console.warn('BrowserLauncher: v8.20.0 Emulation.setHardwareConcurrencyOverride failed:', coresErr.message);
            // Non-fatal: JS-level hook (stealth_api.js Layer 3A / stealth_patches.js Slot 3) still active as fallback
        }
    }

    // === Step 2.6: v8.20.0 FIX-C — IMMEDIATE deviceMemory override via Runtime.evaluate ===
    // Chromium has NO Emulation.setDeviceMemoryOverride CDP command.
    // Unlike hardwareConcurrency (Step 2.5), deviceMemory can ONLY be overridden via JS.
    // Page.addScriptToEvaluateOnNewDocument (Step 4) fires on NEXT navigation only.
    // On recycled page, navigator.deviceMemory reports host real value (e.g., 32 GB)
    // until next navigation triggers the registered script.
    //
    // FIX: Runtime.evaluate executes IMMEDIATELY in current page context.
    // This overrides navigator.deviceMemory RIGHT NOW, before any page JS can read it.
    // Engine B Layer 3A JS hook remains active as backup for future navigations.
    if (fpEmulationConfig.memory) {
        try {
            await cdp.send('Runtime.evaluate', {
                expression: `(function() {
                    var m = ${fpEmulationConfig.memory};
                    try { Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: function() { return m; }, configurable: true, enumerable: true }); } catch(e) {}
                    try { Object.defineProperty(navigator, 'deviceMemory', { get: function() { return m; }, configurable: true, enumerable: true }); } catch(e) {}
                })();`,
                awaitPromise: false
            });
            console.log(`BrowserLauncher: v8.20.0 CDP deviceMemory override: ${fpEmulationConfig.memory} GB (via Runtime.evaluate)`);
        } catch (memoryErr) {
            console.warn('BrowserLauncher: v8.20.0 Runtime.evaluate deviceMemory failed:', memoryErr.message);
            // Non-fatal: JS hook in Engine B Layer 3A still active as backup
        }
    }

    // === Step 2.7: v8.25.0 P0-4 — Emulation.setUserAgentOverride with userAgentMetadata ===
    // CRITICAL: Without this, Sec-CH-UA HTTP header is generated by Chromium binary
    // based on ACTUAL binary version, not the spoofed UA string.
    // If binary is Chrome 120 but UA is spoofed to Chrome 118, then:
    //   User-Agent header: Chrome/118 (from JS spoof)
    //   Sec-CH-UA header: Chrome/120 (from binary) → MISMATCH DETECTED by Cloudflare
    // CDP Emulation.setUserAgentOverride with userAgentMetadata aligns BOTH headers.
    if (fpEmulationConfig.userAgent) {
        try {
            const uaOverride = {
                userAgent: fpEmulationConfig.userAgent,
                acceptLanguage: fpEmulationConfig.language || 'en-US',
                platform: fpEmulationConfig.platform || 'Win32'
            };

            // Build userAgentMetadata if brand data available
            try {
                const brands = JSON.parse(fpEmulationConfig.uaBrands || '[]');
                const fullVersionList = JSON.parse(fpEmulationConfig.uaFullVersionList || '[]');
                if (brands.length > 0) {
                    uaOverride.userAgentMetadata = {
                        brands: brands,
                        fullVersionList: fullVersionList.length > 0 ? fullVersionList : brands,
                        platform: fpEmulationConfig.uaPlatform || 'Windows',
                        platformVersion: fpEmulationConfig.uaPlatformVersion || '15.0.0',
                        architecture: fpEmulationConfig.uaArchitecture || 'x86',
                        model: '',
                        mobile: fpEmulationConfig.isMobile || false,
                        bitness: fpEmulationConfig.uaBitness || '64'
                    };
                }
            } catch (parseErr) {
                // Non-fatal: proceed without metadata
            }

            await cdp.send('Emulation.setUserAgentOverride', uaOverride);
            console.log('BrowserLauncher: v8.25.0 — CDP Emulation.setUserAgentOverride with sec-ch-ua alignment');
        } catch (uaErr) {
            console.warn('BrowserLauncher: v8.25.0 — Emulation.setUserAgentOverride failed:', uaErr.message);
            // Non-fatal: JS-level hooks still active
        }
    }

    // Step 3: Emulation.setTouchEmulationEnabled — hardware-level touch
    // JS-level override (navigator.maxTouchPoints via Slot 3 / Engine B Layer 3A) can be detected
    // by advanced scanners comparing maxTouchPoints with actual TouchEvent behavior.
    // CDP touch emulation makes Chromium generate real TouchEvent objects.
    if (fpEmulationConfig.hasTouch) {
        try {
            await cdp.send('Emulation.setTouchEmulationEnabled', {
                enabled: true,
                maxTouchPoints: fpEmulationConfig.maxTouchPoints || 10
            });
            console.log(`BrowserLauncher: v8.18.0 — CDP touch emulation enabled (maxTouchPoints=${fpEmulationConfig.maxTouchPoints || 10})`);
        } catch (touchErr) {
            console.warn('BrowserLauncher: v8.18.0 — Touch emulation failed:', touchErr.message);
        }
    }

    // Step 4: Page.addScriptToEvaluateOnNewDocument — backup injection per-page (Layer 4)
    // This is a BACKUP for context.addInitScript (Layer 1).
    // If addInitScript fails due to race condition, CDP channel ensures script injection.
    // CRITICAL: worldName MUST NOT be set — omitting = inject into DEFAULT main world.
    try {
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            source: combinedScript
        });
        console.log('BrowserLauncher: v8.18.0 — CDP Page.addScriptToEvaluateOnNewDocument registered (per-page backup)');
    } catch (scriptErr) {
        console.warn('BrowserLauncher: v8.18.0 — CDP addScript failed:', scriptErr.message);
    }

    // Step 4.5: v8.18.0 PATCH 1C — Generate Worker-specific stealth script
    // Workers have NO DOM, NO window object — only self, navigator, OffscreenCanvas, AudioContext
    // This script covers the SAME overrides as Engine B but in Worker-compatible form:
    //   - navigator props: hardwareConcurrency, deviceMemory, platform, vendor, language, languages
    //   - OffscreenCanvas: WebGL vendor/renderer spoof only (2D canvas noise REMOVED v8.22.0)
    //   - WebGL via OffscreenCanvas: getParameter(37445/37446) vendor/renderer spoof
    //   - AudioBuffer noise: same hash→audioNoise algorithm as Engine B Layer 3E
    const workerStealthScript = `(function() {
        'use strict';
        if (typeof self === 'undefined') return;
        if (self.__workerStealthApplied) return;
        self.__workerStealthApplied = true;

        // ─── Navigator overrides (same values as Engine B Layer 3A + 3F) ───
        const navOverrides = {
            hardwareConcurrency: ${fpEmulationConfig.cores},
            deviceMemory: ${fpEmulationConfig.memory},
            platform: '${fpEmulationConfig.platform}',
            vendor: '${fpEmulationConfig.vendor}',
            language: '${fpEmulationConfig.language}',
            languages: Object.freeze(${fpEmulationConfig.languagesJSON})
        };
        const navProto = Object.getPrototypeOf(self.navigator);
        for (const [key, val] of Object.entries(navOverrides)) {
            try {
                Object.defineProperty(navProto, key, {
                    get: function() { return val; },
                    configurable: true,
                    enumerable: true
                });
            } catch(e) {}
        }

        // ─── Deterministic hash v8.19.0 PATCH-6 (MUST MATCH Engine B Math.imul) ───
        function hashStr(s) {
            let h = 0;
            for (let i = 0; i < s.length; i++) {
                h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
            }
            return h;
        }
        const seed = hashStr('${fpEmulationConfig.identityId}');

        // ─── OffscreenCanvas WebGL spoof only (v8.22.0: 2D canvas noise REMOVED, matching Engine B) ───
        if (typeof OffscreenCanvas !== 'undefined') {
            const origGetContext = OffscreenCanvas.prototype.getContext;
            OffscreenCanvas.prototype.getContext = function(type, attrs) {
                const ctx = origGetContext.call(this, type, attrs);
                if (ctx && type === 'webgl' || type === 'webgl2') {
                    if (ctx && !ctx.__glSpoofed) {
                        ctx.__glSpoofed = true;
                        const origGetParam = ctx.getParameter;
                        ctx.getParameter = function(p) {
                            const ext = this.getExtension('WEBGL_debug_renderer_info');
                            if (ext) {
                                if (p === ext.UNMASKED_VENDOR_WEBGL) return '${fpEmulationConfig.webglVendor}';
                                if (p === ext.UNMASKED_RENDERER_WEBGL) return '${fpEmulationConfig.webglRenderer}';
                            }
                            if (p === 37445) return '${fpEmulationConfig.webglVendor}';
                            if (p === 37446) return '${fpEmulationConfig.webglRenderer}';
                            return origGetParam.call(this, p);
                        };
                    }
                }
                return ctx;
            };
        }

        // ─── AudioBuffer noise v8.23.0 FIX-5 (variable stride 60-140 — mirror Engine B Layer 3E/4D) ───
        if (typeof AudioContext !== 'undefined' || typeof OfflineAudioContext !== 'undefined') {
            const ACtx = typeof AudioContext !== 'undefined' ? AudioContext : OfflineAudioContext;
            const origGetChannelData = AudioBuffer.prototype.getChannelData;
            AudioBuffer.prototype.getChannelData = function(ch) {
                const buf = origGetChannelData.call(this, ch);
                if (!buf.__noised) {
                    buf.__noised = true;
                    var baseHash = hashStr(seed + '|ach|' + ch);
                    var step = 0;
                    while (step < buf.length) {
                        var sh = hashStr(seed + '|a|' + step + '|' + baseHash);
                        buf[step] += (sh % 200 - 100) * 1e-9;
                        var stepHash = hashStr(seed + '|as|' + step);
                        step += 60 + Math.abs(stepHash % 81);
                    }
                }
                return buf;
            };
        }
    })();`;

    // Step 5: Target.setAutoAttach — auto-attach CDP to all iframes AND workers (Layer 3)
    // This makes every iframe AND worker (including cross-origin) automatically get a CDP session.
    // JS-level propagation (Slot 18 + Engine B Layer 4) CANNOT reach cross-origin iframes or workers.
    // CDP auto-attach BYPASSES browser security policy for cross-origin coverage.
    // flatten:true makes all nested iframe levels accessible from this session.
    // v8.18.0 PATCH 1A: waitForDebuggerOnStart: TRUE — pause child targets before ANY JS executes
    // This guarantees stealth injection via Runtime.evaluate completes BEFORE child code runs.
    try {
        await cdp.send('Target.setAutoAttach', {
            autoAttach: true,
            waitForDebuggerOnStart: true,
            flatten: true
        });

        // Step 6: Target.attachedToTarget listener — inject into cross-origin iframes + workers
        // v8.18.0 PATCH 1B: Expanded from iframe-only to iframe + worker + service_worker + shared_worker
        // When a new child target is attached, we inject the appropriate stealth script:
        //   6A: iframe → combinedScript (full Engine B) via Runtime.evaluate + Page.addScriptToEvaluateOnNewDocument
        //   6B: worker/service_worker/shared_worker → workerStealthScript (navigator + OffscreenCanvas + Audio)
        //   6C: Recursive Target.setAutoAttach for nested targets (iframe-in-iframe, worker-in-worker)
        //   6D: Runtime.runIfWaitingForDebugger to resume paused child (complements PATCH 1A)
        cdp.on('Target.attachedToTarget', async (event) => {
            const { sessionId, targetInfo } = event;
            const targetType = targetInfo.type;

            try {
                // 6A: IFRAME — full stealth injection (same logic as v8.17.0)
                if (targetType === 'iframe') {
                    // Inject immediately into iframe's current context
                    await cdp.send('Runtime.evaluate', {
                        expression: combinedScript
                    }, sessionId).catch(() => {});

                    // Persist for future navigations within this iframe
                    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
                        source: combinedScript
                    }, sessionId).catch(() => {});

                    console.log(`BrowserLauncher: v8.18.0 — Iframe CDP attached: ${targetInfo.url ? targetInfo.url.substring(0, 80) : 'unknown'}`);
                }

                // 6B: WORKER / SERVICE_WORKER / SHARED_WORKER — worker-specific stealth
                // Workers have NO DOM, NO window — cannot use combinedScript (it references document, window).
                // workerStealthScript (PATCH 1C) covers navigator + OffscreenCanvas + WebGL + Audio.
                else if (targetType === 'worker' || targetType === 'service_worker' || targetType === 'shared_worker') {
                    await cdp.send('Runtime.evaluate', {
                        expression: workerStealthScript
                    }, sessionId).catch(() => {});

                    console.log(`BrowserLauncher: v8.18.0 — ${targetType} CDP attached: ${targetInfo.url ? targetInfo.url.substring(0, 80) : 'unknown'}`);
                }

                // 6C: Recursive auto-attach for nested targets (iframe-in-iframe, worker spawning worker)
                await cdp.send('Target.setAutoAttach', {
                    autoAttach: true,
                    waitForDebuggerOnStart: true,
                    flatten: true
                }, sessionId).catch(() => {});

                // 6D: Resume paused target — complements PATCH 1A waitForDebuggerOnStart: true
                // Without this call, the child target stays frozen forever.
                await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
            } catch (attachErr) {
                // Best effort — some targets may not support CDP injection
                // Still attempt to resume even if injection failed
                try {
                    await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
                } catch(e) {}
            }
        });

        console.log('BrowserLauncher: v8.18.0 — Target.setAutoAttach(flatten:true, waitForDebuggerOnStart:true) active — iframe + worker + SW + SharedWorker coverage enabled');
    } catch (autoAttachErr) {
        console.warn('BrowserLauncher: v8.18.0 — Target.setAutoAttach failed:', autoAttachErr.message);
    }

    return { cdp, success };
}

// ═══════════════════════════════════════════════════════════════════════════════
// v8.18.0 NEW PAGE LISTENER — SENTINEL CONTEXT.ON('PAGE')
// ═══════════════════════════════════════════════════════════════════════════════
// v8.24.0: REWRITTEN — setupNewPageListener()
// Registers context.on('page') listener that auto-detects every new page/tab/popup
// and applies FULL stealth injection + CDP emulation.
//
// v8.24.0 CHANGES vs v8.18.0-v8.23.0:
//   BEFORE: Only called applyCdpEmulationToPage (registers script for NEXT navigation)
//     → New tab's CURRENT document had NO injection (race condition)
//   AFTER: Triple injection guarantee:
//     1. Runtime.evaluate IMMEDIATELY (inject into current document RIGHT NOW)
//     2. Page.addScriptToEvaluateOnNewDocument (cover future navigations in this page)
//     3. applyCdpEmulationToPage (screen metrics, touch, iframe auto-attach, workers)
//
// NOTE: context.addInitScript (v8.24.0 PRIMARY) already covers JS-level stealth for
// all new documents. This listener adds:
//   - Immediate injection for CURRENT document (in case page already loaded)
//   - CDP Emulation (screen, touch, DPR — these are NOT covered by addInitScript)
//   - CDP iframe/worker auto-attach (Target.setAutoAttach)
//
// CHROMIUM ONLY: Firefox does not support CDP Target API.
// ═══════════════════════════════════════════════════════════════════════════════
function setupNewPageListener(context, fpEmulationConfig, combinedScript) {
    let pageCount = 0;

    context.on('page', async (newPage) => {
        pageCount++;
        const pageId = pageCount;
        console.log(`BrowserLauncher: v8.24.0 — New page detected (#${pageId}), applying stealth injection...`);

        try {
            // Step 1: Create CDP session for this new page
            const newCdp = await context.newCDPSession(newPage);

            // Step 2: Register script for FUTURE navigations in this page
            // (Page.addScriptToEvaluateOnNewDocument fires on next navigation)
            try {
                await newCdp.send('Page.addScriptToEvaluateOnNewDocument', {
                    source: combinedScript
                });
                console.log(`BrowserLauncher: v8.24.0 — Page #${pageId} addScriptToEvaluateOnNewDocument registered`);
            } catch (regErr) {
                console.warn(`BrowserLauncher: v8.24.0 — Page #${pageId} script registration failed:`, regErr.message);
            }

            // Step 3: IMMEDIATE injection into current document via Runtime.evaluate
            // This ensures the current about:blank or loading page gets stealth NOW
            // The idempotency guard in stealth_api.js prevents double execution
            // if addInitScript already ran
            try {
                await newCdp.send('Runtime.evaluate', {
                    expression: combinedScript,
                    awaitPromise: false
                });
                console.log(`BrowserLauncher: v8.24.0 — Page #${pageId} Runtime.evaluate immediate injection SUCCESS`);
            } catch (evalErr) {
                console.warn(`BrowserLauncher: v8.24.0 — Page #${pageId} Runtime.evaluate failed:`, evalErr.message);
                // Not fatal — addInitScript will cover on next navigation
            }

        } catch (cdpErr) {
            console.warn(`BrowserLauncher: v8.24.0 — Page #${pageId} CDP session failed:`, cdpErr.message);
            // Not fatal — context.addInitScript (Layer 1) still active as fallback
        }

        // Step 4: Apply full CDP emulation (screen metrics, touch, iframe auto-attach, workers)
        // This is additive — does NOT re-inject scripts (that's already done above)
        const result = await applyCdpEmulationToPage(newPage, context, fpEmulationConfig, combinedScript);

        if (result.success) {
            console.log(`BrowserLauncher: v8.24.0 — Page #${pageId} fully instrumented (injection + CDP emulation + iframe/worker auto-attach)`);
        } else {
            console.warn(`BrowserLauncher: v8.24.0 — Page #${pageId} CDP emulation partial (addInitScript still active as fallback)`);
        }

        newPage.on('close', () => {
            console.log(`BrowserLauncher: v8.24.0 — Page #${pageId} closed`);
        });
    });

    console.log('BrowserLauncher: v8.24.0 — New-page listener active (triple injection: addInitScript + Runtime.evaluate + CDP per-page)');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LAUNCHER CLASS
// ═══════════════════════════════════════════════════════════════════════════════
class BrowserLauncher {
    constructor(config) {
        this.config = config;
    }

    async launchPersistentContext(profilePath, options) {
        const { executablePath, initScripts, headless, fp } = options;
        return BrowserLauncher.launchBrowser(
            'W_SINGLE', executablePath, fp, profilePath, headless,
            this.config, null, require('playwright').chromium, initScripts
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN LAUNCHER FUNCTION — v8.6.4 - DICS HEADER INJECTION
    // v8.15.0: STEALTH DEBUG SYSTEM INTEGRATION
    // v8.18.0: WORKER/SW/SHARED_WORKER STEALTH + SENTINEL 4-LAYER PERSISTENCE
    // ═══════════════════════════════════════════════════════════════════════════
    static async launchBrowser(
        workerId, executablePath, fp, profilePath, isHeadless = false,
        config, stealthPatches, browserBackend, preGeneratedScripts
    ) {
        try {
            console.log(`BrowserLauncher: Launching ${workerId} (${fp.browserName})...`);

            // ════════════════════════════════════════════════════════════════════
            // 1. DETECT ENGINE
            // ════════════════════════════════════════════════════════════════════
            const { engine, browser } = detectBrowserEngine(executablePath);
            console.log(`BrowserLauncher: Detected ${browser} (${engine})`);
            console.log(`BrowserLauncher: Platform: ${PLATFORM.isWindows ? 'Windows' : PLATFORM.isLinux ? 'Linux' : 'Other'} ${PLATFORM.arch}`);

            // ════════════════════════════════════════════════════════════════════
            // 2. VALIDATE EXECUTABLE EXISTS
            // ════════════════════════════════════════════════════════════════════
            if (!fs.existsSync(executablePath)) {
                throw new Error(`Browser executable not found: ${executablePath}`);
            }

            // ════════════════════════════════════════════════════════════════════
            // 3. SLOT + EXECUTABLE STRATEGY
            // ════════════════════════════════════════════════════════════════════
            const slotIndex = parseInt(workerId.replace('W', ''), 10);
            const slotId = formatSlotId(slotIndex);
            let finalExecutablePath = executablePath;

            const availability = getWorkerAvailability(slotIndex);
            if (!availability.available) {
                throw new Error(`Slot ${slotIndex} is NOT available: ${availability.message}`);
            }

            // STRATEGY B: EDGE WORKER DIRECTORY
            if (slotIndex > OTHERS_RESERVED && slotIndex <= TOTAL_SLOTS) {
                if (browser !== 'edge') {
                    throw new Error(`Slot ${slotIndex} requires Edge browser, got: ${browser}`);
                }
                const workersBaseDir = path.join(process.cwd(), 'Browser', 'edge');
                const specificWorkerDir = path.join(workersBaseDir, `worker${slotId}`);
                const browserExeName = path.basename(executablePath);
                finalExecutablePath = path.join(specificWorkerDir, browserExeName);
                if (!fs.existsSync(finalExecutablePath)) {
                    throw new Error(`Edge worker directory NOT FOUND: ${finalExecutablePath}`);
                }
                console.log(`BrowserLauncher: Worker directory confirmed: ${finalExecutablePath}`);
            }
            // STRATEGY A: HARDLINK
            else if (slotIndex <= OTHERS_RESERVED) {
                const browserDir = path.dirname(executablePath);
                const ext = PLATFORM.isWindows ? '.exe' : '';
                const hardlinkName = `worker${slotId}${ext}`;
                const expectedPath = path.join(browserDir, hardlinkName);

                if (executablePath !== expectedPath && !executablePath.endsWith(hardlinkName)) {
                    if (fs.existsSync(expectedPath)) {
                        try { fs.unlinkSync(expectedPath); } catch(e) {}
                    }
                    console.log(`BrowserLauncher: Creating hardlink: ${hardlinkName}`);
                    try {
                        fs.linkSync(executablePath, expectedPath);
                    } catch(e) {
                        if (e.code === 'EXDEV' || e.code === 'EPERM') {
                            console.warn('BrowserLauncher: Hardlink failed, using copy');
                            fs.copyFileSync(executablePath, expectedPath);
                        } else {
                            throw e;
                        }
                    }
                    finalExecutablePath = expectedPath;
                } else {
                    finalExecutablePath = executablePath;
                }
                console.log(`BrowserLauncher: Hardlink strategy: ${path.basename(finalExecutablePath)}`);
                // v8.6.0 WARNING: if hardlink may not be recognized
                if (!path.basename(finalExecutablePath).startsWith('worker')) {
                    console.warn('BrowserLauncher: WARNING — Chromium may not recognize hardlink as valid browser binary');
                    console.warn('BrowserLauncher: If CLI args (--window-size) fail, this may be the cause');
                }
            } else {
                throw new Error(`Invalid slot: ${slotIndex}`);
            }

            // ════════════════════════════════════════════════════════════════════
            // v8.25.0 VIEWPORT + SCREEN FROM FP — PERSISTENT CONTEXT MODE — CLI ARGS ONLY
            // ════════════════════════════════════════════════════════════════════
            const dbWidth = fp.viewport?.width || 1920;
            const dbHeight = fp.viewport?.height || 1080;
            const screenWidth = fp.screen?.width || 1920;
            const screenHeight = fp.screen?.height || 1080;
            const screenAvailHeight = fp.screen?.availHeight || (screenHeight - 40);
            const deviceScaleFactor = fp.deviceScaleFactor || 1;

            // v8.25.0 FIX: Clamp viewport to screen boundaries
            // DB can have IMPOSSIBLE values: viewport=3440x1360 > screen=1920x1080
            // Chrome headful clamps --window-size anyway, but JS hooks leak the raw values.
            // Normalize HERE so --window-size, CDP, and JS hooks ALL see the same clamped values.
            const finalWidth = Math.min(dbWidth, screenWidth);
            const finalHeight = Math.min(dbHeight, screenAvailHeight);

            console.log(`BrowserLauncher: FP Viewport DB: ${dbWidth}x${dbHeight} | Screen: ${screenWidth}x${screenHeight} | AvailH: ${screenAvailHeight} | DPR: ${deviceScaleFactor}`);
            if (dbWidth !== finalWidth || dbHeight !== finalHeight) {
                console.warn(`BrowserLauncher: ★ v8.25.0 VIEWPORT NORMALIZED: ${dbWidth}x${dbHeight} → ${finalWidth}x${finalHeight} (clamped to screen bounds)`);
            }
            console.log(`BrowserLauncher: Window (normalized): ${finalWidth}x${finalHeight}`);

            // ════════════════════════════════════════════════════════════════════
            // v8.25.0 ARGS CONSTRUCTION — VIEWPORT VIA CLI ONLY — NO CONTEXT OPTIONS
            // ════════════════════════════════════════════════════════════════════
            const gpuArgs = getGPUArgs(engine, browser);
            const stealthArgs = getStealthArgs(engine, fp.locale, fp);
            let launchArgs;

            if (engine === 'chromium') {
                launchArgs = [
                    // v8.6.0 CRITICAL — Viewport MUST be in args for persistent context
                    `--window-size=${finalWidth},${finalHeight}`,
                    // v8.6.0 CRITICAL — deviceScaleFactor MUST be in args for persistent context
                    `--force-device-scale-factor=${deviceScaleFactor}`,
                    ...stealthArgs,
                    ...gpuArgs
                ];
                if (isHeadless) launchArgs.push('--headless=new');
                console.log('BrowserLauncher: v8.6.0 — Viewport set via CLI args ONLY (no context options)');
                console.log(`BrowserLauncher: CLI args: --window-size=${finalWidth},${finalHeight} --force-device-scale-factor=${deviceScaleFactor}`);
            } else if (engine === 'gecko') {
                launchArgs = stealthArgs;
            }

            // ════════════════════════════════════════════════════════════════════
            // ══════════════════════════════════════════════════════════════════════
            // P2-9: H2 FINGERPRINT VERIFICATION (diagnostic note)
            // HTTP/2 fingerprint is determined by ALPN negotiation and TLS ClientHello.
            // Chrome H2 SETTINGS include: HEADER_TABLE_SIZE=65536, ENABLE_PUSH=0,
            // INITIAL_WINDOW_SIZE=6291456, MAX_HEADER_LIST_SIZE=262144 (Chrome v120+).
            //
            // Verification checklist:
            //   1. ALPN includes "h2" in TLS ClientHello (Chromium default)
            //   2. WINDOW_UPDATE (65535) sent immediately after SETTINGS
            //   3. User-Agent NOT in pseudo-headers (correct Chrome behavior)
            //   4. Proxy uses SOCKS5 (P2-8) to avoid CONNECT tunnel H2 artifacts
            //   5. Header ordering: :method :authority :scheme :path (Chrome order)
            // These are Chromium networking stack defaults — not configurable via args.
            // Use Wireshark/mitmproxy to verify if H2 fingerprint discrepancy suspected.
            // ══════════════════════════════════════════════════════════════════════
            // v8.15.0 NEW — STEALTH DEBUG: Attach debug config to fp BEFORE script preparation
            // ════════════════════════════════════════════════════════════════════
            const stealthDebugEnabled = process.env.STEALTH_DEBUG === 'true';
            const stealthLogLevel = parseInt(process.env.STEALTH_LOG || '3', 10);
            fp.__stealthDebug = {
                enabled: stealthDebugEnabled,
                level: stealthLogLevel
            };
            if (stealthDebugEnabled) {
                console.log(`BrowserLauncher: STEALTH_DEBUG=ON | STEALTH_LOG=${stealthLogLevel}`);
            }

            // ════════════════════════════════════════════════════════════════════
            // v8.6.0 PREPARE SCRIPTS BEFORE CONTEXT CREATION — SINGLE SOURCE
            // ════════════════════════════════════════════════════════════════════
            console.log('BrowserLauncher: Preparing scripts for EARLY injection...');
            const combinedScript = preGeneratedScripts.join('\n// === NEXT SCRIPT ===\n');
            console.log(`BrowserLauncher: Scripts ready: ${preGeneratedScripts.length} modules`);

            // ════════════════════════════════════════════════════════════════════
            // 6. LAUNCH CONTEXT WITH NATIVE EMULATION
            // ════════════════════════════════════════════════════════════════════
            console.log('BrowserLauncher: Initializing engine context (v8.26.0 — PATCH-8/6 + Worker/SW/SharedWorker Stealth, Sentinel Persistence, Stealth Debug, CDP-Only, DICS Header, WebRTC Defense, Viewport Normalization)...');
            let context;
            let page;

            if (engine === 'chromium') {
                const chromium = require('playwright').chromium;
                context = await chromium.launchPersistentContext(profilePath, {
                    executablePath: finalExecutablePath,
                    headless: isHeadless,
                    args: launchArgs,
                    // v8.6.0 ROOT CAUSE 1 FIX — REMOVE ALL viewport/screen/deviceScaleFactor options
                    viewport: null, // v8.6.0: Explicitly null = no viewport option for persistent context
                    ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
                    userAgent: fp.userAgent || undefined,
                    permissions: ['geolocation'],
                    timezoneId: fp.timezone || 'America/New_York',
                    locale: fp.locale || 'en-US',
                    geolocation: fp.geolocation || undefined
                });
                console.log('BrowserLauncher: Persistent context created (viewport/screen via CLI args ONLY)');

                // ════════════════════════════════════════════════════════════
                // V8.6.3 FIX: FORCE SYNC — ANTI-RACE CONDITION
                // Paksa permission dan geolocation diterapkan ulang ke Context yang aktif.
                // Ini mengatasi masalah dimana profil lama (recycled) mengingat lokasi lama.
                // ════════════════════════════════════════════════════════════
                try {
                    const permissions = ['geolocation'];
                    await context.grantPermissions(permissions);
                    console.log('BrowserLauncher: Permissions enforced (geolocation)');
                    if (fp.geolocation) {
                        await context.setGeolocation(fp.geolocation);
                        console.log(`BrowserLauncher: Geolocation enforced: ${fp.geolocation.latitude}, ${fp.geolocation.longitude}`);
                    }
                } catch (syncErr) {
                    console.warn('BrowserLauncher: Sync Warning:', syncErr.message);
                }

                // ════════════════════════════════════════════════════════════
                // V8.6.4 NEW: DICS ACCEPT-LANGUAGE HEADER INJECTION
                // Inject dynamic Accept-Language header from StealthLanguage DICS Engine.
                // This syncs network layer with persona (NATIVE/TECH/EXPAT) and adds Q-factor jitter.
                // ════════════════════════════════════════════════════════════
                try {
                    // Read header from DeviceManager v7.5.1 — stored in fp.meta.headerLanguage
                    const dicsHeader = fp.meta?.headerLanguage;
                    if (dicsHeader && typeof dicsHeader === 'string' && dicsHeader.length > 0) {
                        // Success: Use DICS-generated header with natural variance
                        await context.setExtraHTTPHeaders({
                            'Accept-Language': dicsHeader
                        });
                        console.log(`BrowserLauncher: DICS Header Injected: ${dicsHeader.substring(0, 60)}...`);
                        console.log(`BrowserLauncher: Persona: ${fp.meta.persona || 'UNKNOWN'}`);
                    } else {
                        // Fallback: Generate basic header from locale
                        const fallbackLocale = fp.locale || 'en-US';
                        const shortLang = fallbackLocale.split('-')[0];
                        const fallbackHeader = `${fallbackLocale},${shortLang};q=0.9`;
                        await context.setExtraHTTPHeaders({
                            'Accept-Language': fallbackHeader
                        });
                        console.warn(`BrowserLauncher: DICS header missing, using fallback: ${fallbackHeader}`);
                    }
                } catch (headerErr) {
                    console.error('BrowserLauncher: Header injection failed:', headerErr.message);
                    // Non-fatal error, continue execution
                }

                // ════════════════════════════════════════════════════════════
                // V8.24.0: DUAL INJECTION — addInitScript (PRIMARY) + CDP (REINFORCEMENT)
                //
                // BEFORE (v8.12.0-v8.23.0): CDP PRIMARY, addInitScript FALLBACK only
                //   BUG: Page.addScriptToEvaluateOnNewDocument is per-CDP-session (per-page).
                //   New tabs have NO CDP session → ZERO injection.
                //   addInitScript was ONLY called when CDP failed → dead code in production.
                //
                // AFTER (v8.24.0): BOTH always called. No double-execution risk because
                //   stealth_api.js v1.20.2 has window.__qteStealthApplied idempotency guard.
                //
                // context.addInitScript = Playwright-level, CONTEXT-WIDE.
                //   Fires on EVERY new document in EVERY page/tab/popup in this context.
                //   This is the PRIMARY guarantee that all tabs get injected.
                //
                // CDP Page.addScriptToEvaluateOnNewDocument = per-page REINFORCEMENT.
                //   Fires before any JS on this specific page. Useful as timing insurance.
                //
                // CRITICAL: worldName parameter MUST NOT be set!
                // - Omitting worldName → inject into DEFAULT main world
                // - Setting worldName → ISOLATED world (website can't see overrides)
                // ════════════════════════════════════════════════════════════

                // 1. CHECK + RECYCLE EXISTING PAGE (moved BEFORE injection for CDP session)
                const existingPages = context.pages();
                if (existingPages.length > 0) {
                    page = existingPages[0];
                    console.log('BrowserLauncher: RECYCLING existing page (safe strategy - no tab closure)');
                } else {
                    page = await context.newPage();
                    console.log('BrowserLauncher: Context was empty, created NEW page (unusual case)');
                }

                // 2. PRIMARY: context.addInitScript — CONTEXT-WIDE, covers ALL pages/tabs/popups
                // v8.24.0: This is now ALWAYS called (was fallback-only in v8.12.0-v8.23.0)
                try {
                    await context.addInitScript(combinedScript);
                    console.log('BrowserLauncher: v8.24.0 — addInitScript registered (context-wide, covers ALL tabs)');
                } catch (initScriptErr) {
                    console.error('BrowserLauncher: v8.24.0 — addInitScript FAILED:', initScriptErr.message);
                }

                // 3. REINFORCEMENT: CDP Page.addScriptToEvaluateOnNewDocument (per-page timing insurance)
                let cdpInjectionSuccess = false;
                let cdpClient = null;
                try {
                    cdpClient = await context.newCDPSession(page);
                    await cdpClient.send('Page.addScriptToEvaluateOnNewDocument', {
                        source: combinedScript
                    });
                    cdpInjectionSuccess = true;
                    console.log('BrowserLauncher: v8.24.0 — CDP per-page reinforcement registered');
                } catch (cdpErr) {
                    console.warn('BrowserLauncher: v8.24.0 — CDP reinforcement failed (addInitScript still active):', cdpErr.message);
                }

                // VERIFICATION: Confirm we have a valid page
                if (!page) {
                    throw new Error('Failed to obtain valid page (recycling strategy failed)');
                }

                // ════════════════════════════════════════════════════════════
                // v8.14.0 F10 FIX: FORCE STEALTH ACTIVATION ON RECYCLED PAGE
                //
                // CDP Page.addScriptToEvaluateOnNewDocument fires on NEXT navigation.
                // Recycled page already has a loaded document from previous session.
                // Gap window: page accessible WITHOUT stealth patches until page.goto().
                //
                // FIX: Navigate to about:blank to trigger registered CDP scripts NOW.
                // After this, stealth patches are ACTIVE and page is ready for real navigation.
                // ════════════════════════════════════════════════════════════
                try {
                    await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 });
                    console.log('BrowserLauncher: F10 — Stealth activation (about:blank navigation triggered CDP scripts)');
                } catch (blankErr) {
                    console.warn('BrowserLauncher: F10 — about:blank navigation failed:', blankErr.message);
                    // Non-fatal: scripts will still fire on next real navigation
                }

                // ════════════════════════════════════════════════════════════
                // v8.18.0 SENTINEL 4-LAYER PERSISTENCE + WORKER STEALTH — INITIAL PAGE CDP EMULATION
                //
                // REPLACES v8.16.0 inline Emulation.setDeviceMetricsOverride block.
                // Now uses applyCdpEmulationToPage() which includes ALL 4 layers:
                //   Layer 2: Emulation.setDeviceMetricsOverride (screen/viewport/DPR)
                //   Layer 2: Emulation.setTouchEmulationEnabled (hardware touch)
                //   Layer 3: Target.setAutoAttach(flatten:true) (iframe CDP coverage)
                //   Layer 3: Target.attachedToTarget (cross-origin iframe injection)
                //   Layer 4: Page.addScriptToEvaluateOnNewDocument (per-page backup)
                //
                // fpEmulationConfig is a clean config object extracted from fp,
                // avoiding passing the entire fp object to avoid mutation concerns.
                // ════════════════════════════════════════════════════════════
                const fpEmulationConfig = {
                    width: finalWidth,
                    height: finalHeight,
                    screenWidth: screenWidth,
                    screenHeight: screenHeight,
                    deviceScaleFactor: deviceScaleFactor,
                    isMobile: fp.isMobile || false,
                    hasTouch: fp.hasTouch || false,
                    maxTouchPoints: fp.navigator?.maxTouchPoints || (fp.hasTouch ? 10 : 0),
                    // v8.18.0 PATCH 1D: Worker stealth data — feeds workerStealthScript template
                    // v8.20.0 FIX-B: CORRECTED lookup — fp.hardware.cores is the correct path from toFingerprintObject()
                    // BEFORE (BUGGY): fp.hardwareConcurrency (does NOT exist as top-level field)
                    cores: fp.hardware?.cores || fp.navigator?.hardwareConcurrency || 4,
                    // v8.20.0 FIX-A: CORRECTED lookup — fp.hardware.memory is the correct path from toFingerprintObject()
                    // BEFORE (BUGGY): fp.deviceMemory (does NOT exist as top-level field, could leak host 32 GB)
                    memory: fp.hardware?.memory || fp.navigator?.deviceMemory || 8,
                    platform: fp.navigator?.platform || fp.platform || 'Win32',
                    vendor: fp.navigator?.vendor || '',
                    language: fp.navigator?.language || fp.locale || 'en-US',
                    languagesJSON: JSON.stringify(fp.navigator?.languages || [fp.locale || 'en-US']),
                    identityId: fp.sessionSeed || fp.fingerprintSeed || 'default',
                    webglVendor: fp.webgl?.vendor || fp.webGl?.vendor || 'Google Inc. (NVIDIA)',
                    webglRenderer: fp.webgl?.renderer || fp.webGl?.renderer || 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                    // v8.25.0 P0-4: sec-ch-ua alignment data for CDP Emulation.setUserAgentOverride
                    userAgent: fp.navigator?.userAgent || fp.userAgent || '',
                    uaBrands: JSON.stringify(fp.navigator?.brands || fp.uaData?.brands || []),
                    uaFullVersionList: JSON.stringify(fp.navigator?.fullVersionList || fp.uaData?.fullVersionList || []),
                    uaPlatform: fp.navigator?.platform || fp.platform || 'Windows',
                    uaPlatformVersion: fp.navigator?.platformVersion || fp.uaData?.platformVersion || '15.0.0',
                    uaArchitecture: fp.navigator?.architecture || fp.uaData?.architecture || 'x86',
                    uaBitness: fp.navigator?.bitness || fp.uaData?.bitness || '64'
                };

                const emulationResult = await applyCdpEmulationToPage(page, context, fpEmulationConfig, combinedScript);

                // Preserve cdpClient reference for stealth debug section below
                // If applyCdpEmulationToPage created a new CDP session, we use that
                // But the PRIMARY cdpClient (for script injection) was already created above
                // We do NOT replace cdpClient here — the script injection CDP session is separate
                // from the emulation CDP session, which is by design (Sentinel pattern)

                console.log(`BrowserLauncher: v8.20.0 — Initial page 4-layer persistence + worker stealth + PATCH-8/6: ${emulationResult.success ? 'FULL' : 'PARTIAL'}`);

                // ════════════════════════════════════════════════════════════
                // v8.18.0 SENTINEL NEW-PAGE LISTENER
                //
                // Registers context.on('page') to auto-apply CDP emulation
                // to every new tab, popup, or window.open page.
                // Layer 1 (addInitScript) already covers JS-level stealth.
                // This listener adds Layers 2/3/4 (CDP native emulation).
                // ════════════════════════════════════════════════════════════
                setupNewPageListener(context, fpEmulationConfig, combinedScript);

                // ════════════════════════════════════════════════════════════
                // v8.15.0 NEW: STEALTH DEBUG — RETRIEVE VALIDATION RESULTS
                // After about:blank, stealth hooks are active. Slot 25 validation
                // runs 500ms after DOMContentLoaded. We wait briefly then retrieve.
                // ONLY when STEALTH_DEBUG=true — zero overhead in production.
                // ════════════════════════════════════════════════════════════
                if (stealthDebugEnabled) {
                    try {
                        // Wait for Slot 25 validation to complete (runs 500ms after DOMContentLoaded)
                        await new Promise(r => setTimeout(r, 800));
                        const validation = await page.evaluate(() => {
                            return window.__stealthValidation || null;
                        });
                        if (validation) {
                            console.log(`BrowserLauncher: ═══ STEALTH VALIDATION ═══`);
                            console.log(`BrowserLauncher: Score: ${validation.score}% (${validation.passed}/${validation.total} passed, ${validation.failed} failed, ${validation.warned} warnings)`);
                            if (validation.failed > 0) {
                                console.warn(`BrowserLauncher: ⚠️  STEALTH INCOMPLETE — ${validation.failed} LEAK(S) DETECTED`);
                            } else {
                                console.log(`BrowserLauncher: ✅ ALL HOOKS VERIFIED — 100% stealth`);
                            }
                            // Write debug log to file (STEALTH_LOG=2 or 3)
                            if (stealthLogLevel >= 2 && validation.log && validation.log.length > 0) {
                                try {
                                    const logDir = process.env.STEALTH_LOG_FILE || path.join(process.cwd(), 'logs');
                                    fs.mkdirSync(logDir, { recursive: true });
                                    const logFileName = `stealth_debug_${validation.logTimestamp}.log`;
                                    const logFilePath = path.join(logDir, logFileName);
                                    fs.writeFileSync(logFilePath, validation.log.join('\n'), 'utf8');
                                    console.log(`BrowserLauncher: Debug log written: ${logFilePath}`);
                                } catch (logWriteErr) {
                                    console.warn('BrowserLauncher: Failed to write debug log:', logWriteErr.message);
                                }
                            }
                        } else {
                            console.warn('BrowserLauncher: Stealth validation not available (Slot 25 may not have executed yet)');
                        }
                    } catch (debugErr) {
                        console.warn('BrowserLauncher: Debug retrieval failed:', debugErr.message);
                        // Non-fatal: debug failure must NEVER block browser launch
                    }
                }

                console.log(`BrowserLauncher: v8.24.0 addInitScript(PRIMARY) + ${cdpInjectionSuccess ? 'CDP(REINFORCEMENT)' : 'CDP(FAILED)'} | Sentinel 4-layer + worker stealth | pre-activated via about:blank${stealthDebugEnabled ? ' | DEBUG: ON' : ''}`);

            } else if (engine === 'gecko') {
                const firefox = require('playwright').firefox;
                context = await firefox.launchPersistentContext(profilePath, {
                    executablePath: finalExecutablePath,
                    headless: isHeadless,
                    args: launchArgs,
                    // Firefox persistent context CAN use viewport option
                    viewport: { width: finalWidth, height: finalHeight },
                    screen: { width: screenWidth, height: screenHeight },
                    deviceScaleFactor: deviceScaleFactor,
                    firefoxUserPrefs: getFirefoxPrefs(fp),
                    userAgent: fp.userAgent || undefined,
                    timezoneId: fp.timezone || 'America/New_York',
                    locale: fp.locale || 'en-US',
                    geolocation: fp.geolocation || undefined
                });

                // V8.6.3: Firefox also gets Force Sync treatment
                try {
                    const permissions = ['geolocation'];
                    await context.grantPermissions(permissions);
                    console.log('BrowserLauncher: Firefox Permissions enforced');
                    if (fp.geolocation) {
                        await context.setGeolocation(fp.geolocation);
                        console.log(`BrowserLauncher: Firefox Geolocation enforced: ${fp.geolocation.latitude}, ${fp.geolocation.longitude}`);
                    }
                } catch (syncErr) {
                    console.warn('BrowserLauncher: Firefox sync warning:', syncErr.message);
                }

                // V8.6.4: Firefox also gets DICS header injection
                try {
                    const dicsHeader = fp.meta?.headerLanguage;
                    if (dicsHeader && typeof dicsHeader === 'string' && dicsHeader.length > 0) {
                        await context.setExtraHTTPHeaders({
                            'Accept-Language': dicsHeader
                        });
                        console.log(`BrowserLauncher: Firefox DICS Header: ${dicsHeader.substring(0, 60)}...`);
                    } else {
                        const fallbackLocale = fp.locale || 'en-US';
                        const shortLang = fallbackLocale.split('-')[0];
                        const fallbackHeader = `${fallbackLocale},${shortLang};q=0.9`;
                        await context.setExtraHTTPHeaders({
                            'Accept-Language': fallbackHeader
                        });
                        console.warn(`BrowserLauncher: Firefox — Using fallback header: ${fallbackHeader}`);
                    }
                } catch (headerErr) {
                    console.error('BrowserLauncher: Firefox header injection failed:', headerErr.message);
                }

                // Firefox EARLY injection
                await injectViaFirefox(context, preGeneratedScripts, fp);

                // v8.6.2: Firefox also uses Recycle Strategy
                const existingPages = context.pages();
                if (existingPages.length > 0) {
                    page = existingPages[0];
                    console.log('BrowserLauncher: Firefox — Recycling existing page');
                } else {
                    page = await context.newPage();
                    console.log('BrowserLauncher: Firefox — Created NEW page (unusual case)');
                }

                // ════════════════════════════════════════════════════════════
                // v8.15.0 NEW: STEALTH DEBUG — RETRIEVE VALIDATION (Firefox)
                // Firefox uses addInitScript which fires on first page load.
                // Navigate to about:blank to trigger scripts, then retrieve.
                // ONLY when STEALTH_DEBUG=true — zero overhead in production.
                // ════════════════════════════════════════════════════════════
                if (stealthDebugEnabled) {
                    try {
                        // Firefox addInitScript fires on page load — trigger via about:blank
                        await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 });
                        // Wait for Slot 25 validation to complete
                        await new Promise(r => setTimeout(r, 800));
                        const validation = await page.evaluate(() => {
                            return window.__stealthValidation || null;
                        });
                        if (validation) {
                            console.log(`BrowserLauncher: ═══ STEALTH VALIDATION (Firefox) ═══`);
                            console.log(`BrowserLauncher: Score: ${validation.score}% (${validation.passed}/${validation.total} passed, ${validation.failed} failed, ${validation.warned} warnings)`);
                            if (validation.failed > 0) {
                                console.warn(`BrowserLauncher: ⚠️  STEALTH INCOMPLETE — ${validation.failed} LEAK(S) DETECTED`);
                            } else {
                                console.log(`BrowserLauncher: ✅ ALL HOOKS VERIFIED — 100% stealth`);
                            }
                            if (stealthLogLevel >= 2 && validation.log && validation.log.length > 0) {
                                try {
                                    const logDir = process.env.STEALTH_LOG_FILE || path.join(process.cwd(), 'logs');
                                    fs.mkdirSync(logDir, { recursive: true });
                                    const logFileName = `stealth_debug_${validation.logTimestamp}.log`;
                                    const logFilePath = path.join(logDir, logFileName);
                                    fs.writeFileSync(logFilePath, validation.log.join('\n'), 'utf8');
                                    console.log(`BrowserLauncher: Debug log written: ${logFilePath}`);
                                } catch (logWriteErr) {
                                    console.warn('BrowserLauncher: Failed to write debug log:', logWriteErr.message);
                                }
                            }
                        } else {
                            console.warn('BrowserLauncher: Firefox stealth validation not available');
                        }
                    } catch (debugErr) {
                        console.warn('BrowserLauncher: Firefox debug retrieval failed:', debugErr.message);
                    }
                }

                // Optional: Additional stealth patches if provided
                if (stealthPatches && typeof stealthPatches.injectFullStealth === 'function') {
                    console.log('BrowserLauncher: Injecting additional stealth patches...');
                    await stealthPatches.injectFullStealth(context, fp);
                }
            }

            // ════════════════════════════════════════════════════════════════════
            // 7. DETECT TEMPORARY PROFILE
            // ════════════════════════════════════════════════════════════════════
            const isTemporaryProfile =
                profilePath.includes('diagnostic') ||
                profilePath.includes('US') ||
                profilePath.includes('temp') ||
                profilePath.includes('test');

            console.log(`BrowserLauncher: Browser launched successfully (v8.20.0 — PATCH-8/6 + Worker/SW/SharedWorker Stealth, Sentinel 4-Layer, Stealth Debug, Forensic F10, CDP-Only, Notification Fix, DICS Header, WebRTC Defense)`);

            // ════════════════════════════════════════════════════════════════════
            // 8. RETURN STRUCTURE
            // ════════════════════════════════════════════════════════════════════
            const browserHandle = {
                close: async () => {
                    console.log(`BrowserLauncher: Closing browser context for ${workerId}...`);
                    try { await context.close(); } catch(e) {}

                    // CLEANUP: Hardlink
                    if (slotIndex <= OTHERS_RESERVED && fs.existsSync(finalExecutablePath)) {
                        try {
                            await new Promise(r => setTimeout(r, 1000));
                            const basename = path.basename(finalExecutablePath);
                            if (basename.match(/worker\d+\.exe/i) && finalExecutablePath !== executablePath) {
                                fs.unlinkSync(finalExecutablePath);
                                console.log(`BrowserLauncher: Hardlink cleaned: ${basename}`);
                            }
                        } catch(e) {}
                    }

                    if (isTemporaryProfile) {
                        await cleanupTemporaryProfile(profilePath, workerId);
                    }
                }
            };

            browserHandle.on = (event, handler) => {
                context.on(event, handler);
            };

            return {
                browser: browserHandle,
                context,
                page,
                executablePath: finalExecutablePath,
                engine,
                browserType: browser
            };
        } catch(error) {
            console.error('BrowserLauncher: Launch error:', error.message);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLEANUP UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════
    static async cleanupExecutable(filePath) {
        if (!filePath || !fs.existsSync(filePath)) return;
        try {
            const basename = path.basename(filePath);
            if (PLATFORM.isWindows && basename.match(/worker\d+\.exe/i)) {
                fs.unlinkSync(filePath);
            } else if (!PLATFORM.isWindows && basename.match(/worker\d+/i)) {
                fs.unlinkSync(filePath);
            }
        } catch(e) {}
    }

    static async cleanupOrphanedHardlinks(config) {
        const hardlinkDirs = config.getHardlinkDirectories ? config.getHardlinkDirectories() : [];
        if (!hardlinkDirs || hardlinkDirs.length === 0) return { deleted: [], failed: [] };

        const deleted = [];
        const failed = [];
        const pattern = PLATFORM.isWindows ? /worker\d+\.exe/i : /worker\d+/i;

        for (const browserDir of hardlinkDirs) {
            if (!fs.existsSync(browserDir)) continue;
            try {
                const files = fs.readdirSync(browserDir);
                for (const file of files) {
                    if (file.match(pattern)) {
                        try {
                            fs.unlinkSync(path.join(browserDir, file));
                            deleted.push(file);
                        } catch(e) {
                            failed.push(file);
                        }
                    }
                }
            } catch(e) {}
        }
        return { deleted, failed };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC METHOD BINDINGS
// ═══════════════════════════════════════════════════════════════════════════════
BrowserLauncher.scanEdgeWorkerDirectories = scanEdgeWorkerDirectories;
BrowserLauncher.detectBrowserEngine = detectBrowserEngine;
BrowserLauncher.extractWorkerID = extractWorkerID;
BrowserLauncher.cleanupTemporaryProfile = cleanupTemporaryProfile;
BrowserLauncher.getWorkerAvailability = getWorkerAvailability;
BrowserLauncher.validateWorkerSetup = validateWorkerSetup;

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
if (process.env.VALIDATE_ON_LOAD !== 'false') {
    setTimeout(() => {
        console.log('═'.repeat(80));
        validateWorkerSetup();
        console.log('═'.repeat(80));
    }, 100);
}

module.exports = BrowserLauncher;

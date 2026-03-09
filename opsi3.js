/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * opsi3.js v16.3.0 - Mode 3 FRESH + Dynamic Workers + Active Page Coordinator
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 🔥 CHANGELOG v16.3.0 (2026-03-09 04:42 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ UPGRADED: Visibility Guard → Active Page Coordinator (APC)
 *    - BEFORE: All pages in a context report visible=true simultaneously (unnatural)
 *    - AFTER: Only the page currently controlled by HumanLike is visible (top)
 *             All other pages (popups, new tabs) correctly report hidden
 *    - Each worker/browser is independent — APC only coordinates within its own context
 *    - Inter-worker protection (OS-level blur/visibilitychange suppression) PRESERVED
 * ✅ ADDED: setActivePage() helper function
 *    - Accepts activePage + array of allPages in the context
 *    - Sets activePage → visible, all others → hidden via page.evaluate()
 *    - Uses bypass flag temporarily to set __qteOvHidden/__qteOvVisState
 *    - Fires synthetic visibilitychange event on pages that change state
 *    - Non-fatal: try/catch per page (closed pages won't crash coordinator)
 * ✅ ADDED: context.on('page') listener in PHASE 6.5
 *    - Detects new tabs/popups automatically
 *    - New page becomes active (visible), previous page becomes hidden
 *    - Tracks all pages in contextPages[] array per worker
 *    - Cleans up closed pages from tracking array
 * ✅ MODIFIED: PHASE 8 passes setActivePage to HumanLike via onPageSwitch callback
 *    - HumanLike can call onPageSwitch(targetPage) when switching tabs
 *    - APC updates all pages' visibility state accordingly
 * ✅ MODIFIED: VISIBILITY_GUARD_SCRIPT updated
 *    - Guard default behavior: return __qteOvHidden/__qteOvVisState when set (APC-controlled)
 *    - Fallback: false/visible when no APC state set (backward compatible)
 *    - OS-level event suppression UNCHANGED (still blocks isTrusted events from OS)
 *    - Bypass mechanism UNCHANGED (HumanLike tabSwitch still works)
 *    - Added __qteSetVisState(hidden, visState) for APC to set state without full bypass
 *    - Added synthetic visibilitychange dispatch when state changes
 * ✅ UNCHANGED: ALL other functions, phases, classes 100% VERBATIM from v16.2.0
 * ✅ CROSS-WORKER: Each worker's APC is independent — no cross-worker coordination needed
 *    Guard still blocks OS-level blur/visibilitychange from other workers' windows

 * 🔥 CHANGELOG v16.2.0 (2026-03-05 05:30 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * 🔥 CHANGELOG v16.1.0 (2026-03-05 04:42 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ ADDED: PHASE 6.5 — Page Visibility Guard (context.addInitScript)
 *   - Persistent spoofing: document.visibilityState='visible', document.hidden=false
 *   - document.hasFocus() always returns true
 *   - Intercepts OS-level visibilitychange/blur events from window focus loss
 *   - Protects cross-worker visibility: when Worker B window overlaps Worker A,
 *     Worker A's page still thinks it's on top (top of screen)
 *   - HumanLike tabSwitch() simulation preserved via __qteBypassVisibilityGuard flag
 *   - Script injected BEFORE any website JS runs (context.addInitScript priority)
 *   - Works for both Chromium and Gecko backends
 *
 * 🔥 CHANGELOG v16.0.0 (2026-03-05 03:30 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ MAJOR: Dynamic Worker Auto-Scaling (ResourceMonitor + DynamicWorkerManager)
 *   - Initial 1 worker, auto scale-up if CPU/RAM below LIMIT_CPU/LIMIT_RAM
 *   - Scale-down: if at limit, workers not recycled (decommissioned on finish)
 *   - Rolling average (LIMIT_THRESHOLD ms) + real-time check for decisions
 *   - Worker recycle delay: random between WORKER_DELAY_MIN/MAX
 * ✅ REMOVED: Manual browser selection prompt (always auto from BrowserMarketshare)
 * ✅ REMOVED: Manual thread count input (dynamic based on system resources)
 * ✅ REMOVED: workerPool.js dependency (replaced by DynamicWorkerManager)
 * ✅ ADDED: ResourceMonitor class (os.cpus() CPU usage + os.freemem() RAM tracking)
 * ✅ ADDED: DynamicWorkerManager class (auto scale-up/scale-down orchestrator)
 * ✅ KEPT: Region, Use Proxy, Headless prompts (user input)
 *
 * 🔥 CHANGELOG v15.2.0 (2026-03-05 00:40 WIB):
 * ✅ Browser prompt: Updated to Mode 4 format (1=Chrome/2=Edge/3=Firefox/4=Opera/5=Brave/auto)
 * ✅ Browser input parsing: Supports both number (1-5) and name input
 *
 * CHANGELOG v15.1.0 (2026-03-05 00:00 WIB):
 * â SWAPPED PHASE 1â2: Fingerprint acquisition now before slot allocation
 * â ADDED: Pass fp.browserType to InfrastructureBuilder.getWorkerSlot()
 * â FIX: Edge browser now gets MSEDGE slot pool (1001+) instead of OTHERS (1-1000)
 *
 * 🔥 CHANGELOG v15.0.0 (2026-03-04 22:15 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ MAJOR: Migrated from LSG proxy stack → Clash Meta architecture
 *   - REMOVED: GatewayAPIClient, IPAMManager, ProxyAPIServer (old LSG instances)
 *   - ADDED: ProxyPoolManager (Singleton), ProxyAPIServer (Singleton), ClashManager
 *   - Proxy selection now region-aware via ProxyPoolManager.assignProxy(slot, wid, region)
 *
 * ✅ MAJOR: Replaced human_like.js → HumanLike_SessionEngine.runSession()
 *   - Old API: humanLike.simulateHumanBehavior(page, context, duration, config, blacklist, ...)
 *   - New API: HumanLikeSession.runSession(page, context, surfingMode, { blacklist, logDebug })
 *   - 7 surfing modes available (Mode 6 = Realistic Mix is default)
 *   - Weibull dwell, Markov scroll, MousePhysics, MicroHabits all integrated
 *
 * ✅ MAJOR: Replaced direct Playwright launch → BrowserLauncher module
 *   - REMOVED: chromium.launchPersistentContext() with manual args
 *   - ADDED: BrowserLauncher.launchBrowser() (same as Mode 4)
 *   - Abstracts Playwright backend selection, profile management, injection scripts
 *
 * ✅ MAJOR: Added Mode 4 mature features
 *   - 3-tier font handling pipeline (pre-built, FontManager, fallback)
 *   - Pre-generated injection scripts (stealth + font → allScripts[])
 *   - C++ IP validator (ip_validator.exe) + identity normalization
 *   - Runtime validation after navigation
 *   - Graceful shutdown via DynamicWorkerManager + SIGINT handler (v16.0.0)
 *
 * ✅ MAJOR: Region-Aware Proxy Selection
 *   - User selects region (e.g. US, ID, GB) at startup
 *   - ProxyPoolManager filters proxies by region from MongoDB
 *   - Replaces old LSG-based proxy routing entirely
 *
 * ✅ KEPT: Mode 3 specific runtime behavior (100% preserved)
 *   - Target URLs from MongoDB via urlManager.getNextTarget()
 *   - Dynamic Worker Auto-Scaling via ResourceMonitor + DynamicWorkerManager
 *   - Temp profile lifecycle: create → use → delete (FRESH mode)
 *   - DB fingerprint acquisition (100% FRESH mode - no disk loading)
 *   - Click blacklist loading from click_blacklist.json
 *   - User input: region, proxy toggle, headless toggle (browser=auto, workers=dynamic)
 *
 * ✅ KEPT: DeviceManager API compatibility
 *   - acquireFingerprint() returns final fpObject directly (v7.14.0+ API)
 *   - alignIdentityWithNetwork() for IP-based identity normalization
 *   - releaseFingerprint() on cleanup
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 📋 PREVIOUS: opsi3.js v14.3.0 (2026-01-29) — Legacy LSG + human_like.js
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 🎯 STATUS: PRODUCTION READY
 *   Synced with: DeviceManager v7.17.0, BrowserLauncher v8.26.0,
 *   ProxyPoolManager v1.5.0, ProxyQualityManager v4.4.0,
 *   HumanLike_SessionEngine v1.2.1, StealthFont v7.8.0
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { execSync, spawn } = require('child_process');

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL MODULES
// ═══════════════════════════════════════════════════════════════════════════════
const logger = require('./logger');
const config = require('./config');
const BrowserLauncher = require('./BrowserLauncher');
const InfrastructureBuilder = require('./infrastructure_builder');
const urlManager = require('./url_manager');
const stealthPatches = require('./stealth_patches');
const { sleep, setupLogging, randomChoice, getRandomInt } = require('./utils');

// HumanLike Modular System (replaces old human_like.js)
const HumanLikeSession = require('./HumanLike_SessionEngine');
const { loadHumanLikeEnv } = require('./HumanLike_ModePresets');

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGERS (Singleton Architecture — same as Mode 4)
// ═══════════════════════════════════════════════════════════════════════════════
let DeviceManager = require('./device_manager');
let ProxyPoolManager = require('./ProxyPoolManager');
const ProxyAPIServer = require('./ProxyAPIServer');
const ClashManager = require('./clash_manager');

// DB Connection
const { connect, db, close: dbClose } = require('./database');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const VALIDATOR_BINARY = path.join(__dirname, 'Validator', 'ip_validator.exe');
const VALIDATOR_DIR = path.join(__dirname, 'Validator');
const FP_LOG_DIR = path.join(__dirname, 'logs', 'Fingerprint');
// SURFING_MODE bersumber dari HumanLike.env (single source of truth)
// Tidak lagi baca process.env — semua config HumanLike terpusat di HumanLike.env
const SURFING_MODE = parseInt(loadHumanLikeEnv().SURFING_MODE || '6'); // Mode 6 = Realistic Mix

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE VISIBILITY GUARD + ACTIVE PAGE COORDINATOR (APC) v16.3.0
// ═══════════════════════════════════════════════════════════════════════════════
// PURPOSE: Two-layer visibility management:
//   LAYER 1 (Cross-Worker): Block OS-level visibilitychange/blur events caused
//     by other worker browser windows overlapping this worker's window.
//     Each worker is independent — always appears "visible" to OS events.
//   LAYER 2 (Intra-Context APC): Within a single worker's browser context,
//     only the page currently controlled by HumanLike is "visible" (top).
//     All other pages (popups, new tabs opened by website) are "hidden".
//     This matches natural user behavior: 1 tab active, rest hidden.
//
// STATE MANAGEMENT:
//   __qteSetVisState(hidden, visState) — called by APC from Node.js via page.evaluate()
//     Sets the page's visibility state WITHOUT enabling full bypass.
//     OS-level event suppression remains active while APC controls state.
//   __qteVGBypass(true/false) — used by HumanLike tabSwitch() for full bypass
//     When true, ALL guards disabled — real OS state flows through.
//
// INJECTION: context.addInitScript() — runs BEFORE any website JavaScript
// ═══════════════════════════════════════════════════════════════════════════════
const VISIBILITY_GUARD_SCRIPT = `
(function() {
'use strict';

// Idempotency: use a unique key on document to prevent double-injection
var _guardKey = '__vg_' + Date.now().toString(36);
if (document[_guardKey]) return;
try { Object.defineProperty(document, _guardKey, { value: true, configurable: false, enumerable: false }); } catch(e) { return; }

// ─── Closure-scoped state ───
var _bypass = false;        // Full bypass for HumanLike tabSwitch()
var _apcHidden = false;     // APC-controlled hidden state (default: false = visible)
var _apcVisState = 'visible'; // APC-controlled visibilityState (default: 'visible')

// ─── __qteVGBypass: Full bypass accessor for HumanLike tabSwitch() ───
// When bypass=true, ALL guards disabled — real OS state flows through
try {
Object.defineProperty(window, '__qteVGBypass', {
  value: function(v) { if (arguments.length) _bypass = !!v; return _bypass; },
  writable: false, enumerable: false, configurable: false
});
} catch(e) {}

// ─── __qteSetVisState: APC state setter (called from Node.js via page.evaluate) ───
// Sets this page's visibility state as determined by Active Page Coordinator.
// Does NOT enable bypass — OS-level event suppression remains active.
// Dispatches synthetic visibilitychange event when state changes (natural behavior).
try {
Object.defineProperty(window, '__qteSetVisState', {
  value: function(hidden, visState) {
    var oldHidden = _apcHidden;
    _apcHidden = !!hidden;
    _apcVisState = visState || (hidden ? 'hidden' : 'visible');
    // Dispatch synthetic visibilitychange if state actually changed
    if (oldHidden !== _apcHidden) {
      try {
        var evt = new Event('visibilitychange', { bubbles: true, cancelable: false });
        // Mark as synthetic so our interceptor lets it through
        evt.__qteSynthetic = true;
        document.dispatchEvent(evt);
      } catch(de) {}
    }
  },
  writable: false, enumerable: false, configurable: false
});
} catch(e) {}

// Store original descriptors
var _origHiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
var _origVisStateDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
var _origHasFocus = Document.prototype.hasFocus;

// ─── document.hidden override ───
// Priority: bypass → real OS value | normal → APC state (_apcHidden)
// BUG #3 FIX: getter-only, NO setter (native is read-only)
Object.defineProperty(Document.prototype, 'hidden', {
  configurable: true,
  get: function() {
    if (_bypass) {
      // Full bypass: return real OS value (for HumanLike tabSwitch simulation)
      if (this.__qteOvHidden !== undefined) return this.__qteOvHidden;
      return _origHiddenDesc ? _origHiddenDesc.get.call(this) : false;
    }
    // Normal mode: return APC-controlled state
    return _apcHidden;
  }
  // NO setter — matches native descriptor shape
});

// ─── document.visibilityState override ───
Object.defineProperty(Document.prototype, 'visibilityState', {
  configurable: true,
  get: function() {
    if (_bypass) {
      return this.__qteOvVisState || (_origVisStateDesc ? _origVisStateDesc.get.call(this) : 'visible');
    }
    // Normal mode: return APC-controlled state
    return _apcVisState;
  }
  // NO setter — matches native descriptor shape
});

// ─── document.hasFocus() override ───
// Active page (APC hidden=false) → true. Hidden page → false. Natural.
Document.prototype.hasFocus = function() {
  if (_bypass) return _origHasFocus ? _origHasFocus.call(this) : true;
  return !_apcHidden; // Active page = true, hidden page = false
};
try {
Object.defineProperty(Document.prototype.hasFocus, 'toString', {
  value: function() { return 'function hasFocus() { [native code] }'; },
  writable: false, enumerable: false, configurable: true
});
} catch(e) {}

// ─── W2 FIX: activeElement — return body when page is hidden or element is null ───
try {
var _origActiveDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement');
if (_origActiveDesc && _origActiveDesc.get) {
  Object.defineProperty(Document.prototype, 'activeElement', {
    configurable: true,
    get: function() {
      var el = _origActiveDesc.get.call(this);
      return el || this.body;
    }
  });
}
} catch(e) {}

// ─── Event interception (visibilitychange, blur, focus) ───
// LAYER 1: Block OS-level (isTrusted) events from cross-worker window overlap
// LAYER 2: Allow synthetic events from APC (__qteSynthetic) and programmatic events
var _origAddEventListener = EventTarget.prototype.addEventListener;
var _origRemoveEventListener = EventTarget.prototype.removeEventListener;
var _handlerMap = new WeakMap();

EventTarget.prototype.addEventListener = function(type, handler, options) {
  if ((type === 'visibilitychange' || type === 'blur' || type === 'focus') &&
      (this === document || this === window)) {

    if (typeof handler === 'function') {
      var wrappedHandler = function(event) {
        // Full bypass: let everything through
        if (_bypass) return handler.call(this, event);
        // Allow synthetic events from APC (state change notifications)
        if (event.__qteSynthetic) return handler.call(this, event);
        // Block OS-level visibilitychange (cross-worker protection)
        if (type === 'visibilitychange' && event.isTrusted) return;
        // Block OS-level window blur (cross-worker protection)
        if (type === 'blur' && event.isTrusted && this === window) return;
        // Allow everything else (programmatic events, focus events)
        return handler.call(this, event);
      };

      if (!_handlerMap.has(handler)) _handlerMap.set(handler, new Map());
      _handlerMap.get(handler).set(type + '_' + (this === document ? 'doc' : 'win'), wrappedHandler);

      return _origAddEventListener.call(this, type, wrappedHandler, options);
    }
  }
  return _origAddEventListener.call(this, type, handler, options);
};
try {
Object.defineProperty(EventTarget.prototype.addEventListener, 'toString', {
  value: function() { return 'function addEventListener() { [native code] }'; },
  writable: false, enumerable: false, configurable: true
});
} catch(e) {}

EventTarget.prototype.removeEventListener = function(type, handler, options) {
  if ((type === 'visibilitychange' || type === 'blur' || type === 'focus') &&
      (this === document || this === window)) {
    if (typeof handler === 'function' && _handlerMap.has(handler)) {
      var typeKey = type + '_' + (this === document ? 'doc' : 'win');
      var mapped = _handlerMap.get(handler);
      if (mapped && mapped.has(typeKey)) {
        var wrappedHandler = mapped.get(typeKey);
        mapped.delete(typeKey);
        if (mapped.size === 0) _handlerMap.delete(handler);
        return _origRemoveEventListener.call(this, type, wrappedHandler, options);
      }
    }
  }
  return _origRemoveEventListener.call(this, type, handler, options);
};
try {
Object.defineProperty(EventTarget.prototype.removeEventListener, 'toString', {
  value: function() { return 'function removeEventListener() { [native code] }'; },
  writable: false, enumerable: false, configurable: true
});
} catch(e) {}

// ─── onvisibilitychange property handler ───
var _origOnVisChange = Object.getOwnPropertyDescriptor(Document.prototype, 'onvisibilitychange');
if (_origOnVisChange) {
  var _storedOnVisHandler = null;
  Object.defineProperty(Document.prototype, 'onvisibilitychange', {
    configurable: true,
    get: function() { return _storedOnVisHandler; },
    set: function(handler) {
      _storedOnVisHandler = handler;
      if (typeof handler === 'function') {
        _origOnVisChange.set.call(this, function(event) {
          if (_bypass) return handler.call(this, event);
          if (event.__qteSynthetic) return handler.call(this, event);
          if (event.isTrusted) return; // Block OS-level
          return handler.call(this, event);
        });
      } else {
        _origOnVisChange.set.call(this, handler);
      }
    }
  });
}

// ─── W3 FIX: window.onblur + window.onfocus interception ───
var _origOnBlur = Object.getOwnPropertyDescriptor(window.constructor.prototype || Window.prototype, 'onblur');
if (_origOnBlur && _origOnBlur.set) {
  var _storedOnBlurHandler = null;
  Object.defineProperty(window, 'onblur', {
    configurable: true,
    get: function() { return _storedOnBlurHandler; },
    set: function(handler) {
      _storedOnBlurHandler = handler;
      if (typeof handler === 'function') {
        _origOnBlur.set.call(this, function(event) {
          if (_bypass) return handler.call(this, event);
          if (event.isTrusted) return; // Block OS-level
          return handler.call(this, event);
        });
      } else {
        _origOnBlur.set.call(this, handler);
      }
    }
  });
}

var _origOnFocus = Object.getOwnPropertyDescriptor(window.constructor.prototype || Window.prototype, 'onfocus');
if (_origOnFocus && _origOnFocus.set) {
  var _storedOnFocusHandler = null;
  Object.defineProperty(window, 'onfocus', {
    configurable: true,
    get: function() { return _storedOnFocusHandler; },
    set: function(handler) {
      _storedOnFocusHandler = handler;
      if (typeof handler === 'function') {
        _origOnFocus.set.call(this, function(event) {
          // Always allow focus events through (they confirm page is active)
          return handler.call(this, event);
        });
      } else {
        _origOnFocus.set.call(this, handler);
      }
    }
  });
}

// ─── W1 FIX: requestAnimationFrame throttle guard ───
// When page is actually hidden by APC, browser may throttle rAF.
// We wrap rAF to ensure it continues if needed.
var _origRAF = window.requestAnimationFrame;
window.requestAnimationFrame = function(callback) {
  var result = _origRAF.call(window, callback);
  return result;
};
try {
Object.defineProperty(window.requestAnimationFrame, 'toString', {
  value: function() { return 'function requestAnimationFrame() { [native code] }'; },
  writable: false, enumerable: false, configurable: true
});
} catch(e) {}

})();
`;

// Ensure directories exist
if (!fs.existsSync(VALIDATOR_DIR)) fs.mkdirSync(VALIDATOR_DIR, { recursive: true });
if (!fs.existsSync(FP_LOG_DIR)) fs.mkdirSync(FP_LOG_DIR, { recursive: true });

setupLogging();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: MANAGER INSTANTIATOR (from Mode 4)
// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE WORKERS REGISTRY (from Mode 4 — for SIGINT cleanup)
// ═══════════════════════════════════════════════════════════════════════════════
const activeWorkers = new Map();

// Click blacklist (loaded in main)
let G_CLICK_BLACKLIST = [];

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC WORKER CONFIG (from .env)
// ═══════════════════════════════════════════════════════════════════════════════
const LIMIT_CPU = parseInt(process.env.LIMIT_CPU || '90');
const LIMIT_RAM = parseInt(process.env.LIMIT_RAM || '90');
const LIMIT_THRESHOLD = parseInt(process.env.LIMIT_THRESHOLD || '120000'); // ms rolling window
const WORKER_DELAY_MIN = parseInt(process.env.WORKER_DELAY_MIN || '60000');
const WORKER_DELAY_MAX = parseInt(process.env.WORKER_DELAY_MAX || '300000');

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE MONITOR — Real-time + Rolling Average CPU/RAM Tracker
// ═══════════════════════════════════════════════════════════════════════════════
class ResourceMonitor {
    constructor(windowMs = LIMIT_THRESHOLD) {
        this.windowMs = windowMs;
        this.samples = [];           // [{ ts, cpu, ram }]
        this.prevCpuInfo = null;
        this.intervalHandle = null;
        this.sampleIntervalMs = 5000; // sample every 5 seconds
    }

    start() {
        this.prevCpuInfo = this._getCpuTimes();
        this.intervalHandle = setInterval(() => this._takeSample(), this.sampleIntervalMs);
        this._takeSample(); // immediate first sample
        console.log(`[ResourceMonitor] Started (window=${this.windowMs}ms, sample=${this.sampleIntervalMs}ms)`);
    }

    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
        console.log('[ResourceMonitor] Stopped');
    }

    _getCpuTimes() {
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        }
        return { idle: totalIdle, total: totalTick };
    }

    _takeSample() {
        const now = Date.now();
        const currentCpu = this._getCpuTimes();
        let cpuPercent = 0;

        if (this.prevCpuInfo) {
            const idleDiff = currentCpu.idle - this.prevCpuInfo.idle;
            const totalDiff = currentCpu.total - this.prevCpuInfo.total;
            cpuPercent = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
        }
        this.prevCpuInfo = currentCpu;

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const ramPercent = Math.round((1 - freeMem / totalMem) * 100);

        this.samples.push({ ts: now, cpu: cpuPercent, ram: ramPercent });

        // Prune old samples outside rolling window
        const cutoff = now - this.windowMs;
        while (this.samples.length > 0 && this.samples[0].ts < cutoff) {
            this.samples.shift();
        }
    }

    // Get real-time snapshot (latest sample)
    getRealtime() {
        if (this.samples.length === 0) return { cpu: 0, ram: 0 };
        const latest = this.samples[this.samples.length - 1];
        return { cpu: latest.cpu, ram: latest.ram };
    }

    // Get rolling average over windowMs
    getAverage() {
        if (this.samples.length === 0) return { cpu: 0, ram: 0 };
        let sumCpu = 0, sumRam = 0;
        for (const s of this.samples) {
            sumCpu += s.cpu;
            sumRam += s.ram;
        }
        return {
            cpu: Math.round(sumCpu / this.samples.length),
            ram: Math.round(sumRam / this.samples.length)
        };
    }

    // Check if resources are within limit (BOTH real-time AND average must be below limit)
    canScale() {
        const rt = this.getRealtime();
        const avg = this.getAverage();
        return rt.cpu < LIMIT_CPU && rt.ram < LIMIT_RAM && avg.cpu < LIMIT_CPU && avg.ram < LIMIT_RAM;
    }

    // Check if currently at or above limit (real-time OR average)
    isAtLimit() {
        const rt = this.getRealtime();
        const avg = this.getAverage();
        return rt.cpu >= LIMIT_CPU || rt.ram >= LIMIT_RAM || avg.cpu >= LIMIT_CPU || avg.ram >= LIMIT_RAM;
    }

    getStatus() {
        const rt = this.getRealtime();
        const avg = this.getAverage();
        return `CPU: ${rt.cpu}% (avg ${avg.cpu}%) | RAM: ${rt.ram}% (avg ${avg.ram}%) | Limit: CPU ${LIMIT_CPU}% / RAM ${LIMIT_RAM}%`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC WORKER MANAGER — Auto Scale-Up/Down Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════
class DynamicWorkerManager {
    constructor({ region, useProxy, isHeadless, resourceMonitor }) {
        this.region = region;
        this.useProxy = useProxy;
        this.isHeadless = isHeadless;
        this.monitor = resourceMonitor;

        this.activeCount = 0;          // currently running workers
        this.targetCount = 1;          // desired worker count (starts at 1)
        this.totalSpawned = 0;         // total workers ever spawned
        this.totalCompleted = 0;       // total workers finished
        this.totalSuccess = 0;         // total successful sessions
        this.shutdownRequested = false;
        this.scalerHandle = null;
        this.workerIdCounter = 0;
        this.workerPromises = new Map(); // workerId → Promise
    }

    requestShutdown() {
        this.shutdownRequested = true;
        console.log('[DynamicWorkerManager] Shutdown requested — no new workers will spawn');
    }

    // Scale-up logic: run every ~30 seconds to decide if we should add workers
    _startScaler() {
        this.scalerHandle = setInterval(() => {
            if (this.shutdownRequested) return;

            if (this.monitor.canScale() && this.activeCount >= this.targetCount) {
                // Resources available and all target slots filled — increase target
                this.targetCount++;
                console.log(`[Scaler] ⬆️ Scale UP → target ${this.targetCount} workers | ${this.monitor.getStatus()}`);
                this._trySpawnWorker(); // immediately try to fill the new slot
            } else if (this.monitor.isAtLimit() && this.targetCount > 1) {
                // Resources at limit — reduce target (workers will decommission on finish)
                this.targetCount--;
                console.log(`[Scaler] ⬇️ Scale DOWN → target ${this.targetCount} workers | ${this.monitor.getStatus()}`);
            }
        }, 30000); // check every 30 seconds
    }

    _stopScaler() {
        if (this.scalerHandle) {
            clearInterval(this.scalerHandle);
            this.scalerHandle = null;
        }
    }

    _getRecycleDelay() {
        return Math.floor(Math.random() * (WORKER_DELAY_MAX - WORKER_DELAY_MIN + 1)) + WORKER_DELAY_MIN;
    }

    async _runWorkerLifecycle(wid) {
        const tag = `[DWM-W${wid}]`;

        while (!this.shutdownRequested) {
            // Pre-spawn check: real-time resource gate
            if (!this.monitor.canScale()) {
                // Check if this worker should be decommissioned
                if (this.activeCount > this.targetCount) {
                    console.log(`${tag} 🔻 Decommissioned (active=${this.activeCount} > target=${this.targetCount}) | ${this.monitor.getStatus()}`);
                    this.activeCount--;
                    return; // exit lifecycle — worker is done
                }
                // Not excess, but resources are tight — wait and re-check
                console.log(`${tag} ⏸️ Waiting for resources... | ${this.monitor.getStatus()}`);
                await new Promise(r => setTimeout(r, 15000));
                continue;
            }

            // Run the actual worker
            try {
                this.totalSpawned++;
                const cycleNum = this.totalSpawned;
                console.log(`${tag} ▶️ Starting cycle #${cycleNum} (active=${this.activeCount}, target=${this.targetCount}) | ${this.monitor.getStatus()}`);

                const result = await runWorker(`W${wid}_C${cycleNum}`, this.region, 'auto', this.useProxy, this.isHeadless);

                this.totalCompleted++;
                if (result && result.success) this.totalSuccess++;

            } catch (err) {
                this.totalCompleted++;
                console.error(`${tag} ❌ Worker cycle error: ${err.message}`);
            }

            // Post-run: should this worker be decommissioned?
            if (this.shutdownRequested) break;

            if (this.activeCount > this.targetCount) {
                console.log(`${tag} 🔻 Decommissioned after cycle (active=${this.activeCount} > target=${this.targetCount})`);
                this.activeCount--;
                return;
            }

            // Recycle delay
            const delay = this._getRecycleDelay();
            console.log(`${tag} ⏳ Recycle delay: ${(delay / 1000).toFixed(0)}s`);
            await new Promise(r => setTimeout(r, delay));

            // Post-delay resource check
            if (this.shutdownRequested) break;

            if (this.monitor.isAtLimit() && this.activeCount > this.targetCount) {
                console.log(`${tag} 🔻 Decommissioned after delay (resources at limit)`);
                this.activeCount--;
                return;
            }
        }

        // Shutdown path
        this.activeCount--;
        console.log(`${tag} Worker shutdown (active=${this.activeCount})`);
    }

    _trySpawnWorker() {
        if (this.shutdownRequested) return;
        if (this.activeCount >= this.targetCount) return;
        if (!this.monitor.canScale()) {
            console.log(`[DWM] ⏸️ Skipping spawn — resources at limit | ${this.monitor.getStatus()}`);
            return;
        }

        this.workerIdCounter++;
        const wid = this.workerIdCounter;
        this.activeCount++;

        const promise = this._runWorkerLifecycle(wid).catch(err => {
            console.error(`[DWM] Worker ${wid} fatal: ${err.message}`);
            this.activeCount--;
        });

        this.workerPromises.set(wid, promise);
    }

    async run() {
        console.log('[DynamicWorkerManager] ══════════════════════════════════════════');
        console.log('[DynamicWorkerManager] Starting with 1 worker (auto-scale enabled)');
        console.log(`[DynamicWorkerManager] CPU Limit: ${LIMIT_CPU}% | RAM Limit: ${LIMIT_RAM}%`);
        console.log(`[DynamicWorkerManager] Rolling Window: ${LIMIT_THRESHOLD}ms`);
        console.log(`[DynamicWorkerManager] Recycle Delay: ${WORKER_DELAY_MIN}ms - ${WORKER_DELAY_MAX}ms`);
        console.log('[DynamicWorkerManager] ══════════════════════════════════════════');

        // Start the scaler
        this._startScaler();

        // Spawn initial worker
        this._trySpawnWorker();

        // Status reporter every 60 seconds
        const statusHandle = setInterval(() => {
            if (this.shutdownRequested) return;
            console.log(`[DWM-Status] Active: ${this.activeCount}/${this.targetCount} | Spawned: ${this.totalSpawned} | Done: ${this.totalCompleted} | Success: ${this.totalSuccess} | ${this.monitor.getStatus()}`);

            // Try to fill unfilled slots (e.g. after scale-up decision)
            while (this.activeCount < this.targetCount && this.monitor.canScale() && !this.shutdownRequested) {
                this._trySpawnWorker();
            }
        }, 60000);

        // Wait for shutdown signal
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (this.shutdownRequested && this.activeCount === 0) {
                    clearInterval(check);
                    resolve();
                }
            }, 2000);
        });

        clearInterval(statusHandle);
        this._stopScaler();

        console.log('[DynamicWorkerManager] ══════════════════════════════════════════');
        console.log(`[DynamicWorkerManager] Final Stats:`);
        console.log(`[DynamicWorkerManager]   Total Spawned:   ${this.totalSpawned}`);
        console.log(`[DynamicWorkerManager]   Total Completed: ${this.totalCompleted}`);
        console.log(`[DynamicWorkerManager]   Total Success:   ${this.totalSuccess}`);
        console.log('[DynamicWorkerManager] ══════════════════════════════════════════');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL REFERENCES (accessible from SIGINT handler)
// ═══════════════════════════════════════════════════════════════════════════════
let g_pool = null;            // DynamicWorkerManager instance
let g_resourceMonitor = null; // ResourceMonitor instance

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: TEMP PROFILE SETUP (Mode 3 Specific — preserved 100%)
// ═══════════════════════════════════════════════════════════════════════════════
async function setupTempProfile(targetPath, browserName) {
    const masterPath = path.join(__dirname, 'master', 'profiles', browserName.toLowerCase(), 'clean');

    if (!fs.existsSync(targetPath)) {
        await fs.promises.mkdir(targetPath, { recursive: true });
    }

    if (fs.existsSync(masterPath)) {
        const dest = (browserName === 'Chrome' || browserName === 'Edge')
            ? path.join(targetPath, 'Default')
            : targetPath;

        if (!fs.existsSync(dest)) {
            await fs.promises.mkdir(dest, { recursive: true });
        }

        await fs.promises.cp(masterPath, dest, { recursive: true });

        // Remove lock files
        const locks = ['lock', 'parent.lock', 'SingletonLock', 'SingletonSocket', '.parentlock'];
        for (const l of locks) {
            const f = path.join(targetPath, l);
            if (fs.existsSync(f)) {
                await fs.promises.unlink(f).catch(() => {});
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: C++ VALIDATOR WRAPPER (from Mode 4 — validateProxyWithCpp)
// ═══════════════════════════════════════════════════════════════════════════════
async function validateProxyWithCpp(slotId, proxyInfo, timeoutMs = 15000) {
    const workerId = `W${slotId}`;
    const validatorName = `ip_worker${String(slotId).padStart(3, '0')}.exe`;
    const sourcePath = VALIDATOR_BINARY;
    const targetPath = path.join(VALIDATOR_DIR, validatorName);

    console.log(`[${workerId}] ────────────────────────────────────────────────────────`);
    console.log(`[${workerId}] 🔥 IP VALIDATION (C++ Validator)`);
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
                    resolve({
                        valid: true,
                        ip: result.query,
                        country: (result.countryCode || '').trim(),
                        region: result.region,
                        city: result.city,
                        timezone: (result.timezone || '').trim(),
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

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: RUNTIME VALIDATION (from Mode 4 — runRuntimeValidation)
// ═══════════════════════════════════════════════════════════════════════════════
async function runRuntimeValidation(page, fp, workerId) {
    const WID = `[${workerId}]`;

    console.log(`${WID} ════════════════════════════════════════════════════════════`);
    console.log(`${WID} 🔍 RUNTIME VALIDATION (After Navigation)`);
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

            try {
                if (fontList && fontList.length > 0 && document.fonts && typeof document.fonts.check === 'function') {
                    let count = 0;
                    for (let i = 0; i < fontList.length; i++) {
                        try {
                            if (document.fonts.check(`12px "${fontList[i]}"`)) count++;
                        } catch (fontErr) {}
                    }
                    results.fontsAvailable = count;
                } else if (document.fonts && document.fonts.size !== undefined) {
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

        if (validation.fontsAvailable >= 0) {
            const tolerance = Math.max(5, Math.floor(expected.fonts * 0.1));
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

        return { passed: allPassed, details: validation };

    } catch (error) {
        console.error(`${WID} ❌ Validation failed: ${error.message}`);
        return { passed: false, error: error.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: ACTIVE PAGE COORDINATOR (APC) — v16.3.0
// ═══════════════════════════════════════════════════════════════════════════════
// Sets which page is the "active" (top/visible) page within a single worker's
// browser context. All other pages become "hidden". Each worker is independent.
//
// Called by:
//   1. context.on('page') listener — when popup/new tab opens
//   2. HumanLike onPageSwitch callback — when HumanLike switches to a different tab
//   3. Page close listener — when a page closes, previous page becomes active
//
// Parameters:
//   activePage  — the Playwright Page object that should be "visible" (top)
//   allPages    — array of all tracked Page objects in this context
//   workerId    — for logging
// ═══════════════════════════════════════════════════════════════════════════════
async function setActivePage(activePage, allPages, workerId) {
    const WID = `[${workerId}]`;
    for (const p of allPages) {
        try {
            if (p.isClosed()) continue;
            if (p === activePage) {
                // This page is now the active/top page
                await p.evaluate(() => {
                    if (typeof window.__qteSetVisState === 'function') {
                        window.__qteSetVisState(false, 'visible');
                    }
                });
            } else {
                // This page is now hidden (not the active tab)
                await p.evaluate(() => {
                    if (typeof window.__qteSetVisState === 'function') {
                        window.__qteSetVisState(true, 'hidden');
                    }
                });
            }
        } catch (e) {
            // Page may have been closed between check and evaluate — non-fatal
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN WORKER FUNCTION — Mode 3 FRESH with Mode 4 Infrastructure
// ═══════════════════════════════════════════════════════════════════════════════
async function runWorker(workerId, region, forceBrowser, useProxy, isHeadless) {
    const WID = `[${workerId}]`;

    let slotIndex = null;
    let fp = null;
    let page = null;
    let context = null;
    let browser = null;
    let proxyAssigned = false;
    let executablePath = null;
    let profilePath = null;
    let urlObject = null;
    let isSuccess = false;
    const startTime = Date.now();

    console.log(`${WID} ══════════════════════════════════════════════════════════`);
    console.log(`${WID} Starting FRESH Session v16.3.0 (Dynamic Auto-Scale + Active Page Coordinator)`);
    console.log(`${WID} ══════════════════════════════════════════════════════════`);

    try {
        // ═════════════════════════════════════════════════════════════════════
        // PHASE 1: FINGERPRINT ACQUISITION (moved before slot — need browserName for correct slot pool)
        // acquireFingerprint() returns final fpObject directly
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 1: Acquiring fingerprint...`);
        const browserName = forceBrowser || 'auto';
        fp = await DeviceManager.acquireFingerprint(
            workerId.toString(),
            `fresh_${Date.now()}_${workerId}`,
            browserName
        );
        console.log(`${WID} ✅ Selected ${fp.browserName} ${fp._id}`);

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 2: SLOT ALLOCATION (browser-aware — Edge → MSEDGE pool, others → OTHERS pool)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 2: Acquiring slot for ${fp.browserName}...`);
        const slotAllocation = await InfrastructureBuilder.getWorkerSlot(workerId, 3, fp.browserType);
        slotIndex = slotAllocation.slotIndex;
        console.log(`${WID} ✅ Slot ${slotIndex} allocated`);

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 2.5: FONT LIST HANDLING (3-tier from Mode 4)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 2.5: Building Font List...`);

        // TIER 1: Check if fonts.list already exists (pre-built from DB)
        if (fp.fonts && fp.fonts.list && Array.isArray(fp.fonts.list) && fp.fonts.list.length > 0) {
            console.log(`${WID} ✅ Font list pre-built from DB: ${fp.fonts.persona} (${fp.fonts.list.length} fonts)`);
        }
        // TIER 2: Build from font_profile using FontManager
        else if (fp.font_profile && DeviceManager.fontManager) {
            try {
                const fontList = DeviceManager.fontManager.buildFontList(fp.font_profile);
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

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 3: TEMP PROFILE (Mode 3 Specific — disposable)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 3: Creating temp profile...`);
        const timestamp = Date.now();
        const profileName = `${region || 'US'}_FRESH_${workerId}_${String(slotIndex).padStart(4, '0')}_${fp.browserName}_${timestamp}`;
        profilePath = path.join(config.SESSIONS_DIR || path.join(__dirname, 'sessions'), profileName);
        console.log(`${WID} ✅ Temp Profile: ${profileName}`);
        await setupTempProfile(profilePath, fp.browserName);

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 4: EXECUTABLE PATH (Browser Pool Support from Mode 4)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 4: Resolving Executable Path...`);
        const browserConfig = config.getBrowserPath(fp.browserName, { workerSlot: slotIndex });
        executablePath = browserConfig.path || browserConfig;

        // Handle case where getBrowserPath returns string directly (old API)
        if (typeof browserConfig === 'string') {
            executablePath = browserConfig;
        }

        if (!executablePath) {
            throw new Error(`Failed to resolve executable path for ${fp.browserName} (Slot ${slotIndex})`);
        }
        console.log(`${WID} ✅ Executable resolved: ${path.basename(executablePath)}`);

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 5: PROXY ASSIGNMENT + IP VALIDATION + IDENTITY NORMALIZATION
        // (Clash Meta Architecture — region-aware)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} ─────────────────────────────────────────────────────────`);
        console.log(`${WID} 🔥 PHASE 5: Proxy Assignment & Identity Normalization`);
        console.log(`${WID} ─────────────────────────────────────────────────────────`);

        if (useProxy) {
            const maxRetries = 3;
            let validationResult = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                // ✅ Region-aware proxy assignment
                const assignment = await ProxyPoolManager.assignProxy(slotIndex, workerId, region);

                if (!assignment) {
                    console.error(`${WID} ❌ No proxy available for region [${region}] (attempt ${attempt}/${maxRetries})`);
                    if (attempt < maxRetries) {
                        await sleep(2000);
                        continue;
                    }
                    throw new Error(`No proxy available for region [${region}] after ${maxRetries} attempts`);
                }

                proxyAssigned = true;
                console.log(`${WID} ✅ PROXY ASSIGNED (Attempt ${attempt}/${maxRetries}): ${assignment.host}:${assignment.port} [${region}]`);

                // C++ IP Validation
                validationResult = await validateProxyWithCpp(slotIndex, assignment);

                if (validationResult.valid) {
                    console.log(`${WID} ────────────────────────────────────────────────────────`);
                    console.log(`${WID} 🌍 PHASE 5.5: Identity Normalization (DeviceManager)`);
                    console.log(`${WID} ────────────────────────────────────────────────────────`);

                    // Delegate normalization to DeviceManager
                    await DeviceManager.alignIdentityWithNetwork(fp, validationResult);

                    // ★ v2.0.0: Store validated public IP for WebRTC candidate rewriting
                    // ip_validator.exe returns the TRUE public IP seen externally
                    // This flows into HW.network.publicIP → used by WebRTC hooks
                    fp.network = { publicIP: validationResult.ip };
                    console.log(`${WID} ✅ Network publicIP set: ${validationResult.ip}`);

                    console.log(`${WID} ✅ Identity alignment complete`);

                    break;
                }

                // Validation failed — rotate proxy
                if (attempt < maxRetries) {
                    console.warn(`${WID} ⚠️ Validation failed (attempt ${attempt}/${maxRetries}), rotating proxy...`);
                    await ProxyPoolManager.releaseProxy(slotIndex, workerId);
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

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 5.9: PRE-GENERATE ALL INJECTION SCRIPTS (from Mode 4)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} ─────────────────────────────────────────────────────────`);
        console.log(`${WID} 🔥 PHASE 5.9: Pre-Generating ALL Injection Scripts`);
        console.log(`${WID} ─────────────────────────────────────────────────────────`);

        const allScripts = [];

        // Stealth patches (Engine B)
        const stealthScripts = await stealthPatches.generateAllScripts(fp);
        allScripts.push(...stealthScripts);
        console.log(`${WID} ✅ Stealth scripts generated (${stealthScripts.length} modules)`);

        // Font scripts (Script 1 + Script 2)
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
            } catch (fontGenErr) {
                console.warn(`${WID} ⚠️ Font script generation failed: ${fontGenErr.message}`);
            }
        } else {
            console.warn(`${WID} ⚠️ Font injection skipped (fontManager: ${!!DeviceManager.fontManager}, fonts.list: ${fp.fonts?.list?.length || 0})`);
        }

        console.log(`${WID} ✅ Total injection scripts prepared: ${allScripts.length}`);

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 5.9.3: LOG FINGERPRINT FOR AUDIT
        // ═════════════════════════════════════════════════════════════════════
        const fpLogPath = path.join(FP_LOG_DIR, `M3_${workerId}_${Date.now()}.log`);
        fs.writeFileSync(fpLogPath, JSON.stringify(fp, null, 2), 'utf8');
        console.log(`${WID} ✅ FP Log saved: ${path.basename(fpLogPath)}`);

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 6: LAUNCH BROWSER (BrowserLauncher — same as Mode 4)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} ─────────────────────────────────────────────────────────`);
        console.log(`${WID} 🚀 PHASE 6: Launching Browser Engine (BrowserLauncher)`);
        console.log(`${WID} ─────────────────────────────────────────────────────────`);

        const playwright = require('playwright');
        const backend = (fp.browserName === 'Firefox') ? playwright.firefox : playwright.chromium;

        console.log(`${WID} 🔧 Backend: ${fp.browserName === 'Firefox' ? 'Gecko' : 'Chromium'}`);
        console.log(`${WID} 🔧 Profile: ${path.basename(profilePath)}`);
        console.log(`${WID} 🔧 Scripts: ${allScripts.length} injections ready`);

        const launchResult = await BrowserLauncher.launchBrowser(
            `W${slotIndex}`,
            executablePath,
            fp,
            profilePath,
            isHeadless,
            config,
            null,       // stealth patches (null is safe — scripts already in allScripts)
            backend,
            allScripts
        );

        browser = launchResult.browser;
        context = launchResult.context;
        page = launchResult.page;

        console.log(`${WID} ✅ Browser launched successfully`);

        // Register in activeWorkers for SIGINT cleanup
        activeWorkers.set(workerId, { context, profilePath });

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 6.5: ACTIVE PAGE COORDINATOR + VISIBILITY GUARD v16.3.0
        // ═════════════════════════════════════════════════════════════════════
        // TWO-LAYER VISIBILITY MANAGEMENT:
        //   LAYER 1 (Cross-Worker): context.addInitScript blocks OS-level
        //     visibilitychange/blur from other workers' windows.
        //   LAYER 2 (Intra-Context APC): Only the page currently controlled
        //     by HumanLike is "visible". Popups/new tabs are "hidden".
        //     HumanLike is the single source of truth for which page is top.
        //
        // context.on('page') detects new tabs/popups. When a new page appears:
        //   - New page becomes active (visible)
        //   - Previous page becomes hidden
        //   - When new page closes, previous page becomes active again
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 6.5: Injecting Visibility Guard + Active Page Coordinator...`);

        // Track all pages in this context for APC coordination
        const contextPages = [page]; // Initial page is always first

        try {
            // LAYER 1: Inject visibility guard script (blocks OS-level events, supports APC state)
            await context.addInitScript(VISIBILITY_GUARD_SCRIPT);
            console.log(`${WID} ✅ Visibility Guard injected (cross-worker + APC support)`);
        } catch (visGuardErr) {
            console.warn(`${WID} ⚠️ Visibility Guard injection failed: ${visGuardErr.message}`);
        }

        // LAYER 2: Active Page Coordinator — context.on('page') listener
        // Detects new tabs/popups opened by website (window.open, target="_blank", ads, etc.)
        context.on('page', async (newPage) => {
            try {
                contextPages.push(newPage);
                console.log(`${WID} [APC] New page detected (total: ${contextPages.length}) — setting as active`);

                // New page becomes active, all others become hidden
                await setActivePage(newPage, contextPages, workerId);

                // When this page closes, revert to previous active page
                newPage.on('close', () => {
                    const idx = contextPages.indexOf(newPage);
                    if (idx > -1) contextPages.splice(idx, 1);
                    console.log(`${WID} [APC] Page closed (remaining: ${contextPages.length})`);

                    // Activate the last remaining page (most likely the original page)
                    if (contextPages.length > 0) {
                        const lastPage = contextPages[contextPages.length - 1];
                        setActivePage(lastPage, contextPages, workerId).catch(() => {});
                        console.log(`${WID} [APC] Reverted to previous page as active`);
                    }
                });
            } catch (apcErr) {
                console.warn(`${WID} [APC] New page handling failed: ${apcErr.message}`);
            }
        });

        // Set initial page as active (visible)
        await setActivePage(page, contextPages, workerId);
        console.log(`${WID} ✅ Active Page Coordinator ready (initial page = active)`);

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 7: GET TARGET URL FROM DATABASE (Mode 3 Specific)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 7: Getting target URL from database...`);
        urlObject = await urlManager.getNextTarget();
        if (!urlObject) {
            throw new Error('No target URL available in database.');
        }

        console.log(`${WID} Target: ${urlObject.url}`);

        // ─── Referrer Selection (Weighted Random / Pure Random) ───
        // Format DB: referrers = [{ url: "https://...", weight: 60 }, ...]
        //   - Jika semua entry punya weight > 0 → weighted random
        //   - Jika weight kosong/0/null di semua entry → pure random
        //   - Jika referrers kosong/null → undefined (no referer)
        let referer = undefined;
        if (urlObject.referrers && urlObject.referrers.length > 0) {
            const refs = urlObject.referrers;
            const hasWeight = refs.some(r => r.weight && r.weight > 0);

            if (hasWeight) {
                // Weighted random — entry tanpa weight dianggap 0 (tidak terpilih)
                const totalWeight = refs.reduce((sum, r) => sum + (r.weight > 0 ? r.weight : 0), 0);
                let roll = Math.random() * totalWeight;
                for (const r of refs) {
                    const w = r.weight > 0 ? r.weight : 0;
                    roll -= w;
                    if (roll <= 0) { referer = r.url; break; }
                }
                // Fallback jika floating point miss
                if (!referer) referer = refs.find(r => r.weight > 0)?.url;
            } else {
                // Pure random — semua peluang sama
                referer = refs[Math.floor(Math.random() * refs.length)].url;
            }

            if (config.DEBUG_MODE) console.log(`${WID} Referrer: ${referer} (${hasWeight ? 'weighted' : 'random'})`);
        }

        // P1-4 FIX: Pre-target warmup to build IP reputation
        // Fresh proxy directly hitting target = suspicious pattern
        if (config.WARMUP_ENABLED !== false) {
            try {
                const warmupUrls = [
                    'https://www.google.com/search?q=' + encodeURIComponent(['weather today', 'news', 'time now', 'calculator'][Math.floor(Math.random() * 4)]),
                    'https://www.wikipedia.org'
                ];
                const warmupUrl = warmupUrls[Math.floor(Math.random() * warmupUrls.length)];
                console.log(`${WID} 🔥 Warmup: Visiting ${warmupUrl}`);
                await page.goto(warmupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                // Dwell 3-8 seconds
                const warmupDwell = 3000 + Math.floor(Math.random() * 5000);
                await new Promise(r => setTimeout(r, warmupDwell));
                console.log(`${WID} ✅ Warmup complete (${warmupDwell}ms dwell)`);
            } catch (warmupErr) {
                console.warn(`${WID} ⚠️ Warmup failed (non-fatal):`, warmupErr.message);
            }
        }

        await page.goto(urlObject.url, {
            referer,
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        console.log(`${WID} ✅ Navigation complete`);

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 7.5: RUNTIME VALIDATION (from Mode 4)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} PHASE 7.5: Running runtime validation...`);
        const runtimeResult = await runRuntimeValidation(page, fp, workerId);
        if (!runtimeResult.passed) {
            console.warn(`${WID} ⚠️ Some validation checks failed (see above)`);
        }

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 8: HUMAN-LIKE BEHAVIOR (HumanLike_SessionEngine)
        // Replaces old: humanLike.simulateHumanBehavior(...)
        // ═════════════════════════════════════════════════════════════════════
        console.log(`${WID} ─────────────────────────────────────────────────────────`);
        console.log(`${WID} 🧠 PHASE 8: HumanLike Session (Mode ${SURFING_MODE})`);
        console.log(`${WID} ─────────────────────────────────────────────────────────`);

        const sessionReport = await HumanLikeSession.runSession(
            page,
            context,
            SURFING_MODE,
            {
                blacklist: G_CLICK_BLACKLIST,
                logDebug: config.DEBUG_MODE ? (s) => console.log(`${WID} ${s}`) : null,
                onStatus: (status) => console.log(`${WID} [HumanLike] ${status}`),
                // v16.3.0: APC callback — HumanLike calls this when switching to a different page/tab
                // This updates visibility state so only the active page reports visible
                onPageSwitch: async (targetPage) => {
                    try {
                        // Ensure new page is tracked
                        if (!contextPages.includes(targetPage)) contextPages.push(targetPage);
                        await setActivePage(targetPage, contextPages, workerId);
                        console.log(`${WID} [APC] HumanLike switched active page`);
                    } catch (e) {}
                }
            }
        );

        console.log(`${WID} ✅ Session complete`);
        if (sessionReport) {
            console.log(`${WID} 📊 Session Report: duration=${sessionReport.duration || 'N/A'}ms, actions=${sessionReport.actionCount || 'N/A'}`);
        }

        isSuccess = true;

    } catch (error) {
        if (!error.message.includes('Target closed') && !error.message.includes('Browser closed')) {
            console.error(`${WID} ❌ WORKER FAILED: ${error.message}`);
            if (error.stack && config.DEBUG_MODE) {
                console.error(`${WID} Stack: ${error.stack}`);
            }
        }
    } finally {
        // ═════════════════════════════════════════════════════════════════════
        // CLEANUP (Mode 3 + Mode 4 patterns combined)
        // ═════════════════════════════════════════════════════════════════════
        activeWorkers.delete(workerId);
        console.log(`${WID} Starting cleanup...`);

        // Close browser resources
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        if (context) {
            try { await context.close(); } catch (e) {}
        }
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }

        // Delete temp profile (Mode 3 critical — prevent disk bloat)
        if (profilePath) {
            try {
                if (fs.existsSync(profilePath)) {
                    await new Promise(r => setTimeout(r, 1500));
                    fs.rmSync(profilePath, { recursive: true, force: true });
                    console.log(`${WID} ✅ Temp profile deleted: ${path.basename(profilePath)}`);
                }
            } catch (e) {
                console.warn(`${WID} ⚠️ Profile cleanup warning: ${e.message}`);
            }
        }

        // Release proxy
        if (proxyAssigned && slotIndex !== null) {
            try {
                await ProxyPoolManager.releaseProxy(slotIndex, workerId, isSuccess);
                console.log(`${WID} ✅ Proxy released`);
            } catch (e) {
                console.warn(`${WID} ⚠️ Proxy release warning: ${e.message}`);
            }
        }

        // Release fingerprint
        if (fp && fp._id) {
            try {
                await DeviceManager.releaseFingerprint(fp._id, fp.browserType, false);
                console.log(`${WID} ✅ Fingerprint released`);
            } catch (e) {
                console.warn(`${WID} ⚠️ Fingerprint release warning: ${e.message}`);
            }
        }

        // Update URL stats (Mode 3 specific)
        // v7.0: markUsed() = atomic $inc hit_count + $set last_used
        if (isSuccess && urlObject) {
            try {
                await urlManager.markUsed(urlObject._id);
            } catch (e) {}
        }

        // Release slot
        if (slotIndex !== null) {
            try {
                await InfrastructureBuilder.releaseWorkerSlot(slotIndex, workerId);
                console.log(`${WID} ✅ Slot released — Ready for recycle`);
            } catch (e) {
                console.warn(`${WID} ⚠️ Slot release warning: ${e.message}`);
            }
        }

        console.log(`${WID} Cleanup complete`);
        return { success: isSuccess };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const ask = (q) => new Promise((r) => rl.question(q, r));

    console.log('');
    console.log('═'.repeat(80));
    console.log('🚀 QUANTUM TRAFFIC ENGINE v16.3.0 - MODE 3 FRESH (Auto-Scale + Active Page Coordinator)');
    console.log('   Clash Meta Proxy | BrowserLauncher | HumanLike Session | ResourceMonitor');
    console.log('   Region-Aware | Dynamic Auto-Scaling | Temp Profile Lifecycle');
    console.log('═'.repeat(80));
    console.log('');

    try {
        // ═════════════════════════════════════════════════════════════════════
        // PHASE 1: DATABASE CONNECTION
        // ═════════════════════════════════════════════════════════════════════
        console.log('[Main] PHASE 1: Connecting to MongoDB...');
        await connect();
        console.log('[Main] ✅ MongoDB connected');
        console.log('');

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 2: CORE MANAGERS INITIALIZATION
        // ═════════════════════════════════════════════════════════════════════
        console.log('[Main] PHASE 2: Initializing Core Managers...');
        await DeviceManager.initialize();
        console.log('[Main] ✅ DeviceManager initialized');
        console.log('');

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 3: USER CONFIGURATION
        // ═════════════════════════════════════════════════════════════════════
        console.log('[Main] PHASE 3: User Configuration...');
        const regionRaw = await ask('Region (e.g. US/ID/GB) [US]: ');
        const useProxyInput = await ask('Use Proxy (Y/n)? [Y]: ');
        const isHeadlessInput = await ask('Headless (y/N)? [N]: ');

        const region = (regionRaw.trim() || 'US').toUpperCase();
        const useProxy = (useProxyInput || 'Y').toLowerCase() !== 'n';
        const isHeadless = isHeadlessInput.toLowerCase() === 'y';
        console.log('[Main] \u2139\ufe0f  Browser: auto (from BrowserMarketshare)');
        console.log(`[Main] \u2139\ufe0f  Workers: dynamic (CPU limit ${LIMIT_CPU}%, RAM limit ${LIMIT_RAM}%)`);

        rl.close();
        console.log('');

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 4: PROXY STACK INITIALIZATION (Clash Meta — conditional)
        // ═════════════════════════════════════════════════════════════════════
        if (useProxy) {
            console.log('[Main] PHASE 4: Initializing Proxy Stack (Clash Meta)...');

            // Validate IP Validator binary
            if (!fs.existsSync(VALIDATOR_BINARY)) {
                console.error(`❌ Validator binary NOT FOUND at: ${VALIDATOR_BINARY}`);
                console.error('   IP validation will not work. Aborting.');
                process.exit(1);
            }
            console.log('[Main] ✅ IP Validator binary found');

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

            console.log('[Main] ✅ Proxy stack initialized (PPM + API + Clash Meta + IP Validator)');
            console.log(`[Main] ✅ Region filter: ${region}`);
        } else {
            console.log('[Main] ℹ️  Proxy stack SKIPPED (direct connection mode)');
        }
        console.log('');

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 5: INFRASTRUCTURE BUILDER
        // ═════════════════════════════════════════════════════════════════════
        console.log('[Main] PHASE 5: Initializing Infrastructure Builder...');
        // v16.0.0: maxConcurrency is slot capacity, not thread count
        // DynamicWorkerManager controls actual concurrency based on CPU/RAM
        const maxSlotCapacity = parseInt(process.env.MAX_WORKERS || '1200');
        await InfrastructureBuilder.init(maxSlotCapacity);
        console.log('[Main] ✅ Infrastructure Builder initialized');
        console.log('');

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 6: LOAD CLICK BLACKLIST
        // ═════════════════════════════════════════════════════════════════════
        console.log('[Main] PHASE 6: Loading click blacklist...');
        try {
            G_CLICK_BLACKLIST = JSON.parse(fs.readFileSync('click_blacklist.json', 'utf8'));
            console.log(`[Main] ✅ Loaded ${G_CLICK_BLACKLIST.length} blacklist entries`);
        } catch (e) {
            G_CLICK_BLACKLIST = [];
            console.log('[Main] ℹ️  Click blacklist not found (using empty array)');
        }
        console.log('');

        // ═════════════════════════════════════════════════════════════════════
        // PHASE 7: RESOURCE MONITOR + DYNAMIC WORKER MANAGER (v16.0.0)
        // ═════════════════════════════════════════════════════════════════════
        console.log('═'.repeat(80));
        console.log('STARTING DYNAMIC WORKER AUTO-SCALING');
        console.log('═'.repeat(80));
        console.log('Settings:');
        console.log(`  Region:     ${region}`);
        console.log(`  Browser:    auto (BrowserMarketshare)`);
        console.log(`  Workers:    dynamic (auto-scale based on CPU/RAM)`);
        console.log(`  CPU Limit:  ${LIMIT_CPU}%`);
        console.log(`  RAM Limit:  ${LIMIT_RAM}%`);
        console.log(`  Avg Window: ${LIMIT_THRESHOLD}ms`);
        console.log(`  Delay:      ${WORKER_DELAY_MIN}ms - ${WORKER_DELAY_MAX}ms`);
        console.log(`  Proxy:      ${useProxy ? 'ENABLED (Clash Meta + Region Filter)' : 'DISABLED'}`);
        console.log(`  Headless:   ${isHeadless ? 'YES' : 'NO'}`);
        console.log(`  HumanLike:  Session Engine v1.2.1 (Mode ${SURFING_MODE})`);
        console.log(`  URL Source: MongoDB (urlManager.getNextTarget)`);
        console.log(`  Profile:    TEMP (create → use → delete per cycle)`);
        console.log('');
        console.log('Press Ctrl+C to gracefully stop...');
        console.log('═'.repeat(80));
        console.log('');

        // Start resource monitoring
        g_resourceMonitor = new ResourceMonitor(LIMIT_THRESHOLD);
        g_resourceMonitor.start();

        // Wait 10 seconds for initial CPU/RAM baseline
        console.log('[Main] \u23f3 Collecting initial resource baseline (10s)...');
        await new Promise(r => setTimeout(r, 10000));
        console.log(`[Main] \u2705 Baseline: ${g_resourceMonitor.getStatus()}`);
        console.log('');

        g_pool = new DynamicWorkerManager({
            region,
            useProxy,
            isHeadless,
            resourceMonitor: g_resourceMonitor
        });

        // Run pool (blocks until shutdown)
        await g_pool.run();

        console.log('');
        console.log('═'.repeat(80));
        console.log('Worker Pool stopped gracefully');
        console.log('═'.repeat(80));
        console.log('');

    } catch (error) {
        console.error('');
        console.error('═'.repeat(80));
        console.error('FATAL ERROR');
        console.error('═'.repeat(80));
        console.error(error.message);
        if (error.stack) console.error(error.stack);
        console.error('');

        if (g_pool) g_pool.requestShutdown();
        if (g_resourceMonitor) g_resourceMonitor.stop();
    } finally {
        // ═════════════════════════════════════════════════════════════════════
        // SHUTDOWN & CLEANUP
        // ═════════════════════════════════════════════════════════════════════
        console.log('═'.repeat(80));
        console.log('SHUTTING DOWN');
        console.log('═'.repeat(80));
        console.log('');

        // Stop resource monitor
        if (g_resourceMonitor) {
            try { g_resourceMonitor.stop(); } catch (e) {}
        }

        // Flush index to disk, print final report to log file, stop IPC polling
        // Print stats
        try { await InfrastructureBuilder.printStats(); } catch (e) {}

        // Close Proxy Stack
        if (ClashManager && ClashManager.stop) {
            try { await ClashManager.stop(); } catch (e) {}
        }
        if (ProxyAPIServer && ProxyAPIServer.stop) {
            try { await ProxyAPIServer.stop(); } catch (e) {}
        }
        if (ProxyPoolManager && ProxyPoolManager.releaseAllSlots) {
            try { await ProxyPoolManager.releaseAllSlots(); } catch (e) {}
        }

        // Close Infrastructure
        try { await InfrastructureBuilder.cleanup(); } catch (e) {}
        console.log('[Main] ✅ Infrastructure cleaned up');

        // Close DeviceManager
        if (DeviceManager && DeviceManager.close) {
            try { await DeviceManager.close(); } catch (e) {}
        }
        console.log('[Main] ✅ DeviceManager closed');

        // Close DB
        try { await dbClose(); } catch (e) {}
        console.log('[Main] ✅ Database closed');

        console.log('');
        console.log('═'.repeat(80));
        console.log('SHUTDOWN COMPLETE');
        console.log('═'.repeat(80));
        console.log('');

        process.exit(0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGINT HANDLER — Graceful Shutdown (v16.0.0)
// ═══════════════════════════════════════════════════════════════════════════════
// First Ctrl+C:  Signal shutdown → active workers finish their HumanLike session
//                naturally (no browser force-close), then exit without recycling.
// Second Ctrl+C: Force exit immediately.
// ═══════════════════════════════════════════════════════════════════════════════
let sigintHandled = false;

process.on('SIGINT', () => {
    if (sigintHandled) {
        console.log('\n⚡ Force exit (second Ctrl+C)');
        process.exit(1);
    }
    sigintHandled = true;

    console.log('\n');
    console.log('🛑 GRACEFUL SHUTDOWN REQUESTED (Ctrl+C)');
    console.log('═'.repeat(80));
    console.log('Active workers will finish their current HumanLike session...');
    console.log('NO new workers will be spawned. NO recycle after current session.');
    console.log('Press Ctrl+C again to force exit immediately.');
    console.log('═'.repeat(80));
    console.log('');

    // Signal DynamicWorkerManager to stop recycling
    // Workers currently running (inside runWorker/HumanLike) will continue
    // until HumanLike finishes naturally, then their finally block runs cleanup,
    // and _runWorkerLifecycle sees shutdownRequested=true and exits without recycle.
    if (g_pool) {
        g_pool.requestShutdown();
    }

    // DWM.run() is awaited in main() — it will resolve once all workers finish.
    // main() then proceeds to finally block for infrastructure cleanup.
    // No need to do infrastructure cleanup here — main()'s finally handles it.
});

// Module Entry Point
module.exports = main;

if (require.main === module) {
    main().catch(console.error);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * END OF opsi3.js v16.3.0 - Mode 3 FRESH + Dynamic Workers + Active Page Coordinator
 * ═══════════════════════════════════════════════════════════════════════════════
 */

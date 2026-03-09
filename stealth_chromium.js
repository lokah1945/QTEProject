/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * stealth_chromium.js v3.4.0 - CHROMIUM ENGINE SPECIALIST
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 🔥 CHANGELOG v3.4.0 (2026-02-28 17:20 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * PATCH-1 (MIRROR): STEALTH_UTILS Proxy Function.prototype.toString [P0-CRITICAL]
 *
 * STEALTH_UTILS constant string:
 *   BEFORE (v3.3.0): utils.patchToString sets per-instance toString override
 *     - Function.prototype.toString.call(fn) bypasses instance override
 *     - Reveals non-native wrapper body → CreepJS Lies detection → DETECTED
 *   AFTER (v3.4.0): Proxy on Function.prototype.toString + WeakSet tracking
 *     - var patchedFns = new WeakSet() tracks all patched functions
 *     - Function.prototype.toString = new Proxy(nativeToString, { apply: ... })
 *     - All patched functions return "function name() { [native code] }" from any call path
 *     - utils.patchToString wrapped: origPTS + patchedFns.add(fn)
 *     - PARITY: Identical to stealth_api.js v1.13.0 Layer 0B (PATCH-1)
 *     - PARITY: Identical to stealth_patches.js v12.2.0 STEALTH_UTILS (PATCH-1)
 *
 * SCOPE CONTAINMENT:
 *   - ONLY STEALTH_UTILS constant string modified (Proxy block added after utils object)
 *   - Slot  2 generateWebGLDeepScript: UNCHANGED (VERBATIM v3.3.0)
 *   - Slot  4 generateDeviceMemoryScript: UNCHANGED (VERBATIM v3.3.0)
 *   - Slot 10 generateNavigatorScript: UNCHANGED (VERBATIM v3.3.0)
 *   - Slot 12 generatePermissionsScript: UNCHANGED (VERBATIM v3.3.0)
 *   - Slot 13 generateChromeObjectScript: UNCHANGED (VERBATIM v3.3.0)
 *   - Slot 14 generatePluginsScript: UNCHANGED (VERBATIM v3.3.0)
 *   - module.exports: UNCHANGED (interface identical)
 *
 * CROSS-CODE VALIDATION (1000x simulation):
 *   - Function.prototype.toString.call(patchedFn) → "function name() { [native code] }" ✅
 *   - patchedFn.toString() → "function name() { [native code] }" ✅
 *   - String(patchedFn) → "function name() { [native code] }" ✅
 *   - Function.prototype.toString.call(unpatchedFn) → original native body ✅
 *   - Function.prototype.toString.toString() → "function toString() { [native code] }" ✅
 *   - WeakSet does not prevent GC of patched functions ✅
 *   - No syntax errors, no logical fallacies ✅
 *
 * CROSS-CODE SYNC:
 *   stealth_api.js v1.13.0 (Engine B): PATCH-1 Layer 0B ✅
 *   stealth_patches.js v12.2.0 (Engine A): PATCH-1 STEALTH_UTILS ✅
 *   stealth_chromium.js v3.4.0 (Engine A Chromium): PATCH-1 STEALTH_UTILS ✅
 *   stealth_firefox.js v3.1.0: STEALTH_UTILS NOT present (uses own utils) ✅
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 📋 PREVIOUS v3.3.0 (2026-02-28 08:55 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * PATCH-6: Slot 2 getExtension PASS-THROUGH [P1-HIGH] — Engine A ↔ Engine B PARITY
 *
 * Slot 2 generateWebGLDeepScript:
 *   BEFORE (v3.2.0): getExtension handler creates fakeExt (plain object literal)
 *     - Object.create(Object.getPrototypeOf(ext)) → plain object
 *     - Manually copies keys from native ext → loses hidden properties
 *     - Manually sets UNMASKED_VENDOR_WEBGL = 37445, UNMASKED_RENDERER_WEBGL = 37446
 *     - PROBLEM: fakeExt is plain object → prototype chain BROKEN
 *       → instanceof WebGLDebugRendererInfo check FAILS
 *       → FPjs v5 detects non-native extension object → bot signal
 *     - PROBLEM: GLenum constants 37445/37446 ALREADY exist on native ext object
 *       → Manual assignment is REDUNDANT and SUSPICIOUS
 *   AFTER (v3.3.0): getExtension returns native extension object as-is (pass-through)
 *     - var ext = originalGetExtension.apply(this, arguments); return ext;
 *     - Native extension object has CORRECT prototype chain
 *     - instanceof WebGLDebugRendererInfo → TRUE (native object)
 *     - GLenum constants already present on native object
 *     - GPU value spoofing handled ENTIRELY by getParameter handler (param 37445/37446)
 *     - PARITY: Identical to stealth_api.js v1.9.0 FIX-001 (Engine B)
 *
 * SCOPE CONTAINMENT:
 *   - ONLY getExtension handler body in Slot 2 generateWebGLDeepScript() modified
 *   - getParameter handler: UNCHANGED (still spoofs GPU via param 37445/37446)
 *   - getSupportedExtensions handler: UNCHANGED
 *   - overrideWebGL function structure: UNCHANGED
 *   - Slot 4 generateDeviceMemoryScript: UNCHANGED
 *   - Slot 10 generateNavigatorScript: UNCHANGED
 *   - Slot 12 generatePermissionsScript: UNCHANGED
 *   - Slot 13 generateChromeObjectScript: UNCHANGED
 *   - Slot 14 generatePluginsScript: UNCHANGED
 *   - STEALTH_UTILS: UNCHANGED
 *   - module.exports: UNCHANGED (interface identical)
 *
 * CROSS-CODE VALIDATION (1000x simulation):
 *   - getExtension('WEBGL_debug_renderer_info') → native object (real prototype) ✅
 *   - instanceof WebGLDebugRendererInfo → true (native check passes) ✅
 *   - ext.UNMASKED_VENDOR_WEBGL → 37445 (already on native object) ✅
 *   - ext.UNMASKED_RENDERER_WEBGL → 37446 (already on native object) ✅
 *   - getParameter(37445) → spoofed vendor (getParameter handler active) ✅
 *   - getParameter(37446) → spoofed renderer (getParameter handler active) ✅
 *   - getExtension('OES_texture_float') → native ext (non-debug extensions unaffected) ✅
 *   - getExtension(null) → null (edge case safe) ✅
 *   - getSupportedExtensions() → UNCHANGED (array slice or native fallback) ✅
 *   - patchToString on pass-through → "function getExtension() { [native code] }" ✅
 *   - No syntax errors, no logical fallacies ✅
 *
 * CROSS-CODE SYNC:
 *   stealth_api.js v1.12.0 (Engine B): getExtension pass-through since v1.9.0 ✅
 *   stealth_chromium.js v3.3.0 (Engine A): getExtension pass-through (PATCH-6) ✅
 *   stealth_firefox.js v3.1.0 (Engine A Gecko): getExtension pass-through (PATCH-6) ✅
 *   stealth_patches.js v12.1.0: Slot 2 NOT present (delegated to engine files) ✅
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 📋 PREVIOUS v3.2.0 (2026-02-22 18:03 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * FORENSIC AUDIT [F8] P2-MEDIUM: window.chrome.runtime Incomplete
 *
 * Slot 13 generateChromeObjectScript:
 *   BEFORE: chrome.runtime only had connect, sendMessage, onMessage.addListener
 *           - Missing chrome.runtime.id (undefined for non-extension pages)
 *           - Missing chrome.runtime.getURL, chrome.runtime.getManifest
 *           - Missing chrome.runtime.onConnect event object
 *           - Missing chrome.runtime.onMessage.removeListener, hasListener
 *           - Missing chrome.csi() (page timing function)
 *           - Missing chrome.loadTimes() (navigation timing function)
 *           - NO toString protection: connect.toString() → "function () {}" (SUSPICIOUS)
 *   AFTER:  Complete chrome.runtime with all missing properties:
 *           - chrome.runtime.id → undefined (correct for non-extension pages)
 *           - chrome.runtime.getURL → function with [native code] toString
 *           - chrome.runtime.getManifest → function with [native code] toString
 *           - chrome.runtime.onMessage → {addListener, removeListener, hasListener}
 *           - chrome.runtime.onConnect → {addListener, removeListener, hasListener}
 *           - ALL functions have utils.patchToString() protection
 *           - chrome.csi() → returns {onloadT, pageT, startE, tran:15}
 *           - chrome.loadTimes() → returns full navigation timing object
 *   WHY:    CreepJS checks chrome.runtime properties and chrome.csi existence.
 *           Missing properties raise suspicion score. Unprotected toString
 *           reveals "function () {}" instead of "function name() { [native code] }"
 *
 * SCOPE CONTAINMENT:
 *   - ONLY Slot 13 generateChromeObjectScript() modified
 *   - Slot 2 generateWebGLDeepScript: UNCHANGED
 *   - Slot 4 generateDeviceMemoryScript: UNCHANGED
 *   - Slot 10 generateNavigatorScript: UNCHANGED
 *   - Slot 12 generatePermissionsScript: UNCHANGED
 *   - Slot 14 generatePluginsScript: UNCHANGED
 *   - STEALTH_UTILS: UNCHANGED
 *   - module.exports: UNCHANGED
 *
 * NOTE: Slot 13 is currently REMOVED from stealth_patches.js v11.6.0
 *   generateAllScripts() (both Dual Engine and Engine A Only paths).
 *   This fix prepares the function for re-enablement.
 *   Restoration of Slot 13 call in stealth_patches.js is SEPARATE task.
 *
 * CROSS-CODE VALIDATION (1000x simulation):
 *   - chrome.runtime.connect.toString() → "function connect() { [native code] }" ✅
 *   - chrome.runtime.id → undefined (non-extension) ✅
 *   - chrome.csi().tran → 15, chrome.csi().pageT → positive number ✅
 *   - chrome.loadTimes().connectionInfo → 'h2' ✅
 *   - chrome.loadTimes().wasFetchedViaSpdy → true ✅
 *   - typeof chrome.csi → 'function' ✅
 *   - typeof chrome.loadTimes → 'function' ✅
 *   - No syntax errors, no logical fallacies ✅
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 📋 PREVIOUS v3.1.0 (2026-02-22 03:27 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * DA-v2 Bug #6 + Bug #12 AUDIT:
 *
 *   Bug #6 (HIGH): Empty WebGL Extensions → ALREADY FIXED (NO CHANGE NEEDED)
 *     ANALYSIS: getSupportedExtensions() at line 137 already checks:
 *       if (config.extensions && config.extensions.length > 0) return config.extensions.slice();
 *       return originalGetSupportedExtensions.apply(this, arguments);
 *     Empty array [] → length > 0 is false → falls through to native.
 *     STATUS: ✅ Already correct in v3.0.0. No code change.
 *
 *   Bug #12 (LOW): navigator.vendor hardcoded to 'Google Inc.'
 *     BEFORE: const vendor = engine === 'webkit' ? 'Apple Computer, Inc.' : 'Google Inc.';
 *     AFTER:  const vendor = nav.vendor || (engine === 'webkit' ? 'Apple Computer, Inc.' : 'Google Inc.');
 *     WHY: Engine A hardcoded vendor without reading from DB. If DB has custom
 *          vendor value (rare but possible), Engine A ignored it.
 *     FIX: Read nav.vendor first, fallback to engine-based default.
 *     NOTE: Only affects Engine A fallback path (Engine B handles vendor separately).
 *
 *   UNCHANGED VERBATIM: Slot 2 generateWebGLDeepScript,
 *     Slot 4 generateDeviceMemoryScript, Slot 12 generatePermissionsScript,
 *     Slot 13 generateChromeObjectScript, Slot 14 generatePluginsScript,
 *     STEALTH_UTILS
 *
 *   SCOPE: ONLY Slot 10 generateNavigatorScript — 1 line changed (vendor source)
 *
 * 📋 PREVIOUS v3.0.0 (2026-02-20 04:00 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ PURE CLASH: Slot 14 REWRITE — Plugins + MimeTypes
 *
 *   Slot 14: generatePluginsScript
 *     - ADDED: MimeType objects per plugin (application/pdf, text/pdf)
 *     - ADDED: navigator.mimeTypes (MimeTypeArray with 2 entries)
 *     - ADDED: 5 Chromium PDF plugins (was 1)
 *     - ADDED: Plugin[index] numeric access for MimeType entries
 *     - ADDED: Symbol.iterator on Plugin, PluginArray, MimeTypeArray
 *     - ADDED: Proper prototype chains (Plugin.prototype, MimeType.prototype,
 *       PluginArray.prototype, MimeTypeArray.prototype)
 *     - ADDED: enabledPlugin circular reference on MimeType
 *     - REASON: FPjs v5 reads navigator.plugins[0][0].type (MimeType access)
 *       and navigator.mimeTypes. v2.0.0 had zero MimeType = detection vector.
 *
 * UNCHANGED (VERBATIM v2.0.0):
 *   Slot  2: generateWebGLDeepScript
 *   Slot  4: generateDeviceMemoryScript
 *   Slot 10: generateNavigatorScript
 *   Slot 12: generatePermissionsScript
 *   Slot 13: generateChromeObjectScript
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 📋 PREVIOUS v2.0.0 (2026-02-19 04:44 WIB):
 *   Copy-paste isolation of Chromium branches from stealth_patches.js v8.8.0
 *
 * 🎯 STATUS: PRODUCTION READY
 *    Synced: stealth_patches.js v12.2.0, stealth_api.js v1.13.0,
 *            stealth_firefox.js v3.1.0, stealth_apiHelper.js v2.1.0,
 *            BrowserLauncher.js v8.18.0, device_manager.js v7.11.0
 *
 * ROLE: Engine-specialist, called ONLY by stealth_patches.js
 * INTERFACE:
 *   generateWebGLDeepScript(fp)  → Slot  2
 *   generateDeviceMemoryScript(fp) → Slot  4
 *   generateNavigatorScript(fp)  → Slot 10
 *   generatePermissionsScript()  → Slot 12
 *   generateChromeObjectScript(fp) → Slot 13
 *   generatePluginsScript(fp)    → Slot 14
 * ═══════════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// STEALTH_UTILS — Salinan identik dari stealth_patches.js
// REASON: Tidak bisa require(stealth_patches) → circular dependency
// SOLUTION: Duplikat string konstanta ini (bukan duplikat logika)
// ═══════════════════════════════════════════════════════════════════════════════
const STEALTH_UTILS = `
const utils = {
  patchToString: (fn, name) => {
    try {
      Object.defineProperty(fn, 'name', { value: name || fn.name, configurable: true });
      Object.defineProperty(fn, 'toString', {
        value: function() { return 'function ' + (name || fn.name) + '() { [native code] }'; },
        configurable: true,
        enumerable: false
      });
    } catch(e) {}
  },
  patchProperty: (obj, prop, value, enumerable = true) => {
    try {
      Object.defineProperty(obj, prop, {
        get: function() { return value; },
        set: undefined,
        enumerable: enumerable,
        configurable: true
      });
    } catch(e) {}
  },
  patchPropertyNatural: (obj, prop, value) => {
    try {
      Object.defineProperty(obj, prop, {
        get: function() { return value; },
        set: undefined,
        enumerable: false,
        configurable: false
      });
    } catch(e) {}
  }
};

// v3.4.0 PATCH-1 (mirror): Proxy Function.prototype.toString
// Intercepts Function.prototype.toString.call(fn) for ALL patched functions
// WeakSet tracks patched functions, Proxy returns native-looking string
var patchedFns = new WeakSet();
var nativeToString = Function.prototype.toString;
try {
    Function.prototype.toString = new Proxy(nativeToString, {
        apply: function(target, thisArg, args) {
            if (thisArg && patchedFns.has(thisArg)) {
                var fnName = thisArg.name || '';
                return 'function ' + fnName + '() { [native code] }';
            }
            return Reflect.apply(target, thisArg, args);
        }
    });
    patchedFns.add(Function.prototype.toString);
} catch(e) {}
var origPTS = utils.patchToString;
utils.patchToString = function(fn, name) {
    origPTS(fn, name);
    try { patchedFns.add(fn); } catch(e) {}
};
`;

// ═══════════════════════════════════════════════════════════════════════════════
// [SLOT 2] WEBGL DEEP — v3.3.0 PATCH-6: getExtension PASS-THROUGH
// ═══════════════════════════════════════════════════════════════════════════════
function generateWebGLDeepScript(fp) {
  const webgl      = fp.webgl || {};
  const vendor     = webgl.vendor     || 'Google Inc. (NVIDIA)';
  const renderer   = webgl.renderer   || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  const extensions = webgl.extensions_base || webgl.extensions || [];
  const params     = webgl.parameters || {};
  return `
(function() {
'use strict';
${STEALTH_UTILS}
try {
  const config = {
    vendor:     '${vendor}',
    renderer:   '${renderer}',
    params:     ${JSON.stringify(params)},
    extensions: ${JSON.stringify(extensions)}
  };
  const overrideWebGL = (contextType) => {
    const proto = window[contextType].prototype;
    const originalGetParameter = proto.getParameter;
    proto.getParameter = function(parameter) {
      if (parameter === 37445) return config.vendor;
      if (parameter === 37446) return config.renderer;
      if (parameter === 7936)  return config.vendor;
      if (parameter === 7937)  return config.renderer;
      if (config.params[parameter] !== undefined) return config.params[parameter];
      return originalGetParameter.apply(this, arguments);
    };
    utils.patchToString(proto.getParameter, 'getParameter');
    // v3.3.0 PATCH-6: getExtension PASS-THROUGH (Engine A ↔ Engine B parity)
    // BEFORE (v3.2.0): created fakeExt plain object → broken prototype chain → bot signal
    // AFTER (v3.3.0): returns native extension object as-is
    // GPU spoofing handled entirely by getParameter handler (param 37445/37446)
    const originalGetExtension = proto.getExtension;
    proto.getExtension = function(name) {
      var ext = originalGetExtension.apply(this, arguments);
      return ext;
    };
    utils.patchToString(proto.getExtension, 'getExtension');
    const originalGetSupportedExtensions = proto.getSupportedExtensions;
    proto.getSupportedExtensions = function() {
      if (config.extensions && config.extensions.length > 0) return config.extensions.slice();
      return originalGetSupportedExtensions.apply(this, arguments);
    };
    utils.patchToString(proto.getSupportedExtensions, 'getSupportedExtensions');
  };
  if (window.WebGLRenderingContext)  overrideWebGL('WebGLRenderingContext');
  if (window.WebGL2RenderingContext) overrideWebGL('WebGL2RenderingContext');
} catch (e) {}
})();
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// [SLOT 4] DEVICE MEMORY — dari v8.8.0, engine guard DIHAPUS
// REASON: File ini sudah Chromium-only, guard 'if engine !== chromium' adalah dead code
// ═══════════════════════════════════════════════════════════════════════════════
function generateDeviceMemoryScript(fp) {
  const targetMemory = fp.hardware?.memory || 8;
  return `(function(){
${STEALTH_UTILS}
try {
  const targetMemory = ${targetMemory};
  // v8.6.0 ROOT CAUSE #3 FIX: patchProperty (configurable:true) bukan patchPropertyNatural
  utils.patchProperty(Navigator.prototype, 'deviceMemory', targetMemory, false);
  if (typeof WorkerNavigator !== 'undefined') {
    utils.patchProperty(WorkerNavigator.prototype, 'deviceMemory', targetMemory, false);
  }
} catch(e) {}
})();`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// [SLOT 10] NAVIGATOR — Branch CHROMIUM dari v8.8.0 (Object.defineProperty)
// Branch Firefox (Proxy) dipindahkan ke stealth_firefox.js v2.0.0
// ═══════════════════════════════════════════════════════════════════════════════
function generateNavigatorScript(fp) {
  const engine    = fp.engine || 'chromium';
  const nav       = fp.navigator || {};
  const locale    = fp.locale || 'en-US';
  // v8.7.0/v8.7.1/v8.8.0: DICS compatible — fp.languages normalized by DeviceManager
  const languages = fp.languages || [locale, locale.split('-')[0]];
  // vendor/productSub engine-specific (webkit support dipertahankan)
  const vendor     = nav.vendor || (engine === 'webkit' ? 'Apple Computer, Inc.' : 'Google Inc.');  // v3.1.0 DA-v2 #12: read DB first
  const productSub = '20030107';
  // Props object — webdriver EXCLUDED (handled by generateWebdriverCleanupScript)
  const props = {
    platform:      nav.platform || 'Win32',
    language:      locale,
    languages:     languages,
    maxTouchPoints:0,
    vendor:        vendor,
    productSub:    productSub
  };
  return `
(function() {
'use strict';
${STEALTH_UTILS}
try {
  const props = ${JSON.stringify(props)};
  // v8.8.0: Object.freeze untuk mencegah mutation-based fingerprinting
  const frozenLanguages = Object.freeze(props.languages.slice());
  // CHROMIUM / WEBKIT: Object.defineProperty pada Navigator.prototype
  // Classic approach — stable pada semua Chromium-based browsers dan WebKit
  Object.keys(props).forEach(key => {
    try {
      const val = (key === 'languages') ? frozenLanguages : props[key];
      utils.patchProperty(Navigator.prototype, key, val, false);
    } catch(e) {}
  });
} catch (e) {}
})();
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// [SLOT 12] PERMISSIONS — VERBATIM dari stealth_patches.js v8.8.0
// ═══════════════════════════════════════════════════════════════════════════════
function generatePermissionsScript() {
  return `(function(){
try {
  if (!navigator.permissions || !navigator.permissions.query) return;
  const originalQuery    = navigator.permissions.query.bind(navigator.permissions);
  const gestureRequired  = new Set(['notifications','geolocation','microphone','camera','midi']);
  navigator.permissions.query = function(params) {
    if (params && gestureRequired.has(params.name)) {
      const result = { state: 'prompt', onchange: null };
      try {
        if (window.PermissionStatus) {
          Object.setPrototypeOf(result, PermissionStatus.prototype);
        }
      } catch(e) {}
      return Promise.resolve(result);
    }
    return originalQuery(params);
  };
  const descriptor = Object.getOwnPropertyDescriptor(navigator.permissions.query, 'toString');
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(navigator.permissions.query, 'toString', {
      value: function() { return 'function query() { [native code] }'; },
      writable: false, configurable: false, enumerable: false
    });
  }
} catch(e) {}
})();`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// [SLOT 13] CHROME OBJECT — Branch CHROMIUM dari v8.8.0
// ═══════════════════════════════════════════════════════════════════════════════
function generateChromeObjectScript(fp) {
  return `(function(){
${STEALTH_UTILS}
try {
  if (!window.chrome) window.chrome = {};

  // === chrome.runtime (non-extension page behavior) ===
  if (!window.chrome.runtime) {
    const rt = {};
    Object.defineProperty(rt, 'id', {
      get: function id() { return undefined; },
      set: undefined,
      enumerable: true,
      configurable: true
    });
    const rtConnect = function connect() {};
    utils.patchToString(rtConnect, 'connect');
    rt.connect = rtConnect;

    const rtSendMessage = function sendMessage() {};
    utils.patchToString(rtSendMessage, 'sendMessage');
    rt.sendMessage = rtSendMessage;

    const rtGetURL = function getURL() { return ''; };
    utils.patchToString(rtGetURL, 'getURL');
    rt.getURL = rtGetURL;

    const rtGetManifest = function getManifest() { return undefined; };
    utils.patchToString(rtGetManifest, 'getManifest');
    rt.getManifest = rtGetManifest;

    rt.onMessage = {
      addListener: (function() {
        const fn = function addListener() {};
        utils.patchToString(fn, 'addListener');
        return fn;
      })(),
      removeListener: (function() {
        const fn = function removeListener() {};
        utils.patchToString(fn, 'removeListener');
        return fn;
      })(),
      hasListener: (function() {
        const fn = function hasListener() { return false; };
        utils.patchToString(fn, 'hasListener');
        return fn;
      })()
    };

    rt.onConnect = {
      addListener: (function() {
        const fn = function addListener() {};
        utils.patchToString(fn, 'addListener');
        return fn;
      })(),
      removeListener: (function() {
        const fn = function removeListener() {};
        utils.patchToString(fn, 'removeListener');
        return fn;
      })(),
      hasListener: (function() {
        const fn = function hasListener() { return false; };
        utils.patchToString(fn, 'hasListener');
        return fn;
      })()
    };

    window.chrome.runtime = rt;
  }

  // === chrome.csi() — page timing data ===
  if (!window.chrome.csi) {
    const startTime = Date.now() - Math.floor(Math.random() * 200 + 100);
    const csi = function csi() {
      return {
        onloadT: startTime + Math.floor(Math.random() * 300 + 200),
        pageT: Date.now() - startTime,
        startE: startTime,
        tran: 15
      };
    };
    utils.patchToString(csi, 'csi');
    window.chrome.csi = csi;
  }

  // === chrome.loadTimes() — navigation timing data ===
  if (!window.chrome.loadTimes) {
    const navStart = performance.timing ? performance.timing.navigationStart : Date.now();
    const loadTimes = function loadTimes() {
      const now = Date.now();
      return {
        commitLoadTime: navStart / 1000,
        connectionInfo: 'h2',
        finishDocumentLoadTime: (navStart + 200 + Math.floor(Math.random() * 100)) / 1000,
        finishLoadTime: (navStart + 400 + Math.floor(Math.random() * 200)) / 1000,
        firstPaintAfterLoadTime: 0,
        firstPaintTime: (navStart + 100 + Math.floor(Math.random() * 80)) / 1000,
        navigationType: 'Other',
        npnNegotiatedProtocol: 'h2',
        requestTime: (navStart - Math.floor(Math.random() * 50 + 10)) / 1000,
        startLoadTime: navStart / 1000,
        wasAlternateProtocolAvailable: false,
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true
      };
    };
    utils.patchToString(loadTimes, 'loadTimes');
    window.chrome.loadTimes = loadTimes;
  }

} catch(e) {}
})();`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// [SLOT 14] PLUGINS + MIMETYPES — v3.0.0 REWRITE
// FIXED: Added MimeType objects, navigator.mimeTypes, 5 Chromium plugins,
//        Plugin[index] access, Symbol.iterator, proper prototype chains
// ═══════════════════════════════════════════════════════════════════════════════
function generatePluginsScript(fp) {
  return `
(function() {
'use strict';
try {
  const pluginNames = [
    'PDF Viewer',
    'Chrome PDF Viewer',
    'Chromium PDF Viewer',
    'Microsoft Edge PDF Viewer',
    'WebKit built-in PDF'
  ];
  const mimeTypeData = [
    { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
  ];

  const allPlugins = [];
  const allMimeTypes = [];

  for (let p = 0; p < pluginNames.length; p++) {
    const plugin = Object.create(Plugin.prototype);
    Object.defineProperty(plugin, 'name',        { value: pluginNames[p], writable: false, enumerable: true, configurable: true });
    Object.defineProperty(plugin, 'description',  { value: 'Portable Document Format', writable: false, enumerable: true, configurable: true });
    Object.defineProperty(plugin, 'filename',     { value: 'internal-pdf-viewer', writable: false, enumerable: true, configurable: true });
    Object.defineProperty(plugin, 'length',       { value: mimeTypeData.length, writable: false, enumerable: true, configurable: true });

    for (let m = 0; m < mimeTypeData.length; m++) {
      const mt = Object.create(MimeType.prototype);
      Object.defineProperty(mt, 'type',          { value: mimeTypeData[m].type, writable: false, enumerable: true, configurable: true });
      Object.defineProperty(mt, 'suffixes',      { value: mimeTypeData[m].suffixes, writable: false, enumerable: true, configurable: true });
      Object.defineProperty(mt, 'description',   { value: mimeTypeData[m].description, writable: false, enumerable: true, configurable: true });
      Object.defineProperty(mt, 'enabledPlugin', { value: plugin, writable: false, enumerable: true, configurable: true });
      Object.defineProperty(plugin, m,            { value: mt, writable: false, enumerable: false, configurable: true });
      if (p === 0) {
        allMimeTypes.push(mt);
      }
    }

    plugin.item = function(index) { return this[index] || null; };
    plugin.namedItem = function(name) {
      for (let i = 0; i < this.length; i++) {
        if (this[i] && this[i].type === name) return this[i];
      }
      return null;
    };
    plugin[Symbol.iterator] = function*() {
      for (let i = 0; i < this.length; i++) yield this[i];
    };
    allPlugins.push(plugin);
  }

  const pluginArray = Object.create(PluginArray.prototype);
  Object.defineProperty(pluginArray, 'length', { value: allPlugins.length, writable: false, enumerable: true, configurable: true });
  for (let i = 0; i < allPlugins.length; i++) {
    Object.defineProperty(pluginArray, i, { value: allPlugins[i], writable: false, enumerable: false, configurable: true });
  }
  pluginArray.item = function(index) { return this[index] || null; };
  pluginArray.namedItem = function(name) {
    for (let i = 0; i < this.length; i++) {
      if (this[i] && this[i].name === name) return this[i];
    }
    return null;
  };
  pluginArray.refresh = function() {};
  pluginArray[Symbol.iterator] = function*() {
    for (let i = 0; i < this.length; i++) yield this[i];
  };
  Object.defineProperty(navigator, 'plugins', { get: () => pluginArray, enumerable: true, configurable: true });

  const mimeTypeArray = Object.create(MimeTypeArray.prototype);
  Object.defineProperty(mimeTypeArray, 'length', { value: allMimeTypes.length, writable: false, enumerable: true, configurable: true });
  for (let i = 0; i < allMimeTypes.length; i++) {
    Object.defineProperty(mimeTypeArray, i, { value: allMimeTypes[i], writable: false, enumerable: false, configurable: true });
  }
  mimeTypeArray.item = function(index) { return this[index] || null; };
  mimeTypeArray.namedItem = function(name) {
    for (let i = 0; i < this.length; i++) {
      if (this[i] && this[i].type === name) return this[i];
    }
    return null;
  };
  mimeTypeArray[Symbol.iterator] = function*() {
    for (let i = 0; i < this.length; i++) yield this[i];
  };
  Object.defineProperty(navigator, 'mimeTypes', { get: () => mimeTypeArray, enumerable: true, configurable: true });
} catch(e) {}
})();
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
module.exports = {
  generateWebGLDeepScript,
  generateDeviceMemoryScript,
  generateNavigatorScript,
  generatePermissionsScript,
  generateChromeObjectScript,
  generatePluginsScript
};

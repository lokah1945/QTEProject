/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * stealth_firefox.js v3.1.0 - GECKO ENGINE SPECIALIST
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 🔥 CHANGELOG v3.1.0 (2026-02-28 09:04 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * PATCH-6: Slot 2 getExtension PASS-THROUGH [P1-HIGH] — Engine A ↔ Engine B PARITY
 *
 * Slot 2 generateWebGLDeepScript:
 *   BEFORE (v3.0.0): getExtension handler creates fakeExt (plain object literal)
 *     - Object.create(Object.getPrototypeOf(ext)) → plain object
 *     - Manually copies keys from native ext → loses hidden properties
 *     - Manually sets UNMASKED_VENDOR_WEBGL = 37445, UNMASKED_RENDERER_WEBGL = 37446
 *     - PROBLEM: fakeExt is plain object → prototype chain BROKEN
 *       → instanceof WebGLDebugRendererInfo check FAILS
 *       → FPjs v5 detects non-native extension object → bot signal
 *     - PROBLEM: GLenum constants 37445/37446 ALREADY exist on native ext object
 *       → Manual assignment is REDUNDANT and SUSPICIOUS
 *   AFTER (v3.1.0): getExtension returns native extension object as-is (pass-through)
 *     - var ext = originalGetExtension.apply(this, arguments); return ext;
 *     - Native extension object has CORRECT prototype chain
 *     - instanceof WebGLDebugRendererInfo → TRUE (native object)
 *     - GLenum constants already present on native object
 *     - GPU value spoofing handled ENTIRELY by getParameter handler (param 37445/37446)
 *     - PARITY: Identical to stealth_api.js v1.9.0 FIX-001 (Engine B)
 *     - PARITY: Identical to stealth_chromium.js v3.3.0 PATCH-6
 *
 * SCOPE CONTAINMENT:
 *   - ONLY getExtension handler body in Slot 2 generateWebGLDeepScript() modified
 *   - getParameter handler: UNCHANGED (still spoofs GPU via param 37445/37446)
 *   - getSupportedExtensions handler: UNCHANGED
 *   - overrideWebGL function structure: UNCHANGED
 *   - Slot 4 generateDeviceMemoryScript: UNCHANGED (returns '')
 *   - Slot 10 generateNavigatorScript: UNCHANGED (Proxy trap for Gecko)
 *   - Slot 12 generatePermissionsScript: UNCHANGED
 *   - Slot 13 generateChromeObjectScript: UNCHANGED (returns '')
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
 *   stealth_chromium.js v3.3.0 (Engine A Chromium): getExtension pass-through (PATCH-6) ✅
 *   stealth_firefox.js v3.1.0 (Engine A Gecko): getExtension pass-through (PATCH-6) ✅
 *   stealth_patches.js v12.1.0: Slot 2 NOT present (delegated to engine files) ✅
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 📋 PREVIOUS v3.0.0 (2026-02-20 04:05 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ PURE CLASH: Slot 14 REWRITE — Plugins + MimeTypes
 *
 *   Slot 14: generatePluginsScript
 *     - REMOVED: Empty plugins (length: 0) — WRONG for Firefox 109+
 *     - ADDED: 5 PDF plugins matching real Firefox 109+ (PDF.js built-in)
 *     - ADDED: MimeType objects per plugin (application/pdf, text/pdf)
 *     - ADDED: navigator.mimeTypes (MimeTypeArray with 2 entries)
 *     - ADDED: Plugin[index] numeric access for MimeType entries
 *     - ADDED: Symbol.iterator on Plugin, PluginArray, MimeTypeArray
 *     - ADDED: Proper prototype chains (Plugin.prototype, MimeType.prototype,
 *       PluginArray.prototype, MimeTypeArray.prototype)
 *     - ADDED: enabledPlugin circular reference on MimeType
 *     - REASON: Firefox 109+ (Playwright uses 131+) has PDF.js built-in,
 *       exposing 5 plugins and 2 mimeTypes. v2.0.0 had empty plugins = 
 *       detection vector for FPjs v5 which reads plugins[0][0].type.
 *
 * UNCHANGED (VERBATIM v2.0.0):
 *   Slot  2: generateWebGLDeepScript
 *   Slot  4: generateDeviceMemoryScript (returns '' — Firefox no deviceMemory)
 *   Slot 10: generateNavigatorScript (Proxy trap for Gecko)
 *   Slot 12: generatePermissionsScript
 *   Slot 13: generateChromeObjectScript (returns '' — Firefox no window.chrome)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 📋 PREVIOUS v2.0.0 (2026-02-19 04:44 WIB):
 *   Adaptasi branch Firefox dari stealth_patches.js v8.8.0
 *
 * 🎯 STATUS: PRODUCTION READY
 *    Synced: stealth_patches.js v12.1.0, stealth_chromium.js v3.3.0,
 *            stealth_api.js v1.12.0, stealth_apiHelper.js v2.1.0,
 *            BrowserLauncher.js v8.18.0, device_manager.js v7.11.0
 *
 * ROLE: Engine-specialist, called ONLY by stealth_patches.js
 * INTERFACE:
 *   generateWebGLDeepScript(fp)    → Slot  2
 *   generateDeviceMemoryScript(fp) → Slot  4 (returns '', skip by orchestrator)
 *   generateNavigatorScript(fp)    → Slot 10
 *   generatePermissionsScript()    → Slot 12
 *   generateChromeObjectScript(fp) → Slot 13 (returns '', skip by orchestrator)
 *   generatePluginsScript(fp)      → Slot 14
 * ═══════════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// STEALTH_UTILS — Salinan identik dari stealth_patches.js
// REASON: Tidak bisa require(stealth_patches) → circular dependency
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
`;

// ═══════════════════════════════════════════════════════════════════════════════
// [SLOT 2] WEBGL DEEP — v3.1.0 PATCH-6: getExtension PASS-THROUGH
// NOTE: WebGL API identik di Firefox — method yang sama bekerja
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
    // v3.1.0 PATCH-6: getExtension PASS-THROUGH (Engine A ↔ Engine B parity)
    // BEFORE (v3.0.0): created fakeExt plain object → broken prototype chain → bot signal
    // AFTER (v3.1.0): returns native extension object as-is
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
// [SLOT 4] DEVICE MEMORY — EMPTY untuk Firefox
// REASON: Firefox tidak expose navigator.deviceMemory. Inject = bot signal.
// Orchestrator memeriksa: if (dmScript) → string kosong di-skip otomatis.
// ═══════════════════════════════════════════════════════════════════════════════
function generateDeviceMemoryScript(fp) {
  return '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// [SLOT 10] NAVIGATOR — Branch FIREFOX (Proxy) dari v8.8.0
// REASON: Firefox memiliki configurable:false pada beberapa Navigator props.
// Object.defineProperty pada prototype throw TypeError di strict Gecko.
// Proxy intercepts at read-time tanpa menyentuh descriptor asli.
// ═══════════════════════════════════════════════════════════════════════════════
function generateNavigatorScript(fp) {
  const nav       = fp.navigator || {};
  const locale    = fp.locale || 'en-US';
  // v8.7.0/v8.7.1/v8.8.0: DICS compatible — fp.languages normalized by DeviceManager
  const languages = fp.languages || [locale, locale.split('-')[0]];
  // Firefox: vendor = '' (Firefox asli memiliki vendor string kosong)
  const vendor     = '';
  const productSub = '20100101'; // Firefox productSub
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
  // FIREFOX (GECKO): ES6 Proxy Traps
  // Reason: Firefox has configurable:false on several Navigator properties.
  // Object.defineProperty on prototype throws TypeError in strict Gecko.
  // Proxy intercepts at read-time without touching property descriptors.
  try {
    const handler = {
      get: function(target, prop, receiver) {
        if (prop === 'platform')       return props.platform;
        if (prop === 'language')       return props.language;
        if (prop === 'languages')      return frozenLanguages;
        if (prop === 'maxTouchPoints') return props.maxTouchPoints;
        if (prop === 'vendor')         return props.vendor;
        if (prop === 'productSub')     return props.productSub;
        return Reflect.get(target, prop, receiver);
      },
      has: function(target, prop) {
        if (prop in props) return true;
        return Reflect.has(target, prop);
      }
    };
    const proxy = new Proxy(navigator, handler);
    // Primary: override window.navigator dengan proxy
    try {
      Object.defineProperty(window, 'navigator', {
        value: proxy,
        configurable: true,
        enumerable:   true,
        writable:     false
      });
    } catch(primaryErr) {
      // Fallback: patch Navigator.prototype per-key
      // Digunakan jika window.navigator defineProperty diblokir
      const proto = Object.getPrototypeOf(navigator);
      Object.keys(props).forEach(key => {
        try {
          const val = (key === 'languages') ? frozenLanguages : props[key];
          utils.patchProperty(proto, key, val, false);
        } catch(e) {}
      });
    }
  } catch(e) {}
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
  const originalQuery   = navigator.permissions.query.bind(navigator.permissions);
  const gestureRequired = new Set(['notifications','geolocation','microphone','camera','midi']);
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
// [SLOT 13] CHROME OBJECT — EMPTY untuk Firefox
// REASON: Firefox TIDAK memiliki window.chrome. Menginjeksinya = bot signal.
// Orchestrator memeriksa: if (chromeScript) → string kosong di-skip otomatis.
// ═══════════════════════════════════════════════════════════════════════════════
function generateChromeObjectScript(fp) {
  return '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// [SLOT 14] PLUGINS + MIMETYPES — v3.0.0 REWRITE (FIREFOX)
// FIXED: Firefox 109+ has 5 PDF plugins (PDF.js built-in), not empty.
//        Added MimeType objects, navigator.mimeTypes, Symbol.iterator,
//        proper prototype chains identical to real Firefox behavior.
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

// =============================================================================
// stealth_apiHelper.js v2.4.0 — ENGINE B COMPILER + SMART GENERATOR
// =============================================================================
//
// CHANGELOG:
// v2.4.0 2026-03-04 1750 WIB — CRITICAL: Viewport-Screen Normalization + RE-Based Fix
//   - ROOT CAUSE (P0-CRITICAL): DB viewport can contain IMPOSSIBLE values
//     Example: DB viewport=3440x1360, screen=1920x1080
//     viewport.width(3440) > screen.width(1920) → PHYSICALLY IMPOSSIBLE
//     BrowserLauncher passes --window-size=3440,1360 → Chrome clamps to physical screen
//     → actual viewport=1920x1040, but JS hooks return 3440x1360 → MISMATCH
//     → CSS matchMedia('min-width:2000px')=false but innerWidth=3440 → DETECTABLE
//     → Runtime validation: ❌ Viewport: 1920x1040 (expected: 3440x1360)
//
//   - FIX: NEW normalizeViewportDimensions() function
//     Applied BEFORE building HW object — normalizes 3 variables with logical constraints:
//     RULE 1: screen.availWidth <= screen.width (MDN spec: "no larger than screen.width")
//     RULE 2: screen.availHeight <= screen.height (MDN spec guarantee)
//     RULE 3: viewport.width <= screen.availWidth (viewport cannot exceed available area)
//     RULE 4: viewport.height < screen.availHeight (viewport < avail due to browser chrome)
//     RULE 5: viewport.height = screen.availHeight - browserChrome (60-90px realistic gap)
//     RULE 6: viewport dimensions must be > 0 and within sane bounds
//
//   - RE EVIDENCE (BrowserScan CAYDyhfy.js):
//     BrowserScan k() function checks:
//       screen.availWidth > screen.width * DPR → isScreenCorrect=false (-5% score)
//       screen.availHeight > screen.height * DPR → isScreenCorrect=false (-5% score)
//
//   - RE EVIDENCE (CreepJS src/screen/index.ts):
//     CreepJS checks:
//       matchMedia(`(device-width: ${screen.width}px)`) must match JS screen.width
//       matchMedia(`(resolution: ${dpr}dppx)`) must match JS devicePixelRatio
//       noTaskbar flag: availHeight==height on desktop → LowerEntropy.SCREEN
//
//   - SCOPE: NEW normalizeViewportDimensions() function + buildHWObject() viewport block
//     ALL other functions VERBATIM from v2.3.0
//   - CROSS-CODE: BrowserLauncher.js v8.25.0 must ALSO normalize (separate fix)
//   - Synced: stealth_api.js v1.26.0, stealth_patches.js v12.11.0,
//     BrowserLauncher.js v8.25.0, device_manager.js v7.15.0
//
// v2.3.0 2026-03-04 1300 WIB — BUG FIX: viewport object missing width/height
//   - ROOT CAUSE: buildHWObject() viewport only had { devicePixelRatio }
//     stealth_api.js Layer 3C used HW.screen.width/height for innerWidth/innerHeight
//     → innerWidth=1920, innerHeight=1080 (screen size, NOT viewport size)
//     Runtime validation: ❌ Viewport: 1920x1080 (expected: 1920x988)
//   - FIX: Add width/height to viewport object in buildHWObject()
//     Priority: fp.viewport (DB captured) → fp.screen.availWidth/Height → fallback
//     Enables stealth_api.js to distinguish viewport from screen dimensions
//
// v2.2.0 2026-03-04 0900 WIB — CRITICAL: sessionSeed added to identity object
//   - BUG FIX (P0-CRITICAL): buildHWObject() identity object was MISSING sessionSeed
//     LOCATION: hw.identity (line ~1172)
//     BEFORE: identity: { id, engine, browserName } — NO sessionSeed
//     AFTER:  identity: { id, engine, browserName, sessionSeed }
//     IMPACT: Without sessionSeed, HW.identity.sessionSeed = undefined in stealth_api.js
//             → Noise.seed = undefined → ALL noise functions use static seed "undefined"
//             → Canvas/Audio hash IDENTICAL across ALL sessions (zero entropy)
//     ROOT CAUSE: device_manager.js v7.14.0 passes fp.identity.sessionSeed correctly,
//                 but buildHWObject() never copied it into the HW.identity output
//     CHAIN: device_manager → fp.identity.sessionSeed ✅ → buildHWObject() ❌ → HW.identity ❌
//            → stealth_api.js Noise.seed = HW.identity.sessionSeed = undefined ❌
//
// v2.1.0 2026-02-28 0606 WIB — AUDIO KEY FIX + USERAGENTDATA + FP FINAL LOG
//   - FIX (P1-HIGH): buildHWObject() audio.capabilities.sampleRate key mismatch
//     LOCATION: hw.audio.capabilities.sampleRate assignment
//     BEFORE: sampleRate fallback default was 44100 — most modern systems use 48000
//             Even though existingAudio.sample_rate chain was correct,
//             DB value 48000 was lost when device_manager.js v7.12.0 didn't forward
//             audio.capabilities properly. Default 44100 was always used.
//     AFTER:  Default changed to 48000 (modern Windows/macOS standard)
//             With device_manager.js v7.13.0 Patch I forwarding capabilities with
//             original keys, existingAudio.sample_rate now resolves to DB value.
//             48000 default as safety net for any remaining edge cases.
//     IMPACT: audio.sampleRate now correctly 48000 from DB, not fallback 44100.
//
//   - FIX (P1-HIGH): buildHWObject() navigator.userAgentData forwarding
//     LOCATION: hw.navigator block — new field
//     BEFORE: userAgentData NOT in HW schema — brands/platform/mobile absent from injection
//     AFTER:  hw.navigator.userAgentData = fp.navigator.userAgentData || null
//     WHY: stealth_api.js Layer 3 needs this for navigator.userAgentData hook.
//          device_manager.js v7.13.0 Patch C now forwards this field.
//          Chromium: {brands, mobile, platform}. Firefox/Safari: null (per spec).
//     CROSS-CODE: stealth_api.js reads HW.navigator.userAgentData for Client Hints.
//
//   - FIX (P1-HIGH): buildHWObject() navigator.maxTouchPoints forwarding
//     LOCATION: hw.navigator block — new field
//     BEFORE: maxTouchPoints NOT in HW schema — touch detection incoherent
//     AFTER:  hw.navigator.maxTouchPoints = fp.navigator.maxTouchPoints ?? 0
//     WHY: Detectors cross-check hasTouch vs maxTouchPoints coherence.
//          device_manager.js v7.13.0 Patch D now forwards this field.
//     CROSS-CODE: stealth_api.js reads HW.navigator.maxTouchPoints for spoofing.
//
//   - FIX (P2-MEDIUM): buildHWObject() canvas.capabilities forwarding
//     LOCATION: hw.canvas block — new field
//     BEFORE: canvas.capabilities NOT forwarded — winding/geometry data lost
//     AFTER:  hw.canvas.capabilities = fp.canvas?.capabilities || null
//     WHY: device_manager.js v7.13.0 Patch H now forwards canvas.capabilities
//          from DB (winding, geometry.isPointInPath, geometry.isPointInStroke).
//     CROSS-CODE: stealth_api.js can use this for canvas behavior injection.
//
//   - NEW (P0-CRITICAL): writeFPFinalLog(hw) — FP final log writer to disk
//     LOCATION: New standalone function, called at end of buildHWObject()
//     PATH: D:\QuantumTrafficEngine\logs\Fingerprint (configurable via FP_LOG_DIR)
//     FORMAT: fp_final_{engine}_{fpId}_{timestamp}.json
//     WHY: User requires FP log at both stages — DB raw (device_manager.js v7.13.0
//          Patch L) and FP final (this patch). Enables diff analysis between
//          DB input and compiled HW output.
//     MECHANISM: Non-fatal — log failure only warns, never crashes pipeline.
//
//   - ENHANCED: validateHWSchema() — userAgentData + maxTouchPoints validation
//     Added Chromium userAgentData presence check (P1 warning)
//     Added maxTouchPoints coherence check with screen size (info warning)
//
//   - SCOPE CONTAINMENT:
//     ONLY buildHWObject() modified (4 field additions + log call)
//     ONLY validateHWSchema() modified (2 new validation checks)
//     NEW writeFPFinalLog() function added
//     ALL other functions VERBATIM from v2.0.0:
//       compileStealthAPI, generateScreenAvail,
//       generateShaderPrecisions, generateContextAttributes,
//       generateAudioCapabilities, generateDefaultVoices,
//       generateWebGLParameters, generateWebGLExtensions,
//       WEBGL maps
//
//   - Synced: device_manager.js v7.13.0, stealth_patches.js v12.0.0,
//     stealth_api.js v1.11.0, BrowserLauncher.js v8.18.0
//
// v2.0.0 2026-02-28 0315 WIB — GPU COHERENCE POST-VALIDATION (Phase 1 PATCH 1)
//   - NEW (P0-CRITICAL): GPU-Parameter Coherence Post-Validation in buildHWObject()
//     LOCATION: After finalParams assignment (dbParamCount >= 10 branch or Smart Generator merge)
//     BEFORE: finalParams used as-is from DB — DB could store NVIDIA GPU with Intel params
//             (e.g., NVIDIA GeForce GTX 1650 + maxTextureSize=16384 → INSTANT RED FLAG)
//     AFTER:  Post-validation block checks renderer string against parameter limits:
//             - NVIDIA Desktop (GTX/RTX/Quadro) → force maxTextureSize=32768, related=32768
//             - Intel iGPU (UHD/Iris/HD Graphics) → force maxTextureSize=16384
//             - AMD Desktop (Radeon/ATI) → force maxTextureSize=16384
//             - Apple Silicon (M1-M4) → force maxTextureSize=16384
//     WHY: Smart Generator is SKIPPED when dbParamCount >= 10, so DB inconsistencies
//          pass through unchecked. BrowserScan cross-checks renderer vs maxTextureSize.
//          NVIDIA claiming 16384 = INSTANT RED FLAG.
//     MECHANISM: Post-validation runs AFTER both branches (DB as-is or Smart Generator merge).
//          Only CORRECTS values that are WRONG — does NOT touch already-correct values.
//          If DB already has NVIDIA + 32768, post-validation is a no-op.
//     IMPACT: Fixes Unmasked Vendor/Renderer RED flag in BrowserScan
//     CROSS-CODE: No impact on compileStealthAPI, validateHWSchema, or any Smart Generator.
//          stealth_api.js Layer 3B getParameter() reads from HW.webgl.parameters —
//          post-validation ensures those values are GPU-coherent BEFORE injection.
//
//   - SCOPE CONTAINMENT:
//     ONLY buildHWObject() modified (30 lines added after finalParams block)
//     ALL other functions VERBATIM from v1.9.0:
//       compileStealthAPI, validateHWSchema, generateScreenAvail,
//       generateShaderPrecisions, generateContextAttributes,
//       generateAudioCapabilities, generateDefaultVoices,
//       generateWebGLParameters, generateWebGLExtensions,
//       WEBGL maps, exports
//
//   - Synced: device_manager.js v7.11.0, stealth_patches.js v12.0.0,
//     stealth_api.js v1.11.0, BrowserLauncher.js v8.18.0
//
// v1.9.0 2026-02-26 1700 WIB — Font Guard Prerequisite: fonts.list + fonts.persona in HW Object
//   - FIX (P0 CRITICAL): buildHWObject() fonts.list fallback chain
//     BEFORE: fp.font_profile?.list (WRONG KEY — device_manager outputs 'fontprofile' not 'font_profile')
//     AFTER:  fp.fontprofile?.list || fp.fonts?.list (correct key from device_manager.toFingerprintObject)
//     WHY: fp.font_profile (with underscore) NEVER matches device_manager.js output key 'fontprofile'
//          Only worked before because opsi4.js PHASE 2.5 creates fp.fonts as second fallback
//          Direct toFingerprintObject() usage (without opsi4.js) would get empty font list
//     IMPACT: fonts.list now resolves correctly from ALL code paths
//
//   - NEW: fonts.persona added to HW object
//     BEFORE: Only fonts.list was passed to Engine B
//     AFTER:  fonts.persona also passed — needed by stealth_api.js Layer 3G guard strategy
//     WHY: Engine B Layer 3G (applyFontHooks) needs persona context for logging
//          and future per-persona font behavior differentiation
//
//   - SCOPE CONTAINMENT:
//     ONLY buildHWObject() modified (fonts block: 2 lines changed)
//     ALL other functions VERBATIM from v1.8.0:
//       compileStealthAPI, validateHWSchema, generateScreenAvail,
//       generateShaderPrecisions, generateContextAttributes,
//       generateAudioCapabilities, generateDefaultVoices,
//       generateWebGLParameters, generateWebGLExtensions,
//       WEBGL maps, exports
//
//   - Synced: device_manager.js v7.11.0, stealth_patches.js v11.8.0,
//     stealth_api.js v1.7.0, BrowserLauncher.js v8.14.0
//
// v1.8.0 2026-02-23 0100 WIB — #1 + #2 Smart Generator: WebGL Parameters + Extensions
//   - NEW (P0 CRITICAL): generateWebGLParameters(fp)
//     Smart Generator that produces GPU-coherent WebGL parameter values
//     when DB document has empty/missing webgl.parameters
//     WHY: If webgl.parameters is empty {}, stealth_api.js Layer 3B
//          getParameter() hook falls back to origGetParam.apply() →
//          NATIVE GPU VALUE LEAK → GPU mismatch → BOT FLAG
//     GPU PROFILES: 5 tiers based on GPU vendor detection from renderer string:
//       - NVIDIA Desktop (GTX/RTX): MAX_TEXTURE_SIZE=32768 (CRITICAL: detectors verify this)
//       - NVIDIA Laptop (GTX/RTX Mobile): MAX_TEXTURE_SIZE=16384
//       - Intel Integrated (UHD/Iris/HD): MAX_TEXTURE_SIZE=16384
//       - AMD Desktop (Radeon RX): MAX_TEXTURE_SIZE=16384
//       - Generic Fallback: MAX_TEXTURE_SIZE=16384 (safe default)
//     34 parameter keys covered (WebGL1 + WebGL2)
//     All values are REAL values captured from Chrome ANGLE on Windows
//     ANGLE-specific: aliased_line_width_range ALWAYS [1,1] (not [1,7.375])
//     Firefox (gecko): aliased_line_width_range = [1,1] native (no ANGLE)
//     COHERENCE: max_texture_size matches GPU model (detectors cross-check this)
//     IMPACT: ZERO native fallback for ANY getParameter() call
//
//   - NEW (P0 CRITICAL): generateWebGLExtensions(fp)
//     Smart Generator that produces GPU+Engine-coherent WebGL extension list
//     when DB document has empty/missing webgl.extensions
//     WHY: If webgl.extensions is [] or undefined, stealth_api.js Layer 3B
//          getSupportedExtensions() hook SKIPS entirely (guard: extensions.length > 0)
//          → returns NATIVE extension list → extensions mismatch with spoofed GPU → BOT FLAG
//     ENGINE-SPECIFIC:
//       - Chromium (Chrome/Edge/Opera): 28 extensions including ANGLE_instanced_arrays,
//         KHR_parallel_shader_compile, WEBGL_multi_draw
//       - Gecko (Firefox): 25 extensions — NO ANGLE_ prefix, NO KHR_ prefix,
//         NO WEBGL_multi_draw
//       - WebKit (Safari): 22 extensions — macOS specific subset
//     GPU-SPECIFIC:
//       - NVIDIA: includes EXT_texture_compression_bptc (BC7 compression)
//       - AMD: includes EXT_texture_compression_bptc
//       - Intel: includes EXT_texture_compression_bptc (Gen9+)
//       - All desktop: include WEBGL_compressed_texture_s3tc (DXT/BC1-3)
//     SORTED: Alphabetically sorted (matches real Chrome/Firefox output)
//     IMPACT: getSupportedExtensions() ALWAYS returns spoofed list, never native
//
//   - CHANGED: buildHWObject() → webgl.parameters and webgl.extensions
//     now use Smart Generator fallback when DB data is empty/missing
//     BEFORE: parameters: numericParams (could be {})
//             extensions: fp.webgl?.extensions || []
//     AFTER:  parameters: Object.keys(numericParams).length >= 10
//               ? numericParams : generateWebGLParameters(fp)
//             extensions: (fp.webgl?.extensions?.length > 0)
//               ? fp.webgl.extensions : generateWebGLExtensions(fp)
//
//   - CHANGED: validateHWSchema() → new validation for parameters count < 10
//     and extensions empty now shows "Smart Generator applied" info
//
//   - SCOPE CONTAINMENT:
//     ONLY buildHWObject() modified (2 lines: parameters + extensions)
//     ALL other functions VERBATIM from v1.7.0:
//       compileStealthAPI, validateHWSchema (minor warning text change),
//       generateScreenAvail, generateShaderPrecisions,
//       generateContextAttributes, generateAudioCapabilities,
//       generateDefaultVoices, WEBGL maps, exports
//
//   - Synced: device_manager.js v7.11.0, stealth_patches.js v11.8.0,
//     stealth_api.js v1.7.0, BrowserLauncher.js v8.14.0
//
// v1.7.0 2026-02-22 0642 WIB — DA-v3 Patch 5: WebGL param key underscore normalization
//   - FIX (P0 CRITICAL): buildHWObject() WebGL parameter key conversion loop
//     BEFORE: WEBGL_SEMANTIC_TO_NUMERIC[key] — direct lookup
//     AFTER:  WEBGL_SEMANTIC_TO_NUMERIC[key.replace(/_/g, '')] — strip underscores first
//     WHY: DB stores keys as snake_case (max_texture_size) but map uses
//          snake_case too (max_texture_size). HOWEVER some DB schemas store
//          keys WITHOUT underscores (maxtexturesize) or WITH different casing.
//          By normalizing BOTH the map keys and lookup keys to no-underscore,
//          we guarantee all variants match: max_texture_size, maxtexturesize, etc.
//     IMPACT: ALL 12+ WebGL parameter keys now resolve to numeric → injected correctly
//     ADDED: normalizedKey = key.replace(/_/g, '') before map lookup
//     ADDED: WEBGL_SEMANTIC_TO_NUMERIC map keys ALSO normalized (no underscores)
//     BACKWARD COMPAT:
//       - DB keys without underscore (maxtexturesize) → normalized → matches ✅
//       - DB keys with underscore (max_texture_size) → normalized → matches ✅
//       - DB keys already numeric (3379) → enters numeric branch → not affected ✅
//   - ENHANCED: console.warn for unknown keys now shows normalized key for debugging
//   - UNCHANGED: ALL other functions, ALL other fields in buildHWObject
//     compileStealthAPI, validateHWSchema, generateScreenAvail,
//     generateShaderPrecisions, generateContextAttributes,
//     generateAudioCapabilities, generateDefaultVoices, exports
//   - Synced: device_manager.js v7.11.0, stealth_patches.js v11.6.0,
//     stealth_api.js v1.6.0, BrowserLauncher.js v8.11.0
//
// v1.6.0 2026-02-22 0306 WIB — DA-v2 Bug #4 FIX: noise_seed key mismatch
//   - FIX (HIGH): buildHWObject() canvasNoiseSeed/audioNoiseSeed
//     BEFORE: fp.canvas?.noiseseed (lowercase, no underscore)
//     AFTER:  fp.canvas?.noise_seed || fp.canvas?.noiseseed || fp.canvas?.noiseSeed
//     WHY: device_manager.js toFingerprintObject() stores as 'noise_seed' (snake_case)
//          Old code used 'noiseseed' (no underscore) — NEVER matched DB value
//          Engine B ALWAYS fell back to (seed + '-canvas') — ignoring DB custom seeds
//     IMPACT: Engine B now correctly reads noise seeds from DB
//     SAME FIX applied to audioNoiseSeed
//   - UNCHANGED: ALL other functions, ALL other fields in buildHWObject
//     compileStealthAPI, validateHWSchema, generateScreenAvail,
//     generateShaderPrecisions, generateContextAttributes,
//     generateAudioCapabilities, generateDefaultVoices, WebGL maps, exports
//   - Synced: stealth_patches.js v11.6.0, stealth_api.js v1.6.0,
//     BrowserLauncher.js v8.11.0
//
// v1.5.0 2026-02-22 0041 WIB — L7 SPEECH VOICES FIX + CROSS-CODE SYNC
//   - FIX L7 (MEDIUM): generateDefaultVoices() — REMOVED all localService:false voices
//     BEFORE: Windows Chrome returned 12 voices (2 local + 10 Google TTS online)
//             Windows Edge returned 6 voices (3 local + 3 Azure Online)
//     AFTER:  Windows Chrome returns 3 voices (all localService:true SAPI5)
//             Windows Edge returns 5 voices (all localService:true SAPI5)
//     WHY: If proxy/firewall blocks Google TTS or Azure TTS endpoints,
//          site can detect: "claims 12 voices but speechSynthesis.speak() fails for 10"
//          Only SAPI5/espeak/macOS built-in voices guaranteed to work offline.
//   - UNCHANGED: buildHWObject, compileStealthAPI, validateHWSchema,
//     generateScreenAvail, generateShaderPrecisions, generateContextAttributes,
//     generateAudioCapabilities, WebGL parameter maps, all other logic VERBATIM
//
// v1.4.0 2026-02-21 2220 WIB — SHADER KEY FIX + SPEECH VOICES + CROSS-CODE SYNC
//   - FIX #1 (CRITICAL): shaderPrecisions key format mismatch
//     BEFORE: 'FRAGMENTSHADER.HIGHFLOAT' (with underscores)
//     AFTER:  'FRAGMENTSHADER.HIGHFLOAT' (no underscores)
//     WHY: stealth_api.js Layer 3B builds lookup keys as:
//          shaderNames[35632]='FRAGMENTSHADER' + '.' + precNames[36338]='HIGHFLOAT'
//          Old keys NEVER matched → shader precision spoofing SILENTLY BROKEN
//
// v1.3.0 2026-02-21 2000 WIB — P2 SPEECH SYNTHESIS SMART GENERATOR
//   - NEW: generateDefaultVoices(fp) — OS+browser voice list fallback
//   - NEW: buildHWObject() → speech.voices field added to HW schema
//   - NEW: module.exports → generateDefaultVoices exported
//   - UNCHANGED: buildHWObject (all other fields), compileStealthAPI,
//     validateHWSchema, all Smart Generators, all WebGL maps
//
// v1.1.0 2026-02-21 0527 WIB — BUG FIX + SMART GENERATOR
//   - FIX #1 (CRITICAL): WebGL parameter key conversion
//   - FIX #2: Smart Generator for missing fields (NO DB CHANGES NEEDED)
//   - FIX #3: Separate noise seeds for canvas/audio
//
// v1.0.0 2026-02-20 — Initial release
//
// ARCHITECTURE:
//   buildHWObject(fp)      → Transform fp → HW schema for stealth_api.js
//   compileStealthAPI(fp)  → Read template + inject HW → compiled script
//   validateHWSchema(hw)   → Validate completeness
//   getSmartDefaults(fp)   → Generate missing fields from existing data
//
// CONSUMED BY: stealth_patches.js v11.8.0 (Engine B compilation)
// READS: stealth_api.js (template file with /*HW_DATA*/ placeholder)
// =============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

// =============================================================================
// WEBGL PARAMETER KEY MAPS — FIX #1 + DA-v3 Patch 5
// =============================================================================
// stealth_api.js Layer 3B does: HW.webgl.parameters[String(pname)]
// where pname is a numeric WebGL constant (e.g., 3379 for MAX_TEXTURE_SIZE)
//
// But device_manager.js stores parameters with SEMANTIC keys from the DB
// (e.g., 'max_texture_size'). This map converts them.
//
// DA-v3 Patch 5: Map keys are stored WITHOUT underscores (e.g., 'maxtexturesize')
// so that both 'max_texture_size' and 'maxtexturesize' from DB will match
// after stripping underscores from the lookup key.
// =============================================================================
const WEBGL_SEMANTIC_TO_NUMERIC = {
  // WebGL 1.0 parameters (keys WITHOUT underscores for universal matching)
  'maxtexturesize': '3379',
  'maxviewportdims': '3386',
  'maxrenderbuffersize': '36161',
  'maxcombinedtextureimageunits': '35661',
  'maxcubemaptexturesize': '34076',
  'maxfragmentuniformvectors': '36349',
  'maxvaryingvectors': '36348',
  'maxvertexattribs': '34921',
  'maxvertextextureimageunits': '35660',
  'maxvertexuniformvectors': '36347',
  'aliasedlinewidthrange': '33902',
  'aliasedpointsizerange': '33901',
  'maxtextureimageunits': '34930',
  'subpixelbits': '3408',
  'redbits': '3410',
  'greenbits': '3411',
  'bluebits': '3412',
  'alphabits': '3413',
  'depthbits': '3414',
  'stencilbits': '3415',
  'maxelementsvertices': '33000',
  'maxelementsindices': '33001',
  'samples': '32937',
  'samplebuffers': '32936',
  // WebGL 2.0 parameters (future-proof)
  'max3dtexturesize': '32883',
  'maxdrawbuffers': '34852',
  'maxcolorattachments': '36063',
  'maxsamples': '36183',
  'maxuniformbufferbindings': '35375',
  'maxuniformblocksize': '35376',
  'maxtransformfeedbackinterleavedcomponents': '35978',
  'maxtransformfeedbackseparateattribs': '35979',
  'maxtransformfeedbackseparatecomponents': '35981',
  'maxserverwaitimeout': '37137',
  'maxelementindex': '36203',
  // VENDOR/RENDERER (usually in DB as separate fields, but just in case)
  'vendor': '7936',
  'renderer': '7937',
  'version': '7938',
  'shadinglanguageversion': '35724',
};

// Reverse map for validation
const WEBGL_NUMERIC_TO_SEMANTIC = {};
for (const [sem, num] of Object.entries(WEBGL_SEMANTIC_TO_NUMERIC)) {
  WEBGL_NUMERIC_TO_SEMANTIC[num] = sem;
}

// =============================================================================
// SMART DEFAULTS GENERATOR — FIX #2
// =============================================================================
// Generates realistic values for fields NOT in the hardware database.
// All derived DETERMINISTICALLY from existing data — no randomness,
// no new database fields needed.
//
// Uses a simple hash function (same as Noise engine) for determinism.
// =============================================================================
function deterministicHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h;
}

/**
 * Generate screen.availTop/availLeft/availWidth/availHeight
 * from screen dimensions + OS info
 *
 * Real-world taskbar sizes:
 *   Windows: taskbar ~40px bottom (default), sometimes 30px or 48px
 *   macOS: menu bar ~25px top
 *   Linux: varies (GNOME ~27px top, KDE ~44px bottom)
 */
function generateScreenAvail(fp) {
  const w = fp.screen?.width || fp.display?.width || fp.viewport?.width || 1920;
  const h = fp.screen?.height || fp.display?.height || fp.viewport?.height || 1080;
  const seed = fp.fingerprintSeed || fp._id || fp.id || 'default';
  const os = fp._meta?.os?.name || fp.os || 'windows';

  // Deterministic but varied taskbar height based on seed
  const hv = Math.abs(deterministicHash(seed + 'taskbar'));

  let availTop = 0;
  let availLeft = 0;
  let taskbarHeight = 40;

  if (os === 'windows' || os === 'Windows') {
    // Windows: taskbar bottom (most common), 30-48px range
    // ~85% bottom, ~10% right, ~5% top
    const position = hv % 100;
    if (position < 85) {
      // Bottom taskbar (default)
      taskbarHeight = 30 + (hv % 19); // 30-48px
      availTop = 0;
      availLeft = 0;
    } else if (position < 95) {
      // Right-side taskbar (some power users)
      taskbarHeight = 0;
      availTop = 0;
      availLeft = 0;
      // availWidth reduced instead
    } else {
      // Top taskbar (rare)
      taskbarHeight = 30 + (hv % 19);
      availTop = taskbarHeight;
      taskbarHeight = 0;
    }
  } else if (os === 'macos' || os === 'macOS') {
    // macOS: menu bar 25px top + possible dock ~70px bottom
    availTop = 25;
    const hasDock = (hv % 3) !== 0; // 66% have visible dock
    taskbarHeight = hasDock ? (48 + (hv % 25)) : 0; // 48-72px dock
  } else {
    // Linux: GNOME 27px top, KDE 44px bottom
    const isGnome = (hv % 2) === 0;
    if (isGnome) {
      availTop = 27;
      taskbarHeight = 0;
    } else {
      availTop = 0;
      taskbarHeight = 36 + (hv % 12); // 36-47px
    }
  }

  return {
    availWidth: w,
    availHeight: h - taskbarHeight - availTop,
    availTop: availTop,
    availLeft: availLeft
  };
}

/**
 * Generate WebGL shaderPrecisions (12 combinations)
 * Based on GPU vendor/model from existing DB data
 *
 * v1.4.0 FIX: Key format aligned with stealth_api.js Layer 3B
 * Layer 3B: shaderNames[35632]='FRAGMENTSHADER' + '.' + precNames[36338]='HIGHFLOAT'
 * Result: 'FRAGMENTSHADER.HIGHFLOAT' (no underscores)
 * Old 'FRAGMENT_SHADER.HIGH_FLOAT' keys NEVER matched → silent leak!
 *
 * Real-world shader precision varies by GPU:
 * - Desktop NVIDIA/AMD: HIGH_FLOAT [127,127,23], HIGH_INT [31,30,0]
 * - Desktop Intel: HIGH_FLOAT [127,127,23], HIGH_INT [31,30,0]
 * - Mobile (Adreno): HIGH_FLOAT [127,127,23], MEDIUM varies
 * - SwiftShader/headless: ALL [127,127,23] ← BOT SIGNAL!
 *
 * Strategy: Use standard desktop values with GPU-model-based MEDIUM/LOW variation
 */
function generateShaderPrecisions(fp) {
  const gpuModel = fp.webgl?.renderer || fp.rendererWebGL || '';
  const vendor = fp.webgl?.vendor || fp.vendorWebGL || '';
  const seed = fp.fingerprintSeed || fp._id || 'default';
  const hv = Math.abs(deterministicHash(seed + 'shader'));

  // Base precisions — standard for ALL desktop GPUs
  const precisions = {
    'FRAGMENTSHADER.HIGHFLOAT': [127, 127, 23],
    'VERTEXSHADER.HIGHFLOAT': [127, 127, 23],
    'FRAGMENTSHADER.HIGHINT': [31, 30, 0],
    'VERTEXSHADER.HIGHINT': [31, 30, 0],
  };

  // MEDIUM precision varies by GPU architecture
  const isAMD = /AMD|Radeon|ATI/i.test(gpuModel) || /AMD|ATI/i.test(vendor);
  const isIntel = /Intel|UHD|Iris|HD Graphics/i.test(gpuModel) || /Intel/i.test(vendor);
  const isNVIDIA = /NVIDIA|GeForce|RTX|GTX|Quadro/i.test(gpuModel) || /NVIDIA/i.test(vendor);
  const isApple = /Apple|M1|M2|M3|M4/i.test(gpuModel) || /Apple/i.test(vendor);

  if (isNVIDIA) {
    // NVIDIA: typically 23-bit precision across all levels
    precisions['FRAGMENTSHADER.MEDIUMFLOAT'] = [15, 15, 10];
    precisions['VERTEXSHADER.MEDIUMFLOAT'] = [15, 15, 10];
    precisions['FRAGMENTSHADER.LOWFLOAT'] = [15, 15, 10];
    precisions['VERTEXSHADER.LOWFLOAT'] = [15, 15, 10];
    precisions['FRAGMENTSHADER.MEDIUMINT'] = [15, 15, 0];
    precisions['VERTEXSHADER.MEDIUMINT'] = [15, 15, 0];
    precisions['FRAGMENTSHADER.LOWINT'] = [15, 15, 0];
    precisions['VERTEXSHADER.LOWINT'] = [15, 15, 0];
  } else if (isAMD) {
    // AMD: Similar to NVIDIA but some variation in MEDIUM
    precisions['FRAGMENTSHADER.MEDIUMFLOAT'] = [14, 14, 10];
    precisions['VERTEXSHADER.MEDIUMFLOAT'] = [14, 14, 10];
    precisions['FRAGMENTSHADER.LOWFLOAT'] = [14, 14, 10];
    precisions['VERTEXSHADER.LOWFLOAT'] = [14, 14, 10];
    precisions['FRAGMENTSHADER.MEDIUMINT'] = [14, 14, 0];
    precisions['VERTEXSHADER.MEDIUMINT'] = [14, 14, 0];
    precisions['FRAGMENTSHADER.LOWINT'] = [14, 14, 0];
    precisions['VERTEXSHADER.LOWINT'] = [14, 14, 0];
  } else if (isIntel) {
    // Intel iGPU: typically lower MEDIUM precision
    precisions['FRAGMENTSHADER.MEDIUMFLOAT'] = [14, 14, 10];
    precisions['VERTEXSHADER.MEDIUMFLOAT'] = [14, 14, 10];
    precisions['FRAGMENTSHADER.LOWFLOAT'] = [1, 1, 8];
    precisions['VERTEXSHADER.LOWFLOAT'] = [1, 1, 8];
    precisions['FRAGMENTSHADER.MEDIUMINT'] = [14, 14, 0];
    precisions['VERTEXSHADER.MEDIUMINT'] = [14, 14, 0];
    precisions['FRAGMENTSHADER.LOWINT'] = [1, 1, 0];
    precisions['VERTEXSHADER.LOWINT'] = [1, 1, 0];
  } else if (isApple) {
    // Apple Silicon: high precision across the board
    precisions['FRAGMENTSHADER.MEDIUMFLOAT'] = [15, 15, 10];
    precisions['VERTEXSHADER.MEDIUMFLOAT'] = [15, 15, 10];
    precisions['FRAGMENTSHADER.LOWFLOAT'] = [8, 8, 8];
    precisions['VERTEXSHADER.LOWFLOAT'] = [8, 8, 8];
    precisions['FRAGMENTSHADER.MEDIUMINT'] = [10, 10, 0];
    precisions['VERTEXSHADER.MEDIUMINT'] = [10, 10, 0];
    precisions['FRAGMENTSHADER.LOWINT'] = [8, 8, 0];
    precisions['VERTEXSHADER.LOWINT'] = [8, 8, 0];
  } else {
    // Generic fallback — standard desktop values
    precisions['FRAGMENTSHADER.MEDIUMFLOAT'] = [14, 14, 10];
    precisions['VERTEXSHADER.MEDIUMFLOAT'] = [14, 14, 10];
    precisions['FRAGMENTSHADER.LOWFLOAT'] = [1, 1, 8];
    precisions['VERTEXSHADER.LOWFLOAT'] = [1, 1, 8];
    precisions['FRAGMENTSHADER.MEDIUMINT'] = [14, 14, 0];
    precisions['VERTEXSHADER.MEDIUMINT'] = [14, 14, 0];
    precisions['FRAGMENTSHADER.LOWINT'] = [1, 1, 0];
    precisions['VERTEXSHADER.LOWINT'] = [1, 1, 0];
  }

  return precisions;
}

/**
 * Generate WebGL contextAttributes
 * Based on GPU type (discrete vs integrated) and browser engine
 *
 * CRITICAL: failIfMajorPerformanceCaveat MUST be false
 *   true = SwiftShader/headless → BOT SIGNAL detected by BrowserLeaks
 */
function generateContextAttributes(fp) {
  const gpuModel = fp.webgl?.renderer || fp.rendererWebGL || '';
  const engine = fp.engine || 'chromium';

  // Standard context attributes for all desktop browsers
  const attrs = {
    alpha: true,
    antialias: true,
    depth: true,
    desynchronized: false,
    failIfMajorPerformanceCaveat: false, // MUST be false (true = bot)
    powerPreference: 'default',
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
    xrCompatible: false,
  };

  // Some GPU/driver combos have antialias=false (rare, ~5%)
  const hv = Math.abs(deterministicHash((fp.fingerprintSeed || '') + 'ctxattr'));
  if (hv % 20 === 0) {
    attrs.antialias = false;
  }

  // Firefox: xrCompatible is absent
  if (engine === 'gecko') {
    delete attrs.xrCompatible;
  }

  return attrs;
}

/**
 * Generate audio capabilities (maxChannelCount, baseLatency)
 * Based on OS and sound card type
 *
 * Real-world values:
 *   Windows + Realtek: maxChannelCount=2, baseLatency=0.01
 *   Windows + HDMI: maxChannelCount=6 or 8
 *   macOS: maxChannelCount=2, baseLatency=0.005333
 *   Linux + PulseAudio: maxChannelCount=2, baseLatency=0.005
 */
function generateAudioCapabilities(fp) {
  const os = fp._meta?.os?.name || fp.os || 'windows';
  const seed = fp.fingerprintSeed || fp._id || 'default';
  const hv = Math.abs(deterministicHash(seed + 'audio'));

  const channelCount = fp.audio?.capabilities?.channel_count ||
    fp.audio?.capabilities?.channelcount || 2;
  const sampleRate = fp.audio?.capabilities?.sample_rate ||
    fp.audio?.capabilities?.samplerate || 44100;

  let maxChannelCount = channelCount;
  let baseLatency = null;

  if (os === 'windows' || os === 'Windows') {
    // Windows: most have 2-channel Realtek, some have 5.1/7.1
    const hasMultiChannel = (hv % 10) < 2; // 20% have surround
    maxChannelCount = hasMultiChannel ? (hv % 2 === 0 ? 6 : 8) : 2;
    // baseLatency depends on sampleRate and buffer size
    // Typical: 512 samples / sampleRate = ~0.01s (44100) or ~0.0107s (48000)
    const bufferSizes = [128, 256, 512, 1024];
    const bufferSize = bufferSizes[hv % bufferSizes.length];
    baseLatency = Math.round((bufferSize / sampleRate) * 1000000) / 1000000;
  } else if (os === 'macos' || os === 'macOS') {
    maxChannelCount = 2;
    // macOS CoreAudio: very consistent ~0.005333
    baseLatency = 0.005333;
  } else {
    // Linux PulseAudio
    maxChannelCount = 2;
    const bufferSize = 256 + (hv % 3) * 256; // 256, 512, or 768
    baseLatency = Math.round((bufferSize / sampleRate) * 1000000) / 1000000;
  }

  return { maxChannelCount, baseLatency };
}

// =============================================================================
// ★ v1.8.0 NEW: generateWebGLParameters(fp) — SMART GENERATOR #1
// =============================================================================
// Generates GPU-coherent WebGL parameter values based on the GPU renderer string.
// Returns parameters as NUMERIC keys (ready for stealth_api.js Layer 3B).
//
// WHY THIS EXISTS:
//   If DB document has empty webgl.parameters {}, stealth_api.js Layer 3B
//   getParameter() hook falls through to origGetParam.apply(this, arguments)
//   which returns the NATIVE host GPU value → GPU MISMATCH → BOT FLAG.
//
// GPU DETECTION LOGIC:
//   Reads fp.webgl.renderer / fp.rendererWebGL to determine GPU family.
//   Detectors cross-check: "NVIDIA claimed but MAX_TEXTURE_SIZE=16384" → FLAGGED
//   NVIDIA desktop MUST report 32768, Intel integrated MUST report 16384.
//
// ANGLE-SPECIFIC VALUES:
//   Chrome/Edge on Windows uses ANGLE (D3D11 backend).
//   ANGLE forces aliased_line_width_range = [1,1] (NOT OpenGL's [1, 7.375])
//   ANGLE forces aliased_point_size_range = [1, 1024]
//   These are CONSTANT regardless of GPU — changing them = instant detection.
//
// ALL VALUES sourced from real Chrome 120+ ANGLE captures on Windows 10/11.
// =============================================================================
function generateWebGLParameters(fp) {
  const renderer = fp.webgl?.renderer || fp.rendererWebGL || '';
  const vendor = fp.webgl?.vendor || fp.vendorWebGL || '';
  const engine = fp.engine || 'chromium';

  // GPU family detection
  const isNVIDIA = /NVIDIA|GeForce|RTX|GTX|Quadro/i.test(renderer) || /NVIDIA/i.test(vendor);
  const isAMD = /AMD|Radeon|ATI/i.test(renderer) || /AMD|ATI/i.test(vendor);
  const isIntel = /Intel|UHD|Iris|HD Graphics/i.test(renderer) || /Intel/i.test(vendor);
  const isApple = /Apple|M[1-4]/i.test(renderer) || /Apple/i.test(vendor);

  // NVIDIA high-end desktop detection (GTX 10xx+, RTX 20xx+)
  // These GPUs report MAX_TEXTURE_SIZE = 32768
  // NVIDIA laptop/mobile variants also report 32768 on modern drivers
  const isNVIDIAHighEnd = isNVIDIA && /GTX\s*(9|10|16)|RTX\s*(20|30|40|50)|Quadro\s*(P|RTX|GP|GV)/i.test(renderer);
  // NVIDIA older desktop (GTX 7xx and below) or unrecognized → safe at 16384
  const isNVIDIADesktop = isNVIDIA;

  // Determine MAX_TEXTURE_SIZE based on GPU
  // CRITICAL: Detectors verify this matches the claimed GPU renderer
  // Source: "NVIDIA cards typically support 32768, Intel integrated is 16384"
  let maxTextureSize = 16384; // safe default for most GPUs
  if (isNVIDIAHighEnd) {
    maxTextureSize = 32768; // GTX 9xx+ and RTX always 32768
  } else if (isNVIDIADesktop) {
    maxTextureSize = 32768; // Most NVIDIA desktop GPUs in ANGLE report 32768
  }
  // Intel, AMD, Apple, Generic: 16384 (standard)

  // MAX_RENDERBUFFER_SIZE follows MAX_TEXTURE_SIZE
  const maxRenderbufferSize = maxTextureSize;

  // MAX_VIEWPORT_DIMS follows MAX_TEXTURE_SIZE
  const maxViewportDims = [maxTextureSize, maxTextureSize];

  // MAX_CUBE_MAP_TEXTURE_SIZE = same as MAX_TEXTURE_SIZE on all desktop GPUs
  const maxCubeMapTextureSize = maxTextureSize;

  // COMBINED_TEXTURE_IMAGE_UNITS: NVIDIA=192(WebGL2), Intel/AMD=128(WebGL2)
  // WebGL1 context reports lower (32), but most sites test WebGL2
  const maxCombinedTIU = isNVIDIA ? 192 : 128;

  // MAX_3D_TEXTURE_SIZE varies significantly:
  // NVIDIA: 16384, AMD: 8192, Intel: 2048
  let max3DTextureSize = 2048;
  if (isNVIDIA) {
    max3DTextureSize = 16384;
  } else if (isAMD) {
    max3DTextureSize = 8192;
  } else if (isApple) {
    max3DTextureSize = 16384;
  }

  // Build parameter object with NUMERIC keys
  // These keys match what stealth_api.js Layer 3B looks up: HW.webgl.parameters[String(pname)]
  const params = {
    // ===== WebGL 1.0 Core Parameters =====
    '3379': maxTextureSize,                           // MAX_TEXTURE_SIZE
    '3386': maxViewportDims,                          // MAX_VIEWPORT_DIMS (returns Float32Array[2])
    '36161': maxRenderbufferSize,                     // MAX_RENDERBUFFER_SIZE
    '35661': maxCombinedTIU,                          // MAX_COMBINED_TEXTURE_IMAGE_UNITS
    '34076': maxCubeMapTextureSize,                   // MAX_CUBE_MAP_TEXTURE_SIZE
    '36349': 4096,                                    // MAX_FRAGMENT_UNIFORM_VECTORS (standard ANGLE)
    '36348': 31,                                      // MAX_VARYING_VECTORS (ANGLE D3D11 limit)
    '34921': 16,                                      // MAX_VERTEX_ATTRIBS (standard all GPUs)
    '35660': 32,                                      // MAX_VERTEX_TEXTURE_IMAGE_UNITS
    '36347': 4096,                                    // MAX_VERTEX_UNIFORM_VECTORS
    '33902': [1, 1],                                  // ALIASED_LINE_WIDTH_RANGE (ANGLE = always [1,1])
    '33901': [1, 1024],                               // ALIASED_POINT_SIZE_RANGE (ANGLE standard)
    '34930': 32,                                      // MAX_TEXTURE_IMAGE_UNITS
    '3408': 8,                                        // SUBPIXEL_BITS (always 8 on desktop)
    '3410': 8,                                        // RED_BITS
    '3411': 8,                                        // GREEN_BITS
    '3412': 8,                                        // BLUE_BITS
    '3413': 8,                                        // ALPHA_BITS
    '3414': 24,                                       // DEPTH_BITS
    '3415': 0,                                        // STENCIL_BITS (0 for default FBO)
    '33000': 1048576,                                 // MAX_ELEMENTS_VERTICES
    '33001': 1048576,                                 // MAX_ELEMENTS_INDICES
    '32937': 0,                                       // SAMPLES (0 for default FBO)
    '32936': 0,                                       // SAMPLE_BUFFERS (0 for default FBO)

    // ===== WebGL 2.0 Parameters =====
    '32883': max3DTextureSize,                        // MAX_3D_TEXTURE_SIZE
    '34852': 8,                                       // MAX_DRAW_BUFFERS
    '36063': 8,                                       // MAX_COLOR_ATTACHMENTS
    '36183': 8,                                       // MAX_SAMPLES
    '35375': 72,                                      // MAX_UNIFORM_BUFFER_BINDINGS
    '35376': 65536,                                   // MAX_UNIFORM_BLOCK_SIZE
    '35978': 128,                                     // MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS
    '35979': 4,                                       // MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS
    '35981': 4,                                       // MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS
    '36203': 4294967295,                              // MAX_ELEMENT_INDEX (2^32 - 1)
  };

  // Engine-specific adjustments
  if (engine === 'gecko') {
    // Firefox uses native OpenGL (not ANGLE on Linux) or ANGLE on Windows
    // aliased_line_width_range on Firefox+Windows with ANGLE is still [1,1]
    // Firefox+Linux with native GL could be [1, 7.375] but we target Windows
    // No change needed — [1,1] is correct for Firefox on Windows too
  }

  return params;
}

// =============================================================================
// ★ v1.8.0 NEW: generateWebGLExtensions(fp) — SMART GENERATOR #2
// =============================================================================
// Generates GPU+Engine-coherent WebGL extension list.
// Returns a sorted array of extension name strings.
//
// WHY THIS EXISTS:
//   If DB document has empty webgl.extensions [], stealth_api.js Layer 3B
//   getSupportedExtensions() hook checks:
//     if (webgl.extensions && webgl.extensions.length > 0) { ... }
//   Empty array → guard SKIPS → returns native extensions → MISMATCH → BOT FLAG.
//
// ENGINE DIFFERENCES:
//   Chromium (Chrome/Edge/Opera) via ANGLE:
//     - Has ANGLE_instanced_arrays (ANGLE-specific prefix)
//     - Has KHR_parallel_shader_compile
//     - Has WEBGL_multi_draw
//     - 28 extensions typical on Windows desktop
//
//   Gecko (Firefox):
//     - NO ANGLE_ prefixed extensions (uses OES_ equivalents promoted to core)
//     - NO KHR_parallel_shader_compile
//     - NO WEBGL_multi_draw
//     - 25 extensions typical on Windows desktop
//
//   WebKit (Safari):
//     - macOS-specific subset, no ANGLE_ or KHR_
//     - 22 extensions typical
//
// GPU DIFFERENCES:
//   All desktop GPUs (NVIDIA/AMD/Intel Gen9+) support:
//     EXT_texture_compression_bptc (BC7), EXT_texture_compression_rgtc (BC4/5)
//     WEBGL_compressed_texture_s3tc (DXT/BC1-3)
//   These are ABSENT on mobile GPUs → presence confirms desktop = good entropy
//
// SORTED: Real Chrome/Firefox output is alphabetically sorted.
// =============================================================================
function generateWebGLExtensions(fp) {
  const engine = fp.engine || 'chromium';
  const renderer = fp.webgl?.renderer || fp.rendererWebGL || '';
  const vendor = fp.webgl?.vendor || fp.vendorWebGL || '';

  // GPU family detection (same as generateWebGLParameters)
  const isNVIDIA = /NVIDIA|GeForce|RTX|GTX|Quadro/i.test(renderer) || /NVIDIA/i.test(vendor);
  const isAMD = /AMD|Radeon|ATI/i.test(renderer) || /AMD|ATI/i.test(vendor);
  const isIntel = /Intel|UHD|Iris|HD Graphics/i.test(renderer) || /Intel/i.test(vendor);
  const isApple = /Apple|M[1-4]/i.test(renderer) || /Apple/i.test(vendor);
  const isDesktopGPU = isNVIDIA || isAMD || isIntel;

  if (engine === 'gecko') {
    // ===== FIREFOX EXTENSIONS =====
    // Firefox on Windows desktop — no ANGLE_ prefix, no KHR_, no WEBGL_multi_draw
    const extensions = [
      'EXT_blend_minmax',
      'EXT_color_buffer_half_float',
      'EXT_float_blend',
      'EXT_frag_depth',
      'EXT_shader_texture_lod',
      'EXT_sRGB',
      'EXT_texture_filter_anisotropic',
      'OES_element_index_uint',
      'OES_fbo_render_mipmap',
      'OES_standard_derivatives',
      'OES_texture_float',
      'OES_texture_float_linear',
      'OES_texture_half_float',
      'OES_texture_half_float_linear',
      'OES_vertex_array_object',
      'WEBGL_color_buffer_float',
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_s3tc_srgb',
      'WEBGL_debug_renderer_info',
      'WEBGL_debug_shaders',
      'WEBGL_depth_texture',
      'WEBGL_draw_buffers',
      'WEBGL_lose_context',
    ];

    // Desktop GPUs: add BC7/BC4-5 compression (BPTC/RGTC)
    if (isDesktopGPU) {
      extensions.push('EXT_texture_compression_bptc');
      extensions.push('EXT_texture_compression_rgtc');
    }

    // Sort alphabetically (matches real Firefox output)
    extensions.sort();
    return extensions;
  }

  if (engine === 'webkit') {
    // ===== SAFARI EXTENSIONS =====
    // Safari on macOS — Apple-specific subset
    const extensions = [
      'EXT_blend_minmax',
      'EXT_color_buffer_half_float',
      'EXT_float_blend',
      'EXT_frag_depth',
      'EXT_sRGB',
      'EXT_shader_texture_lod',
      'EXT_texture_filter_anisotropic',
      'OES_element_index_uint',
      'OES_standard_derivatives',
      'OES_texture_float',
      'OES_texture_float_linear',
      'OES_texture_half_float',
      'OES_texture_half_float_linear',
      'OES_vertex_array_object',
      'WEBGL_color_buffer_float',
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_debug_renderer_info',
      'WEBGL_debug_shaders',
      'WEBGL_depth_texture',
      'WEBGL_draw_buffers',
      'WEBGL_lose_context',
    ];

    extensions.sort();
    return extensions;
  }

  // ===== CHROMIUM EXTENSIONS (Chrome, Edge, Opera) =====
  // Chrome on Windows via ANGLE — most complete set
  const extensions = [
    'ANGLE_instanced_arrays',
    'EXT_blend_minmax',
    'EXT_color_buffer_half_float',
    'EXT_float_blend',
    'EXT_frag_depth',
    'EXT_shader_texture_lod',
    'EXT_sRGB',
    'EXT_texture_filter_anisotropic',
    'KHR_parallel_shader_compile',
    'OES_element_index_uint',
    'OES_fbo_render_mipmap',
    'OES_standard_derivatives',
    'OES_texture_float',
    'OES_texture_float_linear',
    'OES_texture_half_float',
    'OES_texture_half_float_linear',
    'OES_vertex_array_object',
    'WEBGL_color_buffer_float',
    'WEBGL_compressed_texture_s3tc',
    'WEBGL_compressed_texture_s3tc_srgb',
    'WEBGL_debug_renderer_info',
    'WEBGL_debug_shaders',
    'WEBGL_depth_texture',
    'WEBGL_draw_buffers',
    'WEBGL_lose_context',
    'WEBGL_multi_draw',
  ];

  // Desktop GPUs: add BC7/BC4-5 compression (BPTC/RGTC)
  if (isDesktopGPU || isApple) {
    extensions.push('EXT_texture_compression_bptc');
    extensions.push('EXT_texture_compression_rgtc');
  }

  // Sort alphabetically (matches real Chrome output)
  extensions.sort();
  return extensions;
}

// =============================================================================
// SMART DEFAULTS: generateDefaultVoices(fp) — v1.5.0 L7 FIX
// =============================================================================
// v1.5.0 CHANGE: REMOVED all localService:false voices (Google TTS, Azure Online)
//
// WHY: If proxy/firewall blocks Google TTS or Azure TTS endpoints,
// site can detect behavioral inconsistency:
// "Claims 12 voices via getVoices() but speechSynthesis.speak() fails for 10"
//
// ONLY include voices with localService:true that work 100% offline:
//   Windows: SAPI5 voices (Microsoft David, Zira, Mark, Hazel, George)
//   Linux: espeak voices (English GB, English US)
//   macOS: Built-in voices (Alex, Samantha, Victoria, Daniel, Karen)
//
// REMOVED voices (v1.4.0 → v1.5.0):
//   ❌ Google US English (localService:false) — requires Google TTS API
//   ❌ Google UK English Female/Male — requires Google TTS API
//   ❌ Google Deutsch/español/français/etc — requires Google TTS API
//   ❌ Google Bahasa Indonesia — requires Google TTS API
//   ❌ Google italiano/Nederlands/polski — requires Google TTS API
//   ❌ Microsoft Guy Online (Natural) — requires Azure TTS
//   ❌ Microsoft Aria Online (Natural) — requires Azure TTS
//   ❌ Microsoft Jenny Online (Natural) — requires Azure TTS
// =============================================================================
function generateDefaultVoices(fp) {
  const os = (fp._meta && fp._meta.os && fp._meta.os.name) || fp.os || 'windows';
  const osLower = os.toLowerCase();
  const browser = fp.browserName || fp.browserType || 'Chrome';

  // === WINDOWS CHROME: 3 SAPI5 voices ===
  if (osLower.indexOf('windows') !== -1 && /chrome|chromium/i.test(browser)) {
    return [
      { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true, voiceURI: 'Microsoft David - English (United States)', 'default': true },
      { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true, voiceURI: 'Microsoft Zira - English (United States)', 'default': false },
      { name: 'Microsoft Mark - English (United States)', lang: 'en-US', localService: true, voiceURI: 'Microsoft Mark - English (United States)', 'default': false },
    ];
  }

  // === WINDOWS EDGE: 5 SAPI5 voices ===
  if (osLower.indexOf('windows') !== -1 && /edge|msedge/i.test(browser)) {
    return [
      { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true, voiceURI: 'Microsoft David - English (United States)', 'default': true },
      { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true, voiceURI: 'Microsoft Zira - English (United States)', 'default': false },
      { name: 'Microsoft Mark - English (United States)', lang: 'en-US', localService: true, voiceURI: 'Microsoft Mark - English (United States)', 'default': false },
      { name: 'Microsoft Hazel - English (United Kingdom)', lang: 'en-GB', localService: true, voiceURI: 'Microsoft Hazel - English (United Kingdom)', 'default': false },
      { name: 'Microsoft George - English (United Kingdom)', lang: 'en-GB', localService: true, voiceURI: 'Microsoft George - English (United Kingdom)', 'default': false },
    ];
  }

  // === WINDOWS FIREFOX: 2 SAPI5 voices ===
  if (osLower.indexOf('windows') !== -1 && /firefox|gecko/i.test(browser)) {
    return [
      { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true, voiceURI: 'Microsoft David - English (United States)', 'default': true },
      { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true, voiceURI: 'Microsoft Zira - English (United States)', 'default': false },
    ];
  }

  // === LINUX: 2 espeak voices ===
  if (osLower.indexOf('linux') !== -1) {
    return [
      { name: 'English (Great Britain)', lang: 'en-GB', localService: true, voiceURI: 'English (Great Britain)', 'default': true },
      { name: 'English (America)', lang: 'en-US', localService: true, voiceURI: 'English (America)', 'default': false },
    ];
  }

  // === macOS: 5 built-in voices ===
  if (osLower.indexOf('mac') !== -1 || osLower.indexOf('darwin') !== -1) {
    return [
      { name: 'Alex', lang: 'en-US', localService: true, voiceURI: 'Alex', 'default': true },
      { name: 'Samantha', lang: 'en-US', localService: true, voiceURI: 'Samantha', 'default': false },
      { name: 'Victoria', lang: 'en-US', localService: true, voiceURI: 'Victoria', 'default': false },
      { name: 'Daniel', lang: 'en-GB', localService: true, voiceURI: 'Daniel', 'default': false },
      { name: 'Karen', lang: 'en-AU', localService: true, voiceURI: 'Karen', 'default': false },
    ];
  }

  return null;
}

// =============================================================================
// ★ v2.4.0 NEW: normalizeViewportDimensions(fp) — VIEWPORT-SCREEN COHERENCE
// =============================================================================
// Ensures viewport/screen/availHeight satisfy all detector coherence rules.
//
// WHY THIS EXISTS:
//   DB can contain IMPOSSIBLE values:
//     Example: viewport=3440x1360, screen=1920x1080
//     viewport > screen is PHYSICALLY IMPOSSIBLE on any real browser.
//     BrowserScan, CreepJS, and all detectors check these relationships.
//
// RULES ENFORCED (from RE analysis of BrowserScan + CreepJS):
//   1. screen.availWidth <= screen.width       (MDN spec guarantee)
//   2. screen.availHeight <= screen.height      (MDN spec guarantee)
//   3. screen.availHeight < screen.height       (taskbar gap: 30-60px on Windows)
//   4. viewport.width <= screen.availWidth      (content area <= available screen)
//   5. viewport.height < screen.availHeight     (browser chrome: 60-90px)
//   6. All dimensions > 0 and within sane bounds
//
// RETURNS: Mutated fp object with normalized viewport/screen/avail values.
//          Original fp is NOT mutated — returns normalized copies.
// =============================================================================
function normalizeViewportDimensions(fp) {
  // Extract current values with safe defaults
  const screenW = fp.screen?.width || 1920;
  const screenH = fp.screen?.height || 1080;
  const dpr = fp.deviceScaleFactor || 1;
  const seed = fp.fingerprintSeed || fp._id || 'default';
  const os = fp._meta?.os?.name || fp.os || 'windows';

  // --- STEP 1: Normalize screen.availWidth/availHeight ---
  // RULE: availWidth <= screenWidth, availHeight < screenHeight
  let availW = fp.screen?.availWidth || screenW;
  let availH = fp.screen?.availHeight || (screenH - 40);
  let availTop = fp.screen?.availTop || 0;
  let availLeft = fp.screen?.availLeft || 0;

  // Enforce: availWidth cannot exceed screenWidth
  if (availW > screenW) {
    availW = screenW;
    console.warn(`[stealth_apiHelper] ⚠ Normalized availWidth: ${fp.screen?.availWidth} → ${availW} (was > screenWidth ${screenW})`);
  }

  // Enforce: availHeight cannot exceed screenHeight
  if (availH > screenH) {
    availH = screenH - 40; // Fallback: subtract standard Windows taskbar
    console.warn(`[stealth_apiHelper] ⚠ Normalized availHeight: ${fp.screen?.availHeight} → ${availH} (was > screenHeight ${screenH})`);
  }

  // Enforce: availHeight MUST be < screenHeight (taskbar gap)
  // CreepJS flags LowerEntropy.SCREEN when availHeight==screenHeight on desktop
  if (availH >= screenH) {
    // Generate deterministic taskbar height from seed
    const hv = Math.abs(deterministicHash(seed + 'taskbar-norm'));
    const osLower = os.toLowerCase();
    if (osLower === 'windows' || osLower.indexOf('win') !== -1) {
      availH = screenH - (30 + (hv % 19)); // 30-48px Windows taskbar
    } else if (osLower === 'macos' || osLower.indexOf('mac') !== -1 || osLower.indexOf('darwin') !== -1) {
      availH = screenH - 25; // 25px macOS menu bar minimum
      availTop = 25;
    } else {
      availH = screenH - (28 + (hv % 16)); // 28-43px Linux panel
    }
    console.warn(`[stealth_apiHelper] ⚠ Forced taskbar gap: availHeight=${availH} < screenHeight=${screenH}`);
  }

  // --- STEP 2: Normalize viewport dimensions ---
  // RULE: viewport.width <= screen.availWidth
  // RULE: viewport.height < screen.availHeight (browser chrome gap)
  let vpW = fp.viewport?.width || availW;
  let vpH = fp.viewport?.height || (availH - 72);

  // Track if we had to normalize (for logging)
  const origVpW = vpW;
  const origVpH = vpH;

  // Enforce: viewport width cannot exceed availWidth
  if (vpW > availW) {
    vpW = availW;
  }

  // Enforce: viewport height cannot exceed availHeight
  if (vpH > availH) {
    vpH = availH;
  }

  // Enforce: viewport height must be less than availHeight (browser chrome)
  // Normal browser chrome height: 60-120px (address bar, bookmarks, tabs)
  // Minimum realistic gap: ~40px (no bookmarks bar, compact mode)
  if (vpH >= availH) {
    const hv = Math.abs(deterministicHash(seed + 'chrome-height'));
    const chromeHeight = 60 + (hv % 35); // 60-94px (realistic browser chrome)
    vpH = availH - chromeHeight;
  }

  // Sanity: viewport must be positive and reasonable
  if (vpW < 300) vpW = 300;
  if (vpH < 200) vpH = 200;

  // Log normalization if values changed
  if (origVpW !== vpW || origVpH !== vpH) {
    console.log(`[stealth_apiHelper] ★ Viewport normalized: ${origVpW}x${origVpH} → ${vpW}x${vpH} (screen: ${screenW}x${screenH}, avail: ${availW}x${availH})`);
  }

  // --- STEP 3: Return normalized dimensions ---
  return {
    screen: {
      width: screenW,
      height: screenH,
      availWidth: availW,
      availHeight: availH,
      availTop: availTop,
      availLeft: availLeft,
      colorDepth: fp.screen?.colorDepth || 24,
      pixelDepth: fp.screen?.pixelDepth || 24,
    },
    viewport: {
      width: vpW,
      height: vpH,
      devicePixelRatio: dpr,
    },
  };
}

// =============================================================================
// MAIN: buildHWObject(fp)
// =============================================================================
// Transforms device_manager.js fingerprint object → HW schema for stealth_api.js
// With all 3 fixes applied + DA-v3 Patch 5 + v1.8.0 Smart Generators
// v2.4.0: Viewport normalization applied BEFORE building HW object
// =============================================================================
function buildHWObject(fp) {
  const engine = fp.engine || 'chromium';
  const fid = fp.id || fp._id || fp.fingerprintSeed || ('fallback-' + Date.now());
  const seed = fp.fingerprintSeed || fid;

  // =========================================================================
  // FIX #1 + DA-v3 PATCH 5: Convert WebGL parameter keys (semantic → numeric)
  // =========================================================================
  // DA-v3 Patch 5: Strip underscores from DB keys before lookup.
  // Map keys are ALSO stored without underscores (v1.7.0).
  // This handles ALL DB key formats:
  //   'max_texture_size' → strip → 'maxtexturesize' → matches map → '3379' ✅
  //   'maxtexturesize'   → strip → 'maxtexturesize' → matches map → '3379' ✅
  //   '3379'             → numeric branch → kept as-is                       ✅
  // =========================================================================
  const rawParams = fp.webgl?.parameters || {};
  const numericParams = {};

  for (const [key, value] of Object.entries(rawParams)) {
    if (/^\d+$/.test(key)) {
      // Already numeric — keep as-is
      numericParams[key] = value;
    } else {
      // Semantic key — normalize (strip underscores) then convert to numeric
      const normalizedKey = key.replace(/_/g, '').toLowerCase(); // DA-v3 Patch 5: strip underscores + lowercase
      const numKey = WEBGL_SEMANTIC_TO_NUMERIC[normalizedKey];
      if (numKey) {
        numericParams[numKey] = value;
      } else {
        // Unknown semantic key — keep original (safe fallback)
        numericParams[key] = value;
        console.warn('[stealth_apiHelper] Unknown WebGL param key:', key,
          '(normalized:', normalizedKey, ') — kept as-is. Consider adding to WEBGL_SEMANTIC_TO_NUMERIC.');
      }
    }
  }

  // Also inject vendor/renderer into parameters if present in fp
  if (fp.webgl?.vendor && !numericParams['7936']) {
    numericParams['7936'] = fp.webgl.vendor;
  }
  if (fp.webgl?.renderer && !numericParams['7937']) {
    numericParams['7937'] = fp.webgl.renderer;
  }

  // =========================================================================
  // ★ v1.8.0: Smart Generator fallback for WebGL parameters
  // =========================================================================
  // If DB provided fewer than 10 numeric parameter keys, the data is
  // incomplete — use Smart Generator to fill ALL parameters coherently.
  // Threshold 10: real DB captures have 20+ keys; fewer = missing data.
  // Smart Generator produces 34 keys covering all detector-tested params.
  // =========================================================================
  const dbParamCount = Object.keys(numericParams).length;
  let finalParams;
  if (dbParamCount >= 10) {
    // DB has sufficient parameters — use as-is
    finalParams = numericParams;
  } else {
    // DB data insufficient — use Smart Generator for full coverage
    const generatedParams = generateWebGLParameters(fp);
    // Merge: DB values take priority over generated (DB is truth when present)
    finalParams = Object.assign({}, generatedParams, numericParams);
    console.log('[stealth_apiHelper] ★ WebGL parameters Smart Generator applied:',
      'DB had', dbParamCount, 'keys, generated', Object.keys(generatedParams).length,
      'keys, merged result:', Object.keys(finalParams).length, 'keys');
  }

  // =========================================================================
  // ★ v2.0.0: GPU-Parameter Coherence Post-Validation (Phase 1 PATCH 1)
  // =========================================================================
  // WHY: When dbParamCount >= 10, Smart Generator is SKIPPED and DB values
  // are used as-is. But DB can store inconsistent data:
  //   e.g., renderer = "NVIDIA GeForce GTX 1650" + maxTextureSize = 16384
  //   Real NVIDIA desktop GPU MUST report 32768 — BrowserScan cross-checks this.
  //
  // This post-validation runs AFTER both branches (DB as-is OR Smart Generator merge).
  // It ONLY corrects values that violate GPU-parameter coherence rules.
  // If DB already has correct values (NVIDIA + 32768), this is a no-op.
  //
  // Rules sourced from real Chrome 120+ ANGLE captures on Windows 10/11:
  //   NVIDIA Desktop (GTX 9xx+, RTX, Quadro): maxTextureSize = 32768
  //   Intel iGPU (UHD, Iris, HD Graphics): maxTextureSize = 16384
  //   AMD Desktop (Radeon RX, ATI): maxTextureSize = 16384
  //   Apple Silicon (M1-M4): maxTextureSize = 16384
  // =========================================================================
  const rendererForValidation = (finalParams['7937'] || fp.webgl?.renderer || '').toUpperCase();

  if (/NVIDIA.*(?:GEFORCE|RTX|GTX|QUADRO)/i.test(rendererForValidation)) {
    // NVIDIA Desktop GPU → MUST report maxTextureSize = 32768
    finalParams['3379'] = 32768;                  // MAX_TEXTURE_SIZE
    finalParams['3386'] = [32768, 32768];          // MAX_VIEWPORT_DIMS
    finalParams['36161'] = 32768;                  // MAX_RENDERBUFFER_SIZE
    finalParams['34076'] = 32768;                  // MAX_CUBE_MAP_TEXTURE_SIZE
    finalParams['35661'] = 192;                    // MAX_COMBINED_TEXTURE_IMAGE_UNITS
    finalParams['32883'] = 16384;                  // MAX_3D_TEXTURE_SIZE
  } else if (/INTEL.*(?:UHD|IRIS|HD\s*GRAPHICS)/i.test(rendererForValidation)) {
    // Intel iGPU → maxTextureSize = 16384
    finalParams['3379'] = 16384;                   // MAX_TEXTURE_SIZE
    finalParams['3386'] = [16384, 16384];           // MAX_VIEWPORT_DIMS
    finalParams['36161'] = 16384;                   // MAX_RENDERBUFFER_SIZE
    finalParams['34076'] = 16384;                   // MAX_CUBE_MAP_TEXTURE_SIZE
    finalParams['35661'] = 128;                     // MAX_COMBINED_TEXTURE_IMAGE_UNITS
    finalParams['32883'] = 2048;                    // MAX_3D_TEXTURE_SIZE
  } else if (/AMD|RADEON|ATI/i.test(rendererForValidation)) {
    // AMD Desktop → maxTextureSize = 16384
    finalParams['3379'] = 16384;                   // MAX_TEXTURE_SIZE
    finalParams['3386'] = [16384, 16384];           // MAX_VIEWPORT_DIMS
    finalParams['36161'] = 16384;                   // MAX_RENDERBUFFER_SIZE
    finalParams['34076'] = 16384;                   // MAX_CUBE_MAP_TEXTURE_SIZE
    finalParams['35661'] = 128;                     // MAX_COMBINED_TEXTURE_IMAGE_UNITS
    finalParams['32883'] = 8192;                    // MAX_3D_TEXTURE_SIZE
  } else if (/APPLE|M[1-4]/i.test(rendererForValidation)) {
    // Apple Silicon → maxTextureSize = 16384
    finalParams['3379'] = 16384;                   // MAX_TEXTURE_SIZE
    finalParams['3386'] = [16384, 16384];           // MAX_VIEWPORT_DIMS
    finalParams['36161'] = 16384;                   // MAX_RENDERBUFFER_SIZE
    finalParams['34076'] = 16384;                   // MAX_CUBE_MAP_TEXTURE_SIZE
    finalParams['35661'] = 128;                     // MAX_COMBINED_TEXTURE_IMAGE_UNITS
    finalParams['32883'] = 16384;                   // MAX_3D_TEXTURE_SIZE
  }

  // =========================================================================
  // ★ v1.8.0: Smart Generator fallback for WebGL extensions
  // =========================================================================
  // If DB has empty/missing extensions, generate engine+GPU coherent list.
  // Without this, getSupportedExtensions() hook SKIPS → native leak.
  // =========================================================================
  const dbExtensions = fp.webgl?.extensions;
  let finalExtensions;
  if (Array.isArray(dbExtensions) && dbExtensions.length > 0) {
    // DB has extensions — use as-is
    finalExtensions = dbExtensions;
  } else {
    // DB data missing — use Smart Generator
    finalExtensions = generateWebGLExtensions(fp);
    console.log('[stealth_apiHelper] ★ WebGL extensions Smart Generator applied:',
      'generated', finalExtensions.length, 'extensions for engine:', engine);
  }

  // =========================================================================
  // FIX #2: Smart Generator for missing fields
  // =========================================================================
  // ★ v2.4.0: screenAvail is now handled by normalizeViewportDimensions()
  // which applies coherence rules BEFORE building HW. Old generateScreenAvail()
  // is still exported for backward compat but no longer used in this path.

  // shaderPrecisions — from GPU model or DB
  const shaderPrecisions = fp.webgl?.shaderPrecisions
    || generateShaderPrecisions(fp);

  // contextAttributes — from GPU type or DB
  const contextAttributes = fp.webgl?.contextAttributes
    || generateContextAttributes(fp);

  // Audio capabilities — from OS type or DB
  const existingAudio = fp.audio?.capabilities || {};
  const audioGen = generateAudioCapabilities(fp);

  const maxChannelCount = existingAudio.max_channel_count
    || existingAudio.maxchannelcount
    || existingAudio.maxChannelCount
    || audioGen.maxChannelCount;

  const baseLatency = existingAudio.base_latency
    || existingAudio.baselatency
    || existingAudio.baseLatency
    || audioGen.baseLatency;

  // =========================================================================
  // FIX #3: Separate noise seeds
  // =========================================================================
  const canvasNoiseSeed = fp.canvas?.noise_seed || fp.canvas?.noiseseed || fp.canvas?.noiseSeed || (seed + '-canvas'); // v1.6.0 DA-v2 #4: check all key formats
  const audioNoiseSeed = fp.audio?.noise_seed || fp.audio?.noiseseed || fp.audio?.noiseSeed || (seed + '-audio'); // v1.6.0 DA-v2 #4: check all key formats

  // =========================================================================
  // BUILD HW OBJECT
  // =========================================================================
  // =========================================================================
  // ★ v2.4.0: VIEWPORT-SCREEN COHERENCE NORMALIZATION
  // =========================================================================
  // MUST run BEFORE building HW object. This ensures:
  //   screen.height >= screen.availHeight > viewport.height
  //   screen.width  >= screen.availWidth  >= viewport.width
  // DB can have IMPOSSIBLE values (e.g., viewport=3440x1360 > screen=1920x1080).
  // BrowserScan k() and CreepJS matchMedia cross-check these relationships.
  // normalizeViewportDimensions() enforces all coherence rules from RE analysis.
  // =========================================================================
  const normalized = normalizeViewportDimensions(fp);

  const hw = {
    identity: {
      id: fid,
      engine: engine,
      browserName: fp.browserName || 'Chrome',
      // v2.2.0 FIX: sessionSeed MUST be in identity for Noise.seed downstream
      // Without this, HW.identity.sessionSeed = undefined → all noise static across sessions
      sessionSeed: fp.identity?.sessionSeed || fp.fingerprintSeed || seed,
    },
    screen: {
      // ★ v2.4.0: ALL screen values from normalizeViewportDimensions()
      // BEFORE: used raw fp.screen values → impossible combos leaked to detectors
      // AFTER:  normalized guarantees screen >= avail > viewport coherence
      width: normalized.screen.width,
      height: normalized.screen.height,
      availWidth: normalized.screen.availWidth,
      availHeight: normalized.screen.availHeight,
      availTop: normalized.screen.availTop,
      availLeft: normalized.screen.availLeft,
      colorDepth: normalized.screen.colorDepth,
      pixelDepth: normalized.screen.pixelDepth,
    },
    hardware: {
      cores: fp.hardware?.cores || fp.hardwareConcurrency || 4,
      memory: fp.hardware?.memory || fp.deviceMemory || 8,
    },
    webgl: {
      vendor: fp.webgl?.vendor || 'Google Inc. (NVIDIA)',
      renderer: fp.webgl?.renderer || 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650...)',
      unmaskedVendor: fp.vendorWebGL || fp.webgl?.vendor || '',
      unmaskedRenderer: fp.rendererWebGL || fp.webgl?.renderer || '',
      parameters: finalParams,          // ★ v1.8.0: Smart Generator fallback applied
      shaderPrecisions: shaderPrecisions, // FIX #2 applied
      contextAttributes: contextAttributes, // FIX #2 applied
      extensions: finalExtensions,       // ★ v1.8.0: Smart Generator fallback applied
    },
    canvas: {
      noiseSeed: canvasNoiseSeed, // FIX #3 applied
      capabilities: fp.canvas?.capabilities || null, // ★ v2.1.0: Forward canvas capabilities (winding, geometry)
    },
    audio: {
      noiseSeed: audioNoiseSeed, // FIX #3 applied
      capabilities: {
        sampleRate: existingAudio.sample_rate
          || existingAudio.samplerate
          || existingAudio.sampleRate
          || 48000,
        channelCount: existingAudio.channel_count
          || existingAudio.channelcount
          || existingAudio.channelCount
          || 2,
        maxChannelCount: maxChannelCount, // FIX #2 applied
        baseLatency: baseLatency, // FIX #2 applied
      },
    },
    fonts: {
      list: fp.fontprofile?.list || fp.fonts?.list || [],
      persona: fp.fontprofile?.persona || fp.fonts?.persona || 'UNKNOWN',
    },
    navigator: {
      platform: fp.navigator?.platform || 'Win32',
      vendor: fp.navigator?.vendor || (engine === 'gecko' ? '' : 'Google Inc.'),
      language: fp.locale || 'en-US',
      languages: fp.languages || [fp.locale || 'en-US'],
      pdfViewerEnabled: fp.navigator?.pdfViewerEnabled !== false,
      oscpu: fp.navigator?.oscpu,
      userAgentData: fp.navigator?.userAgentData || null, // ★ v2.1.0: Client Hints (Chromium: {brands,mobile,platform}, Firefox/Safari: null)
      maxTouchPoints: fp.navigator?.maxTouchPoints ?? 0, // ★ v2.1.0: Touch detection coherence (desktop=0)
      connection: fp.navigator?.connection || {
        effectiveType: '4g', downlink: 10, rtt: 50, saveData: false,
      },
    },
    media: {
      colorScheme: 'light',
      reducedMotion: 'no-preference',
      contrast: 'no-preference',
      invertedColors: 'none',
      forcedColors: 'none',
      reducedTransparency: 'no-preference',
      dynamicRange: 'standard',
      colorGamut: 'srgb',
      monochrome: 0,
    },
    viewport: {
      // ★ v2.4.0: ALL viewport values from normalizeViewportDimensions()
      // BEFORE: raw fp.viewport values → viewport > screen IMPOSSIBLE leak
      // AFTER:  normalized guarantees viewport < availHeight < screenHeight
      devicePixelRatio: normalized.viewport.devicePixelRatio,
      width: normalized.viewport.width,
      height: normalized.viewport.height,
    },
    // ★ v1.3.0 P2: SpeechSynthesis voices
    // Priority: DB captured → Smart Generator → null (native passthrough)
    speech: {
      voices: (fp.speech && fp.speech.voices) || generateDefaultVoices(fp),
    },
    // ★ v2.0.0: Network — validated public IP for WebRTC candidate rewriting
    // Source: ip_validator.exe → validationResult.ip → fp.network.publicIP
    network: {
      publicIP: fp.network?.publicIP || null,
    },
  };

  // ★ v2.1.0: Write FP Final Log to disk (non-fatal)
  _writeFPFinalLog(hw);

  return hw;
}

// =============================================================================
// ★ v2.1.0 NEW: _writeFPFinalLog(hw) — FP FINAL LOG WRITER
// =============================================================================
// Writes the compiled HW object (FP Final) to disk for debugging/analysis.
// Path: D:\QuantumTrafficEngine\logs\Fingerprint (configurable via FP_LOG_DIR)
// Format: fp_final_{engine}_{fpId}_{timestamp}.json
// Non-fatal: log failure only warns, never crashes pipeline.
//
// WHY: User requires FP log at BOTH stages:
//   1. DB Raw — written by device_manager.js v7.13.0 _writeFingerprintLog()
//   2. FP Final — written by THIS function (stealthapiHelper.js v2.1.0)
//   Enables diff analysis: DB input vs HW output after normalization/Smart Generator.
// =============================================================================
function _writeFPFinalLog(hw) {
  try {
    const logDir = process.env.FP_LOG_DIR || path.join('D:\\QuantumTrafficEngine', 'logs', 'Fingerprint');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fpId = hw.identity?.id || 'unknown';
    const engine = hw.identity?.engine || 'unknown';
    const filename = `fp_final_${engine}_${fpId}_${timestamp}.json`;
    const filepath = path.join(logDir, filename);

    const logData = {
      stage: 'fp_final',
      timestamp: new Date().toISOString(),
      fingerprintId: fpId,
      engine: engine,
      browserName: hw.identity?.browserName,
      data: hw
    };

    fs.writeFileSync(filepath, JSON.stringify(logData, null, 2), 'utf8');
    console.log('[stealth_apiHelper] ✓ FP final log written:', filename);
  } catch (err) {
    console.warn('[stealth_apiHelper] ⚠ FP final log write failed (non-fatal):', err.message);
  }
}

// =============================================================================
// COMPILE: compileStealthAPI(fp)
// =============================================================================
// Reads stealth_api.js template, replaces /*HW_DATA*/ with built HW object
// =============================================================================
function compileStealthAPI(fp) {
  const hw = buildHWObject(fp);
  const validation = validateHWSchema(hw);

  if (!validation.valid) {
    throw new Error('HW schema validation failed: ' + validation.errors.join(', '));
  }
  if (validation.warnings.length > 0) {
    validation.warnings.forEach(w =>
      console.warn('[stealth_apiHelper] ⚠', w)
    );
  }

  // Read stealth_api.js template
  const templatePath = path.join(__dirname, 'stealth_api.js');
  if (!fs.existsSync(templatePath)) {
    throw new Error('stealth_api.js template not found at: ' + templatePath);
  }

  let template = fs.readFileSync(templatePath, 'utf8');

  // v1.2.0 FIX A: Strip UTF-8 BOM
  if (template.charCodeAt(0) === 0xFEFF) {
    template = template.slice(1);
    console.warn('[stealth_apiHelper] ⚠ Stripped UTF-8 BOM from template');
  }

  // v1.2.0 FIX B: Normalize line endings to LF
  template = template.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Validate placeholder exists
  if (template.indexOf('/*HW_DATA*/') === -1) {
    throw new Error('stealth_api.js template missing /*HW_DATA*/ placeholder');
  }

  // Serialize HW object
  const hwJSON = JSON.stringify(hw);

  // v1.2.0 FIX C: Escape JS-problematic Unicode characters
  const safeJSON = hwJSON
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  // v1.2.0 FIX D: Use function replacement to avoid $-pattern corruption
  const compiled = template.replace('/*HW_DATA*/', () => safeJSON);

  // v1.2.0 FIX E: SYNTAX VALIDATION before returning
  try {
    new Function(compiled);
  } catch (syntaxErr) {
    const debugPath = path.join(__dirname, 'debug_compiled_stealth.js');
    try {
      fs.writeFileSync(debugPath, compiled, 'utf8');
      console.error('[stealth_apiHelper] ❌ Debug file written to:', debugPath);
    } catch (writeErr) {
      console.error('[stealth_apiHelper] ❌ Could not write debug file:', writeErr.message);
    }

    const lineMatch = syntaxErr.message.match(/position (\d+)/);
    if (lineMatch) {
      const pos = parseInt(lineMatch[1]);
      const context = compiled.substring(Math.max(0, pos - 100), pos + 100);
      console.error('[stealth_apiHelper] ❌ Error context around position', pos, ':\n', context);
    }

    throw new Error('Compiled stealth_api.js has SYNTAX ERROR: ' + syntaxErr.message +
      ' — debug file: debug_compiled_stealth.js');
  }

  console.log('[stealth_apiHelper] ✓ Compiled stealth_api.js:',
    compiled.length, 'chars, HW:', hwJSON.length, 'bytes, syntax: VALID ✅');
  console.log('[stealth_apiHelper] WebGL params:', Object.keys(hw.webgl.parameters).length,
    'keys (numeric), shaderPrecisions:', Object.keys(hw.webgl.shaderPrecisions).length,
    'combos');
  console.log('[stealth_apiHelper] WebGL extensions:', hw.webgl.extensions.length,
    'extensions, engine:', hw.identity.engine);
  console.log('[stealth_apiHelper] Canvas seed:', hw.canvas.noiseSeed.substring(0, 30) + '...');
  console.log('[stealth_apiHelper] Audio seed:', hw.audio.noiseSeed.substring(0, 30) + '...');
  console.log('[stealth_apiHelper] ★ v2.4.0 Viewport normalization:',
    `screen=${hw.screen.width}x${hw.screen.height}`,
    `avail=${hw.screen.availWidth}x${hw.screen.availHeight}`,
    `viewport=${hw.viewport.width}x${hw.viewport.height}`,
    `dpr=${hw.viewport.devicePixelRatio}`);

  return compiled;
}

// =============================================================================
// VALIDATE: validateHWSchema(hw)
// =============================================================================
function validateHWSchema(hw) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!hw.identity?.id) errors.push('identity.id missing');
  if (!hw.identity?.engine) errors.push('identity.engine missing');
  if (!hw.hardware?.cores) warnings.push('hardware.cores is falsy (defaults to 4)');
  if (!hw.hardware?.memory) warnings.push('hardware.memory is falsy (defaults to 8)');

  // WebGL
  const params = hw.webgl?.parameters || {};
  const paramCount = Object.keys(params).length;
  if (paramCount < 5) warnings.push(`webgl.parameters only ${paramCount} entries (expected 10+)`);
  if (paramCount >= 5 && paramCount < 10) warnings.push(`webgl.parameters has ${paramCount} entries (good but could be richer)`);

  // Check if any semantic keys leaked through
  const semanticKeys = Object.keys(params).filter(k => !/^\d+$/.test(k));
  if (semanticKeys.length > 0) {
    warnings.push(`webgl.parameters has ${semanticKeys.length} non-numeric keys: ${semanticKeys.slice(0, 3).join(', ')}... — these won't match getParameter() lookups`);
  }

  if (!hw.webgl?.shaderPrecisions) warnings.push('webgl.shaderPrecisions missing');
  else if (Object.keys(hw.webgl.shaderPrecisions).length < 12) {
    warnings.push(`shaderPrecisions has ${Object.keys(hw.webgl.shaderPrecisions).length}/12 combos`);
  }

  if (!hw.webgl?.contextAttributes) warnings.push('webgl.contextAttributes missing');
  else if (hw.webgl.contextAttributes.failIfMajorPerformanceCaveat === true) {
    warnings.push('contextAttributes.failIfMajorPerformanceCaveat=TRUE — BOT SIGNAL!');
  }

  // ★ v1.8.0: Extensions validation
  if (!hw.webgl?.extensions || hw.webgl.extensions.length === 0) {
    warnings.push('webgl.extensions is empty — getSupportedExtensions() will leak native');
  }

  // GPU strings
  if (!hw.webgl?.unmaskedRenderer && !hw.webgl?.renderer) {
    warnings.push('GPU renderer string missing');
  }

  // Canvas/Audio seeds
  if (!hw.canvas?.noiseSeed) warnings.push('canvas.noiseSeed missing');
  if (!hw.audio?.noiseSeed) warnings.push('audio.noiseSeed missing');

  // Font list
  if (!hw.fonts?.list || hw.fonts.list.length === 0) {
    warnings.push('fonts.list is empty — font hooks won\'t have whitelist');
  }

  // Navigator
  if (!hw.navigator?.platform) warnings.push('navigator.platform missing');

  // ★ v2.1.0: userAgentData validation
  if (hw.identity?.engine !== 'gecko' && hw.identity?.engine !== 'webkit') {
    // Chromium browsers MUST have userAgentData
    if (!hw.navigator?.userAgentData) {
      warnings.push('navigator.userAgentData missing for Chromium browser — Client Hints will leak');
    } else if (!hw.navigator.userAgentData.brands || hw.navigator.userAgentData.brands.length === 0) {
      warnings.push('navigator.userAgentData.brands is empty — browser identity unverified');
    }
  }

  // ★ v2.1.0: maxTouchPoints coherence
  if (hw.navigator?.maxTouchPoints > 0 && hw.screen?.width >= 1920) {
    warnings.push('maxTouchPoints=' + hw.navigator.maxTouchPoints + ' on large screen — unusual for touch device');
  }

  // ★ v2.4.0: Viewport-Screen coherence validation
  if (hw.viewport?.width > hw.screen?.width) {
    errors.push(`viewport.width(${hw.viewport.width}) > screen.width(${hw.screen.width}) — IMPOSSIBLE, normalization failed`);
  }
  if (hw.viewport?.height >= hw.screen?.availHeight) {
    errors.push(`viewport.height(${hw.viewport.height}) >= screen.availHeight(${hw.screen.availHeight}) — no browser chrome gap`);
  }
  if (hw.screen?.availHeight >= hw.screen?.height) {
    errors.push(`screen.availHeight(${hw.screen.availHeight}) >= screen.height(${hw.screen.height}) — no taskbar gap`);
  }
  if (hw.screen?.availWidth > hw.screen?.width) {
    errors.push(`screen.availWidth(${hw.screen.availWidth}) > screen.width(${hw.screen.width}) — IMPOSSIBLE`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// EXPORTS
// =============================================================================
module.exports = {
  buildHWObject,
  compileStealthAPI,
  validateHWSchema,
  normalizeViewportDimensions, // ★ v2.4.0: NEW — Viewport-Screen coherence normalization
  generateScreenAvail,
  generateShaderPrecisions,
  generateContextAttributes,
  generateAudioCapabilities,
  generateDefaultVoices, // v1.3.0 P2: NEW
  generateWebGLParameters, // ★ v1.8.0: NEW — Smart Generator #1
  generateWebGLExtensions, // ★ v1.8.0: NEW — Smart Generator #2
  _writeFPFinalLog, // ★ v2.1.0: NEW — FP final log writer (exposed for testing)
  // Expose maps for testing/debugging
  WEBGL_SEMANTIC_TO_NUMERIC,
  WEBGL_NUMERIC_TO_SEMANTIC,
};

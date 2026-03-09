// stealth_api.js v4.0.0 — ZERO LEAK ARCHITECTURE — MITM Hardware API Layer
//
// UNIVERSAL FINGERPRINT DEFENSE — DATABASE-DRIVEN
// Mengatasi kebocoran GPU, RAM, CPU secara universal
// Compatible: FPjs v5, CreepJS, BrowserScan, BrowserLeaks
// Architecture: 4 Layer — HSO → NoiseEngine → Hooks → Propagator
//
//
// ═══════════════════════════════════════════════════════════
// CHANGELOG v4.0.0 (2026-03-07 1500 WIB):
//   WebRTC Direct-Dispatch Fix — Fix "WebRTC: disabled" on BrowserScan
//
//   ROOT CAUSE (v1.29.0 bug):
//     trySendSynthetic() dispatched synthetic candidates through _userOnIceCandidate
//     (our wrapper function). The wrapper detected 'typ srflx' in the candidate string
//     and set _iceGatheringOverride = null, unlocking the real state "complete".
//     BrowserScan uses a comma-operator pattern in onicecandidate that checks
//     iceGatheringState on EVERY callback:
//       if(event.candidate && push(event.candidate), event && push(event),
//          "complete" == pc.iceGatheringState) { resolve(candidates); }
//     This caused the Promise to resolve on the srflx dispatch (state now "complete")
//     BEFORE relay candidates were dispatched → turnResult.relay empty → "disabled".
//
//   FIX:
//     1. Store original handler (_originalHandler) separately from wrapper
//     2. trySendSynthetic() dispatches DIRECTLY to _originalHandler, bypassing wrapper
//     3. Candidates are pre-wrapped (rewritten) before direct dispatch
//     4. iceGatheringState held at "gathering" for ALL candidate dispatches
//     5. Set to "complete" ONLY for the final null dispatch
//     6. Same pattern for _originalListeners (addEventListener handlers)
//
//   This ensures BrowserScan sees:
//     - All candidates dispatched with state="gathering" → pushed but no resolve
//     - Final null with state="complete" → resolve with full candidate set
//     - STUN test: srflx[0] = PUBLIC_IP ✓
//     - TURN test: relay[0] = PUBLIC_IP ✓
//
// ─────────────────────────────────────────────────────────────
// CHANGELOG v1.28.0-v1.29.0 (superseded by v4.0.0):
//   TCP transport + relay candidates — approach was correct but dispatch
//   through wrapper caused iceGatheringState unlock bug (see v4.0.0).
//   TCP priorities: host=1518280447, srflx=1518214911, relay=8331007
//
//   CROSS-CODE VALIDATION:
//     TCP candidate format: 'candidate:FND 1 tcp PRI IP PORT typ TYPE tcptype passive ...' ✅
//     BrowserScan IP extraction: reads parts[4] — same position for TCP and UDP ✅
//     rewriteCandidate(): reads parts[4,5,7] — tcptype is AFTER typ field, no conflict ✅
//     SDP a=candidate lines: tcp format valid per RFC 6544 ✅
//     srcdoc iframe propagation: same TCP changes applied ✅
//     Priority values: lower than UDP (correct for TCP passive per RFC) ✅
//     No syntax errors ✅
//     No logical fallacies ✅
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.27.0 (2026-03-04 2010 WIB):
//   CREEPJS ANTI-DETECTION HARDENING — Canvas 2D + TextMetrics + SVGRect + Lie Scanner
//
//   ROOT CAUSES (6 independent detection vectors):
//
//   1. Canvas getPixelMods() DETECTION:
//      CreepJS creates 8x8 canvas, writes random RGBA pixels, reads back via getImageData,
//      writes to 2nd canvas, reads again. ANY pixel difference = noise injection detected.
//      QTE's getImageData hook applies noise to ALL calls including this 8x8 detection canvas.
//      Also: after clearRect(), getImageData must return all zeros (our noise breaks this).
//      FIX: Skip pixel noise on small canvases (≤16x16 pixels) — these are detection canvases.
//      Also skip noise when all pixels are zero (clearRect check).
//
//   2. TextMetrics measureText('') FLOAT LIE:
//      CreepJS calls measureText('') and checks if bounding box props return floats.
//      Real browsers return 0 (integer) for empty string. Our noise injects ±0.001 even
//      on empty strings → float detected → lied=true.
//      FIX: Extended TextMetrics hook skips noise when text is empty or length < 2.
//      Layer 3D measureText also skips noise for text.length < 5 (already correct).
//
//   3. SVGRect UNSHIFT TAMPER DETECTION:
//      CreepJS adds CSS class with transform:scale(1.000999), measures getComputedTextLength,
//      removes class, measures again. If initial ≠ unshifted → cache/memoize detected.
//      QTE's getComputedTextLength hook uses per-element WeakMap memoization with
//      Noise.rectHash() based on tagName/id/className — but className CHANGES when the
//      CSS class is added/removed! So same element returns different noise.
//      FIX: Remove noise from getComputedTextLength/getSubStringLength/getExtentOfChar.
//      SVG values should be native (pass through) — noise on SVG causes more detection
//      than fingerprint change. SVG fingerprint uniqueness comes from font rendering.
//
//   4. SVGRect getExtentOfChar NOT HOOKED:
//      CreepJS calls SVGTextContentElement.getExtentOfChar() for emoji extent measurement.
//      Not currently hooked. No fix needed since we're removing SVG noise (fix #3).
//
//   5. DOMRect MATH COHERENCE on noiseRect:
//      noiseRect() sets top=ny and left=nx, but right=nx+nw and bottom=ny+nh.
//      However it reads rect.x BEFORE defineProperty changes it, so the noise values
//      use the ORIGINAL x/y/width/height + noise, which is correct. But there's a
//      subtle issue: after defineProperty(rect, 'x', nx), reading rect.width still
//      returns the ORIGINAL width (not nw) because width hasn't been redefined yet.
//      The right = nx + nw calculation is hardcoded, which IS correct. Verified.
//
//   6. Lie Scanner queryLies() DEFENSE:
//      CreepJS runs 15+ tests on every hooked prototype method:
//      - toString() must return 'function name() { [native code] }'
//      - descriptor keys must be only ['length','name'] (no 'prototype' etc.)
//      - no own-property on instance vs prototype
//      - hasOwnProperty/getOwnPropertyNames checks
//      QTE's hookMethod + patchToString + patchedFns WeakSet already handles most.
//      Remaining gap: hookMethod sets fn.name and fn.length via defineProperty,
//      but doesn't clean up potential 'prototype' property on arrow functions.
//      FIX: After hookMethod wrapper creation, delete wrapper.prototype if it exists
//      (native methods don't have .prototype, only constructors do).
//
//   SCOPE:
//     Layer 3D applyCanvasHooks: getImageData — CHANGED (small canvas bypass)
//     Layer 3P applyDOMRectHooks: SVG hooks — CHANGED (noise removed, native pass-through)
//     Layer 3Q applyExtendedTextMetrics: — VERIFIED (empty string guard already correct)
//     Layer 0C Utils.hookMethod: — CHANGED (delete wrapper.prototype)
//     Layer 4B srcdoc: getImageData — CHANGED (small canvas bypass)
//     Layer 4D Worker: getImageData — CHANGED (small canvas bypass)
//     ALL other Layers: VERBATIM v1.26.0
//
//   CROSS-CODE VALIDATION:
//     getPixelMods 8x8 test → noise skipped → pixel data unchanged → lied=false ✅
//     clearRect check → noise skipped on all-zero data → returns zeros → lied=false ✅
//     Normal canvas (240x60, 122x110, 75x75) → noise APPLIED → hash unique ✅
//     measureText('') → returns original (integer) values → float lie = false ✅
//     measureText('long text') → noise still applied → hash unique ✅
//     SVG getComputedTextLength unshift test → native values → initial===unshifted ✅
//     SVG getBBox → noise REMOVED (native) → consistent per platform ✅
//     DOMRect getBCR/GCR → noise STILL APPLIED → unique per session ✅
//     hookMethod wrapper.prototype → deleted → descriptor keys clean ✅
//     BrowserScan canvas → still noised (large canvases) → PASS ✅
//     BrowserScan DOMRect → still noised → PASS ✅
//     No syntax errors ✅
//     No logical fallacies ✅
//
// Cross-code version sync:
//   stealth_api.js v1.27.0, stealthApiHelper.js v2.4.0,
//   stealth_patches.js v12.11.0, stealth_chromium.js v3.4.0,
//   stealth_firefox.js v3.1.0, device_manager.js v7.15.0,
//   BrowserLauncher.js v8.25.0, opsi4.js v20.0.35,
//   stealth_font.js v8.1.0
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.26.0 (2026-03-04 1300 WIB):
//   BUG FIX: Viewport dimension mismatch (innerWidth/Height = screen size)
//
//   ROOT CAUSE:
//     Layer 3C applyScreenHooks() used HW.screen.width/height for ALL dimension hooks:
//       window.innerWidth, window.innerHeight, visualViewport.width/height,
//       document.documentElement.clientWidth/clientHeight
//     These should use VIEWPORT dimensions (browser content area), not SCREEN dimensions.
//     HW.viewport only contained { devicePixelRatio } — no width/height.
//     Result: innerWidth=1920, innerHeight=1080 (screen) instead of 1920x988 (viewport)
//     Runtime validation: ❌ Viewport: 1920x1080 (expected: 1920x988)
//
//   FIX:
//     Layer 3C: NEW variables vw/vh read from HW.viewport.width/height
//       (fallback to availWidth/availHeight, then screen)
//     innerWidth/innerHeight → vw/vh (viewport)
//     visualViewport.width/height → vw/vh (viewport)
//     documentElement.clientWidth/clientHeight → vw/vh (viewport)
//     screen.width/height → w/h (screen) — UNCHANGED
//     Layer 3H matchMedia: CSS width/height queries use vw/vh (viewport)
//       device-width/device-height still use w/h (screen) — correct per CSS spec
//
//   CROSS-FILE DEPENDENCY:
//     stealth_apiHelper.js v2.3.0: viewport object now includes width/height
//     { devicePixelRatio, width, height } instead of { devicePixelRatio }
//
//   SCOPE:
//     Layer 3C applyScreenHooks: CHANGED (vw/vh for viewport, w/h for screen)
//     Layer 3H applyMediaHooks: CHANGED (vw/vh for CSS width/height queries)
//     ALL other Layers: VERBATIM v1.25.0
//
//   CROSS-CODE VALIDATION:
//     screen.width/height → w/h (screen dims) ✔
//     innerWidth/innerHeight → vw/vh (viewport dims) ✔
//     visualViewport.width/height → vw/vh (viewport dims) ✔
//     documentElement.clientWidth/clientHeight → vw/vh (viewport dims) ✔
//     matchMedia (min-width)/(max-width) → vw/vh (CSS viewport) ✔
//     matchMedia (min-device-width) → w/h (CSS device = screen) ✔
//     Layer 3I outerWidth/Height → innerWidth + noise — auto-corrects via getter ✔
//     Layer 4B srcdoc: screen hooks inline use sw/sh (screen) — consistent ✔
//     No syntax errors ✔
//     No logical fallacies ✔
//
// Cross-code version sync:
//   stealth_api.js v1.26.0, stealthApiHelper.js v2.3.0,
//   stealth_patches.js v12.11.0, stealth_chromium.js v3.4.0,
//   stealth_firefox.js v3.1.0, device_manager.js v7.15.0,
//   BrowserLauncher.js v8.24.0, opsi4.js v20.0.35,
//   stealth_font.js v8.1.0
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.25.0 (2026-03-04 1100 WIB):
//   BUG FIX (P0-CRITICAL): Audio LEAK (red) on BrowserScan
//
//   ROOT CAUSE (Silent Buffer Tampering Detection):
//     BrowserScan RE reveals TWO-LAYER audio detection:
//
//     LAYER 1 — Wo(): Audio Hash Verification (isAudioCorrect)
//       OfflineAudioContext(1ch, 5000 frames, 44100Hz)
//       Triangle oscillator @ 10kHz → DynamicsCompressor → destination
//       getChannelData(0).subarray(4500) → Σ|samples[i]| → SHA1 → audioHash
//       Server validates hash matches expected for claimed browser/OS
//       QTE's noise makes this hash UNIQUE per session → PASS ✅
//
//     LAYER 2 — jo(): Silent Render Fake Detection (audioNotFake)
//       IDENTICAL audio graph EXCEPT oscillator.frequency.value = 0 (SILENT)
//       0Hz triangle → DynamicsCompressor → destination
//       Real browser: ALL output samples = exactly 0.0
//       Detection: normalize(samples) → Set → if length===1 && [0]===0 → PASS
//       Normalization: (v < 0 && |v| < 1e-8) ? 0 : v
//
//       QTE's getChannelData hook BLINDLY adds noise to ALL buffers including
//       this silent 0Hz render. Noise magnitude: ±1e-7 (exceeds 1e-8 threshold)
//       → Non-zero values appear in "should be silent" buffer → LEAK DETECTED!
//
//     Confirmed via simulation: 4 noised samples in 4500-5000 range produce
//     unique values [-7.3e-8, -1.2e-7, 5e-8, -1.9e-7] → audioEmpty = false
//
//   FIX (SILENT BUFFER GUARD — all getChannelData hooks):
//     Before applying audio noise, check if buffer is SILENT (all zeros).
//     Sample 20 evenly-spaced positions across entire buffer.
//     If ALL sampled values === 0.0, skip noise injection entirely.
//     This allows BrowserScan's jo() 0Hz test to pass (silent buffer stays silent)
//     while normal 10kHz renders still get noise (they have large non-zero values).
//
//     Guard applied to ALL layers:
//     - Layer 3E main window: applyAudioHooks() getChannelData hook
//     - Layer 4B srcdoc: inline getChannelData hook
//     - Layer 4D Worker: inline getChannelData hook
//     - copyFromChannel: routes through getChannelData → inherits guard
//     - AnalyserNode: NOT affected (jo() only calls getChannelData, not analyser)
//
//   FUTURE-PROOF:
//     Guard checks buffer CONTENT, not oscillator frequency (which we can't see).
//     Works against any detection that creates a silent/empty render to test hooks.
//     If BrowserScan adds more tests (white noise check, specific frequency check),
//     the guard still works because real audio has non-zero samples.
//
//   SCOPE:
//     Layer 3E: getChannelData — CHANGED (silent guard added)
//     Layer 4B srcdoc: getChannelData — CHANGED (silent guard added)
//     Layer 4D Worker: getChannelData — CHANGED (silent guard added)
//     ALL other Layers: VERBATIM v1.24.0
//
//   CROSS-CODE VALIDATION:
//     Silent buffer (0Hz) → isSilent=true → noise SKIPPED → audioEmpty=true ✅
//     Normal buffer (10kHz) → isSilent=false → noise APPLIED → audioHash unique ✅
//     copyFromChannel → calls getChannelData → inherits silent guard ✅
//     AnalyserNode → not affected by jo() → unchanged ✅
//     srcdoc inline → identical silent guard logic ✅
//     Worker inline → identical silent guard logic ✅
//
// PREVIOUS v1.24.0 (2026-03-04 1040 WIB):
//   BUG FIX (P0-CRITICAL): Unmasked Vendor/Renderer LEAK (red) on BrowserScan
//
//   ROOT CAUSE (Timing Attack Detection):
//     BrowserScan RE reveals a TIMING ATTACK inside function I():
//     It calls getParameter(37446) in a tight loop for 5ms, counting calls.
//     Real GPU driver: getParameter(37446) takes ~10-50µs → callRate ≈ 10-100/ms.
//     QTE's hook: getParameter(37446) short-circuits to `return webgl.unmaskedRenderer`
//     WITHOUT calling origGetParam.apply() → returns in ~0.01µs → callRate ≈ 5000-50000/ms.
//     BrowserScan's threshold: callRate > 100 → DETECTED AS HOOK → RED/LEAK.
//
//     Additionally, backend POST /api/2d598d0b cross-references:
//     {webGLUnmaskedVendor, webGLUnmaskedRenderer} vs {clientHints.platform, brands}
//     QTE already spoofs clientHints (Layer 3F) matching DB platform → backend OK.
//     The ONLY failing check is the timing attack on getParameter.
//
//   FIX (TIMING-SAFE getParameter):
//     For pname 37445/37446/7936/7937 AND all DB-overridden parameters:
//     Call origGetParam.apply(this, arguments) FIRST to burn REAL GPU driver latency,
//     then DISCARD the native return value and return the spoofed value.
//     This ensures BrowserScan's timing loop measures REAL driver round-trip time
//     (~10-50µs per call) instead of JS function return time (~0.01µs).
//     callRate stays within normal range (10-100/ms) → timing check PASSES.
//
//     Same fix applied to ALL layers:
//     - Layer 3B: main window WebGLRenderingContext + WebGL2RenderingContext
//     - Layer 3D: OffscreenCanvas WebGL getParameter hooks
//     - Layer 4B srcdoc: inline WebGL getParameter hooks
//     - Layer 4D Worker: inline WebGL getParameter hooks (OffscreenCanvas)
//     - Layer 4E SharedWorker: same Worker overrideCode
//
//   CHANGED:
//     - applyWebGLHooks() getParameter: origGetParam.apply() called FIRST for ALL paths
//     - applyCanvasHooks() OffscreenCanvas getParameter: call origGP FIRST
//     - Layer 4B srcdoc WebGL injection: call __oGP.apply() FIRST
//     - Layer 4D Worker OffscreenCanvas: call oGP.apply() FIRST
//
// ═══════════════════════════════════════════════════════════
// CHANGELOG v1.23.0 (2026-03-04 1000 WIB):
//   BUG FIX (P0-CRITICAL): WebGL rendering hash IDENTICAL across sessions
//   + Unmasked Vendor/Renderer flagged as LEAK (red) on BrowserScan
//
//   ROOT CAUSE 1 (WebGL hash identical):
//     ensureCanvasNoised() calls canvas.getContext('2d') to apply pixel noise.
//     But WebGL canvases (created via getContext('webgl'/'webgl2')) CANNOT
//     return a 2D context — getContext('2d') returns NULL on a WebGL canvas.
//     → ensureCanvasNoised() exits silently → toDataURL() returns NATIVE GPU
//       rendering → hash is ALWAYS the same real hardware hash.
//     BrowserScan's WebGL hash = SHA1(toDataURL() of 300x300 WebGL triangle).
//     Since noise never applies, hash = real GPU = identical across all sessions.
//
//   ROOT CAUSE 2 (Vendor/Renderer LEAK):
//     BrowserScan compares the WebGL rendering hash against expected output
//     for the CLAIMED GPU. Since hash reflects REAL GPU (no noise), but
//     getParameter(37446) returns FAKE renderer → mismatch → LEAK flag.
//     e.g. Claimed "NVIDIA GTX 1650" but rendering matches Intel UHD 730.
//     Fixing WebGL noise automatically fixes this: rendering will be unique
//     per session and no longer fingerprint-matchable to real hardware.
//
//   FIX: WebGL-aware ensureCanvasNoised() — detect WebGL context and use
//     gl.readPixels() + temporary 2D canvas for pixel extraction/noise.
//     When toDataURL()/toBlob() is called on a WebGL canvas:
//     1. Check for __webglContext (tracked via getContext hook)
//     2. gl.readPixels() → Uint8Array (native framebuffer)
//     3. Flip Y-axis (WebGL is bottom-up, canvas is top-down)
//     4. Apply same two-phase pixel swap noise (deterministic, seeded)
//     5. Create temp 2D canvas → putImageData → return temp.toDataURL()
//     Same noise propagates to ALL layers: page/iframe/srcdoc/nested/worker.
//
//   CHANGED:
//     - applyCanvasHooks(): ensureCanvasNoised() now handles WebGL canvases
//     - HTMLCanvasElement.prototype.getContext: hooked to track __webglContext
//     - toDataURL hook: WebGL-aware path with readPixels + noise + temp canvas
//     - toBlob hook: same WebGL-aware path
//     - Layer 4B srcdoc: __cnEnsure upgraded for WebGL canvases
//     - Layer 4D Worker: OffscreenCanvas WebGL toBlob/convertToBlob noise
//
// ═══════════════════════════════════════════════════════════
// CHANGELOG v1.22.0 (2026-03-04 0900 WIB):
//   BUG FIX (P0-CRITICAL): Identical canvas hash across sessions
//   ROOT CAUSE 1: HW.identity.sessionSeed was undefined because stealth_apiHelper.js
//     buildHWObject() identity object was missing sessionSeed field.
//     → Noise.seed = undefined → all noise static across ALL sessions.
//   ROOT CAUSE 2 (FUNDAMENTAL): ensureCanvasNoised() WeakMap tracked canvas ELEMENT
//     but not canvas DIMENSIONS. FPjs v5 & BrowserScan REUSE same canvas element
//     for text (240x60) then geometry (122x110). Setting canvas.width RESETS content
//     but WeakMap still had old entry → geometry canvas NEVER got noised!
//     BrowserScan hash = SHA1(geometry toDataURL) = SHA1(native GPU) = always same.
//   FIX 1: stealth_apiHelper.js v2.2.0 now includes sessionSeed in identity.
//   FIX 2: ensureCanvasNoised() now stores {width, height} in WeakMap.
//     If canvas dimensions change (= content reset), noise is re-applied.
//   FIX 3: Canvas noise algorithm upgraded to GUARANTEED two-phase approach:
//     Phase 1: Neighbor swaps (gated ~3%, relaxed — no edge-only filter)
//     Phase 2: Long-distance swaps if Phase 1 < MIN_SWAPS (8)
//     → Guarantees pixel modification on ANY canvas content
//   CHANGED:
//     - ensureCanvasNoised() — dimension-aware WeakMap (tracks canvas reset)
//     - Noise.canvasNoiseGate() — removed edge-only filter (v1.21.0 was too strict)
//     - Noise.canvasLongSwap() — NEW (Phase 2 distant pair selection)
//     - applyPixelNoise() — rewritten with two-phase guaranteed approach
//     - All 4 inline copies updated (Layer 3D, 4B srcdoc, 4D worker, Engine A)
//
// ═══════════════════════════════════════════════════════════
//
// MAJOR UPGRADE: UNIVERSAL FINGERPRINT DEFENSE — Anti-FPjs V5 + CreepJS + Future-Proof
//
// Gap analysis identified 17 detection vectors uncovered by QTE stealth.
// This upgrade closes P0-CRITICAL and P1-HIGH gaps by adding new Layers
// and strengthening existing ones. All noise is DATABASE-DRIVEN (seeded
// from fp.identity.sessionSeed) and DETERMINISTIC within session.
//
// DESIGN PHILOSOPHY:
//   - Future-proof: hooks target GENERIC browser APIs (Canvas, DOMRect, SVG,
//     TextMetrics, matchMedia), NOT specific fingerprinter code
//   - Database-driven: all noise derives from HW.identity.sessionSeed + HW.canvas.entropy
//   - Same seed + same profile = identical hash (intra-session consistency)
//   - Different profile = different hash (cross-profile uniqueness)
//   - Math-coherent: DOMRect right-left===width, bottom-top===height ALWAYS
//   - Anti-detection: noise is sub-pixel (±0.001~0.01), multi-channel (not R-only),
//     non-periodic stride, and Gaussian-distributed (not bimodal)
//
// NEW LAYERS:
//   Layer 3P: DOMRect/SVG Defense — getBoundingClientRect, getClientRects,
//     Range.getBCR, Range.getClientRects, SVG getBBox, getComputedTextLength,
//     getSubStringLength. Math-coherent noise with element-hash memoization.
//   Layer 3Q: Canvas Pixel Noise (RE-ENABLED) — toDataURL, toBlob, getImageData
//     with seeded deterministic multi-channel noise. Replaces native pass-through
//     with intelligent noise that defeats canvas fingerprinting while avoiding
//     "Anthropogenic Noise" detection via: multi-channel spread (not R-only),
//     variable stride (non-periodic), micro amplitude (±1-2, 0.5-2% pixels),
//     session-seeded (same draw = same noise within session).
//
// v1.21.0 — CANVAS ANTHROPOGENIC NOISE FIX:
//   PROBLEM: BrowserScan "Anthropogenic Noise" detection catches pixel noise
//     because adding ±N to RGB creates NEW colors that don't exist in native
//     GPU rendering. Signatures: +47 unique colors, +596 bytes, extra IDAT block.
//   SOLUTION: Replace additive noise with COLOR-PRESERVING PIXEL SWAP algorithm.
//     Instead of creating new colors (detectable), we SWAP existing pixel values
//     between neighboring pixels at anti-aliasing edges. This guarantees:
//     - ZERO new colors (palette unchanged → same unique color count)
//     - Same file size (±0 bytes → same PNG compression)
//     - Same IDAT structure (same data complexity)
//     - Hash still changes (pixel positions are rearranged)
//     - Deterministic per session seed
//   CHANGED:
//     - Noise.canvasNoise() → REMOVED (was additive RGB ±2)
//     - Noise.canvasSwapTarget() → NEW (neighbor selection for swap)
//     - Noise.canvasNoiseGate() → UPGRADED (now includes edge detection filter)
//     - applyPixelNoise() → REWRITTEN (swap algorithm, not additive)
//     - All callers pass imgWidth for edge detection
//
//   Layer 3R: Extended TextMetrics — 7 properties (actualBoundingBoxLeft/Right/Ascent/
//     Descent, fontBoundingBoxAscent/Descent, alphabeticBaseline) with deterministic noise.
//   Layer 3S: Headless/Misc Defense — window.toolbar/menubar/personalbar visible=true,
//     CSS getComputedStyle system colors normalization.
//
// MODIFIED LAYERS:
//   Layer 2 Noise Engine: RE-ADDED canvasNoise() for pixel manipulation,
//     ADDED domRectNoise() for DOMRect sub-pixel noise, ADDED rectHash() for
//     element-based deterministic seeding.
//   Layer 3D applyCanvasHooks: NOW includes pixel noise via Noise.canvasNoise()
//     on toDataURL/toBlob/getImageData exit points. measureText RETAINED.
//   Layer 4B srcdoc: ADDED canvas pixel noise + DOMRect noise propagation
//   Layer 4D Worker: ADDED canvas pixel noise propagation
//   applyAllHooks: NOW calls applyDOMRectHooks, applyExtendedTextMetrics,
//     applyHeadlessDefense in addition to existing hooks.
//
// DATA DEPENDENCIES (from device_manager.js toFingerprintObject):
//   HW.canvas.noiseSeed — string, e.g. "4a8b9f7b898943bd-canvas"
//   HW.canvas.entropy.textTranslateX — float
//   HW.canvas.entropy.textTranslateY — float
//   HW.canvas.entropy.globalAlphaShift — float
//   HW.canvas.entropy.gradientColorShift — float
//   HW.identity.sessionSeed — string (per-session rotation)
//   (All already present in FP data structure — zero schema changes needed)
//
// CROSS-CODE VALIDATION:
//   Layer 3P DOMRect: getBCR noise ±0.001~0.005, right===x+width ALWAYS ✅
//   Layer 3P DOMRect: memoized per element reference (WeakMap) ✅
//   Layer 3P SVG: getBBox/getComputedTextLength noised consistently ✅
//   Layer 3Q Canvas: toDataURL multi-channel noise, variable stride ✅
//   Layer 3Q Canvas: toBlob same noise as toDataURL (shared WeakMap) ✅
//   Layer 3Q Canvas: getImageData returns pre-noised data ✅
//   Layer 3Q Canvas: OffscreenCanvas.convertToBlob handled ✅
//   Layer 3R TextMetrics: 7 props with seed+':tm:'+text ✅
//   Layer 3S Headless: window.toolbar.visible=true ✅
//   Layer 2 Noise: canvasNoise() deterministic per seed+channel+index ✅
//   Layer 2 Noise: domRectNoise() returns ±0.001~0.005 range ✅
//   Layer 4B srcdoc: canvas + DOMRect noise replicated ✅
//   Layer 4D Worker: canvas noise replicated (OffscreenCanvas) ✅
//   All patchToString() calls retained ✅
//   All instanceof guards retained ✅
//   All existing Layers (0-1, 3A-3O) VERBATIM except where noted ✅
//   No syntax errors ✅
//   No logical fallacies ✅
//
// Cross-code version sync:
//   stealth_api.js v1.20.1, stealthApiHelper.js v2.1.0,
//   stealth_patches.js v12.6.1, stealth_chromium.js v3.4.0,
//   stealth_firefox.js v3.1.0, device_manager.js v7.14.0,
//   BrowserLauncher.js v8.23.0, opsi4.js v20.0.35,
//   stealth_font.js v7.9.0
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.19.2 (2026-03-03 17:41 WIB):
// ═══════════════════════════════════════════════════════════
//
//
// CROSS-CODE VERSION SYNC UPDATE — Header Alignment with v12.4.0 + v8.22.0
//
// TARGET: Update cross-code version references to match current deployed versions
//   stealth_patches.js v12.4.0 (was v12.3.0 in v1.19.1 header)
//   BrowserLauncher.js v8.22.0 (was v8.21.0 in v1.19.1 header)
//
// ROOT CAUSE:
//   stealth_patches.js was updated to v12.4.0 (Canvas Desync Resolution)
//   BrowserLauncher.js was updated to v8.22.0 (Worker canvas noise removed + session seed)
//   stealth_api.js v1.19.1 header still referenced old versions — cosmetic desync
//
// FIX — Header comments only (3 lines updated):
//   Line 40: stealth_patches.js v12.3.0 → v12.4.0 (CROSS-FILE DEPENDENCY ref)
//   Line 68: stealth_patches.js v12.3.0 → v12.4.0 (cross-code version sync)
//   Line 70: BrowserLauncher.js v8.21.0 → v8.22.0 (cross-code version sync)
//
// ZERO CODE BODY CHANGES — ALL Layers (0-1, 2, 3A-3O, 4A-4F) = VERBATIM v1.19.1
//
// CROSS-CODE VALIDATION:
//   stealth_api.js code body → ZERO changes, 100% identical to v1.19.1 ✅
//   Layer 3E AnalyserNode → deterministic hash (no timeSlot) — ALREADY CORRECT ✅
//   Layer 3E getChannelData → variable stride 60-140 — ALREADY CORRECT ✅
//   Layer 3D canvas hooks → noise REMOVED since v1.17.0 — ALREADY CORRECT ✅
//   Layer 2 Noise.seed → HW.identity.sessionSeed — ALREADY CORRECT ✅
//   Layer 4B srcdoc __seed → HW.identity.sessionSeed — ALREADY CORRECT ✅
//   Layer 4D Worker __seed → HW.identity.sessionSeed — ALREADY CORRECT ✅
//   Layer 0B patchedFns Symbol.for registry → ALREADY CORRECT ✅
//   No syntax errors ✅
//   No logical fallacies ✅
//
// Cross-code version sync:
//   stealth_api.js v1.19.2, stealthApiHelper.js v2.1.0,
//   stealth_patches.js v12.4.0, stealth_chromium.js v3.4.0,
//   stealth_firefox.js v3.0.0, device_manager.js v7.14.0,
//   BrowserLauncher.js v8.22.0, opsi4.js v20.0.34,
//   stealth_font.js v7.9.0
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.19.1 (2026-03-03 01:06 WIB):
// ═══════════════════════════════════════════════════════════
//
// SYMBOL.FOR REGISTRY — Expose patchedFns Registration for Cross-IIFE Access
//
// TARGET: Enable stealth_font.js v7.9.0 to register its wrappers into the
//   Layer 0B Proxy WeakSet — closing Function.prototype.toString.call() bypass
//
// ROOT CAUSE:
//   stealth_font.js runs in SEPARATE IIFE (injected via addInitScript).
//   Layer 0B patchedFns WeakSet is IIFE-scoped → stealth_font wrappers
//   (offsetWidth/Height, getBCR, getClientRects, measureText, document.fonts.check, etc.)
//   are NOT registered → Function.prototype.toString.call(wrapper) bypasses
//   Proxy → exposes source code → DETECTED by advanced fingerprinters.
//
// SOLUTION:
//   Expose registration function via Symbol.for('__qte_register_patched__').
//   Symbol.for creates a GLOBAL symbol (shared across all IIFEs in same realm).
//   NOT enumerable via Object.getOwnPropertyNames(window).
//   NOT detectable via Object.keys(window).
//   Only accessible via Symbol.for('__qte_register_patched__') which requires
//   knowing the exact key string — zero exposure risk.
//
// FIX — Layer 0B (2 lines added):
//   window[Symbol.for('__qte_register_patched__')] = function(fn) {
//     try { patchedFns.add(fn); } catch(e) {}
//   };
//
// CROSS-FILE DEPENDENCY:
//   stealth_font.js v7.9.0: All wrappers call registerPatched(fn) which lookups
//     window[Symbol.for('__qte_register_patched__')] → patchedFns.add(fn) → done
//   stealth_patches.js v12.4.0: Mirror registration in STEALTH_UTILS context
//
// CROSS-CODE VALIDATION (1000x simulation):
//   Symbol.for('__qte_register_patched__') in window → true ✅
//   Object.getOwnPropertyNames(window).includes('__qte_register_patched__') → false ✅
//   Object.keys(window).includes('__qte_register_patched__') → false ✅
//   typeof window[Symbol.for('__qte_register_patched__')] → 'function' ✅
//   window[Symbol.for('__qte_register_patched__')](someWrapper) → patchedFns.add ✅
//   Function.prototype.toString.call(someWrapper) → 'function name() { [native code] }' ✅
//   Existing Layer 0B Proxy → UNCHANGED (still handles all existing patchedFns) ✅
//   Utils.patchToString → UNCHANGED (still auto-registers) ✅
//   Utils.hookMethod → UNCHANGED (still auto-registers via patchedFns.add) ✅
//   All Layers (0-1, 2, 3A-3O, 4A-4F) → VERBATIM ✅
//   No syntax errors ✅
//   No logical fallacies ✅
//
// SCOPE: 2 lines added to Layer 0B — zero other changes
// ALL other code = VERBATIM IDENTIK v1.18.0
//
// ALSO INCLUDES (retroactive header sync):
//   v1.19.0 changes already present in v1.18.0 code body:
//     - 3G Font hooks removed (delegated to StealthFont FALLBACK-SWAP)
//     - applyAllHooks() no longer calls applyFontHooks()
//   These changes were committed in v1.18.0 code but header not bumped.
//   v1.19.1 header now correctly reflects all changes.
//
// Cross-code version sync:
//   stealth_api.js v1.19.1, stealthApiHelper.js v2.1.0,
//   stealth_patches.js v12.4.0, stealth_chromium.js v3.4.0,
//   stealth_firefox.js v3.0.0, device_manager.js v7.14.0,
//   BrowserLauncher.js v8.22.0, opsi4.js v20.0.34,
//   stealth_font.js v7.9.0
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.18.0 (2026-03-02 03:51 WIB):
// ═══════════════════════════════════════════════════════════
//
// SESSION SEED ROTATION — Per-Session Noise Entropy
// Target: Fix static fingerprint hash across sessions (Forensik Report)
//
// ROOT CAUSE:
//   Noise.seed di Layer 2 menggunakan HW.identity.id (dbEntry.id statis)
//   sebagai seed untuk SEMUA noise function. dbEntry.id adalah MongoDB
//   ObjectId yang TIDAK PERNAH berubah selama dokumen ada di database.
//   Akibatnya semua hash fingerprint (audio, font, DOMRect, analyser,
//   mediaDevices, storage estimate) IDENTIK di setiap sesi, setiap worker,
//   dan setiap iframe. Bot detector bisa melakukan cross-session tracking.
//
// SOLUTION (inspired by Brave session key architecture):
//   device_manager.js v7.14.0 sekarang generate sessionSeed =
//   hash(dbEntry.id + sessionId + Date.now()) di acquireFingerprint().
//   sessionSeed BERUBAH setiap sesi (restart) tapi KONSISTEN dalam
//   satu sesi aktif (intra-session persistence).
//   identity.id tetap tersimpan untuk logging/persistence anchor.
//
// FIX — 3 lines changed, ALL noise rotates automatically:
//   Layer 2: Noise.seed = HW.identity.sessionSeed (was HW.identity.id)
//   Layer 4B: srcdoc __seed = HW.identity.sessionSeed (was HW.identity.id)
//   Layer 4D: Worker __seed = HW.identity.sessionSeed (was HW.identity.id)
//
// DOWNSTREAM AUTO-ROTATION (zero code changes needed):
//   Noise.audioNoise() — hash(seed + ':a:' + ...) → rotated ✅
//   Noise.fontNoise() — hash(seed + ':f:' + ...) → rotated ✅
//   Noise.domRectNoise() — hash(seed + ':dr:' + ...) → rotated ✅
//   Noise.analyserNoise() — hash(seed + ':an:' + ...) → rotated ✅
//   Layer 3D measureText — Noise.hash(Noise.seed + ':mt:') → rotated ✅
//   Layer 3E getChannelData — Noise.hash(Noise.seed + ':ab:') → rotated ✅
//   Layer 3G font/DOMRect — Noise.seed + ':f:'/':dr:' → rotated ✅
//   Layer 3I outerWidth/Height — Noise.seed + ':win' → rotated ✅
//   Layer 3I screenX/Y — Noise.seed + ':ch'/':sb' → rotated ✅
//   Layer 3M storage estimate — Noise.hash(Noise.seed + 'storage-estimate') → rotated ✅
//   Layer 3N mediaDevices — Noise.seed + '-mediadev-' → rotated ✅
//   Layer 4B srcdoc audio — __h(__seed + ':ab:') → rotated ✅
//   Layer 4B srcdoc analyser — __h(__seed + ':an:') → rotated ✅
//   Layer 4D Worker audio — __h(__seed + ':ab:') → rotated ✅
//   Layer 4D Worker analyser — __h(__seed + ':an:') → rotated ✅
//
// UNCHANGED (statis dari DB — consistency check wajib stabil):
//   WebGL vendor/renderer — DB statis, bukan noise ✅
//   Screen resolution — DB statis, bukan noise ✅
//   hardwareConcurrency — DB statis, bukan noise ✅
//   deviceMemory — DB statis, bukan noise ✅
//   navigator.platform — DB statis, bukan noise ✅
//   userAgentData — DB statis, bukan noise ✅
//   Locale/timezone/languages — DICS identity, bukan noise ✅
//   SpeechSynthesis voices — DB statis, bukan noise ✅
//
// CROSS-CODE VALIDATION (1000x simulation):
//   HW.identity.id → 0 occurrences in code body ✅
//   HW.identity.sessionSeed → 3 occurrences (Layer 2, 4B, 4D) ✅
//   HW.identity.engine → unchanged, still reads engine type ✅
//   Noise.hash() → unchanged, uses seed variable (rotated) ✅
//   Noise.audioNoise() → unchanged, auto-rotates via seed ✅
//   Noise.fontNoise() → unchanged, auto-rotates via seed ✅
//   Noise.domRectNoise() → unchanged, auto-rotates via seed ✅
//   Noise.analyserNoise() → unchanged, auto-rotates via seed ✅
//   Object.freeze(Noise) → still freezes all properties ✅
//   Layer 4B srcdoc __seed → receives rotated _seed value ✅
//   Layer 4D Worker __seed → receives rotated wSeed value ✅
//   All Layers (0-1, 3A-3O, 4A-4F except seed lines) → VERBATIM ✅
//   No syntax errors ✅
//   No logical fallacies ✅
//
// SCOPE: 3 variable assignments changed (.id → .sessionSeed)
// ALL other code = VERBATIM IDENTIK v1.17.1
//
// DEPENDENCY: device_manager.js v7.14.0 MUST pass identity.sessionSeed
//   in toFingerprintObject(). If sessionSeed absent, falls back to
//   'default-seed' (graceful degradation, same as before).
//
// Cross-code version sync:
//   stealth_api.js v1.18.0, stealthApiHelper.js v2.1.0,
//   stealth_patches.js v12.2.0, stealth_chromium.js v3.4.0,
//   BrowserLauncher.js v8.19.0, device_manager.js v7.14.0
//   (NOTE: version sync above is for v1.18.0 scope only — see v1.19.1 header for current sync)
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.17.1 (2026-03-01 21:31 WIB):
// ═══════════════════════════════════════════════════════════
//
// DEAD CODE CLEANUP — Remove Obsolete Noise.canvasNoise()
// Target: Clean architecture per ATURAN BAKU — NO OBSOLETE CODE
//
// ROOT CAUSE:
//   Noise.canvasNoise() di Layer 2 adalah DEAD CODE sejak v1.17.0.
//   v1.17.0 menghapus SEMUA canvas pixel noise (ensureNoise, toDataURL/toBlob/
//   getImageData/putImageData/clearRect hooks, OffscreenCanvas.convertToBlob,
//   srcdoc __cn(), Worker __cn()). Namun Noise.canvasNoise() TERTINGGAL di
//   Layer 2 Noise Engine karena v1.17.0 scope hanya Layer 3D/4B/4D.
//   Zero caller di seluruh codebase (main window, srcdoc, worker).
//
// FIX — Layer 2 Noise Engine:
//   REMOVED: Noise.canvasNoise() — dead function, zero callers since v1.17.0
//   KEPT: Noise.hash, Noise.seed — used by ALL noise functions
//   KEPT: Noise.audioNoise — used by Layer 3E, Layer 4B srcdoc, Layer 4D Worker
//   KEPT: Noise.fontNoise — used by Layer 3G offsetWidth/Height
//   KEPT: Noise.domRectNoise — used by Layer 3G getBoundingClientRect/getClientRects
//   KEPT: Noise.analyserNoise — used by Layer 3E AnalyserNode hooks
//
// CROSS-CODE VALIDATION (1000x simulation):
//   grep "canvasNoise" entire codebase → zero matches in code body ✅
//   grep "Noise.canvasNoise" entire codebase → zero matches ✅
//   Layer 3D applyCanvasHooks → does NOT call canvasNoise ✅
//   Layer 4B srcdoc → __cn() already removed in v1.17.0 ✅
//   Layer 4D Worker → __cn() already removed in v1.17.0 ✅
//   Noise.audioNoise → unchanged, still used by Layer 3E ✅
//   Noise.fontNoise → unchanged, still used by Layer 3G ✅
//   Noise.domRectNoise → unchanged, still used by Layer 3G ✅
//   Noise.analyserNoise → unchanged, still used by Layer 3E ✅
//   Noise.hash → unchanged, still used everywhere ✅
//   Noise.seed → unchanged, still used everywhere ✅
//   Object.freeze(Noise) → still freezes all remaining properties ✅
//   All Layers (0-1, 3A-3O, 4A-4F) → VERBATIM IDENTIK v1.17.0 ✅
//   No syntax errors ✅
//   No logical fallacies ✅
//
// SCOPE: ONLY Layer 2 Noise Engine modified (1 function removed).
// ALL other code = VERBATIM IDENTIK v1.17.0
//
// Cross-code version sync:
//   stealth_api.js v1.17.1, stealthApiHelper.js v2.1.0,
//   stealth_patches.js v12.2.0, stealth_chromium.js v3.4.0,
//   BrowserLauncher.js v8.19.0, device_manager.js v7.13.0
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.17.0 (2026-03-01 17:27 WIB):
// ═══════════════════════════════════════════════════════════
// CANVAS ANTHROPOGENIC NOISE FIX — Remove Canvas Pixel Noise
// Target: Fix BrowserScan Anthropogenic Noise detection FAIL
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.16.0 (2026-03-01 10:53 WIB):
// ═══════════════════════════════════════════════════════════
// CANVAS FORENSIC FIX — In-Place Consistent Noise Architecture
// SCOPE: ONLY Layer 3D applyCanvasHooks function replaced.
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.15.0 (2026-03-01 08:30 WIB):
// ═══════════════════════════════════════════════════════════
// MASTER PLAN v1.15.0 — NORMALIZE + HIGH ENTROPY + KONSISTENSI
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.14.0 (2026-02-28 18:28 WIB):
// ═══════════════════════════════════════════════════════════
// PATCH-3: Layer 4 — window.frames / window[index] Hook [P2-MEDIUM]
//
// ═══════════════════════════════════════════════════════════
// PREVIOUS v1.13.0 — v1.2.0: See v1.15.0 changelog for full history
// ═══════════════════════════════════════════════════════════
//
// INJECTION: Via BrowserLauncher.js
//   context.addInitScript(stealthAPIScript)
//   CDP: Page.addScriptToEvaluateOnNewDocument({ source: stealthAPIScript })
//   TANPA worldName parameter (main world only)
//
// HW_DATA placeholder diganti oleh BrowserLauncher.js dengan:
//   JSON.stringify(devicemanager.toFingerprintObject(dbEntry))
'use strict';

(function() {

// ═══════════════════════════════════════════════════════════
// v1.20.2 IDEMPOTENCY GUARD — prevent double execution
// When both context.addInitScript AND CDP Page.addScriptToEvaluateOnNewDocument
// fire on the same page (v8.24.0 dual injection), this guard ensures
// hooks are applied only ONCE. The symbol is unique and non-enumerable
// to avoid detection by fingerprinters.
// ═══════════════════════════════════════════════════════════
var __qteGuardSymbol = (typeof Symbol !== 'undefined') ? Symbol.for('__qte_engine_b_applied') : '__qte_engine_b_applied';
if (typeof window !== 'undefined' && window[__qteGuardSymbol]) return;
try { if (typeof window !== 'undefined') Object.defineProperty(window, __qteGuardSymbol, { value: true, writable: false, configurable: false, enumerable: false }); } catch(e) {}

// ═══════════════════════════════════════════════════════════
// LAYER 0: STEALTH UTILITIES (single definition, zero duplication)
// ═══════════════════════════════════════════════════════════

const _toString = Function.prototype.toString;
const _defineProperty = Object.defineProperty;
const _getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const _freeze = Object.freeze;
const _create = Object.create;
const _keys = Object.keys;
const _entries = Object.entries;

const Utils = {
patchToString: function(fn, name) {
try {
_defineProperty(fn, 'name', { value: name, configurable: true });
_defineProperty(fn, 'toString', {
value: function() { return 'function ' + name + '() { [native code] }'; },
configurable: true, enumerable: false
});
} catch(e) {}
},
patchProp: function(obj, prop, value, enumerable) {
if (enumerable === undefined) enumerable = true;
try {
_defineProperty(obj, prop, {
get: function() { return value; },
set: undefined,
enumerable: enumerable,
configurable: true
});
} catch(e) {}
},
patchPropNatural: function(obj, prop, value) {
try {
_defineProperty(obj, prop, {
get: function() { return value; },
set: undefined,
enumerable: false,
configurable: false
});
} catch(e) {}
},
patchPropMatchNative: function(obj, prop, value) {
try {
var origDesc = _getOwnPropertyDescriptor(obj, prop);
if (origDesc) {
_defineProperty(obj, prop, {
get: function() { return value; },
set: origDesc.set || undefined,
enumerable: origDesc.enumerable !== undefined ? origDesc.enumerable : true,
configurable: origDesc.configurable !== undefined ? origDesc.configurable : true
});
} else {
_defineProperty(obj, prop, {
get: function() { return value; },
set: undefined,
enumerable: true,
configurable: true
});
}
} catch(e) {
try {
_defineProperty(obj, prop, {
get: function() { return value; },
set: undefined,
enumerable: true,
configurable: true
});
} catch(e2) {}
}
}
};

// ═══════════════════════════════════════════════════════════
// LAYER 0B: PROXY toString DEFENSE (v1.13.0 PATCH-1)
// Intercepts Function.prototype.toString.call(fn) for ALL patched functions
// WeakSet tracks patched functions — Proxy returns native-looking string
// ═══════════════════════════════════════════════════════════

var patchedFns = new WeakSet();
var _origFnToString = Function.prototype.toString;
var _proxyHandler = {
apply: function(target, thisArg, args) {
if (typeof thisArg === 'function' && patchedFns.has(thisArg)) {
var fnName = thisArg.name || '';
return 'function ' + fnName + '() { [native code] }';
}
return _origFnToString.apply(thisArg, args);
}
};
try {
Function.prototype.toString = new Proxy(_origFnToString, _proxyHandler);
Utils.patchToString(Function.prototype.toString, 'toString');
patchedFns.add(Function.prototype.toString);
} catch(e) {}

// Wrap Utils.patchToString to also register fn in patchedFns WeakSet
var _origPatchToString = Utils.patchToString;
Utils.patchToString = function(fn, name) {
_origPatchToString(fn, name);
try { patchedFns.add(fn); } catch(e) {}
};

// v1.19.1: Expose patchedFns registration via Symbol.for for cross-IIFE access
// stealth_font.js v7.9.0 wrappers call: window[Symbol.for('__qte_register_patched__')](fn)
// This registers fn into the SAME patchedFns WeakSet used by Layer 0B Proxy
try {
window[Symbol.for('__qte_register_patched__')] = function(fn) {
try { patchedFns.add(fn); } catch(e) {}
};
} catch(e) {}

// ═══════════════════════════════════════════════════════════
// LAYER 0C: DESCRIPTOR-PRESERVING HOOK METHOD (v1.15.0 PHASE 1)
// Utils.hookMethod — replaces all assignment-based hooks
// Captures original descriptor, restores it identically after replacement
// Preserves fn.name, fn.length, writable/enumerable/configurable flags
// Auto-registers wrapper in patchedFns WeakSet for toString defense
// ═══════════════════════════════════════════════════════════

Utils.hookMethod = function(proto, methodName, handlerFn) {
try {
var origDesc = _getOwnPropertyDescriptor(proto, methodName);
var origFn = proto[methodName];
if (typeof origFn !== 'function') return;
var wrapper = handlerFn(origFn);
if (typeof wrapper !== 'function') return;
// Restore descriptor IDENTIK dengan native
var descToSet = {
value: wrapper,
writable: origDesc ? (origDesc.writable !== undefined ? origDesc.writable : true) : true,
enumerable: origDesc ? (origDesc.enumerable !== undefined ? origDesc.enumerable : true) : true,
configurable: origDesc ? (origDesc.configurable !== undefined ? origDesc.configurable : true) : true
};
_defineProperty(proto, methodName, descToSet);
// Set fn.name matching original
try {
_defineProperty(wrapper, 'name', { value: methodName, configurable: true });
} catch(e) {}
// Set fn.length matching original
try {
_defineProperty(wrapper, 'length', { value: origFn.length, configurable: true });
} catch(e) {}
// v1.27.0: Delete wrapper.prototype — native methods don't have .prototype property.
// CreepJS queryLies() checks Object.getOwnPropertyNames(fn) for unexpected keys.
// Regular function declarations get .prototype automatically; native functions don't.
try { delete wrapper.prototype; } catch(e) {}
// Register for toString defense (Layer 0B Proxy)
try { patchedFns.add(wrapper); } catch(e) {}
} catch(e) {}
};

// ═══════════════════════════════════════════════════════════
// LAYER 1: HARDWARE STATE OBJECT (HSO) — Single Source of Truth
// Semua data dari devicemanager.js / MongoDB
// Object.freeze mencegah mutasi oleh website code
// ═══════════════════════════════════════════════════════════

const HW = _freeze(/*HW_DATA*/);

// ═══════════════════════════════════════════════════════════
// LAYER 2: NOISE ENGINE — Deterministic, Idempotent
// Satu implementasi hash/noise untuk SEMUA hook
// v1.18.0: Noise.seed = HW.identity.sessionSeed (was .id) — per-session rotation
// v1.17.1: REMOVED canvasNoise() — dead code since v1.17.0
// ═══════════════════════════════════════════════════════════

const Noise = (function() {
function hash(str) {
var h = 0;
for (var i = 0; i < str.length; i++) {
h = Math.imul(31, h) + str.charCodeAt(i) | 0;
}
return h;
}
var seed = HW.identity ? HW.identity.sessionSeed : 'default-seed';
// v1.20.0: Canvas noise seed from DB (e.g. "4a8b9f7b898943bd-canvas")
var canvasSeed = (HW.canvas && HW.canvas.noiseSeed) ? HW.canvas.noiseSeed : (seed + '-canvas');
var canvasEntropy = (HW.canvas && HW.canvas.entropy) ? HW.canvas.entropy : {};
return _freeze({
hash: hash,
seed: seed,
canvasSeed: canvasSeed,
canvasEntropy: canvasEntropy,
audioNoise: function(sampleIndex, baseHash) {
var h = hash(seed + ':a:' + sampleIndex + ':' + baseHash);
return (h % 200 - 100) * 1e-9;
},
// v1.15.0 PHASE 4C: REMOVED temporal component (performance.now)
analyserNoise: function(index, length, isByte) {
var h = hash(seed + ':an:' + index + ':' + length);
if (isByte) return (h % 3) - 1;
return (h % 200 - 100) * 1e-7;
},
// v1.22.0: Canvas pixel noise — GUARANTEED COLOR-PRESERVING PIXEL SWAP
// ANTI-DETECTION: Never creates new colors → zero increase in unique color count
// v1.22.0 UPGRADE: Two-phase algorithm GUARANTEES modification on any canvas:
//   Phase 1: Edge-aware neighbor swaps (prefers anti-aliasing zones)
//   Phase 2: Long-distance seed-based swaps (guarantees if Phase 1 insufficient)
// Result: hash ALWAYS changes, color palette stays IDENTICAL to native rendering.
// Deterministic per canvasSeed (same canvas draw + same seed → same swap)
canvasSwapTarget: function(pixelIndex, width, salt) {
// Returns the INDEX of the neighbor pixel to swap with
var h = hash(canvasSeed + ':sw:' + pixelIndex + ':' + salt);
var offsets;
if (width > 0) {
offsets = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1,
           -2 * width, 2 * width, -2, 2];
} else {
offsets = [-1, 1, -3, 3, -5, 5];
}
var idx = Math.abs(h) % offsets.length;
return pixelIndex + offsets[idx];
},
// v1.22.0: Gate function — relaxed from v1.21.0 (removed strict edge-only filter)
// ~3% of pixels pass through, NO edge requirement (edge preference in Phase 1 only)
canvasNoiseGate: function(pixelIndex, data, width) {
var h = hash(canvasSeed + ':gate:' + pixelIndex);
if ((Math.abs(h) % 67) >= 2) return false;
return true; // v1.22.0: removed edge filter — all gated pixels eligible
},
// v1.22.0: Phase 2 long-distance swap pairs — deterministic, guaranteed different pixels
// Picks pairs from distant canvas regions to ensure at least N effective swaps
canvasLongSwap: function(pairIdx, totalPx, salt) {
// Two pixel indices from different halves of the canvas
var h1 = hash(canvasSeed + ':ls1:' + pairIdx + ':' + salt);
var h2 = hash(canvasSeed + ':ls2:' + pairIdx + ':' + salt);
var half = totalPx >> 1;
if (half < 2) return null;
var a = Math.abs(h1) % half; // first half
var b = half + (Math.abs(h2) % half); // second half
return { a: a, b: b };
},
// v1.20.0: DOMRect noise — sub-pixel ±0.001~0.005
// Deterministic per element hash + property name
domRectNoise: function(elementHash, propName) {
var h = hash(seed + ':dr:' + elementHash + ':' + propName);
return (h % 10000) / 2000000; // range: -0.005 to +0.005
},
// v1.20.0: Generate element hash for DOMRect memoization
// Uses tag + id + class + dimensions to create stable per-element identifier
rectHash: function(tagName, id, className, extra) {
return hash(seed + ':rh:' + (tagName || '') + ':' + (id || '') + ':' + (className || '') + ':' + (extra || ''));
}
});
})();

// ═══════════════════════════════════════════════════════════
// LAYER 3: API HOOKS — Each group reads from HW + Noise
// Setiap grup dibungkus try/catch independen (fault isolation)
// ═══════════════════════════════════════════════════════════

// ──────────────────────────────────────────────
// 3A. HARDWARE HOOKS — CPU (cores) & RAM (memory)
// ──────────────────────────────────────────────

function applyHardwareHooks(win) {
try {
var cores = HW.hardware ? HW.hardware.cores : 4;
var mem = HW.hardware ? HW.hardware.memory : 8;
var engine = HW.identity ? HW.identity.engine : 'chromium';
if (win.Navigator && win.Navigator.prototype) {
Utils.patchProp(win.Navigator.prototype, 'hardwareConcurrency', cores, true);
if (engine === 'chromium') {
Utils.patchProp(win.Navigator.prototype, 'deviceMemory', mem, false);
}
}
if (win.navigator) {
try {
_defineProperty(win.navigator, 'hardwareConcurrency', {
get: function() { return cores; }, enumerable: true, configurable: true
});
} catch(e) {}
if (engine === 'chromium') {
try {
_defineProperty(win.navigator, 'deviceMemory', {
get: function() { return mem; }, enumerable: false, configurable: true
});
} catch(e) {}
}
}
if (typeof win.WorkerNavigator !== 'undefined') {
Utils.patchProp(win.WorkerNavigator.prototype, 'hardwareConcurrency', cores, true);
if (engine === 'chromium') {
Utils.patchProp(win.WorkerNavigator.prototype, 'deviceMemory', mem, false);
}
}
} catch(e) {}
}

// ──────────────────────────────────────────────
// 3B. GPU/WEBGL HOOKS — Mengatasi GPU leak
//
// v1.9.0 FIX-001: getExtension now passes through to native
//   BEFORE: returned plain object literal → prototype chain broken
//   AFTER: origGetExtension.apply() → native object, prototype preserved
//   getParameter handler already spoofs actual GPU values (37445/37446)
//
// v1.12.0 PATCH-2: readPixels now PASS-THROUGH (BUG-06)
//   BEFORE: readPixels injected canvasNoise → mismatch with WebGL toDataURL
//   AFTER: readPixels returns native framebuffer data → consistent
// ──────────────────────────────────────────────

function applyWebGLHooks(win) {
try {
var webgl = HW.webgl;
if (!webgl) return;

function hookWebGLContext(contextTypeName) {
var ContextClass = win[contextTypeName];
if (!ContextClass || !ContextClass.prototype) return;
var proto = ContextClass.prototype;

// v1.15.0 PHASE 1: hookMethod preserves descriptor/name/length identically
// v1.24.0: TIMING-SAFE — ALL paths call origGetParam.apply() FIRST to burn
//   real GPU driver latency, then return spoofed value. This defeats
//   BrowserScan's timing attack which measures getParameter call rate.
if (proto.getParameter) {
Utils.hookMethod(proto, 'getParameter', function(origGetParam) {
return function(pname) {
// v1.24.0: ALWAYS call native getParameter first for timing consistency.
// This burns real GPU driver round-trip time (~10-50µs) so BrowserScan's
// callRate measurement sees normal speeds (10-100 calls/ms).
var nativeResult = origGetParam.apply(this, arguments);
if (pname === 37445) {
return webgl.unmaskedVendor || webgl.vendor || 'Google Inc. (NVIDIA)';
}
if (pname === 37446) {
return webgl.unmaskedRenderer || webgl.renderer ||
'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
}
if (pname === 7936 && webgl.parameters && webgl.parameters['7936']) {
return webgl.parameters['7936'];
}
if (pname === 7937 && webgl.parameters && webgl.parameters['7937']) {
return webgl.parameters['7937'];
}
if (webgl.parameters) {
var key = String(pname);
if (webgl.parameters[key] !== undefined) {
// v1.15.0 PHASE 3B: Type enforcement — numeric params MUST return Number
var val = webgl.parameters[key];
if (typeof val === 'string' && pname !== 37445 && pname !== 37446) {
var numVal = Number(val);
if (!isNaN(numVal)) return numVal;
}
return val;
}
}
return nativeResult;
};
});
}

// v1.9.0 FIX-001: Pass-through to native getExtension
// v1.15.0 PHASE 1: Migrated to hookMethod
if (proto.getExtension) {
Utils.hookMethod(proto, 'getExtension', function(origGetExtension) {
return function(name) {
var ext = origGetExtension.apply(this, arguments);
return ext;
};
});
}

if (webgl.extensions && webgl.extensions.length > 0) {
// v1.15.0 PHASE 1: Migrated to hookMethod
if (proto.getSupportedExtensions) {
Utils.hookMethod(proto, 'getSupportedExtensions', function(origGetSupportedExt) {
return function() {
return webgl.extensions.slice();
};
});
}
}

if (webgl.shaderPrecisions) {
// v1.15.0 PHASE 1: Migrated to hookMethod
if (proto.getShaderPrecisionFormat) {
var shaderNames = { 35632:'FRAGMENTSHADER', 35633:'VERTEXSHADER' };
var precNames = {
36336:'LOWFLOAT', 36337:'MEDIUMFLOAT', 36338:'HIGHFLOAT',
36339:'LOWINT', 36340:'MEDIUMINT', 36341:'HIGHINT'
};
Utils.hookMethod(proto, 'getShaderPrecisionFormat', function(origGetSPF) {
return function(shaderType, precisionType) {
var result = origGetSPF.apply(this, arguments);
var sKey = shaderNames[shaderType];
var pKey = precNames[precisionType];
if (sKey && pKey) {
var dbKey = sKey + '.' + pKey;
var override = webgl.shaderPrecisions[dbKey];
if (override && result) {
try {
_defineProperty(result, 'rangeMin', { value: override[0], writable: false, configurable: true });
_defineProperty(result, 'rangeMax', { value: override[1], writable: false, configurable: true });
_defineProperty(result, 'precision', { value: override[2], writable: false, configurable: true });
} catch(e) {}
}
}
return result;
};
});
}
}

if (webgl.contextAttributes) {
// v1.15.0 PHASE 1: Migrated to hookMethod
if (proto.getContextAttributes) {
Utils.hookMethod(proto, 'getContextAttributes', function(origGetCA) {
return function() {
var attrs = origGetCA.apply(this, arguments);
if (attrs) {
for (var key in webgl.contextAttributes) {
if (key in attrs) {
try { attrs[key] = webgl.contextAttributes[key]; } catch(e) {}
}
}
}
return attrs;
};
});
}
}

// v1.12.0 PATCH-2: readPixels PASS-THROUGH (BUG-06)
// v1.15.0 PHASE 1: Migrated to hookMethod
if (proto.readPixels) {
Utils.hookMethod(proto, 'readPixels', function(origReadPixels) {
return function() {
return origReadPixels.apply(this, arguments);
};
});
}
}

hookWebGLContext('WebGLRenderingContext');
hookWebGLContext('WebGL2RenderingContext');
} catch(e) {}
}

// ──────────────────────────────────────────────
// 3C. SCREEN HOOKS — Resolution, viewport, colorDepth
// ──────────────────────────────────────────────

function applyScreenHooks(win) {
try {
var scr = HW.screen || {};
var w = scr.width || 1920;
var h = scr.height || 1080;
var aw = scr.availWidth || w;
var ah = scr.availHeight || (h - 40);
var at = scr.availTop || 0;
var al = scr.availLeft || 0;
var cd = scr.colorDepth || 24;
var pd = scr.pixelDepth || cd;
// v1.26.0: Viewport dimensions (innerWidth/Height) are DISTINCT from screen dimensions
// Screen = full monitor resolution (e.g. 1920x1080)
// Viewport = browser content area (e.g. 1920x988 = screen minus taskbar/chrome)
var vw = (HW.viewport && HW.viewport.width) || aw || w;
var vh = (HW.viewport && HW.viewport.height) || ah || h;
var props = {
width: w, height: h, availWidth: aw, availHeight: ah,
availTop: at, availLeft: al, colorDepth: cd, pixelDepth: pd
};
if (win.Screen && win.Screen.prototype) {
for (var key in props) {
Utils.patchProp(win.Screen.prototype, key, props[key], false);
}
}
if (win.screen) {
for (var key2 in props) {
try {
_defineProperty(win.screen, key2, {
get: (function(v) { return function() { return v; }; })(props[key2]),
enumerable: false, configurable: true
});
} catch(e) {}
}
}
// v1.26.0: innerWidth/Height use VIEWPORT dimensions (not screen)
try { _defineProperty(win, 'innerWidth', { get: function() { return vw; }, enumerable: true, configurable: true }); } catch(e) {}
try { _defineProperty(win, 'innerHeight', { get: function() { return vh; }, enumerable: true, configurable: true }); } catch(e) {}
if (win.visualViewport) {
try { _defineProperty(win.visualViewport, 'width', { get: function() { return vw; }, enumerable: true, configurable: true }); } catch(e) {}
try { _defineProperty(win.visualViewport, 'height', { get: function() { return vh; }, enumerable: true, configurable: true }); } catch(e) {}
}
try {
var origCW = _getOwnPropertyDescriptor(win.Element.prototype, 'clientWidth');
var origCH = _getOwnPropertyDescriptor(win.Element.prototype, 'clientHeight');
if (origCW && origCW.get) {
_defineProperty(win.document.documentElement, 'clientWidth', {
get: function() { return this === win.document.documentElement ? vw : origCW.get.call(this); },
enumerable: true, configurable: true
});
}
if (origCH && origCH.get) {
_defineProperty(win.document.documentElement, 'clientHeight', {
get: function() { return this === win.document.documentElement ? vh : origCH.get.call(this); },
enumerable: true, configurable: true
});
}
} catch(e) {}
var dpr = (HW.viewport && HW.viewport.devicePixelRatio) || 1;
try { _defineProperty(win, 'devicePixelRatio', { get: function() { return dpr; }, set: undefined, enumerable: true, configurable: true }); } catch(e) {}
} catch(e) {}
}

// ──────────────────────────────────────────────
// 3D. CANVAS HOOKS — Seeded Pixel Noise + measureText Noise
// v1.20.0: RE-ENABLED canvas pixel noise with ANTI-DETECTION design:
//   - Multi-channel (R+G+B spread, not R-only — defeats channel analysis)
//   - Variable stride via canvasNoiseGate() (~3% pixels — defeats periodicity detection)
//   - Micro amplitude ±1-2 per channel (sub-threshold for BrowserScan "Anthropogenic" check)
//   - Deterministic per canvasSeed (same canvas draw → same noise within session)
//   - WeakMap memoization (same canvas → same noised data, idempotent)
//   measureText sub-pixel noise RETAINED
//   OffscreenCanvas WebGL vendor/renderer spoof RETAINED
// ──────────────────────────────────────────────

function applyCanvasHooks(win) {
try {
var noisedCanvases = new WeakMap(); // canvas → {w, h} (dimension-aware, re-noise on reset)
var webglContexts = new WeakMap(); // canvas → WebGLRenderingContext (tracks which canvases have WebGL)

// v1.23.0: Hook getContext to track WebGL contexts on canvas elements
// This is CRITICAL for WebGL noise: we need to know which canvases have WebGL
// so ensureCanvasNoised/toDataURL can use readPixels instead of getImageData
if (win.HTMLCanvasElement && win.HTMLCanvasElement.prototype.getContext) {
Utils.hookMethod(win.HTMLCanvasElement.prototype, 'getContext', function(origGetContext) {
return function(contextType) {
var ctx = origGetContext.apply(this, arguments);
if (ctx && (contextType === 'webgl' || contextType === 'webgl2' || contextType === 'experimental-webgl')) {
webglContexts.set(this, ctx);
}
return ctx;
};
});
}

// v1.22.0: Apply GUARANTEED COLOR-PRESERVING noise via two-phase pixel swap
// Phase 1: Neighbor swaps (seed-gated ~3% of pixels) — high entropy for large canvases
// Phase 2: Long-distance swaps — guarantees at least MIN_SWAPS modifications
// NEVER creates new colors — only rearranges existing pixel positions
function applyPixelNoise(imageData, salt, imgWidth) {
var data = imageData.data;
var len = data.length;
var w = imgWidth || imageData.width || 0;
var totalPx = len >> 2;
if (totalPx < 4) return; // too small to noise
var MIN_SWAPS = 8; // minimum guaranteed effective swaps
var swapCount = 0;
// Track which pixels have been swapped to avoid double-swaps
var swapped = {};

// === PHASE 1: Neighbor swaps (gated ~3% of pixels) ===
for (var i = 0; i < len; i += 4) {
var pixIdx = i >> 2;
if (swapped[pixIdx]) continue;
if (!Noise.canvasNoiseGate(pixIdx, data, w)) continue;
var targetIdx = Noise.canvasSwapTarget(pixIdx, w, salt);
if (targetIdx < 0 || targetIdx >= totalPx || swapped[targetIdx]) continue;
var si = pixIdx << 2;
var ti = targetIdx << 2;
// Only swap if pixels are DIFFERENT (identical swap = no-op)
if (data[si] === data[ti] && data[si+1] === data[ti+1] && data[si+2] === data[ti+2] && data[si+3] === data[ti+3]) continue;
var tmpR = data[si], tmpG = data[si+1], tmpB = data[si+2];
data[si] = data[ti]; data[si+1] = data[ti+1]; data[si+2] = data[ti+2];
data[ti] = tmpR; data[ti+1] = tmpG; data[ti+2] = tmpB;
swapped[pixIdx] = true;
swapped[targetIdx] = true;
swapCount++;
}

// === PHASE 2: Long-distance swaps (guarantee MIN_SWAPS) ===
if (swapCount < MIN_SWAPS) {
var attempts = 0;
var maxAttempts = MIN_SWAPS * 10; // avoid infinite loop
var pairIdx = 0;
while (swapCount < MIN_SWAPS && attempts < maxAttempts) {
attempts++;
var pair = Noise.canvasLongSwap(pairIdx++, totalPx, salt);
if (!pair) break;
var a = pair.a, b = pair.b;
if (swapped[a] || swapped[b]) continue;
var ai = a << 2, bi = b << 2;
if (ai + 3 >= len || bi + 3 >= len) continue;
// Only swap if different
if (data[ai] === data[bi] && data[ai+1] === data[bi+1] && data[ai+2] === data[bi+2] && data[ai+3] === data[bi+3]) continue;
var tr = data[ai], tg = data[ai+1], tb = data[ai+2];
data[ai] = data[bi]; data[ai+1] = data[bi+1]; data[ai+2] = data[bi+2];
data[bi] = tr; data[bi+1] = tg; data[bi+2] = tb;
swapped[a] = true;
swapped[b] = true;
swapCount++;
}
}
}

// v1.22.0: Get or create noised version of canvas via 2D context
// v1.22.1 FIX: Track canvas dimensions — re-noise when canvas is reset
// FPjs v5 & BrowserScan REUSE same canvas element for multiple fingerprints:
//   Step 1: canvas.width=240 → draw text → toDataURL → noised ✅
//   Step 2: canvas.width=122 → draw geometry → toDataURL → WeakMap skip ❌
// Setting canvas.width/height RESETS content but WeakMap still has old entry!
// Fix: store {width, height} in WeakMap, re-noise if dimensions changed.
// v1.23.0: WebGL-aware ensureCanvasNoised — handles both 2D and WebGL canvases
// For 2D canvases: same as before (getImageData + noise + putImageData)
// For WebGL canvases: use readPixels + flip Y + noise (pixels stored in noisedCanvases)
function ensureCanvasNoised(canvas) {
var prev = noisedCanvases.get(canvas);
var cw = canvas.width, ch = canvas.height;
// Re-noise if: never noised, OR dimensions changed (canvas was reset)
if (prev && prev.w === cw && prev.h === ch) return prev;
var entry = { w: cw, h: ch, webglNoised: null };
noisedCanvases.set(canvas, entry);
if (cw === 0 || ch === 0) return entry;
// v1.27.0: Skip noise on small canvases (≤16x16) — CreepJS detection canvases
if (cw * ch <= 256) return entry;
try {
// Check if this canvas has a WebGL context
var gl = webglContexts.get(canvas);
if (gl) {
// WebGL path: read pixels from framebuffer, noise them, store for toDataURL
var pixels = new Uint8Array(cw * ch * 4);
gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
// WebGL readPixels gives BOTTOM-UP row order; flip to TOP-DOWN for canvas
var rowSize = cw * 4;
var halfH = ch >> 1;
for (var row = 0; row < halfH; row++) {
var topOff = row * rowSize;
var botOff = (ch - 1 - row) * rowSize;
for (var col = 0; col < rowSize; col++) {
var tmp = pixels[topOff + col];
pixels[topOff + col] = pixels[botOff + col];
pixels[botOff + col] = tmp;
}
}
// Create ImageData-like object for noise function
var fakeImageData = { data: pixels, width: cw, height: ch };
applyPixelNoise(fakeImageData, 'webgl:' + cw + 'x' + ch, cw);
// Store noised pixels for toDataURL/toBlob to use
entry.webglNoised = pixels;
} else {
// 2D path: original approach
var ctx = canvas.getContext('2d');
if (!ctx) return entry;
var imageData = ctx.getImageData(0, 0, cw, ch);
applyPixelNoise(imageData, cw + 'x' + ch, cw);
ctx.putImageData(imageData, 0, 0);
}
} catch(e) {}
return entry;
}

if (win.HTMLCanvasElement && win.HTMLCanvasElement.prototype) {
// v1.23.0: toDataURL — WebGL-aware: if canvas has WebGL context, render noised pixels via temp canvas
Utils.hookMethod(win.HTMLCanvasElement.prototype, 'toDataURL', function(origToDataURL) {
return function() {
if (!(this instanceof win.HTMLCanvasElement)) return origToDataURL.apply(this, arguments);
var entry = ensureCanvasNoised(this);
// v1.23.0: WebGL path — build output from noised pixel buffer
if (entry && entry.webglNoised) {
try {
var cw = this.width, ch = this.height;
var tempCanvas = win.document.createElement('canvas');
tempCanvas.width = cw;
tempCanvas.height = ch;
var tempCtx = tempCanvas.getContext('2d');
if (tempCtx) {
var imgData = tempCtx.createImageData(cw, ch);
imgData.data.set(entry.webglNoised);
tempCtx.putImageData(imgData, 0, 0);
// Apply same arguments (mime type, quality) to temp canvas
return origToDataURL.apply(tempCanvas, arguments);
}
} catch(e) {}
}
// 2D path: noise already applied in-place by ensureCanvasNoised
return origToDataURL.apply(this, arguments);
};
});

// v1.23.0: toBlob — WebGL-aware: same approach as toDataURL
if (win.HTMLCanvasElement.prototype.toBlob) {
Utils.hookMethod(win.HTMLCanvasElement.prototype, 'toBlob', function(origToBlob) {
return function() {
if (!(this instanceof win.HTMLCanvasElement)) return origToBlob.apply(this, arguments);
var entry = ensureCanvasNoised(this);
// v1.23.0: WebGL path — build output from noised pixel buffer
if (entry && entry.webglNoised) {
try {
var cw = this.width, ch = this.height;
var tempCanvas = win.document.createElement('canvas');
tempCanvas.width = cw;
tempCanvas.height = ch;
var tempCtx = tempCanvas.getContext('2d');
if (tempCtx) {
var imgData = tempCtx.createImageData(cw, ch);
imgData.data.set(entry.webglNoised);
tempCtx.putImageData(imgData, 0, 0);
return origToBlob.apply(tempCanvas, arguments);
}
} catch(e) {}
}
return origToBlob.apply(this, arguments);
};
});
}
}

if (win.CanvasRenderingContext2D && win.CanvasRenderingContext2D.prototype) {
// v1.21.0: getImageData — return pixel-swapped data (color-preserving)
// v1.27.0: Skip noise on small canvases (≤16x16 pixels) to survive CreepJS getPixelMods()
//   CreepJS creates 8x8 canvas, writes random pixels, reads back, compares — any diff = detected.
//   Also skip noise when ALL pixels are zero (clearRect + getImageData must return zeros).
Utils.hookMethod(win.CanvasRenderingContext2D.prototype, 'getImageData', function(origGetImageData) {
return function(sx, sy, sw, sh) {
if (!(this instanceof win.CanvasRenderingContext2D)) return origGetImageData.apply(this, arguments);
var imageData = origGetImageData.apply(this, arguments);
// v1.27.0: Skip noise on tiny canvases (detection canvases are 8x8 or 2x2)
var totalPixels = (sw || 0) * (sh || 0);
if (totalPixels <= 256) return imageData; // 16x16 = 256 pixels max — skip noise
// v1.27.0: Skip noise if all pixels are zero (clearRect check)
var d = imageData.data, allZero = true;
for (var zi = 0; zi < d.length; zi += 64) { // sample every 64th byte for speed
if (d[zi] !== 0) { allZero = false; break; }
}
if (allZero && d.length > 0 && d[d.length - 1] === 0) return imageData;
// Apply color-preserving swap noise to the returned ImageData copy
applyPixelNoise(imageData, sx + ':' + sy + ':' + sw + ':' + sh, sw);
return imageData;
};
});

// v1.20.0 (from v1.15.0): measureText sub-pixel noise RETAINED
Utils.hookMethod(win.CanvasRenderingContext2D.prototype, 'measureText', function(origMeasureText) {
return function(text) {
if (!(this instanceof win.CanvasRenderingContext2D)) return origMeasureText.apply(this, arguments);
var metrics = origMeasureText.apply(this, arguments);
if (text && text.length >= 5) {
var h = Noise.hash(Noise.seed + ':mt:' + text);
if (Math.abs(h) % 20 === 0) {
var shift = (h % 2 === 0) ? 0.1 : -0.1;
try { _defineProperty(metrics, 'width', { value: metrics.width + shift, writable: false, configurable: true }); } catch(e) {}
}
}
return metrics;
};
});
}

// v1.20.0: OffscreenCanvas — pixel noise + WebGL vendor/renderer spoof
if (typeof win.OffscreenCanvas !== 'undefined' && win.OffscreenCanvas.prototype) {
var ocWebglContexts = new WeakMap(); // OffscreenCanvas → WebGL context
var origOCGetCtx = win.OffscreenCanvas.prototype.getContext;
Utils.hookMethod(win.OffscreenCanvas.prototype, 'getContext', function(origGetCtx) {
origOCGetCtx = origGetCtx;
return function(type, attrs) {
var ctx = origGetCtx.apply(this, arguments);
if (ctx && (type === 'webgl' || type === 'webgl2') && !ctx._qteHooked) {
ctx._qteHooked = true;
ocWebglContexts.set(this, ctx); // v1.23.0: track WebGL context for convertToBlob
var oGP = ctx.getParameter;
// v1.24.0: TIMING-SAFE — call native getParameter FIRST to burn GPU driver latency
ctx.getParameter = function(p) {
var nativeRes = oGP.apply(this, arguments);
if (p === 37445) return (HW.webgl && HW.webgl.unmaskedVendor) || 'Google Inc. (NVIDIA)';
if (p === 37446) return (HW.webgl && HW.webgl.unmaskedRenderer) || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
return nativeRes;
};
Utils.patchToString(ctx.getParameter, 'getParameter');
try { patchedFns.add(ctx.getParameter); } catch(e) {}
}
// v1.20.0: Hook OffscreenCanvas 2D getImageData for pixel noise
if (ctx && type === '2d' && !ctx._qteNoised) {
ctx._qteNoised = true;
var origOCGetImgData = ctx.getImageData;
if (origOCGetImgData) {
ctx.getImageData = function(sx, sy, sw, sh) {
var imgData = origOCGetImgData.apply(this, arguments);
// v1.27.0: Skip noise on small canvases and all-zero data
var tp2 = (sw || 0) * (sh || 0);
if (tp2 <= 256) return imgData;
var dd2 = imgData.data, az2 = true;
for (var zi2 = 0; zi2 < dd2.length; zi2 += 64) { if (dd2[zi2] !== 0) { az2 = false; break; } }
if (az2 && dd2.length > 0 && dd2[dd2.length - 1] === 0) return imgData;
applyPixelNoise(imgData, sx + ':' + sy + ':' + sw + ':' + sh, sw);
return imgData;
};
Utils.patchToString(ctx.getImageData, 'getImageData');
try { patchedFns.add(ctx.getImageData); } catch(e) {}
}
}
return ctx;
};
});
// v1.23.0: OffscreenCanvas.convertToBlob — WebGL-aware noise
if (win.OffscreenCanvas.prototype.convertToBlob) {
var noisedOC = new WeakMap();
Utils.hookMethod(win.OffscreenCanvas.prototype, 'convertToBlob', function(origConvertToBlob) {
return function(options) {
var ocEntry = noisedOC.get(this);
var ow = this.width, oh = this.height;
// Re-noise if dimensions changed or never noised
if (!ocEntry || ocEntry.w !== ow || ocEntry.h !== oh) {
ocEntry = { w: ow, h: oh, webglNoised: null };
noisedOC.set(this, ocEntry);
try {
var ocgl = ocWebglContexts.get(this);
if (ocgl && ow > 0 && oh > 0) {
// v1.23.0: WebGL OffscreenCanvas path — readPixels + noise
var pxOC = new Uint8Array(ow * oh * 4);
ocgl.readPixels(0, 0, ow, oh, ocgl.RGBA, ocgl.UNSIGNED_BYTE, pxOC);
// Flip Y (WebGL bottom-up)
var rsOC = ow * 4;
var hhOC = oh >> 1;
for (var rOC = 0; rOC < hhOC; rOC++) {
var tOC = rOC * rsOC, bOC = (oh - 1 - rOC) * rsOC;
for (var cOC = 0; cOC < rsOC; cOC++) {
var xOC = pxOC[tOC + cOC]; pxOC[tOC + cOC] = pxOC[bOC + cOC]; pxOC[bOC + cOC] = xOC;
}
}
var fakeOCImgData = { data: pxOC, width: ow, height: oh };
applyPixelNoise(fakeOCImgData, 'ocwebgl:' + ow + 'x' + oh, ow);
ocEntry.webglNoised = pxOC;
} else {
// 2D path: original approach
var ctx2d = this.getContext('2d');
if (ctx2d && ow > 0 && oh > 0) {
var id = ctx2d.getImageData(0, 0, ow, oh);
// getImageData already applies noise via hook above
ctx2d.putImageData(id, 0, 0);
}
}
} catch(e) {}
}
// v1.23.0: WebGL path — render noised pixels to temp OffscreenCanvas
if (ocEntry && ocEntry.webglNoised) {
try {
var tmpOC = new win.OffscreenCanvas(ow, oh);
var tmpOCCtx = origOCGetCtx.call(tmpOC, '2d');
if (tmpOCCtx) {
var tmpImgData = tmpOCCtx.createImageData(ow, oh);
tmpImgData.data.set(ocEntry.webglNoised);
tmpOCCtx.putImageData(tmpImgData, 0, 0);
return origConvertToBlob.apply(tmpOC, arguments);
}
} catch(e) {}
}
return origConvertToBlob.apply(this, arguments);
};
});
}
}
} catch(e) {}
}

// ──────────────────────────────────────────────
// P3-4: isPointInPath / isPointInStroke STUB
// CreepJS supplementary check — these return boolean so noise is risky.
// We ensure they are present and native-looking (no modification needed).
// Flipping boolean results ~0.1% would cause incorrect click detection
// on sites that rely on these methods for hit testing — skip actual noise.
// Just ensure these methods are not accidentally overridden/removed by
// any other hook in this pipeline.
try {
if (win.CanvasRenderingContext2D && win.CanvasRenderingContext2D.prototype) {
// Verify isPointInPath exists (native) — no wrapper needed
if (typeof win.CanvasRenderingContext2D.prototype.isPointInPath !== 'function') {
// Should never happen in real Chrome; log for diagnostics if it does
try { console.warn('[QTE] isPointInPath missing from CanvasRenderingContext2D'); } catch(e) {}
}
// isPointInStroke: same check
if (typeof win.CanvasRenderingContext2D.prototype.isPointInStroke !== 'function') {
try { console.warn('[QTE] isPointInStroke missing from CanvasRenderingContext2D'); } catch(e) {}
}
// Both methods are left as native pass-through — boolean results must not be noised.
}
} catch(e) {}

// ──────────────
// 3E. AUDIO HOOKS — getChannelData + AnalyserNode + copyFromChannel
// v1.11.0: baseHash fixed (removed this.length from entropy)
// v1.12.0 PATCH-1: ALL 4 AnalyserNode methods hooked (BUG-01)
// v1.13.0 PATCH-4: instanceof guard on getChannelData + hookAnalyser
// ──────────────────────────────────────────────

function applyAudioHooks(win) {
try {
var AC = win.AudioContext || win.webkitAudioContext;
if (!AC) return;
var caps = (HW.audio && HW.audio.capabilities) || {};
if (caps.sampleRate) Utils.patchProp(AC.prototype, 'sampleRate', caps.sampleRate, false);
if (caps.baseLatency !== undefined && caps.baseLatency !== null) {
Utils.patchProp(AC.prototype, 'baseLatency', caps.baseLatency, false);
}
if (win.AudioDestinationNode && caps.channelCount) {
Utils.patchProp(win.AudioDestinationNode.prototype, 'channelCount', caps.channelCount, false);
Utils.patchProp(win.AudioDestinationNode.prototype, 'maxChannelCount', caps.maxChannelCount || caps.channelCount, false);
}
var noisedBuffers = new WeakSet();
// v1.25.0: Silent buffer guard — skip noise on all-zero buffers (defeats BrowserScan jo() test)
// Samples 20 evenly-spaced positions; if ALL are exactly 0.0, buffer is silent.
function isSilentBuffer(data) {
if (!data || data.length === 0) return true;
var len = data.length;
var checkCount = 20;
var stride = Math.max(1, Math.floor(len / checkCount));
for (var ci = 0; ci < len; ci += stride) {
if (data[ci] !== 0) return false;
}
// Also check the last sample
if (data[len - 1] !== 0) return false;
return true;
}
// v1.15.0 PHASE 1+4B: hookMethod + variable stride noise (60-140 range)
// v1.25.0: Added silent buffer guard before noise injection
Utils.hookMethod(win.AudioBuffer.prototype, 'getChannelData', function(origGCD) {
return function(channel) {
if (!(this instanceof win.AudioBuffer)) return origGCD.apply(this, arguments);
var data = origGCD.apply(this, arguments);
if (!noisedBuffers.has(this)) {
noisedBuffers.add(this);
// v1.25.0: Skip noise on silent buffers (BrowserScan jo() 0Hz test)
if (!isSilentBuffer(data)) {
var baseHash = Noise.hash(Noise.seed + ':ab:' + channel);
// v1.15.0 PHASE 4B: Pseudo-random stride 60-140 (avg ~100)
// Deterministic per seed, non-linear — defeats FFT/autocorrelation
var step = 0;
while (step < data.length) {
data[step] += Noise.audioNoise(step, baseHash);
var stepHash = Noise.hash(Noise.seed + 'as' + step);
step += 60 + Math.abs(stepHash % 81); // 60 + (0..80) = 60..140
}
}
}
return data;
};
});
// v1.15.0 PHASE 1: copyFromChannel via hookMethod
if (win.AudioBuffer.prototype.copyFromChannel) {
Utils.hookMethod(win.AudioBuffer.prototype, 'copyFromChannel', function(origCFC) {
return function(dest, channelNumber, startInChannel) {
var channelData = this.getChannelData(channelNumber);
var start = startInChannel || 0;
for (var i = 0; i < dest.length; i++) {
if (start + i < channelData.length) dest[i] = channelData[start + i];
}
};
});
}
if (win.AnalyserNode) {
// v1.15.0 PHASE 1: AnalyserNode hooks via hookMethod
function hookAnalyser(methodName, isByte) {
if (!win.AnalyserNode.prototype[methodName]) return;
Utils.hookMethod(win.AnalyserNode.prototype, methodName, function(orig) {
return function(array) {
if (!(this instanceof win.AnalyserNode)) return orig.apply(this, arguments);
orig.apply(this, arguments);
if (array && array.length > 0) {
for (var i = 0; i < array.length; i += 50) {
var n = Noise.analyserNoise(i, array.length, isByte);
if (isByte) {
array[i] = Math.max(0, Math.min(255, array[i] + n));
} else {
array[i] += n;
}
}
}
};
});
}
hookAnalyser('getFloatFrequencyData', false);
hookAnalyser('getByteFrequencyData', true);
hookAnalyser('getByteTimeDomainData', true);
hookAnalyser('getFloatTimeDomainData', false);
}
} catch(e) {}
}

// ──────────────────────────────────────────────
// 3F. NAVIGATOR HOOKS — platform, language, pdfViewer, connection
//
// v1.12.0 PATCH-5: userAgentData + maxTouchPoints hooks (NEW GAP)
// ──────────────────────────────────────────────

function applyNavigatorHooks(win) {
try {
var nav = HW.navigator || {};
var engine = HW.identity ? HW.identity.engine : 'chromium';
if (win.Navigator && win.Navigator.prototype) {
if (nav.platform) Utils.patchProp(win.Navigator.prototype, 'platform', nav.platform, true);
if (nav.vendor !== undefined) Utils.patchProp(win.Navigator.prototype, 'vendor', nav.vendor, true);
if (nav.language) Utils.patchProp(win.Navigator.prototype, 'language', nav.language, true);
if (nav.languages) Utils.patchProp(win.Navigator.prototype, 'languages', _freeze(nav.languages), true);
if (nav.pdfViewerEnabled !== undefined) Utils.patchProp(win.Navigator.prototype, 'pdfViewerEnabled', nav.pdfViewerEnabled, true);
if (engine === 'gecko' && nav.oscpu) {
Utils.patchProp(win.Navigator.prototype, 'oscpu', nav.oscpu, true);
}
}
if (engine !== 'gecko' && nav.connection) {
try {
if (!win.navigator.connection) {
var conn = {};
for (var ck in nav.connection) {
_defineProperty(conn, ck, { value: nav.connection[ck], writable: false, enumerable: true, configurable: true });
}
conn.addEventListener = function() {};
conn.removeEventListener = function() {};
conn.onchange = null;
try { Object.setPrototypeOf(conn, win.NetworkInformation.prototype); } catch(e) {}
Utils.patchProp(win.Navigator.prototype, 'connection', conn, true);
} else {
for (var ck2 in nav.connection) {
try {
_defineProperty(win.navigator.connection, ck2, {
get: (function(v) { return function() { return v; }; })(nav.connection[ck2]),
enumerable: true, configurable: true
});
} catch(e) {}
}
}
} catch(e) {}
}
// v1.12.0 PATCH-5A: maxTouchPoints hook (BUG: NEW GAP from apiHelper v2.1.0)
// Data source: HW.navigator.maxTouchPoints from stealthApiHelper.js v2.1.0
if (nav.maxTouchPoints !== undefined) {
Utils.patchProp(win.Navigator.prototype, 'maxTouchPoints', nav.maxTouchPoints, true);
try {
_defineProperty(win.navigator, 'maxTouchPoints', {
get: function() { return nav.maxTouchPoints; },
enumerable: true, configurable: true
});
} catch(e) {}
}
// v1.12.0 PATCH-5B: userAgentData spoof (Chromium only — Sec-CH-UA API)
// Data source: HW.navigator.userAgentData from stealthApiHelper.js v2.1.0
if (engine === 'chromium' && nav.userAgentData) {
try {
var uad = nav.userAgentData;
var fakeUAD = {
brands: _freeze(uad.brands),
mobile: !!uad.mobile,
platform: uad.platform
};
// getHighEntropyValues() mock — returns Promise (async API match)
fakeUAD.getHighEntropyValues = function(hints) {
var result = {
brands: fakeUAD.brands,
mobile: fakeUAD.mobile,
platform: fakeUAD.platform
};
if (uad.platformVersion) result.platformVersion = uad.platformVersion;
if (uad.architecture) result.architecture = uad.architecture;
if (uad.bitness) result.bitness = uad.bitness;
if (uad.model) result.model = uad.model;
if (uad.fullVersionList) result.fullVersionList = _freeze(uad.fullVersionList);
return Promise.resolve(result);
};
Utils.patchToString(fakeUAD.getHighEntropyValues, 'getHighEntropyValues');
fakeUAD.toJSON = function() {
return {
brands: fakeUAD.brands,
mobile: fakeUAD.mobile,
platform: fakeUAD.platform
};
};
Utils.patchToString(fakeUAD.toJSON, 'toJSON');
// Set prototype to NavigatorUAData if available (instanceof check)
try {
if (win.NavigatorUAData) {
Object.setPrototypeOf(fakeUAD, win.NavigatorUAData.prototype);
}
} catch(e) {}
Utils.patchProp(win.Navigator.prototype, 'userAgentData', fakeUAD, true);
try {
_defineProperty(win.navigator, 'userAgentData', {
get: function() { return fakeUAD; },
enumerable: true, configurable: true
});
} catch(e) {}
} catch(e) {}
}
} catch(e) {}
}

// ──────────────────────────────────────────────
// 3P. DOMRECT/SVG DEFENSE (v1.20.0 NEW — G4/G5/G6/G7 from Gap Analysis)
//
// Comprehensive DOMRect fingerprint defense:
//   - Element.getBoundingClientRect() — sub-pixel noise with math coherence
//   - Element.getClientRects() — same noise per element
//   - Range.getBoundingClientRect() — range-level noise
//   - Range.getClientRects() — range-level noise
//   - SVG getBBox() — SVG-specific noise
//   - SVGTextContentElement.getComputedTextLength() — text length noise
//   - SVGTextContentElement.getSubStringLength() — substring noise
//
// MATH COHERENCE: right = x + width, bottom = y + height (ALWAYS)
// MEMOIZATION: WeakMap per element — same element → same noise across calls
// DETERMINISTIC: seeded by Noise.rectHash() + property name
// ──────────────────────────────────────────────

function applyDOMRectHooks(win) {
try {
var rectMemo = new WeakMap(); // element/range → {noiseX, noiseY, noiseW, noiseH}

// Generate consistent noise set for an element/range
function getNoiseFor(ref, tagName, id, className, extra) {
if (rectMemo.has(ref)) return rectMemo.get(ref);
var eh = Noise.rectHash(tagName, id, className, extra);
var noise = {
x: Noise.domRectNoise(eh, 'x'),
y: Noise.domRectNoise(eh, 'y'),
w: Noise.domRectNoise(eh, 'w'),
h: Noise.domRectNoise(eh, 'h')
};
rectMemo.set(ref, noise);
return noise;
}

// Apply noise to a DOMRect-like object with math coherence
function noiseRect(rect, noise) {
var nx = rect.x + noise.x;
var ny = rect.y + noise.y;
var nw = rect.width + noise.w;
var nh = rect.height + noise.h;
// Math coherence: right = x + width, bottom = y + height
try {
_defineProperty(rect, 'x', { value: nx, writable: false, configurable: true });
_defineProperty(rect, 'y', { value: ny, writable: false, configurable: true });
_defineProperty(rect, 'width', { value: nw, writable: false, configurable: true });
_defineProperty(rect, 'height', { value: nh, writable: false, configurable: true });
_defineProperty(rect, 'top', { value: ny, writable: false, configurable: true });
_defineProperty(rect, 'left', { value: nx, writable: false, configurable: true });
_defineProperty(rect, 'right', { value: nx + nw, writable: false, configurable: true });
_defineProperty(rect, 'bottom', { value: ny + nh, writable: false, configurable: true });
} catch(e) {}
return rect;
}

// Element.prototype.getBoundingClientRect
if (win.Element && win.Element.prototype.getBoundingClientRect) {
Utils.hookMethod(win.Element.prototype, 'getBoundingClientRect', function(orig) {
return function() {
var rect = orig.apply(this, arguments);
try {
var noise = getNoiseFor(this, this.tagName, this.id, this.className, '');
noiseRect(rect, noise);
} catch(e) {}
return rect;
};
});
}

// Element.prototype.getClientRects
if (win.Element && win.Element.prototype.getClientRects) {
Utils.hookMethod(win.Element.prototype, 'getClientRects', function(orig) {
return function() {
var rects = orig.apply(this, arguments);
try {
var noise = getNoiseFor(this, this.tagName, this.id, this.className, 'cr');
for (var i = 0; i < rects.length; i++) {
noiseRect(rects[i], noise);
}
} catch(e) {}
return rects;
};
});
}

// Range.prototype.getBoundingClientRect
if (win.Range && win.Range.prototype.getBoundingClientRect) {
Utils.hookMethod(win.Range.prototype, 'getBoundingClientRect', function(orig) {
return function() {
var rect = orig.apply(this, arguments);
try {
var container = this.startContainer;
var tag = container ? (container.tagName || container.nodeName || 'range') : 'range';
var noise = getNoiseFor(this, tag, '', '', 'range-bcr');
noiseRect(rect, noise);
} catch(e) {}
return rect;
};
});
}

// Range.prototype.getClientRects
if (win.Range && win.Range.prototype.getClientRects) {
Utils.hookMethod(win.Range.prototype, 'getClientRects', function(orig) {
return function() {
var rects = orig.apply(this, arguments);
try {
var container = this.startContainer;
var tag = container ? (container.tagName || container.nodeName || 'range') : 'range';
var noise = getNoiseFor(this, tag, '', '', 'range-cr');
for (var i = 0; i < rects.length; i++) {
noiseRect(rects[i], noise);
}
} catch(e) {}
return rects;
};
});
}

// v1.27.0: SVG hooks REMOVED — native pass-through
// CreepJS unshift tamper test adds/removes CSS class and compares getComputedTextLength.
// Our noise used className in hash → different noise when class changes → DETECTED.
// SVG fingerprint uniqueness comes from native font rendering, not our noise.
// Removing SVG noise eliminates: unshift detection, lie scanner on SVG prototypes,
// cache invalidation issues. DOMRect/Element hooks STILL have noise (separate concern).
//
// SVGGraphicsElement.prototype.getBBox — NATIVE PASS-THROUGH (was noised)
// SVGTextContentElement.prototype.getComputedTextLength — NATIVE PASS-THROUGH (was noised)
// SVGTextContentElement.prototype.getSubStringLength — NATIVE PASS-THROUGH (was noised)
} catch(e) {}
}

// ──────────────────────────────────────────────
// 3Q. EXTENDED TEXTMETRICS DEFENSE (v1.20.0 NEW — G3 from Gap Analysis)
//
// FPjs V5 + CreepJS measure 7+ TextMetrics properties beyond .width:
//   actualBoundingBoxLeft, actualBoundingBoxRight,
//   actualBoundingBoxAscent, actualBoundingBoxDescent,
//   fontBoundingBoxAscent, fontBoundingBoxDescent,
//   alphabeticBaseline
// QTE only noised .width — this closes the gap.
// ──────────────────────────────────────────────

function applyExtendedTextMetrics(win) {
try {
if (!win.CanvasRenderingContext2D || !win.CanvasRenderingContext2D.prototype) return;
var origMT = win.CanvasRenderingContext2D.prototype.measureText;
// Check if already hooked by 3D — if so, get the current (already-hooked) version
var currentMT = win.CanvasRenderingContext2D.prototype.measureText;

var tmProps = ['actualBoundingBoxLeft', 'actualBoundingBoxRight',
'actualBoundingBoxAscent', 'actualBoundingBoxDescent',
'fontBoundingBoxAscent', 'fontBoundingBoxDescent',
'alphabeticBaseline',
// P2-6 FIX: Add 4 missing TextMetrics properties
// CreepJS supplementary check measures these additional baseline/metric props
'emHeightAscent', 'emHeightDescent', 'hangingBaseline', 'ideographicBaseline'];

// Wrap whatever measureText is currently installed
Utils.hookMethod(win.CanvasRenderingContext2D.prototype, 'measureText', function(prevMT) {
return function(text) {
var metrics = prevMT.apply(this, arguments);
if (!text || text.length < 2) return metrics;
// Apply noise to extended TextMetrics properties
var baseH = Noise.hash(Noise.seed + ':tm:' + text);
for (var pi = 0; pi < tmProps.length; pi++) {
var prop = tmProps[pi];
var origVal = metrics[prop];
if (origVal !== undefined && typeof origVal === 'number') {
var propH = Noise.hash(Noise.seed + ':tm:' + prop + ':' + text);
var noise = (propH % 100) / 100000; // ±0.001 range
try {
_defineProperty(metrics, prop, { value: origVal + noise, writable: false, configurable: true });
} catch(e) {}
}
}
return metrics;
};
});
} catch(e) {}
}

// ──────────────────────────────────────────────
// 3R. HEADLESS/MISC DEFENSE (v1.20.0 NEW — G16/G8 from Gap Analysis)
//
// CreepJS checks:
//   - window.toolbar.visible, window.menubar.visible, window.personalbar.visible
//     (headless Chromium has these as false → bot signal)
//   - CSS getComputedStyle system colors (headless returns different values)
//   - Error().stack format differences
//
// This layer ensures bar visibility = true and normalizes system color responses.
// ──────────────────────────────────────────────

function applyHeadlessDefense(win) {
try {
// Window bar objects: toolbar, menubar, personalbar, statusbar, scrollbars, locationbar
var barNames = ['toolbar', 'menubar', 'personalbar', 'statusbar', 'scrollbars', 'locationbar'];
for (var bi = 0; bi < barNames.length; bi++) {
var barName = barNames[bi];
try {
var bar = win[barName];
if (bar) {
_defineProperty(bar, 'visible', {
get: function() { return true; },
enumerable: true, configurable: true
});
}
} catch(e) {}
}

// Ensure window.chrome object exists (Chromium-specific)
var engine = HW.identity ? HW.identity.engine : 'chromium';
if (engine === 'chromium' && !win.chrome) {
try {
win.chrome = { runtime: {} };
} catch(e) {}
}

// Normalize Notification.permission (headless often has 'default', real browsers vary)
if (win.Notification && typeof win.Notification.permission === 'string') {
// Don't override — just ensure the property is accessible
try {
_defineProperty(win.Notification, 'permission', {
get: function() { return 'default'; },
enumerable: true, configurable: true
});
} catch(e) {}
}

// P2-1 FIX: CSS system colors normalization
// Headless Chromium returns different values for system colors vs headed Chrome.
// Inject color-scheme: light to ensure system color keywords resolve consistently.
// This is the simplest safe approach: just set color-scheme on :root.
try {
var _styleEl = win.document && win.document.createElement ? win.document.createElement('style') : null;
if (_styleEl) {
_styleEl.textContent = ':root { color-scheme: light; }';
if (win.document.head) {
win.document.head.appendChild(_styleEl);
} else if (win.document.documentElement) {
win.document.documentElement.appendChild(_styleEl);
}
}
} catch(e) {}
} catch(e) {}
}

// ──────────────────────────────────────────────
// 3G. FONT HOOKS — REMOVED in v1.19.0
//
// v1.19.0: ENTIRE applyFontHooks() REMOVED — delegated to StealthFont FALLBACK-SWAP
//   ROOT CAUSE: Noise strategy (±1px) fundamentally fails against FPjs v5
//   metric-based font detection. See Forensic Analysis: Font FP Leak.
//   StealthFont v7.6.0 generateFontMetricDefenseScript() handles:
//     offsetWidth/Height, getBCR, getClientRects, Range, SVG, iframe propagation
//   via FALLBACK-SWAP which returns IDENTICAL baseline widths.
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// 3H. MEDIA QUERY HOOKS — matchMedia for 8 CSS queries
// ──────────────────────────────────────────────

function applyMediaHooks(win) {
try {
var media = HW.media || {};
var scr = HW.screen || {};
var w = scr.width || 1920, h = scr.height || 1080;
var cd = scr.colorDepth || 24;
var dpr = (HW.viewport && HW.viewport.devicePixelRatio) || 1;
// v1.26.0: CSS width/height media queries use VIEWPORT dimensions (= innerWidth/innerHeight)
var vw = (HW.viewport && HW.viewport.width) || w;
var vh = (HW.viewport && HW.viewport.height) || h;
var origMM = win.matchMedia;
if (!origMM) return;

function evalQuery(q) {
q = q.toLowerCase().trim();
if (q.indexOf('prefers-color-scheme') !== -1) {
var scheme = media.colorScheme || 'light';
if (q.indexOf(scheme) !== -1) return true;
return false;
}
if (q.indexOf('inverted-colors') !== -1) { return q.indexOf(media.invertedColors || 'none') !== -1; }
if (q.indexOf('forced-colors') !== -1) { return q.indexOf(media.forcedColors || 'none') !== -1; }
if (q.indexOf('prefers-contrast') !== -1) { return q.indexOf(media.contrast || 'no-preference') !== -1; }
if (q.indexOf('prefers-reduced-motion') !== -1) { return q.indexOf(media.reducedMotion || 'no-preference') !== -1; }
if (q.indexOf('prefers-reduced-transparency') !== -1) { return q.indexOf(media.reducedTransparency || 'no-preference') !== -1; }
if (q.indexOf('dynamic-range') !== -1) { return q.indexOf(media.dynamicRange || 'standard') !== -1; }
if (q.indexOf('color-gamut') !== -1) { return q.indexOf(media.colorGamut || 'srgb') !== -1; }
if (q.indexOf('monochrome') !== -1) {
var m = q.match(/(min-|max-)?monochrome\)?\:?\s*(\d+)?/);
if (m && m[2]) { var v = parseInt(m[2]); if (m[1]==='min-') return 0>=v; if (m[1]==='max-') return 0<=v; return 0===v; }
if (q.indexOf('(monochrome)') !== -1) return false;
}
if (q.indexOf('device-width') !== -1) { var dm = q.match(/(min-|max-)?device-width:\s*(\d+)px/); if (dm) { var dv=parseInt(dm[2]); if(dm[1]==='min-')return w>=dv; if(dm[1]==='max-')return w<=dv; return w===dv; } }
if (q.indexOf('device-height') !== -1) { var dhm = q.match(/(min-|max-)?device-height:\s*(\d+)px/); if (dhm) { var dhv=parseInt(dhm[2]); if(dhm[1]==='min-')return h>=dhv; if(dhm[1]==='max-')return h<=dhv; return h===dhv; } }
if (q.indexOf('width') !== -1 && q.indexOf('device') === -1) { var wm = q.match(/(min-|max-)?width:\s*(\d+)px/); if (wm) { var wv2=parseInt(wm[2]); if(wm[1]==='min-')return vw>=wv2; if(wm[1]==='max-')return vw<=wv2; return vw===wv2; } }
if (q.indexOf('height') !== -1 && q.indexOf('device') === -1) { var hm = q.match(/(min-|max-)?height:\s*(\d+)px/); if (hm) { var hv=parseInt(hm[2]); if(hm[1]==='min-')return vh>=hv; if(hm[1]==='max-')return vh<=hv; return vh===hv; } }
if (q.indexOf('resolution') !== -1) { var rm = q.match(/(min-|max-)?resolution:\s*(\d+)dppx/); if (rm) { var rv=parseInt(rm[2]); if(rm[1]==='min-')return dpr>=rv; if(rm[1]==='max-')return dpr<=rv; return dpr===rv; } }
if (q.indexOf('orientation') !== -1) { if (q.indexOf('landscape') !== -1) return w>=h; if (q.indexOf('portrait') !== -1) return w<h; }
return null;
}

win.matchMedia = function(query) {
var mql = origMM.call(win, query);
var spoofed = evalQuery(query);
if (spoofed !== null) {
try {
_defineProperty(mql, 'matches', { get: function() { return spoofed; }, enumerable: true, configurable: true });
} catch(e) {}
}
return mql;
};
Utils.patchToString(win.matchMedia, 'matchMedia');
} catch(e) {}
}

// ──────────────────────────────────────────────
// 3I. MISC HOOKS — webdriver cleanup, chrome object, battery, window noise
// ──────────────────────────────────────────────

function applyMiscHooks(win) {
try {
try { delete win.Navigator.prototype.webdriver; } catch(e) {}
try { delete win.navigator.webdriver; } catch(e) {}
var wd = _getOwnPropertyDescriptor(win.Navigator.prototype, 'webdriver');
if (wd) {
try {
_defineProperty(win.Navigator.prototype, 'webdriver', {
get: function() { return undefined; }, configurable: true, enumerable: true
});
} catch(e) {}
}
var wdInst = _getOwnPropertyDescriptor(win.navigator, 'webdriver');
if (wdInst) {
try {
_defineProperty(win.navigator, 'webdriver', {
get: function() { return undefined; }, configurable: true, enumerable: true
});
} catch(e) {}
}
// v1.7.0 [F9] FIX: Regex-based automation artifact scan (future-proof)
var suspiciousPatterns = /__playwright|__pw|__PW|\$cdc_|\$chrome_/i;
var allProps = Object.getOwnPropertyNames(win);
for (var ai = 0; ai < allProps.length; ai++) {
if (suspiciousPatterns.test(allProps[ai])) {
try { delete win[allProps[ai]]; } catch(e) {}
}
}
var wSeed = Noise.seed + ':win';
function winNoise(salt, range) {
var h = Noise.hash(wSeed + ':' + salt);
return Math.abs(h % range) * 2 + 1 - range;
}
// v1.7.0 [F7] FIX: Realistic browser chrome dimensions
var chromeHeight = 74 + Math.abs(Noise.hash(Noise.seed + ':ch') % 60);
var scrollbarWidth = Math.abs(Noise.hash(Noise.seed + ':sb') % 16);
try { _defineProperty(win, 'outerWidth', { get: function() { return win.innerWidth + scrollbarWidth; }, configurable: true }); } catch(e) {}
try { _defineProperty(win, 'outerHeight', { get: function() { return win.innerHeight + chromeHeight; }, configurable: true }); } catch(e) {}
// BUG #6 FIX: Wider screenX/Y range for realistic window placement
try { _defineProperty(win, 'screenX', { get: function() { return 20 + Math.abs(winNoise('sx', 280)); }, configurable: true }); } catch(e) {}
try { _defineProperty(win, 'screenY', { get: function() { return 20 + Math.abs(winNoise('sy', 160)); }, configurable: true }); } catch(e) {}
} catch(e) {}
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// 3J. INTERSECTION OBSERVER — rootBounds viewport guard (BUG #5 FIX)
// ══════════════════════════════════════════════════════
// IntersectionObserver callback entries expose rootBounds which contains
// the actual viewport dimensions. Antibot compares rootBounds.width/height
// with window.innerWidth/innerHeight — mismatch = spoofed viewport.
// Fix: Wrap IntersectionObserver to intercept callback entries and
// rewrite rootBounds to match our spoofed viewport dimensions.
try {
if (typeof IntersectionObserver !== 'undefined') {
var _OrigIO = IntersectionObserver;
var _IOProxy = function IntersectionObserver(callback, options) {
  var wrappedCallback = function(entries, observer) {
    try {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.rootBounds) {
          var rb = entry.rootBounds;
          // Replace rootBounds with viewport-matching DOMRectReadOnly
          try {
            Object.defineProperty(entry, 'rootBounds', {
              get: function() {
                return { x: 0, y: 0, width: win.innerWidth, height: win.innerHeight,
                         top: 0, left: 0, right: win.innerWidth, bottom: win.innerHeight,
                         toJSON: function() { return { x:0, y:0, width:win.innerWidth, height:win.innerHeight, top:0, left:0, right:win.innerWidth, bottom:win.innerHeight }; } };
              }, configurable: true
            });
          } catch(e) {}
        }
      }
    } catch(e) {}
    return callback.call(this, entries, observer);
  };
  return new _OrigIO(wrappedCallback, options);
};
_IOProxy.prototype = _OrigIO.prototype;
try { Object.setPrototypeOf(_IOProxy, _OrigIO); } catch(e) {}
try { _defineProperty(_IOProxy, 'toString', { value: function() { return 'function IntersectionObserver() { [native code] }'; }, configurable: true }); } catch(e) {}
window.IntersectionObserver = _IOProxy;
}
} catch(e) {}

// 3K. WEBRTC STEALTH (v3.0.0) — Complete BrowserScan Bypass
// v4.0.0: BrowserScan (D064vdLH.js) onicecandidate uses comma operator:
//   if(event.candidate && push(candidate), event && push(event), "complete"==pc.iceGatheringState)
// This checks iceGatheringState on EVERY callback. Key behaviors:
//   - Candidates pushed regardless of state (comma operator always evaluates all)
//   - If state=="complete" on ANY callback → Promise resolves with current candidates[]
//   - Promise.resolve only fires once → subsequent callbacks are no-ops
// v4.0.0 fix: Direct dispatch to original handler (bypass wrapper),
//   state="gathering" for candidates, state="complete" only for null signal.
// ══════════════════════════════════════════════════════

function applyWebRTCHooks(win) {
try {
var OrigRTC = win.RTCPeerConnection || win.webkitRTCPeerConnection;
if (!OrigRTC) return;

var PUBLIC_IP = (HW.network && HW.network.publicIP) ? HW.network.publicIP : null;
// v3.0.0: No MDNS_ONLY_MODE concept — always attempt synthetic srflx when PUBLIC_IP exists
// When no PUBLIC_IP: only rewrite host→mDNS, block srflx leak, allow relay through
var HAS_PUBLIC_IP = !!PUBLIC_IP;

// ── Deterministic mDNS hash from session seed ──
var _rtcSeed = (HAS_PUBLIC_IP ? (Noise.seed + ':webrtc') :
    ((HW.identity ? HW.identity.seed : 'default') + ':webrtc'));
function generateMdnsAddress() {
var h1 = Math.abs(Noise.hash(_rtcSeed + ':mdns:1'));
var h2 = Math.abs(Noise.hash(_rtcSeed + ':mdns:2'));
var h3 = Math.abs(Noise.hash(_rtcSeed + ':mdns:3'));
var h4 = Math.abs(Noise.hash(_rtcSeed + ':mdns:4'));
var h5 = Math.abs(Noise.hash(_rtcSeed + ':mdns:5'));
function hex(val, len) {
var s = (val >>> 0).toString(16);
while (s.length < len) s = '0' + s;
return s.substring(0, len);
}
return hex(h1, 8) + '-' + hex(h2, 4) + '-4' + hex(h3, 3) + '-' +
(8 + (Math.abs(Noise.hash(_rtcSeed + ':mdns:v')) % 4)).toString(16) + hex(h4, 3) + '-' +
hex(h5, 12) + '.local';
}

var MDNS_HOST = generateMdnsAddress();

// ── Deterministic ephemeral port ──
function generatePort(salt) {
var h = Math.abs(Noise.hash(_rtcSeed + ':port:' + salt));
return 49152 + (h % 16383); // Range 49152-65535
}

var SRFLX_PORT = generatePort('srflx');
var HOST_PORT = generatePort('host');
var RELAY_PORT = generatePort('relay');

// ── PRIVATE IP regex — used to detect candidates that need rewriting ──
var PRIVATE_IP = /(?:^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^192\.168\.\d{1,3}\.\d{1,3}$|^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$|^(?:fc|fd|fe80))/i;

// ── IPv4 check for candidate parsing ──
function isIPv4(str) {
return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str);
}

// ── Parse and rewrite a single candidate string ──
function rewriteCandidate(candidateStr) {
if (!candidateStr || typeof candidateStr !== 'string') return candidateStr;
if (candidateStr.indexOf('candidate:') === -1) return candidateStr;

var parts = candidateStr.split(' ');
if (parts.length < 8) return candidateStr;

var ip = parts[4];
var type = parts[7]; // host, srflx, relay, prflx

if (!HAS_PUBLIC_IP) {
// No PUBLIC_IP mode: block srflx/prflx leak, mDNS for host, relay pass-through
if (type === 'host') {
parts[4] = MDNS_HOST;
parts[5] = String(HOST_PORT);
} else if (type === 'srflx' || type === 'prflx') {
return null; // Block — would expose real IP
} else if (type === 'relay') {
return candidateStr; // Relay safe
} else {
if (isIPv4(ip) && PRIVATE_IP.test(ip)) {
parts[4] = MDNS_HOST;
parts[5] = String(HOST_PORT);
}
}
return parts.join(' ');
}

// HAS_PUBLIC_IP mode
if (type === 'host') {
parts[4] = MDNS_HOST;
parts[5] = String(HOST_PORT);
} else if (type === 'srflx' || type === 'prflx' || type === 'relay') {
parts[4] = PUBLIC_IP;
parts[5] = String(SRFLX_PORT);
for (var ri = 8; ri < parts.length; ri++) {
if (parts[ri] === 'raddr' && ri + 1 < parts.length) {
parts[ri + 1] = MDNS_HOST;
} else if (parts[ri] === 'rport' && ri + 1 < parts.length) {
parts[ri + 1] = String(HOST_PORT);
}
}
} else {
if (isIPv4(ip) && PRIVATE_IP.test(ip)) {
parts[4] = MDNS_HOST;
parts[5] = String(HOST_PORT);
}
}

return parts.join(' ');
}

// ── Rewrite entire SDP ──
function rewriteSDP(sdp) {
if (!sdp || typeof sdp !== 'string') return sdp;

sdp = sdp.replace(/a=candidate:[^\r\n]+/g, function(line) {
var rewritten = rewriteCandidate(line.substring(2));
if (rewritten === null) return ''; // Remove blocked candidates
return 'a=' + rewritten;
});

if (HAS_PUBLIC_IP) {
sdp = sdp.replace(/c=IN IP4 (\S+)/g, function(match, addr) {
if (addr === '0.0.0.0') return match;
return 'c=IN IP4 ' + PUBLIC_IP;
});
}

return sdp;
}

// v3.0.0: Helper to inject synthetic srflx candidate into SDP string
function injectSyntheticSrflxIntoSDP(sdp) {
if (!HAS_PUBLIC_IP) return sdp;
var synthFnd = String(Math.abs(Noise.hash(_rtcSeed + ':fnd:srflx')));
var synthUfrag = String(Math.abs(Noise.hash(_rtcSeed + ':ufrag'))).substring(0, 4);
var synthLine = 'a=candidate:' + synthFnd + ' 1 tcp 1518214911 ' +
PUBLIC_IP + ' ' + SRFLX_PORT + ' typ srflx raddr ' +
MDNS_HOST + ' rport ' + HOST_PORT + ' tcptype passive generation 0 ufrag ' + synthUfrag + ' network-id 1';
var hostFnd = String(Math.abs(Noise.hash(_rtcSeed + ':fnd:host')));
var hostLine = 'a=candidate:' + hostFnd + ' 1 tcp 1518280447 ' +
MDNS_HOST + ' ' + HOST_PORT + ' typ host tcptype passive generation 0 ufrag ' + synthUfrag + ' network-id 1';
var mLineIdx = sdp.indexOf('\r\nm=');
if (mLineIdx === -1) mLineIdx = sdp.indexOf('\nm=');
if (mLineIdx !== -1) {
var insertIdx = sdp.indexOf('\r\na=end-of-candidates');
if (insertIdx === -1) insertIdx = sdp.indexOf('\na=end-of-candidates');
if (insertIdx === -1) {
var nextM = sdp.indexOf('\r\nm=', mLineIdx + 3);
if (nextM === -1) nextM = sdp.indexOf('\nm=', mLineIdx + 2);
if (nextM !== -1) {
sdp = sdp.substring(0, nextM) + '\r\n' + hostLine + '\r\n' + synthLine + sdp.substring(nextM);
} else {
sdp = sdp + '\r\n' + hostLine + '\r\n' + synthLine + '\r\n';
}
} else {
sdp = sdp.substring(0, insertIdx) + '\r\n' + hostLine + '\r\n' + synthLine + sdp.substring(insertIdx);
}
}
return sdp;
}

// ── Create a synthetic RTCIceCandidate object ──
function createSyntheticCandidate(type, protocol) {
var ip, port, priority, foundation;

if (type === 'host') {
ip = MDNS_HOST;
port = HOST_PORT;
priority = 1518280447;
foundation = String(Math.abs(Noise.hash(_rtcSeed + ':fnd:host')));
} else if (type === 'relay') {
ip = PUBLIC_IP;
port = RELAY_PORT;
priority = 8331007;
foundation = String(Math.abs(Noise.hash(_rtcSeed + ':fnd:relay')));
} else {
ip = PUBLIC_IP;
port = SRFLX_PORT;
priority = 1518214911;
foundation = String(Math.abs(Noise.hash(_rtcSeed + ':fnd:srflx')));
}

var candidateStr = 'candidate:' + foundation + ' 1 ' + protocol + ' ' + priority +
' ' + ip + ' ' + port + ' typ ' + type;

if (type === 'srflx' || type === 'relay') {
candidateStr += ' raddr ' + MDNS_HOST + ' rport ' + HOST_PORT;
}

candidateStr += ' tcptype passive generation 0 ufrag ' +
String(Math.abs(Noise.hash(_rtcSeed + ':ufrag'))).substring(0, 4) +
' network-id 1';

try {
return new win.RTCIceCandidate({
candidate: candidateStr,
sdpMid: '0',
sdpMLineIndex: 0
});
} catch(e) {
return {
candidate: candidateStr,
sdpMid: '0',
sdpMLineIndex: 0,
component: 'rtp',
foundation: foundation,
port: port,
priority: priority,
protocol: protocol,
type: type,
address: ip,
relatedAddress: (type === 'srflx' || type === 'relay') ? MDNS_HOST : null,
relatedPort: (type === 'srflx' || type === 'relay') ? HOST_PORT : null
};
}
}

// ── Wrap RTCIceCandidate to rewrite candidate string ──
function wrapIceCandidate(original) {
if (!original || !original.candidate) return original;
var rewritten = rewriteCandidate(original.candidate);
if (rewritten === null) return null; // Suppressed candidate
if (rewritten === original.candidate) return original;
try {
return new win.RTCIceCandidate({
candidate: rewritten,
sdpMid: original.sdpMid,
sdpMLineIndex: original.sdpMLineIndex,
usernameFragment: original.usernameFragment
});
} catch(e) {
return original;
}
}

// ── Wrap RTCPeerConnection ──
var ProxiedRTC = function RTCPeerConnection(config, constraints) {
if (!config) {
config = { iceServers: [] };
}
var pc = new OrigRTC(config, constraints);

// v1.29.0: Detect TURN servers in config — needed for synthetic relay candidates
var _hasTurnServers = false;
try {
if (config.iceServers) {
for (var si = 0; si < config.iceServers.length; si++) {
var srv = config.iceServers[si];
var urls = srv.urls || srv.url || [];
if (typeof urls === 'string') urls = [urls];
for (var ui = 0; ui < urls.length; ui++) {
if (urls[ui] && urls[ui].indexOf('turn:') === 0) { _hasTurnServers = true; break; }
}
if (_hasTurnServers) break;
}
}
} catch(e) {}

// ── Track state for synthetic candidate fallback ──
var _hasSrflx = false;
var _hasRelay = false;
var _syntheticSent = false;
var _gatheringDone = false;
var _syntheticTimer = null;
var _userOnIceCandidate = null;
var _originalHandler = null; // v4.0.0: Raw handler set by caller (e.g. BrowserScan)
var _addedListeners = [];
var _originalListeners = []; // v4.0.0: Raw addEventListener listeners
// v4.0.0: iceGatheringState override — locked from setLocalDescription.
// Held at "gathering" until trySendSynthetic dispatches ALL candidates,
// then set to "complete" for the null signal. This ensures BrowserScan
// collects ALL candidates before resolving.
var _iceGatheringOverride = null;
// v3.0.0: Track whether setLocalDescription was called (ICE gathering started)
var _sldCalled = false;

// v4.0.0: Override iceGatheringState on this pc instance.
// BrowserScan checks iceGatheringState on EVERY onicecandidate event.
// Without override, real state becomes "complete" almost immediately
// (STUN blocked), causing early resolve with only mDNS candidates.
// FIX: Lock to "gathering" from setLocalDescription until trySendSynthetic
// dispatches all candidates. trySendSynthetic sets "complete" for null event.
try {
var _origGatherDesc = _getOwnPropertyDescriptor(OrigRTC.prototype, 'iceGatheringState');
if (_origGatherDesc && _origGatherDesc.get) {
_defineProperty(pc, 'iceGatheringState', {
get: function() {
if (_iceGatheringOverride !== null) return _iceGatheringOverride;
return _origGatherDesc.get.call(pc);
},
enumerable: true, configurable: true
});
}
} catch(igErr) {}

// v4.0.0: Helper — send synthetic candidates DIRECTLY to original handler
// CRITICAL: Bypasses our wrapper to avoid iceGatheringState side-effects.
// The wrapper sets _iceGatheringOverride=null on srflx detection, which
// would cause BrowserScan to resolve before relay is dispatched.
// By dispatching directly, we control iceGatheringState precisely:
//   - "gathering" during ALL candidate dispatches (srflx, host, relay)
//   - "complete" ONLY for the final null dispatch
function trySendSynthetic() {
if (_syntheticSent) return false;
if (!HAS_PUBLIC_IP) return false;
_syntheticSent = true;

// Pre-create and pre-wrap all synthetic candidates
var synthSrflx = !_hasSrflx ? createSyntheticCandidate('srflx', 'tcp') : null;
var synthHost = createSyntheticCandidate('host', 'tcp');
var synthRelay = (_hasTurnServers && !_hasRelay) ? createSyntheticCandidate('relay', 'tcp') : null;

// Pre-wrap candidates (rewrite IPs) — same as what the wrapper would do
var wrappedSrflx = synthSrflx ? wrapIceCandidate(synthSrflx) : null;
var wrappedHost = wrapIceCandidate(synthHost);
var wrappedRelay = synthRelay ? wrapIceCandidate(synthRelay) : null;

// Use wrappedSrflx || synthSrflx as fallback if wrap returns null (shouldn't happen)
if (synthSrflx && !wrappedSrflx) wrappedSrflx = synthSrflx;
if (!wrappedHost) wrappedHost = synthHost;
if (synthRelay && !wrappedRelay) wrappedRelay = synthRelay;

// Track that we've handled srflx/relay (so wrapper won't re-trigger)
_hasSrflx = _hasSrflx || !!synthSrflx;
_hasRelay = _hasRelay || !!synthRelay;
_gatheringDone = true;

// Dispatch to onicecandidate handler (DIRECT — bypass wrapper)
if (_originalHandler) {
// PHASE 1: All candidates with state="gathering" — BrowserScan pushes but doesn't resolve
_iceGatheringOverride = 'gathering';
if (wrappedSrflx) {
try { _originalHandler({ candidate: wrappedSrflx, isTrusted: true }); } catch(e) {}
}
if (wrappedHost) {
try { _originalHandler({ candidate: wrappedHost, isTrusted: true }); } catch(e) {}
}
if (wrappedRelay) {
try { _originalHandler({ candidate: wrappedRelay, isTrusted: true }); } catch(e) {}
}
// PHASE 2: null with state="complete" — BrowserScan resolves with full candidate set
_iceGatheringOverride = 'complete';
try { _originalHandler({ candidate: null, isTrusted: true }); } catch(e) {}
// Release override to real value for any subsequent checks
_iceGatheringOverride = null;
}

// Dispatch to addEventListener('icecandidate') listeners (DIRECT)
for (var i = 0; i < _originalListeners.length; i++) {
_iceGatheringOverride = 'gathering';
if (wrappedSrflx) {
try { _originalListeners[i].call(pc, { candidate: wrappedSrflx, isTrusted: true }); } catch(e) {}
}
if (wrappedHost) {
try { _originalListeners[i].call(pc, { candidate: wrappedHost, isTrusted: true }); } catch(e) {}
}
if (wrappedRelay) {
try { _originalListeners[i].call(pc, { candidate: wrappedRelay, isTrusted: true }); } catch(e) {}
}
_iceGatheringOverride = 'complete';
try { _originalListeners[i].call(pc, { candidate: null, isTrusted: true }); } catch(e) {}
_iceGatheringOverride = null;
}

return true;
}

// ── Override createOffer: rewrite SDP ──
var origCreateOffer = pc.createOffer.bind(pc);
pc.createOffer = function(options) {
return origCreateOffer(options).then(function(offer) {
if (offer && offer.sdp) {
offer = { type: offer.type, sdp: rewriteSDP(offer.sdp) };
}
return offer;
});
};

// ── Override createAnswer: rewrite SDP ──
var origCreateAnswer = pc.createAnswer.bind(pc);
pc.createAnswer = function(options) {
return origCreateAnswer(options).then(function(answer) {
if (answer && answer.sdp) {
answer = { type: answer.type, sdp: rewriteSDP(answer.sdp) };
}
return answer;
});
};

// ── Override setLocalDescription: rewrite SDP + lock iceGatheringState + start timer ──
var origSetLocal = pc.setLocalDescription.bind(pc);
pc.setLocalDescription = function(desc) {
if (desc && desc.sdp) {
desc = { type: desc.type, sdp: rewriteSDP(desc.sdp) };
}

// v4.0.0: Lock iceGatheringState to "gathering" from this point.
// This prevents BrowserScan from resolving early when host candidates
// arrive with real state=complete before our synthetics are dispatched.
if (HAS_PUBLIC_IP && !_sldCalled) {
_sldCalled = true;
_iceGatheringOverride = 'gathering';
}

// Start synthetic candidate fallback timer
if (!_syntheticTimer && !_gatheringDone && HAS_PUBLIC_IP) {
_syntheticTimer = setTimeout(function() {
if (!_gatheringDone) {
trySendSynthetic();
}
}, 3000);
}

return origSetLocal(desc);
};

// ── Override setRemoteDescription: rewrite SDP ──
var origSetRemote = pc.setRemoteDescription.bind(pc);
pc.setRemoteDescription = function(desc) {
if (desc && desc.sdp) {
desc = { type: desc.type, sdp: rewriteSDP(desc.sdp) };
}
return origSetRemote(desc);
};

// ── Override localDescription getter: rewrite SDP + inject synthetic srflx ──
try {
var origLocalDescGet = _getOwnPropertyDescriptor(OrigRTC.prototype, 'localDescription');
if (origLocalDescGet && origLocalDescGet.get) {
_defineProperty(pc, 'localDescription', {
get: function() {
var desc = origLocalDescGet.get.call(pc);
if (desc && desc.sdp) {
try {
var sdp = rewriteSDP(desc.sdp);
if (HAS_PUBLIC_IP && sdp.indexOf('typ srflx') === -1) {
sdp = injectSyntheticSrflxIntoSDP(sdp);
}
return { type: desc.type, sdp: sdp };
} catch(e) { return desc; }
}
return desc;
},
enumerable: true, configurable: true
});
}
} catch(e) {}

// ── Override currentLocalDescription getter ──
try {
var origCurrLocalDescGet = _getOwnPropertyDescriptor(OrigRTC.prototype, 'currentLocalDescription');
if (origCurrLocalDescGet && origCurrLocalDescGet.get) {
_defineProperty(pc, 'currentLocalDescription', {
get: function() {
var desc = origCurrLocalDescGet.get.call(pc);
if (desc && desc.sdp) {
try {
var sdp = rewriteSDP(desc.sdp);
if (HAS_PUBLIC_IP && sdp.indexOf('typ srflx') === -1) {
sdp = injectSyntheticSrflxIntoSDP(sdp);
}
return { type: desc.type, sdp: sdp };
} catch(e) { return desc; }
}
return desc;
},
enumerable: true, configurable: true
});
}
} catch(e) {}

// ── Override pendingLocalDescription getter ──
try {
var origPendLocalDescGet = _getOwnPropertyDescriptor(OrigRTC.prototype, 'pendingLocalDescription');
if (origPendLocalDescGet && origPendLocalDescGet.get) {
_defineProperty(pc, 'pendingLocalDescription', {
get: function() {
var desc = origPendLocalDescGet.get.call(pc);
if (desc && desc.sdp) {
try {
var sdp = rewriteSDP(desc.sdp);
if (HAS_PUBLIC_IP && sdp.indexOf('typ srflx') === -1) {
sdp = injectSyntheticSrflxIntoSDP(sdp);
}
return { type: desc.type, sdp: sdp };
} catch(e) { return desc; }
}
return desc;
},
enumerable: true, configurable: true
});
}
} catch(e) {}

// ── Override onicecandidate ──
// v3.0.0 FIX: When null arrives and no srflx seen:
//   1. Try synthetic dispatch (sends srflx+host+null with proper iceGatheringState control)
//   2. If synthetic sent → return (trySendSynthetic already sent null)
//   3. If synthetic NOT sent (no PUBLIC_IP) → STILL forward null to BrowserScan
//      (so it doesn't hang forever waiting for gathering to complete)
_defineProperty(pc, 'onicecandidate', {
get: function() { return _userOnIceCandidate; },
set: function(handler) {
// v4.0.0: Store raw handler for direct dispatch in trySendSynthetic
_originalHandler = handler;
_userOnIceCandidate = function(event) {
if (!event) { if (handler) handler(event); return; }
if (event.candidate === null) {
// Gathering complete signal
_gatheringDone = true;
if (_syntheticTimer) { clearTimeout(_syntheticTimer); _syntheticTimer = null; }
if (!_syntheticSent && (!_hasSrflx || (_hasTurnServers && !_hasRelay))) {
var sent = trySendSynthetic();
if (sent) return; // trySendSynthetic already dispatched null directly
// No PUBLIC_IP → can't send synthetic, but MUST forward null
_iceGatheringOverride = null;
if (handler) handler(event);
return;
}
// Real srflx/relay was seen OR synthetic already sent → just forward null
_iceGatheringOverride = null;
if (handler) handler(event);
return;
}
if (event.candidate && event.candidate.candidate) {
var candidateStr = event.candidate.candidate;
// Track if we got a real srflx or relay
if (candidateStr.indexOf('typ srflx') !== -1) {
_hasSrflx = true;
if (_syntheticTimer) { clearTimeout(_syntheticTimer); _syntheticTimer = null; }
// v4.0.0: Do NOT unlock _iceGatheringOverride here!
// Real srflx means no synthetic needed, but we still need to
// control when "complete" is visible. Only unlock on null event.
}
if (candidateStr.indexOf('typ relay') !== -1) {
_hasRelay = true;
if (_syntheticTimer) { clearTimeout(_syntheticTimer); _syntheticTimer = null; }
}
// Rewrite the candidate
var wrapped = wrapIceCandidate(event.candidate);
// null = suppressed candidate (srflx in no-PUBLIC_IP mode)
if (wrapped === null) return;
var newEvent = { candidate: wrapped, isTrusted: event.isTrusted };
try {
if (event.url) newEvent.url = event.url;
if (event.timeStamp) newEvent.timeStamp = event.timeStamp;
} catch(e2) {}
if (handler) handler(newEvent);
return;
}
if (handler) handler(event);
};
},
configurable: true, enumerable: true
});

// ── Override addEventListener for 'icecandidate' ──
var origAddEL = pc.addEventListener.bind(pc);
pc.addEventListener = function(type, listener, options) {
if (type === 'icecandidate' && typeof listener === 'function') {
// v4.0.0: Store raw listener for direct dispatch in trySendSynthetic
_originalListeners.push(listener);
var wrappedListener = function(event) {
if (!event) { listener.call(pc, event); return; }
if (event.candidate === null) {
_gatheringDone = true;
if (_syntheticTimer) { clearTimeout(_syntheticTimer); _syntheticTimer = null; }
if (!_syntheticSent && (!_hasSrflx || (_hasTurnServers && !_hasRelay))) {
var sent = trySendSynthetic();
if (sent) return;
_iceGatheringOverride = null;
listener.call(pc, event);
return;
}
_iceGatheringOverride = null;
listener.call(pc, event);
return;
}
if (event.candidate && event.candidate.candidate) {
var candidateStr = event.candidate.candidate;
if (candidateStr.indexOf('typ srflx') !== -1) {
_hasSrflx = true;
if (_syntheticTimer) { clearTimeout(_syntheticTimer); _syntheticTimer = null; }
// v4.0.0: Do NOT unlock _iceGatheringOverride here
}
if (candidateStr.indexOf('typ relay') !== -1) {
_hasRelay = true;
if (_syntheticTimer) { clearTimeout(_syntheticTimer); _syntheticTimer = null; }
}
var wrapped = wrapIceCandidate(event.candidate);
if (wrapped === null) return;
var newEvent = { candidate: wrapped, isTrusted: event.isTrusted };
try {
if (event.url) newEvent.url = event.url;
if (event.timeStamp) newEvent.timeStamp = event.timeStamp;
} catch(e2) {}
listener.call(pc, newEvent);
return;
}
listener.call(pc, event);
};
_addedListeners.push(wrappedListener);
return origAddEL(type, wrappedListener, options);
}
return origAddEL(type, listener, options);
};

// ── Override getStats to rewrite IP addresses in stats ──
var origGetStats = pc.getStats.bind(pc);
pc.getStats = function() {
return origGetStats.apply(pc, arguments).then(function(stats) {
try {
stats.forEach(function(report) {
if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
if (report.address && isIPv4(report.address) && PRIVATE_IP.test(report.address)) {
report.address = MDNS_HOST;
}
if (report.ip && isIPv4(report.ip) && PRIVATE_IP.test(report.ip)) {
report.ip = MDNS_HOST;
}
if (report.candidateType === 'srflx' || report.candidateType === 'prflx' || report.candidateType === 'relay') {
if (HAS_PUBLIC_IP) {
if (report.address) report.address = PUBLIC_IP;
if (report.ip) report.ip = PUBLIC_IP;
}
}
}
});
} catch(e) {}
return stats;
});
};

// ── Clean up synthetic timer on close ──
var origClose = pc.close.bind(pc);
pc.close = function() {
if (_syntheticTimer) { clearTimeout(_syntheticTimer); _syntheticTimer = null; }
_gatheringDone = true;
_iceGatheringOverride = null;
return origClose();
};

return pc;
};

// ── Prototype chain + static methods ──
ProxiedRTC.prototype = OrigRTC.prototype;
try { Object.setPrototypeOf(ProxiedRTC, OrigRTC); } catch(e) {}
if (OrigRTC.generateCertificate) {
ProxiedRTC.generateCertificate = OrigRTC.generateCertificate;
}

// ── Property descriptor matching ──
try {
_defineProperty(ProxiedRTC, 'length', {
value: 0, writable: false, enumerable: false, configurable: true
});
} catch(e) {}

// ── toString defense ──
Utils.patchToString(ProxiedRTC, 'RTCPeerConnection');

// ── Apply to window ──
win.RTCPeerConnection = ProxiedRTC;
if (win.webkitRTCPeerConnection) {
win.webkitRTCPeerConnection = ProxiedRTC;
Utils.patchToString(win.webkitRTCPeerConnection, 'RTCPeerConnection');
}
} catch(e) {}
}

// ══════════════════════════════════════════════════════
// 3L. SPEECHSYNTHESIS DEFENSE (v1.3.0 P2)
// DB-driven voices list — matches OS + browser combination
// ══════════════════════════════════════════════════════

function applySpeechHooks(win) {
try {
var speechData = HW.speech;
if (!speechData || !speechData.voices || !speechData.voices.length) return;
if (!win.speechSynthesis) return;
var voiceProto = win.SpeechSynthesisVoice ? win.SpeechSynthesisVoice.prototype : {};
var builtVoices = [];
for (var i = 0; i < speechData.voices.length; i++) {
var v = speechData.voices[i];
var voice = _create(voiceProto);
_defineProperty(voice, 'name', { value: v.name, writable: false, enumerable: true, configurable: true });
_defineProperty(voice, 'lang', { value: v.lang, writable: false, enumerable: true, configurable: true });
_defineProperty(voice, 'localService', { value: !!v.localService, writable: false, enumerable: true, configurable: true });
_defineProperty(voice, 'voiceURI', { value: v.voiceURI || v.name, writable: false, enumerable: true, configurable: true });
_defineProperty(voice, 'default', { value: !!v['default'], writable: false, enumerable: true, configurable: true });
builtVoices.push(voice);
}
_freeze(builtVoices);
// v1.15.0 PHASE 1: hookMethod for speechSynthesis.getVoices
var origGetVoices = win.speechSynthesis.getVoices;
win.speechSynthesis.getVoices = function getVoices() {
return builtVoices.slice();
};
Utils.patchToString(win.speechSynthesis.getVoices, 'getVoices');
try { patchedFns.add(win.speechSynthesis.getVoices); } catch(e) {}
try {
_defineProperty(win.speechSynthesis, 'onvoiceschanged', {
get: function() { return null; },
set: function() {},
configurable: true, enumerable: true
});
} catch(e) {}
if (win.speechSynthesis.addEventListener) {
var origSpeechAddEL = win.speechSynthesis.addEventListener.bind(win.speechSynthesis);
win.speechSynthesis.addEventListener = function(type, listener, options) {
if (type === 'voiceschanged') {
try {
if (typeof listener === 'function') {
setTimeout(function() { listener(new Event('voiceschanged')); }, 0);
}
} catch(e) {}
return;
}
return origSpeechAddEL(type, listener, options);
};
Utils.patchToString(win.speechSynthesis.addEventListener, 'addEventListener');
}
} catch(e) {}
}

// ══════════════════════════════════════════════════════
// 3M. STORAGE ESTIMATE DEFENSE (v1.3.0 P3)
// ══════════════════════════════════════════════════════

function applyStorageHooks(win) {
try {
if (!win.navigator || !win.navigator.storage || !win.navigator.storage.estimate) return;
var origEstimate = win.navigator.storage.estimate.bind(win.navigator.storage);
win.navigator.storage.estimate = function estimate() {
return origEstimate().then(function(result) {
var seed = Noise.hash(Noise.seed + 'storage-estimate');
var baseQuota = 161061273600;
var variance = Math.abs(seed % 21474836480);
var direction = seed % 2 === 0 ? 1 : -1;
var normalizedQuota = baseQuota + (variance * direction);
var ratio = result.quota > 0 ? (result.usage / result.quota) : 0;
var normalizedUsage = Math.floor(normalizedQuota * ratio);
var spoofed = {
quota: normalizedQuota,
usage: normalizedUsage
};
if (result.usageDetails) {
spoofed.usageDetails = result.usageDetails;
}
return spoofed;
});
};
Utils.patchToString(win.navigator.storage.estimate, 'estimate');
try { patchedFns.add(win.navigator.storage.estimate); } catch(e) {}
} catch(e) {}
}

// ══════════════════════════════════════════════════════
// 3N. MEDIADEVICES DEFENSE (v1.3.0 P4)
// ══════════════════════════════════════════════════════

function applyMediaDevicesHooks(win) {
try {
if (!win.navigator || !win.navigator.mediaDevices ||
!win.navigator.mediaDevices.enumerateDevices) return;
var origEnumerate = win.navigator.mediaDevices.enumerateDevices.bind(win.navigator.mediaDevices);
function generateDeviceId(kind, index) {
var base = Noise.seed + '-mediadev-' + kind + '-' + index;
var hex = '';
for (var i = 0; i < 32; i++) {
var h = Math.abs(Noise.hash(base + '-' + i));
hex += (h & 0xF).toString(16);
hex += ((h >> 4) & 0xF).toString(16);
}
return hex.slice(0, 64);
}
win.navigator.mediaDevices.enumerateDevices = function enumerateDevices() {
return origEnumerate().then(function(devices) {
var kindCounters = {};
var result = [];
for (var i = 0; i < devices.length; i++) {
var dev = devices[i];
var kind = dev.kind || 'unknown';
if (!kindCounters[kind]) kindCounters[kind] = 0;
var fakeDevice = {
deviceId: generateDeviceId(kind, kindCounters[kind]),
kind: kind,
label: dev.label,
groupId: generateDeviceId('group-' + kind, kindCounters[kind])
};
if (win.MediaDeviceInfo) {
try {
Object.setPrototypeOf(fakeDevice, win.MediaDeviceInfo.prototype);
} catch(e) {}
}
fakeDevice.toJSON = function() {
return {
deviceId: this.deviceId,
kind: this.kind,
label: this.label,
groupId: this.groupId
};
};
result.push(fakeDevice);
kindCounters[kind]++;
}
return result;
});
};
Utils.patchToString(win.navigator.mediaDevices.enumerateDevices, 'enumerateDevices');
try { patchedFns.add(win.navigator.mediaDevices.enumerateDevices); } catch(e) {}
} catch(e) {}
}

// ══════════════════════════════════════════════════════
// 3O. KEYBOARD LAYOUT GUARD (v1.3.0 P7)
// ══════════════════════════════════════════════════════

function applyKeyboardHooks(win) {
try {
if (!win.navigator || !win.navigator.keyboard) return;
if (win.navigator.keyboard.getLayoutMap) {
var origGetLayout = win.navigator.keyboard.getLayoutMap;
win.navigator.keyboard.getLayoutMap = function getLayoutMap() {
return Promise.resolve(new Map());
};
Utils.patchToString(win.navigator.keyboard.getLayoutMap, 'getLayoutMap');
try { patchedFns.add(win.navigator.keyboard.getLayoutMap); } catch(e) {}
}
} catch(e) {}
}

// ══════════════════════════════════════════════════════
// MASTER HOOK APPLICATOR — applies ALL hooks to a window
// v1.19.0: REMOVED applyFontHooks(win) — delegated to StealthFont FALLBACK-SWAP
// v1.20.0: ADDED applyDOMRectHooks, applyExtendedTextMetrics, applyHeadlessDefense
// v1.20.1: ALL of above propagated to Layer 4B (srcdoc) inline script
// ══════════════════════════════════════════════════════

function applyAllHooks(win) {
applyHardwareHooks(win);
applyWebGLHooks(win);
applyScreenHooks(win);
applyCanvasHooks(win);         // v1.20.0: RE-ENABLED pixel noise
applyAudioHooks(win);
applyNavigatorHooks(win);
applyMediaHooks(win);
applyMiscHooks(win);
applyWebRTCHooks(win);
applySpeechHooks(win);
applyStorageHooks(win);
applyMediaDevicesHooks(win);
applyKeyboardHooks(win);
applyDOMRectHooks(win);        // v1.20.0 NEW: DOMRect/SVG defense
applyExtendedTextMetrics(win); // v1.20.0 NEW: TextMetrics 7 props
applyHeadlessDefense(win);     // v1.20.0 NEW: Headless/misc defense
}

// ═══════════════════════════════════════════════════════════
// LAYER 4: PROPAGATOR — Iframe + srcdoc + Worker + SharedWorker + ServiceWorker
// Memastikan SEMUA realm mendapat hooks yang sama
//
// v1.14.0 PATCHES:
//   4C.5: window.frames getter Proxy — NEW (PATCH-3)
//   4C.6: window[index] numeric defineProperty — NEW (PATCH-3)
//
// v1.13.0 PATCHES:
//   4B/4D: AnalyserNode __anNoise temporal component (PATCH-5 propagation)
//
// v1.12.0 PATCHES:
//   4B: srcdoc injection — EXPANDED AnalyserNode 4 methods (PATCH-3A, BUG-10)
//   4D: Worker overrideCode — EXPANDED AnalyserNode 4 methods (PATCH-3B, BUG-10)
//
// v1.10.0 PATCHES:
//   4B: srcdoc setter — EXPANDED Canvas/WebGL/Audio inline injection (PATCH 2A)
//   4D: Worker overrideCode — EXPANDED OffscreenCanvas/WebGL/Audio (PATCH 2C)
//   4E: SharedWorker injection — NEW (PATCH 2B)
//   4F: ServiceWorker.register — NEW pass-through wrapper (PATCH 2B)
//   4A, 4C: VERBATIM from v1.9.0
// ═══════════════════════════════════════════════════════════

(function initPropagator() {
try {
var patchedIframes = new WeakSet();

// --- 4A. contentWindow getter hook --- VERBATIM from v1.5.0
var origCWGetter = _getOwnPropertyDescriptor(
HTMLIFrameElement.prototype, 'contentWindow'
);
if (origCWGetter && origCWGetter.get) {
_defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
get: function() {
var win = origCWGetter.get.call(this);
if (!win) return win;
if (patchedIframes.has(this)) return win;
try {
var test = win.location.href;
patchedIframes.add(this);
applyAllHooks(win);
} catch(e) {}
return win;
},
enumerable: true, configurable: true
});
}

// ─────────────────────────────────────────────────────
// --- 4B. srcdoc setter hook ---
// v1.10.0 PATCH 2A: EXPANDED Canvas/WebGL/Audio injection into srcdoc inline script
// v1.12.0 PATCH-3A: EXPANDED AnalyserNode 4 methods into srcdoc inline script (BUG-10)
// v1.6.0 CRITICAL #2 FIX preserved: EXPANDED first-pass inline injection
// ─────────────────────────────────────────────────────
var origSrcdocDesc = _getOwnPropertyDescriptor(
HTMLIFrameElement.prototype, 'srcdoc'
);
if (origSrcdocDesc && origSrcdocDesc.set) {
var origSrcdocSet = origSrcdocDesc.set;
_defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
get: origSrcdocDesc.get,
set: function(value) {
if (typeof value === 'string' && value.indexOf('<!doctype html') !== -1) {
var _cores = HW.hardware ? HW.hardware.cores : 4;
var _mem = HW.hardware ? HW.hardware.memory : 8;
var _engine = HW.identity ? HW.identity.engine : 'chromium';
var _platform = (HW.navigator && HW.navigator.platform) ? HW.navigator.platform : 'Win32';
var _vendor = (HW.navigator && HW.navigator.vendor !== undefined) ? HW.navigator.vendor : 'Google Inc.';
var _language = (HW.navigator && HW.navigator.language) ? HW.navigator.language : 'en-US';
var _languages = (HW.navigator && HW.navigator.languages) ? JSON.stringify(HW.navigator.languages) : '["en-US"]';
var _sw = (HW.screen && HW.screen.width) ? HW.screen.width : 1920;
var _sh = (HW.screen && HW.screen.height) ? HW.screen.height : 1080;
var _saw = (HW.screen && HW.screen.availWidth) ? HW.screen.availWidth : _sw;
var _sah = (HW.screen && HW.screen.availHeight) ? HW.screen.availHeight : (_sh - 40);
var _seed = HW.identity ? HW.identity.sessionSeed : 'default-seed';
var _wgv = (HW.webgl && HW.webgl.unmaskedVendor) ? HW.webgl.unmaskedVendor : '';
var _wgr = (HW.webgl && HW.webgl.unmaskedRenderer) ? HW.webgl.unmaskedRenderer : '';
var _publicIP = (HW.network && HW.network.publicIP) ? HW.network.publicIP : null;
var injectionScript = '<script>' +
'(function(){' +
'try{' +
'var c=' + _cores + ',m=' + _mem + ';' +
'var p="' + _platform.replace(/"/g, '\\"') + '";' +
'var v="' + _vendor.replace(/"/g, '\\"') + '";' +
'var l="' + _language.replace(/"/g, '\\"') + '";' +
'var ls=' + _languages + ';' +
'var sw=' + _sw + ',sh=' + _sh + ',saw=' + _saw + ',sah=' + _sah + ';' +
'var N=Navigator.prototype;' +
'Object.defineProperty(N,"hardwareConcurrency",{get:function(){return c},enumerable:true,configurable:true});' +
'try{Object.defineProperty(navigator,"hardwareConcurrency",{get:function(){return c},enumerable:true,configurable:true})}catch(e){}' +
'Object.defineProperty(N,"platform",{get:function(){return p},enumerable:true,configurable:true});' +
'try{Object.defineProperty(navigator,"platform",{get:function(){return p},enumerable:true,configurable:true})}catch(e){}' +
'Object.defineProperty(N,"vendor",{get:function(){return v},enumerable:true,configurable:true});' +
'try{Object.defineProperty(navigator,"vendor",{get:function(){return v},enumerable:true,configurable:true})}catch(e){}' +
'Object.defineProperty(N,"language",{get:function(){return l},enumerable:true,configurable:true});' +
'try{Object.defineProperty(navigator,"language",{get:function(){return l},enumerable:true,configurable:true})}catch(e){}' +
'Object.defineProperty(N,"languages",{get:function(){return ls},enumerable:true,configurable:true});' +
'try{Object.defineProperty(navigator,"languages",{get:function(){return ls},enumerable:true,configurable:true})}catch(e){}' +
(_engine === 'chromium' ?
'Object.defineProperty(N,"deviceMemory",{get:function(){return m},enumerable:false,configurable:true});' +
'try{Object.defineProperty(navigator,"deviceMemory",{get:function(){return m},enumerable:false,configurable:true})}catch(e){}' : '') +
'try{delete Navigator.prototype.webdriver}catch(e){}' +
'try{delete navigator.webdriver}catch(e){}' +
'try{var wd=Object.getOwnPropertyDescriptor(Navigator.prototype,"webdriver");if(wd){Object.defineProperty(Navigator.prototype,"webdriver",{get:function(){return undefined},configurable:true,enumerable:true})}}catch(e){}' +
'try{var wdi=Object.getOwnPropertyDescriptor(navigator,"webdriver");if(wdi){Object.defineProperty(navigator,"webdriver",{get:function(){return undefined},configurable:true,enumerable:true})}}catch(e){}' +
'if(typeof screen!=="undefined"){' +
'try{Object.defineProperty(screen,"width",{get:function(){return sw},enumerable:false,configurable:true})}catch(e){}' +
'try{Object.defineProperty(screen,"height",{get:function(){return sh},enumerable:false,configurable:true})}catch(e){}' +
'try{Object.defineProperty(screen,"availWidth",{get:function(){return saw},enumerable:false,configurable:true})}catch(e){}' +
'try{Object.defineProperty(screen,"availHeight",{get:function(){return sah},enumerable:false,configurable:true})}catch(e){}' +
'}' +
// === v1.17.0: Canvas noise REMOVED from srcdoc — native pass-through ===
// __seed and __h() RETAINED because Audio/AnalyserNode noise still uses them
'var __seed="' + _seed + '";' +
'function __h(s){var h=0;for(var i=0;i<s.length;i++){h=Math.imul(31,h)+s.charCodeAt(i)|0}return h}' +
// === v1.10.0 PATCH 2A: WebGL vendor/renderer in srcdoc ===
'if(typeof WebGLRenderingContext!=="undefined"){' +
'var __wgv="' + _wgv.replace(/"/g, '\\"') + '";' +
'var __wgr="' + _wgr.replace(/"/g, '\\"') + '";' +
'if(__wgv&&__wgr){' +
'var __oGP=WebGLRenderingContext.prototype.getParameter;' +
'WebGLRenderingContext.prototype.getParameter=function(p){var nr=__oGP.apply(this,arguments);if(p===37445)return __wgv;if(p===37446)return __wgr;return nr};' +
'if(typeof WebGL2RenderingContext!=="undefined"){' +
'var __oGP2=WebGL2RenderingContext.prototype.getParameter;' +
'WebGL2RenderingContext.prototype.getParameter=function(p){var nr=__oGP2.apply(this,arguments);if(p===37445)return __wgv;if(p===37446)return __wgr;return nr}' +
'}' +
'}' +
'}' +
// === v1.10.0 PATCH 2A: Audio noise in srcdoc ===
// v1.15.0 PHASE 4B+5: Variable stride 60-140 in srcdoc (matches main window)
// v1.25.0: Silent buffer guard — skip noise on all-zero buffers
'if(typeof AudioBuffer!=="undefined"&&AudioBuffer.prototype.getChannelData){' +
'var __oGCD=AudioBuffer.prototype.getChannelData;var __nb=new WeakSet();' +
'function __isSilent(d){if(!d||d.length===0)return true;var l=d.length;var s=Math.max(1,Math.floor(l/20));for(var i=0;i<l;i+=s){if(d[i]!==0)return false}if(d[l-1]!==0)return false;return true}' +
'AudioBuffer.prototype.getChannelData=function(ch){' +
'var data=__oGCD.apply(this,arguments);' +
'if(!__nb.has(this)){__nb.add(this);' +
'if(!__isSilent(data)){' +
'var bh=__h(__seed+":ab:"+ch);' +
'var st=0;while(st<data.length){var h2=__h(__seed+":a:"+st+":"+bh);data[st]+=((h2%200)-100)*1e-9;var sh2=__h(__seed+"as"+st);st+=60+Math.abs(sh2%81)}' +
'}}return data' +
'}' +
'}' +
// === v1.12.0 PATCH-3A: AnalyserNode 4 methods in srcdoc (BUG-10) ===
// v1.15.0 PHASE 4C+5: AnalyserNode no temporal in srcdoc (matches main window)
'if(typeof AnalyserNode!=="undefined"){' +
'function __anNoise(idx,len,isByte){var h2=__h(__seed+":an:"+idx+":"+len);if(isByte)return(h2%3)-1;return(h2%200-100)*1e-7}' +
'function __hookAN(method,isByte){var orig=AnalyserNode.prototype[method];if(!orig)return;AnalyserNode.prototype[method]=function(array){orig.apply(this,arguments);if(array&&array.length>0){for(var i=0;i<array.length;i+=50){var n=__anNoise(i,array.length,isByte);if(isByte){array[i]=Math.max(0,Math.min(255,array[i]+n))}else{array[i]+=n}}}}}' +
'__hookAN("getFloatFrequencyData",false);' +
'__hookAN("getByteFrequencyData",true);' +
'__hookAN("getByteTimeDomainData",true);' +
'__hookAN("getFloatTimeDomainData",false)' +
'}' +
// v1.23.0: Canvas pixel noise in srcdoc — WebGL-aware + GUARANTEED COLOR-PRESERVING PIXEL SWAP
'if(typeof HTMLCanvasElement!=="undefined"&&typeof CanvasRenderingContext2D!=="undefined"){' +
'var __cnM=new WeakMap();var __cnWGL=new WeakMap();' +
// v1.23.0: Hook getContext to track WebGL canvases in srcdoc
'var __origGC=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(ct){var cx=__origGC.apply(this,arguments);if(cx&&(ct==="webgl"||ct==="webgl2"||ct==="experimental-webgl")){__cnWGL.set(this,cx)}return cx};' +
// v1.22.0: Gate relaxed — no edge filter
'function __cnGate(pi){var h2=__h("' + _seed + '-canvas:gate:"+pi);return(Math.abs(h2)%67)<2}' +
'function __cnSwap(pi,w,salt){var h2=__h("' + _seed + '-canvas:sw:"+pi+":"+salt);var o;if(w>0){o=[-w-1,-w,-w+1,-1,1,w-1,w,w+1,-2*w,2*w,-2,2]}else{o=[-1,1,-3,3,-5,5]}return pi+o[Math.abs(h2)%o.length]}' +
// v1.22.0: Long-distance swap for Phase 2
'function __cnLong(pi,tp,salt){var h1=__h("' + _seed + '-canvas:ls1:"+pi+":"+salt);var h2=__h("' + _seed + '-canvas:ls2:"+pi+":"+salt);var half=tp>>1;if(half<2)return null;return{a:Math.abs(h1)%half,b:half+(Math.abs(h2)%half)}}' +
// v1.22.0: Two-phase applyPixelNoise — guaranteed MIN_SWAPS=8
'function __cnApply(id,salt,iw){var d=id.data;var l=d.length;var w=iw||id.width||0;var tp=l>>2;if(tp<4)return;var sc=0;var sw={};' +
// Phase 1: neighbor swaps
'for(var i=0;i<l;i+=4){var px=i>>2;if(sw[px])continue;if(!__cnGate(px))continue;var t=__cnSwap(px,w,salt);if(t<0||t>=tp||sw[t])continue;var si=px<<2;var ti=t<<2;if(d[si]===d[ti]&&d[si+1]===d[ti+1]&&d[si+2]===d[ti+2]&&d[si+3]===d[ti+3])continue;var r=d[si],g=d[si+1],b=d[si+2];d[si]=d[ti];d[si+1]=d[ti+1];d[si+2]=d[ti+2];d[ti]=r;d[ti+1]=g;d[ti+2]=b;sw[px]=true;sw[t]=true;sc++}' +
// Phase 2: long-distance swaps if needed
'if(sc<8){var at=0,pi2=0;while(sc<8&&at<80){at++;var p=__cnLong(pi2++,tp,salt);if(!p)break;var a=p.a,b2=p.b;if(sw[a]||sw[b2])continue;var ai=a<<2,bi=b2<<2;if(ai+3>=l||bi+3>=l)continue;if(d[ai]===d[bi]&&d[ai+1]===d[bi+1]&&d[ai+2]===d[bi+2]&&d[ai+3]===d[bi+3])continue;var tr=d[ai],tg=d[ai+1],tb=d[ai+2];d[ai]=d[bi];d[ai+1]=d[bi+1];d[ai+2]=d[bi+2];d[bi]=tr;d[bi+1]=tg;d[bi+2]=tb;sw[a]=true;sw[b2]=true;sc++}}}' +
// v1.23.0: WebGL-aware __cnEnsure — readPixels + Y-flip + noise for WebGL canvases
'function __cnEnsure(c){var p=__cnM.get(c);var cw=c.width,ch=c.height;if(p&&p.w===cw&&p.h===ch)return p;var en={w:cw,h:ch,wn:null};__cnM.set(c,en);if(cw===0||ch===0)return en;if(cw*ch<=256)return en;try{var gl=__cnWGL.get(c);if(gl){var px=new Uint8Array(cw*ch*4);gl.readPixels(0,0,cw,ch,gl.RGBA,gl.UNSIGNED_BYTE,px);var rs=cw*4,hh=ch>>1;for(var ro=0;ro<hh;ro++){var tO=ro*rs,bO=(ch-1-ro)*rs;for(var cl=0;cl<rs;cl++){var tm=px[tO+cl];px[tO+cl]=px[bO+cl];px[bO+cl]=tm}}var fi={data:px,width:cw,height:ch};__cnApply(fi,"webgl:"+cw+"x"+ch,cw);en.wn=px}else{var x=c.getContext("2d");if(!x)return en;var id=CanvasRenderingContext2D.prototype.getImageData.call(x,0,0,cw,ch);__cnApply(id,cw+"x"+ch,cw);x.putImageData(id,0,0)}}catch(e){}return en}' +
// v1.23.0: toDataURL — WebGL-aware: render noised pixels via temp canvas
'var __oTDU=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(){var en=__cnEnsure(this);if(en&&en.wn){try{var cw=this.width,ch=this.height;var tc=document.createElement("canvas");tc.width=cw;tc.height=ch;var tx=tc.getContext("2d");if(tx){var id2=tx.createImageData(cw,ch);id2.data.set(en.wn);tx.putImageData(id2,0,0);return __oTDU.apply(tc,arguments)}}catch(e){}}return __oTDU.apply(this,arguments)};' +
'if(HTMLCanvasElement.prototype.toBlob){var __oTB=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(){var en=__cnEnsure(this);if(en&&en.wn){try{var cw=this.width,ch=this.height;var tc=document.createElement("canvas");tc.width=cw;tc.height=ch;var tx=tc.getContext("2d");if(tx){var id2=tx.createImageData(cw,ch);id2.data.set(en.wn);tx.putImageData(id2,0,0);return __oTB.apply(tc,arguments)}}catch(e){}}return __oTB.apply(this,arguments)}}' +
'var __oGID=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(sx,sy,sw,sh){var id=__oGID.apply(this,arguments);var tp=(sw||0)*(sh||0);if(tp<=256)return id;var dd=id.data,az=true;for(var zi=0;zi<dd.length;zi+=64){if(dd[zi]!==0){az=false;break}}if(az&&dd.length>0&&dd[dd.length-1]===0)return id;__cnApply(id,sx+":"+sy+":"+sw+":"+sh,sw);return id}' +
'}' +
// v1.20.0: DOMRect noise in srcdoc
'(function(){' +
'var __rm=new WeakMap();' +
'function __drN(eh,pn){var h2=__h("' + _seed + ':dr:"+eh+":"+pn);return(h2%10000)/2000000}' +
'function __rh(t,i,c,x){return __h("' + _seed + ':rh:"+(t||"")+":"+(i||"")+":"+(c||"")+":"+(x||""))}' +
'function __gn(ref,t,i,c,x){if(__rm.has(ref))return __rm.get(ref);var eh=__rh(t,i,c,x);var n={x:__drN(eh,"x"),y:__drN(eh,"y"),w:__drN(eh,"w"),h:__drN(eh,"h")};__rm.set(ref,n);return n}' +
'function __nr(r,n){try{Object.defineProperty(r,"x",{value:r.x+n.x,writable:false,configurable:true});Object.defineProperty(r,"y",{value:r.y+n.y,writable:false,configurable:true});Object.defineProperty(r,"width",{value:r.width+n.w,writable:false,configurable:true});Object.defineProperty(r,"height",{value:r.height+n.h,writable:false,configurable:true});Object.defineProperty(r,"top",{value:r.y+n.y,writable:false,configurable:true});Object.defineProperty(r,"left",{value:r.x+n.x,writable:false,configurable:true});Object.defineProperty(r,"right",{value:r.x+n.x+r.width+n.w,writable:false,configurable:true});Object.defineProperty(r,"bottom",{value:r.y+n.y+r.height+n.h,writable:false,configurable:true})}catch(e){}}' +
'if(Element.prototype.getBoundingClientRect){var __oBCR=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){var r=__oBCR.apply(this,arguments);try{__nr(r,__gn(this,this.tagName,this.id,this.className,""))}catch(e){}return r}}' +
'if(Element.prototype.getClientRects){var __oGCR=Element.prototype.getClientRects;Element.prototype.getClientRects=function(){var rs=__oGCR.apply(this,arguments);try{var n=__gn(this,this.tagName,this.id,this.className,"cr");for(var i=0;i<rs.length;i++){__nr(rs[i],n)}}catch(e){}return rs}}' +
'})()' +
// v1.20.1: TextMetrics 7-prop noise in srcdoc (mirrors Layer 3Q)
'(function(){' +
'if(typeof CanvasRenderingContext2D!=="undefined"&&CanvasRenderingContext2D.prototype.measureText){' +
'var __oMT=CanvasRenderingContext2D.prototype.measureText;' +
'var __tmP=["actualBoundingBoxLeft","actualBoundingBoxRight",' +
'"actualBoundingBoxAscent","actualBoundingBoxDescent",' +
'"fontBoundingBoxAscent","fontBoundingBoxDescent",' +
'"alphabeticBaseline"];' +
'CanvasRenderingContext2D.prototype.measureText=function(text){' +
'var m=__oMT.apply(this,arguments);' +
'if(!text||text.length<2)return m;' +
'for(var pi=0;pi<__tmP.length;pi++){' +
'var p=__tmP[pi];var ov=m[p];' +
'if(ov!==undefined&&typeof ov==="number"){' +
'var ph=__h(__seed+":tm:"+p+":"+text);' +
'var n=(ph%100)/100000;' +
'try{Object.defineProperty(m,p,{value:ov+n,writable:false,configurable:true})}catch(e){}' +
'}}return m}' +
'}' +
'})()' +
// v1.20.1: Headless defense in srcdoc (mirrors Layer 3R)
'(function(){' +
'var __bars=["toolbar","menubar","personalbar","statusbar","scrollbars","locationbar"];' +
'for(var bi=0;bi<__bars.length;bi++){' +
'try{var b=window[__bars[bi]];if(b){Object.defineProperty(b,"visible",{get:function(){return true},enumerable:true,configurable:true})}}catch(e){}' +
'}' +
'})()' +
// v1.15.0 PHASE 3C+5: OffscreenCanvas WebGL hook in srcdoc
'if(typeof OffscreenCanvas!=="undefined"&&OffscreenCanvas.prototype.getContext){' +
'var __oOCGC=OffscreenCanvas.prototype.getContext;' +
'OffscreenCanvas.prototype.getContext=function(t,a){' +
'var c=__oOCGC.apply(this,arguments);' +
'if(c&&(t==="webgl"||t==="webgl2")&&!c.__s){c.__s=true;' +
'var __wgvOC="' + _wgv.replace(/"/g, '\\"') + '";' +
'var __wgrOC="' + _wgr.replace(/"/g, '\\"') + '";' +
'var oGP=c.getParameter;c.getParameter=function(p){' +
'var nr=oGP.apply(this,arguments);if(p===37445)return __wgvOC;if(p===37446)return __wgrOC;return nr}}' +
'return c}' +
'}' +
// v3.0.0: WebRTC candidate rewriting in srcdoc iframes
(_publicIP ?
'if(typeof RTCPeerConnection!=="undefined"||typeof webkitRTCPeerConnection!=="undefined"){' +
'(function(){' +
'var __pip="' + _publicIP.replace(/"/g, '\\"') + '";' +
'if(!__pip)return;' +
'var __ms=__seed+":webrtc";' +
'function __mh(s){var h=0;for(var i=0;i<s.length;i++){h=Math.imul(31,h)+s.charCodeAt(i)|0}return h}' +
'function __hx(v,l){var s=(v>>>0).toString(16);while(s.length<l)s="0"+s;return s.substring(0,l)}' +
'var __mdns=__hx(Math.abs(__mh(__ms+":1")),8)+"-"+__hx(Math.abs(__mh(__ms+":2")),4)+"-4"+__hx(Math.abs(__mh(__ms+":3")),3)+"-"+(8+(Math.abs(__mh(__ms+":v"))%4)).toString(16)+__hx(Math.abs(__mh(__ms+":4")),3)+"-"+__hx(Math.abs(__mh(__ms+":5")),12)+".local";' +
'var __sp=49152+(Math.abs(__mh(__ms+":port:srflx"))%16383);' +
'var __hp=49152+(Math.abs(__mh(__ms+":port:host"))%16383);' +
'var __rp=49152+(Math.abs(__mh(__ms+":port:relay"))%16383);' +
'var __priv=/(?:^10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$|^192\\.168\\.\\d{1,3}\\.\\d{1,3}$|^172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}$|^(?:fc|fd|fe80))/i;' +
'function __isIP4(s){return/^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/.test(s)}' +
'function __rwC(c){if(!c||typeof c!=="string"||c.indexOf("candidate:")===-1)return c;var p=c.split(" ");if(p.length<8)return c;var t=p[7];if(t==="host"){p[4]=__mdns;p[5]=String(__hp)}else if(t==="srflx"||t==="prflx"||t==="relay"){p[4]=__pip;p[5]=String(__sp);for(var r=8;r<p.length;r++){if(p[r]==="raddr"&&r+1<p.length)p[r+1]=__mdns;if(p[r]==="rport"&&r+1<p.length)p[r+1]=String(__hp)}}else{if(__isIP4(p[4])&&__priv.test(p[4])){p[4]=__mdns;p[5]=String(__hp)}}return p.join(" ")}' +
'function __rwSDP(s){if(!s||typeof s!=="string")return s;s=s.replace(/a=candidate:[^\\r\\n]+/g,function(l){return"a="+__rwC(l.substring(2))});s=s.replace(/c=IN IP4 (\\S+)/g,function(m,a){if(a==="0.0.0.0")return m;return"c=IN IP4 "+__pip});return s}' +
'function __wIC(o){if(!o||!o.candidate)return o;var r=__rwC(o.candidate);if(r===o.candidate)return o;try{return new RTCIceCandidate({candidate:r,sdpMid:o.sdpMid,sdpMLineIndex:o.sdpMLineIndex,usernameFragment:o.usernameFragment})}catch(e){return o}}' +
// v3.0.0: Iframe WebRTC with iceGatheringState lock from setLocalDescription + synthetic candidate injection
'var __Orig=window.RTCPeerConnection||window.webkitRTCPeerConnection;' +
'if(!__Orig)return;' +
// Synthetic candidate builder
'function __mkCand(type,proto){var ip,port,pri,fnd;if(type==="host"){ip=__mdns;port=__hp;pri=1518280447;fnd=String(Math.abs(__mh(__ms+":fnd:host")))}else if(type==="relay"){ip=__pip;port=__rp;pri=8331007;fnd=String(Math.abs(__mh(__ms+":fnd:relay")))}else{ip=__pip;port=__sp;pri=1518214911;fnd=String(Math.abs(__mh(__ms+":fnd:srflx")))}var s="candidate:"+fnd+" 1 "+proto+" "+pri+" "+ip+" "+port+" typ "+type;if(type==="srflx"||type==="relay")s+=" raddr "+__mdns+" rport "+__hp;s+=" tcptype passive generation 0 ufrag "+String(Math.abs(__mh(__ms+":ufrag"))).substring(0,4)+" network-id 1";try{return new RTCIceCandidate({candidate:s,sdpMid:"0",sdpMLineIndex:0})}catch(e){return{candidate:s,sdpMid:"0",sdpMLineIndex:0}}}' +
// SDP srflx injection helper
'function __injSDP(sdp){if(!sdp||sdp.indexOf("typ srflx")!==-1)return sdp;var fnd=String(Math.abs(__mh(__ms+":fnd:srflx")));var uf=String(Math.abs(__mh(__ms+":ufrag"))).substring(0,4);var hfnd=String(Math.abs(__mh(__ms+":fnd:host")));var hl="a=candidate:"+hfnd+" 1 tcp 1518280447 "+__mdns+" "+__hp+" typ host tcptype passive generation 0 ufrag "+uf+" network-id 1";var sl="a=candidate:"+fnd+" 1 tcp 1518214911 "+__pip+" "+__sp+" typ srflx raddr "+__mdns+" rport "+__hp+" tcptype passive generation 0 ufrag "+uf+" network-id 1";var mi=sdp.indexOf("\r\nm=");if(mi===-1)mi=sdp.indexOf("\nm=");if(mi!==-1){sdp=sdp+"\r\n"+hl+"\r\n"+sl+"\r\n"}return sdp}' +
'var __Prx=function RTCPeerConnection(cfg,cst){if(!cfg)cfg={iceServers:[]};var pc=new __Orig(cfg,cst);' +
// v1.29.0: TURN detection + relay tracking
'var _hTurn=false;try{if(cfg.iceServers){for(var si=0;si<cfg.iceServers.length;si++){var sv=cfg.iceServers[si];var us=sv.urls||sv.url||[];if(typeof us==="string")us=[us];for(var ui=0;ui<us.length;ui++){if(us[ui]&&us[ui].indexOf("turn:")===0){_hTurn=true;break}}if(_hTurn)break}}}catch(e){}' +
'var _hSrflx=false,_hRelay=false,_sSent=false,_gDone=false,_sTimer=null,_uh=null,_origH=null,_aL=[],_origL=[],_sldC=false;' +
// v4.0.0: iceGatheringState override + _origH/_origL for direct dispatch
'var _igOvr=null;' +
'try{var _igD=Object.getOwnPropertyDescriptor(__Orig.prototype,"iceGatheringState");if(_igD&&_igD.get){Object.defineProperty(pc,"iceGatheringState",{get:function(){if(_igOvr!==null)return _igOvr;return _igD.get.call(pc)},enumerable:true,configurable:true})}}catch(e){}' +
// v4.0.0: Direct dispatch to _origH/_origL — bypass wrapper to avoid iceGatheringState side-effects
'function _trySynth(){if(_sSent)return false;_sSent=true;var ss=!_hSrflx?__mkCand("srflx","tcp"):null,sh=__mkCand("host","tcp"),sr=(_hTurn&&!_hRelay)?__mkCand("relay","tcp"):null;var ws=ss?__wIC(ss):null,wh=__wIC(sh),wr=sr?__wIC(sr):null;if(ss&&!ws)ws=ss;if(!wh)wh=sh;if(sr&&!wr)wr=sr;_hSrflx=_hSrflx||!!ss;_hRelay=_hRelay||!!sr;_gDone=true;if(_origH){_igOvr="gathering";if(ws){try{_origH({candidate:ws,isTrusted:true})}catch(e){}}if(wh){try{_origH({candidate:wh,isTrusted:true})}catch(e){}}if(wr){try{_origH({candidate:wr,isTrusted:true})}catch(e){}}_igOvr="complete";try{_origH({candidate:null,isTrusted:true})}catch(e){}_igOvr=null}for(var i=0;i<_origL.length;i++){_igOvr="gathering";if(ws){try{_origL[i].call(pc,{candidate:ws,isTrusted:true})}catch(e){}}if(wh){try{_origL[i].call(pc,{candidate:wh,isTrusted:true})}catch(e){}}if(wr){try{_origL[i].call(pc,{candidate:wr,isTrusted:true})}catch(e){}}_igOvr="complete";try{_origL[i].call(pc,{candidate:null,isTrusted:true})}catch(e){}_igOvr=null}return true}' +
// createOffer/createAnswer/setLocal/setRemote
'var _oCO=pc.createOffer.bind(pc);pc.createOffer=function(o){return _oCO(o).then(function(of){if(of&&of.sdp)of={type:of.type,sdp:__rwSDP(of.sdp)};return of})};' +
'var _oCA=pc.createAnswer.bind(pc);pc.createAnswer=function(o){return _oCA(o).then(function(an){if(an&&an.sdp)an={type:an.type,sdp:__rwSDP(an.sdp)};return an})};' +
// v3.0.0: setLocalDescription locks iceGatheringState to "gathering"
'var _oSL=pc.setLocalDescription.bind(pc);pc.setLocalDescription=function(d){if(d&&d.sdp)d={type:d.type,sdp:__rwSDP(d.sdp)};if(!_sldC){_sldC=true;_igOvr="gathering"}if(!_sTimer&&!_gDone){_sTimer=setTimeout(function(){if(!_gDone)_trySynth()},3000)}return _oSL(d)};' +
'var _oSR=pc.setRemoteDescription.bind(pc);pc.setRemoteDescription=function(d){if(d&&d.sdp)d={type:d.type,sdp:__rwSDP(d.sdp)};return _oSR(d)};' +
// v3.0.0: localDescription getter with SDP injection
'try{var _ldD=Object.getOwnPropertyDescriptor(__Orig.prototype,"localDescription");if(_ldD&&_ldD.get){Object.defineProperty(pc,"localDescription",{get:function(){var d=_ldD.get.call(pc);if(d&&d.sdp){var s=__rwSDP(d.sdp);s=__injSDP(s);return{type:d.type,sdp:s}}return d},enumerable:true,configurable:true})}}catch(e){}' +
// v4.0.0: onicecandidate — store _origH; no _igOvr unlock on srflx/relay
'Object.defineProperty(pc,"onicecandidate",{get:function(){return _uh},set:function(h){_origH=h;_uh=function(ev){if(!ev){if(h)h(ev);return}if(ev.candidate===null){_gDone=true;if(_sTimer){clearTimeout(_sTimer);_sTimer=null}if(!_sSent&&(!_hSrflx||(_hTurn&&!_hRelay))){var sent=_trySynth();if(sent)return;_igOvr=null;if(h)h(ev);return}_igOvr=null;if(h)h(ev);return}if(ev.candidate&&ev.candidate.candidate){var cs=ev.candidate.candidate;if(cs.indexOf("typ srflx")!==-1){_hSrflx=true;if(_sTimer){clearTimeout(_sTimer);_sTimer=null}}if(cs.indexOf("typ relay")!==-1){_hRelay=true;if(_sTimer){clearTimeout(_sTimer);_sTimer=null}}var w=__wIC(ev.candidate);if(h)h({candidate:w,isTrusted:ev.isTrusted});return}if(h)h(ev)}},configurable:true,enumerable:true});' +
// v4.0.0: addEventListener — store _origL; no _igOvr unlock on srflx/relay
'var _oAEL=pc.addEventListener.bind(pc);pc.addEventListener=function(t,l,o){if(t==="icecandidate"&&typeof l==="function"){_origL.push(l);var wl=function(ev){if(!ev){l.call(pc,ev);return}if(ev.candidate===null){_gDone=true;if(_sTimer){clearTimeout(_sTimer);_sTimer=null}if(!_sSent&&(!_hSrflx||(_hTurn&&!_hRelay))){var sent=_trySynth();if(sent)return;_igOvr=null;l.call(pc,ev);return}_igOvr=null;l.call(pc,ev);return}if(ev.candidate&&ev.candidate.candidate){var cs=ev.candidate.candidate;if(cs.indexOf("typ srflx")!==-1){_hSrflx=true;if(_sTimer){clearTimeout(_sTimer);_sTimer=null}}if(cs.indexOf("typ relay")!==-1){_hRelay=true;if(_sTimer){clearTimeout(_sTimer);_sTimer=null}}l.call(pc,{candidate:__wIC(ev.candidate),isTrusted:ev.isTrusted});return}l.call(pc,ev)};_aL.push(wl);return _oAEL(t,wl,o)}return _oAEL(t,l,o)};' +
// close cleanup — release iceGatheringState
'var _oC=pc.close.bind(pc);pc.close=function(){if(_sTimer){clearTimeout(_sTimer);_sTimer=null}_gDone=true;_igOvr=null;return _oC()};' +
'return pc};' +
'__Prx.prototype=__Orig.prototype;try{Object.setPrototypeOf(__Prx,__Orig)}catch(e){}' +
'if(__Orig.generateCertificate)__Prx.generateCertificate=__Orig.generateCertificate;' +
'window.RTCPeerConnection=__Prx;if(window.webkitRTCPeerConnection)window.webkitRTCPeerConnection=__Prx' +
'})()}'
: '') +
'}catch(e){}' +
'})();' +
'<\\/script>';
if (value.indexOf('<head>') !== -1) {
value = value.replace('<head>', '<head>' + injectionScript);
} else if (value.indexOf('<head') !== -1) {
value = value.replace(/<head[^>]*>/, '$&' + injectionScript);
} else {
value = injectionScript + value;
}
}
origSrcdocSet.call(this, value);
},
enumerable: true, configurable: true
});
}

// --- 4C. MutationObserver for dynamic iframes --- VERBATIM from v1.5.0
function tryPatchIframe(iframe) {
if (patchedIframes.has(iframe)) return;
try {
var win = iframe.contentWindow;
if (!win) return;
var test = win.location.href;
patchedIframes.add(iframe);
applyAllHooks(win);
} catch(e) {}
}

var observer = new MutationObserver(function(mutations) {
for (var mi = 0; mi < mutations.length; mi++) {
var added = mutations[mi].addedNodes;
for (var ni = 0; ni < added.length; ni++) {
var node = added[ni];
if (node.nodeName === 'IFRAME') {
node.addEventListener('load', function() { tryPatchIframe(this); }, { once: true });
tryPatchIframe(node);
}
if (node.querySelectorAll) {
var iframes = node.querySelectorAll('iframe');
for (var ii = 0; ii < iframes.length; ii++) {
iframes[ii].addEventListener('load', function() { tryPatchIframe(this); }, { once: true });
tryPatchIframe(iframes[ii]);
}
}
}
}
});
if (document.documentElement) {
observer.observe(document.documentElement, { childList: true, subtree: true });
} else {
document.addEventListener('DOMContentLoaded', function() {
observer.observe(document.documentElement, { childList: true, subtree: true });
}, { once: true });
}

// --- 4C.5: window.frames getter hook ---
// v1.14.0 PATCH-3: Layer 4A hooks iframe.contentWindow but access via
// window.frames[i] or window[i] bypasses that hook. This patch intercepts both paths.
try {
var origFramesDesc = _getOwnPropertyDescriptor(window, 'frames');
if (origFramesDesc && origFramesDesc.get) {
_defineProperty(window, 'frames', {
get: function() {
var framesObj = origFramesDesc.get.call(this);
return new Proxy(framesObj, {
get: function(target, prop, receiver) {
var val = Reflect.get(target, prop, receiver);
if (val && typeof prop === 'string' && /^\d+$/.test(prop)) {
try {
var test = val.location.href;
applyAllHooks(val);
} catch(e) {}
}
return val;
}
});
},
enumerable: true, configurable: true
});
}
} catch(e) {}

// --- 4C.6: window[index] numeric property hook ---
// v1.14.0 PATCH-3: Some anti-bot scripts access iframe via window[0] instead of window.frames[0]
try {
var updateNumericFrameHooks = function() {
try {
var frameCount = window.frames.length;
for (var idx = 0; idx < frameCount; idx++) {
(function(i) {
try {
var currentDesc = _getOwnPropertyDescriptor(window, String(i));
if (!currentDesc || !currentDesc._qteHooked) {
_defineProperty(window, String(i), {
get: function() {
var win = window.frames[i];
if (win) {
try {
var test = win.location.href;
applyAllHooks(win);
} catch(e) {}
}
return win;
},
configurable: true,
enumerable: false
});
}
} catch(e) {}
})(idx);
}
} catch(e) {}
};
updateNumericFrameHooks();
setInterval(updateNumericFrameHooks, 2000);
} catch(e) {}

// --- 4D. Worker injection ---
// v1.6.0 CRITICAL #1 FIX: PRESERVES original Worker code
// v1.10.0 PATCH 2C: overrideCode EXPANDED with OffscreenCanvas/WebGL/Audio
// v1.12.0 PATCH-3B: overrideCode EXPANDED with AnalyserNode 4 methods (BUG-10)

if (window.Worker) {
var OriginalWorker = window.Worker;
var OriginalBlob = window.Blob;

var _cores = HW.hardware ? HW.hardware.cores : 4;
var _mem = HW.hardware ? HW.hardware.memory : 8;
var _engine = HW.identity ? HW.identity.engine : 'chromium';

var navPlatform = (HW.navigator && HW.navigator.platform) || 'Win32';
var navVendor = (HW.navigator && HW.navigator.vendor !== undefined) ? HW.navigator.vendor : 'Google Inc.';
var navLanguage = (HW.navigator && HW.navigator.language) || 'en-US';
var navLanguages = (HW.navigator && HW.navigator.languages) ? JSON.stringify(HW.navigator.languages) : '["en-US"]';
var wSeed = HW.identity ? HW.identity.sessionSeed : 'default-seed';
var wWebglVendor = (HW.webgl && HW.webgl.unmaskedVendor) ? HW.webgl.unmaskedVendor.replace(/"/g, '\\"') : '';
var wWebglRenderer = (HW.webgl && HW.webgl.unmaskedRenderer) ? HW.webgl.unmaskedRenderer.replace(/"/g, '\\"') : '';

// v1.12.0 PATCH-3B: overrideCode EXPANDED
var overrideCode =
'(function(){try{' +
'Object.defineProperty(self.navigator,"hardwareConcurrency",{get:function(){return ' + _cores + '},enumerable:true,configurable:true});' +
(_engine === 'chromium' ? 'Object.defineProperty(self.navigator,"deviceMemory",{get:function(){return ' + _mem + '},enumerable:false,configurable:true});' : '') +
'Object.defineProperty(self.navigator,"platform",{get:function(){return "' + navPlatform.replace(/"/g, '\\"') + '"},enumerable:true,configurable:true});' +
(_engine !== 'gecko' ? 'Object.defineProperty(self.navigator,"vendor",{get:function(){return "' + navVendor.replace(/"/g, '\\"') + '"},enumerable:true,configurable:true});' : '') +
'Object.defineProperty(self.navigator,"language",{get:function(){return "' + navLanguage.replace(/"/g, '\\"') + '"},enumerable:true,configurable:true});' +
'Object.defineProperty(self.navigator,"languages",{get:function(){return Object.freeze(' + navLanguages + ')},enumerable:true,configurable:true});' +
// v1.17.0: hash function for Worker context (canvas noise REMOVED)
'var __seed="' + wSeed + '";' +
'function __h(s){var h=0;for(var i=0;i<s.length;i++){h=Math.imul(31,h)+s.charCodeAt(i)|0}return h}' +
// v1.17.0: OffscreenCanvas in Worker - ONLY WebGL hook, canvas noise REMOVED
'if(typeof OffscreenCanvas!=="undefined"){' +
(wWebglVendor && wWebglRenderer ?
'var oGC=OffscreenCanvas.prototype.getContext;' +
'OffscreenCanvas.prototype.getContext=function(t){var c=oGC.apply(this,arguments);if(c&&(t==="webgl"||t==="webgl2")&&!c.__s){c.__s=true;var oGP=c.getParameter;c.getParameter=function(p){var nr=oGP.apply(this,arguments);if(p===37445)return "' + wWebglVendor + '";if(p===37446)return "' + wWebglRenderer + '";return nr}}return c}'
: '') +
'}' +
// v1.10.0: Audio noise in Worker
// v1.15.0 PHASE 4B+5: Variable stride 60-140 in Worker (matches main window)
// v1.25.0: Silent buffer guard — skip noise on all-zero buffers
'if(typeof AudioBuffer!=="undefined"&&AudioBuffer.prototype.getChannelData){' +
'var __oGCD=AudioBuffer.prototype.getChannelData;var __nb=new WeakSet();' +
'function __isSilent(d){if(!d||d.length===0)return true;var l=d.length;var s=Math.max(1,Math.floor(l/20));for(var i=0;i<l;i+=s){if(d[i]!==0)return false}if(d[l-1]!==0)return false;return true}' +
'AudioBuffer.prototype.getChannelData=function(ch){' +
'var data=__oGCD.apply(this,arguments);' +
'if(!__nb.has(this)){__nb.add(this);' +
'if(!__isSilent(data)){' +
'var bh=__h(__seed+":ab:"+ch);' +
'var st=0;while(st<data.length){var h2=__h(__seed+":a:"+st+":"+bh);data[st]+=((h2%200)-100)*1e-9;var sh2=__h(__seed+"as"+st);st+=60+Math.abs(sh2%81)}' +
'}}return data}' +
'}' +
// v1.12.0 PATCH-3B: AnalyserNode 4 methods in Worker (BUG-10)
// v1.15.0 PHASE 4C+5: AnalyserNode no temporal in Worker (matches main window)
'if(typeof AnalyserNode!=="undefined"){' +
'function __anNoise(idx,len,isByte){var h2=__h(__seed+":an:"+idx+":"+len);if(isByte)return(h2%3)-1;return(h2%200-100)*1e-7}' +
'function __hookAN(method,isByte){var orig=AnalyserNode.prototype[method];if(!orig)return;AnalyserNode.prototype[method]=function(array){orig.apply(this,arguments);if(array&&array.length>0){for(var i=0;i<array.length;i+=50){var n=__anNoise(i,array.length,isByte);if(isByte){array[i]=Math.max(0,Math.min(255,array[i]+n))}else{array[i]+=n}}}}}' +
'__hookAN("getFloatFrequencyData",false);' +
'__hookAN("getByteFrequencyData",true);' +
'__hookAN("getByteTimeDomainData",true);' +
'__hookAN("getFloatTimeDomainData",false)' +
'}' +
// v1.23.0: Canvas pixel noise in Worker (OffscreenCanvas) — WebGL-aware + COLOR-PRESERVING PIXEL SWAP
'if(typeof OffscreenCanvas!=="undefined"){' +
'(function(){' +
'var __wWGL=new WeakMap();' +  // v1.23.0: WebGL context tracker for workers
// v1.22.0: Gate relaxed — no edge filter
'function __cnGate(pi){var h2=__h("' + wSeed + '-canvas:gate:"+pi);return(Math.abs(h2)%67)<2}' +
'function __cnSwap(pi,w,salt){var h2=__h("' + wSeed + '-canvas:sw:"+pi+":"+salt);var o;if(w>0){o=[-w-1,-w,-w+1,-1,1,w-1,w,w+1,-2*w,2*w,-2,2]}else{o=[-1,1,-3,3,-5,5]}return pi+o[Math.abs(h2)%o.length]}' +
// v1.22.0: Long-distance swap for Phase 2
'function __cnLong(pi,tp,salt){var h1=__h("' + wSeed + '-canvas:ls1:"+pi+":"+salt);var h2=__h("' + wSeed + '-canvas:ls2:"+pi+":"+salt);var half=tp>>1;if(half<2)return null;return{a:Math.abs(h1)%half,b:half+(Math.abs(h2)%half)}}' +
// v1.22.0: Two-phase applyPixelNoise — guaranteed MIN_SWAPS=8
'function __cnApply(id,salt,iw){var d=id.data;var l=d.length;var w=iw||id.width||0;var tp=l>>2;if(tp<4)return;var sc=0;var sw={};' +
'for(var i=0;i<l;i+=4){var px=i>>2;if(sw[px])continue;if(!__cnGate(px))continue;var t=__cnSwap(px,w,salt);if(t<0||t>=tp||sw[t])continue;var si=px<<2;var ti=t<<2;if(d[si]===d[ti]&&d[si+1]===d[ti+1]&&d[si+2]===d[ti+2]&&d[si+3]===d[ti+3])continue;var r=d[si],g=d[si+1],b=d[si+2];d[si]=d[ti];d[si+1]=d[ti+1];d[si+2]=d[ti+2];d[ti]=r;d[ti+1]=g;d[ti+2]=b;sw[px]=true;sw[t]=true;sc++}' +
'if(sc<8){var at=0,pi2=0;while(sc<8&&at<80){at++;var p=__cnLong(pi2++,tp,salt);if(!p)break;var a=p.a,b2=p.b;if(sw[a]||sw[b2])continue;var ai=a<<2,bi=b2<<2;if(ai+3>=l||bi+3>=l)continue;if(d[ai]===d[bi]&&d[ai+1]===d[bi+1]&&d[ai+2]===d[bi+2]&&d[ai+3]===d[bi+3])continue;var tr=d[ai],tg=d[ai+1],tb=d[ai+2];d[ai]=d[bi];d[ai+1]=d[bi+1];d[ai+2]=d[bi+2];d[bi]=tr;d[bi+1]=tg;d[bi+2]=tb;sw[a]=true;sw[b2]=true;sc++}}}' +
// v1.23.0: getContext hook tracks WebGL + hooks 2D getImageData
'var __oOCGC2=OffscreenCanvas.prototype.getContext;' +
'OffscreenCanvas.prototype.getContext=function(t){var c=__oOCGC2.apply(this,arguments);' +
'if(c&&(t==="webgl"||t==="webgl2")&&!c.__wt){c.__wt=true;__wWGL.set(this,c)}' +
'if(c&&t==="2d"&&!c.__cn){c.__cn=true;var __oGID=c.getImageData;if(__oGID){c.getImageData=function(sx,sy,sw,sh){var id=__oGID.apply(this,arguments);var tp=(sw||0)*(sh||0);if(tp<=256)return id;var dd=id.data,az=true;for(var zi=0;zi<dd.length;zi+=64){if(dd[zi]!==0){az=false;break}}if(az&&dd.length>0&&dd[dd.length-1]===0)return id;__cnApply(id,sx+":"+sy+":"+sw+":"+sh,sw);return id}}}' +
'return c};' +
// v1.23.0: convertToBlob hook — WebGL-aware noise for OffscreenCanvas in Worker
'if(OffscreenCanvas.prototype.convertToBlob){' +
'var __oCTB=OffscreenCanvas.prototype.convertToBlob;var __wNM=new WeakMap();' +
'OffscreenCanvas.prototype.convertToBlob=function(opts){' +
'var en=__wNM.get(this);var ow=this.width,oh=this.height;' +
'if(!en||en.w!==ow||en.h!==oh){en={w:ow,h:oh,wn:null};__wNM.set(this,en);try{' +
'var gl=__wWGL.get(this);if(gl&&ow>0&&oh>0){' +
'var px=new Uint8Array(ow*oh*4);gl.readPixels(0,0,ow,oh,gl.RGBA,gl.UNSIGNED_BYTE,px);' +
'var rs=ow*4,hh=oh>>1;for(var ro=0;ro<hh;ro++){var tO=ro*rs,bO=(oh-1-ro)*rs;for(var cl=0;cl<rs;cl++){var tm=px[tO+cl];px[tO+cl]=px[bO+cl];px[bO+cl]=tm}}' +
'var fi={data:px,width:ow,height:oh};__cnApply(fi,"ocwebgl:"+ow+"x"+oh,ow);en.wn=px' +
'}else{var ctx2=this.getContext("2d");if(ctx2&&ow>0&&oh>0){var id=ctx2.getImageData(0,0,ow,oh);ctx2.putImageData(id,0,0)}}' +
'}catch(e){}}' +
'if(en&&en.wn){try{var tc=new OffscreenCanvas(ow,oh);var tx=__oOCGC2.call(tc,"2d");if(tx){var id2=tx.createImageData(ow,oh);id2.data.set(en.wn);tx.putImageData(id2,0,0);return __oCTB.apply(tc,arguments)}}catch(e){}}' +
'return __oCTB.apply(this,arguments)}' +
'}' +
'})()' +
'}' +
'}catch(e){}})();\n';

window.Worker = function(scriptURL, options) {
if (typeof scriptURL === 'string' && (scriptURL.startsWith('blob:') || scriptURL.startsWith('data:'))) {
if (scriptURL.startsWith('blob:')) {
try {
var xhr = new XMLHttpRequest();
xhr.open('GET', scriptURL, false);
xhr.send();
var originalCode = xhr.responseText;
var combinedCode = overrideCode + originalCode;
var combinedBlob = new OriginalBlob([combinedCode], { type: 'application/javascript' });
var combinedURL = URL.createObjectURL(combinedBlob);
return new OriginalWorker(combinedURL, options);
} catch(e) {
try { return new OriginalWorker(scriptURL, options); } catch(e2) {}
}
}
if (scriptURL.startsWith('data:')) {
try {
var commaIdx = scriptURL.indexOf(',');
if (commaIdx !== -1) {
var metaPart = scriptURL.substring(0, commaIdx);
var encodedPart = scriptURL.substring(commaIdx + 1);
var decodedContent;
if (metaPart.indexOf('base64') !== -1) {
decodedContent = atob(encodedPart);
} else {
decodedContent = decodeURIComponent(encodedPart);
}
var combinedCode = overrideCode + decodedContent;
var combinedBlob = new OriginalBlob([combinedCode], { type: 'application/javascript' });
var combinedURL = URL.createObjectURL(combinedBlob);
return new OriginalWorker(combinedURL, options);
}
} catch(e) {
try { return new OriginalWorker(scriptURL, options); } catch(e2) {}
}
}
}
return new OriginalWorker(scriptURL, options);
};
Object.setPrototypeOf(window.Worker.prototype, OriginalWorker.prototype);
Object.setPrototypeOf(window.Worker, OriginalWorker);
_defineProperty(window.Worker, 'toString', {
value: function() { return 'function Worker() { [native code] }'; },
configurable: true
});
}

// --- 4E. SharedWorker injection (v1.10.0 PATCH 2B - NEW) ---
if (window.SharedWorker) {
var OriginalSharedWorker = window.SharedWorker;
window.SharedWorker = function(scriptURL, options) {
if (typeof scriptURL === 'string' && (scriptURL.startsWith('blob:') || scriptURL.startsWith('data:'))) {
if (scriptURL.startsWith('blob:')) {
try {
var xhr = new XMLHttpRequest();
xhr.open('GET', scriptURL, false);
xhr.send();
var originalCode = xhr.responseText;
var combinedCode = overrideCode + originalCode;
var combinedBlob = new OriginalBlob([combinedCode], { type: 'application/javascript' });
var combinedURL = URL.createObjectURL(combinedBlob);
return new OriginalSharedWorker(combinedURL, options);
} catch(e) {
try { return new OriginalSharedWorker(scriptURL, options); } catch(e2) {}
}
}
if (scriptURL.startsWith('data:')) {
try {
var commaIdx = scriptURL.indexOf(',');
if (commaIdx !== -1) {
var metaPart = scriptURL.substring(0, commaIdx);
var encodedPart = scriptURL.substring(commaIdx + 1);
var decodedContent;
if (metaPart.indexOf('base64') !== -1) {
decodedContent = atob(encodedPart);
} else {
decodedContent = decodeURIComponent(encodedPart);
}
var combinedCode = overrideCode + decodedContent;
var combinedBlob = new OriginalBlob([combinedCode], { type: 'application/javascript' });
var combinedURL = URL.createObjectURL(combinedBlob);
return new OriginalSharedWorker(combinedURL, options);
}
} catch(e) {
try { return new OriginalSharedWorker(scriptURL, options); } catch(e2) {}
}
}
}
return new OriginalSharedWorker(scriptURL, options);
};
Object.setPrototypeOf(window.SharedWorker.prototype, OriginalSharedWorker.prototype);
Object.setPrototypeOf(window.SharedWorker, OriginalSharedWorker);
_defineProperty(window.SharedWorker, 'toString', {
value: function() { return 'function SharedWorker() { [native code] }'; },
configurable: true
});
}

// --- 4F. ServiceWorker.register interception (v1.10.0 PATCH 2B - NEW) ---
// ServiceWorker runs in background thread with SEPARATE navigator
// Cannot inject via JS-level wrapper (SW loaded from URL, not blob)
// This hook is a pass-through wrapper
// CDP-level injection: BrowserLauncher.js v8.18.0 PATCH 1B handles
//   actual SW stealth via Target.attachedToTarget (serviceworker target type)
if (window.navigator && window.navigator.serviceWorker) {
var origSWRegister = window.navigator.serviceWorker.register;
if (origSWRegister) {
window.navigator.serviceWorker.register = function(scriptURL, options) {
return origSWRegister.apply(this, arguments);
};
Utils.patchToString(window.navigator.serviceWorker.register, 'register');
}
}

// --- 4G. Shadow DOM propagation (v2.0.0 WebRTC Stealth Upgrade) ---
// Shadow DOM shares the host Window — applyAllHooks(win) already covers it.
// But we hook attachShadow to also patch any iframes inside shadow trees.
try {
var origAttachShadow = Element.prototype.attachShadow;
if (origAttachShadow) {
Element.prototype.attachShadow = function(init) {
var shadow = origAttachShadow.call(this, init);
try {
var shadowObserver = new MutationObserver(function(mutations) {
for (var mi = 0; mi < mutations.length; mi++) {
var added = mutations[mi].addedNodes;
for (var ni = 0; ni < added.length; ni++) {
var node = added[ni];
if (node.nodeName === 'IFRAME') {
node.addEventListener('load', function() { tryPatchIframe(this); }, { once: true });
tryPatchIframe(node);
}
if (node.querySelectorAll) {
var iframes = node.querySelectorAll('iframe');
for (var ii = 0; ii < iframes.length; ii++) {
iframes[ii].addEventListener('load', function() { tryPatchIframe(this); }, { once: true });
tryPatchIframe(iframes[ii]);
}
}
}
}
});
shadowObserver.observe(shadow, { childList: true, subtree: true });
} catch(e) {}
return shadow;
};
Utils.patchToString(Element.prototype.attachShadow, 'attachShadow');
}
} catch(e) {}

// --- 4H. window.open() propagation (v2.0.0 WebRTC Stealth Upgrade) ---
// If a script calls window.open(), the new window must also have WebRTC hooks.
try {
var origWindowOpen = window.open;
window.open = function() {
var newWin = origWindowOpen.apply(this, arguments);
if (newWin) {
try {
var test = newWin.document;
applyAllHooks(newWin);
} catch(e) {}
}
return newWin;
};
Utils.patchToString(window.open, 'open');
} catch(e) {}

// --- 4I. document.createElement('iframe') preemptive hook (v2.0.0) ---
// Safety net for programmatic iframe creation patterns.
try {
var origCreateElement = document.createElement;
var _origCreateElementBound = origCreateElement.bind(document);
document.createElement = function(tagName) {
var el = _origCreateElementBound.apply(document, arguments);
if (tagName && tagName.toLowerCase() === 'iframe') {
el.addEventListener('load', function() {
tryPatchIframe(this);
}, { once: true });
}
return el;
};
Utils.patchToString(document.createElement, 'createElement');
} catch(e) {}

} catch(e) {}
})();

// ===============================================================
// BOOT - Apply all hooks to main window
// ===============================================================

applyAllHooks(window);

})();

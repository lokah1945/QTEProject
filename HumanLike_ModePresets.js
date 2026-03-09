// ═══════════════════════════════════════════════════════════════════════════════
// HumanLike_ModePresets.js v1.3.0 — 7 Surfing Mode Definitions (Layer 1)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ CHANGELOG                                                                │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ v1.3.0 (2026-03-04 20:33 WIB)                                           │
// │   - BREAKING: loadEnvOverrides() now reads from HumanLike.env file      │
// │     using dotenv.parse(fs.readFileSync()) instead of process.env         │
// │     → HumanLike.env is the SINGLE SOURCE OF TRUTH for all variables     │
// │     → Eliminates dependency on .env for HumanLike variables             │
// │     → Async-safe: each worker call gets isolated parsed object          │
// │       (no pollution of process.env shared across modules)               │
// │   - ENV_MAP updated to match HumanLike.env naming convention:           │
// │     → BOUNCE_RATE → BOUNCE_RATE_BASE                                    │
// │     → WEIBULL_SHAPE_K → DWELL_WEIBULL_K                                │
// │     → WEIBULL_SCALE_LAMBDA → DWELL_WEIBULL_LAMBDA                      │
// │     → SCROLL_R1-R4 → SCROLL_MARKOV_R1-R4                               │
// │     → MOUSE_STEPS_MIN/MAX → MOUSE_BEZIER_STEPS_MIN/MAX                 │
// │     → MOUSE_OVERSHOOT_PX_MIN/MAX → MOUSE_OVERSHOOT_PIXELS_MIN/MAX      │
// │     → FRUSTRATION_DWELL_MUL → FRUSTRATION_DWELL_MULTIPLIER              │
// │     → FRUSTRATION_BOUNCE_BOOST → FRUSTRATION_BOUNCE_UPLIFT              │
// │     → POPUP_DELAY_SEC → POPUP_EXPECTED_DELAY_SEC                        │
// │   - Added loadHumanLikeEnv() — isolated file parser with caching        │
// │     → Uses fs.readFileSync + dotenv.parse for process.env isolation     │
// │     → Caches parsed result per file mtime (re-reads on file change)     │
// │     → Safe for concurrent workers in same Node.js process               │
// │   - DEPENDENCIES ADDED: fs (Node.js built-in), dotenv (parse only)      │
// │                                                                          │
// │ v1.2.0 (2026-03-03 02:24 WIB)                                           │
// │   - PATCH [MP-1] Added popupDelaySec to all modes (SessionEngine needs   │
// │     this for popup modal timing — was undefined → popup NEVER handled)   │
// │     → Mode 2,7: 0 (disabled — bouncers/frustrated leave too fast)       │
// │     → Mode 3: 6s (Omnisend 6-10s window, casual users)                  │
// │     → Mode 4,5,6: 8s (Omnisend optimal peak at 6-10s)                  │
// │   - PATCH [MP-2] Auto-assemble scrollTransitions array in getModeConfig()│
// │     → ScrollMarkov.sampleMaxScrollDepth() expects [r1,r2,r3,r4] array   │
// │     → Was reading config.scrollTransitions = undefined → .map() crash   │
// │   - PATCH [MP-3] Auto-alias scrollUpChance in getModeConfig()            │
// │     → ScrollMarkov reads config.scrollUpChance                          │
// │     → ModePresets stores as scrollUpProbability → mismatch = always 0   │
// │   - PATCH [MP-4] Added bounceDwellMean to all modes                     │
// │     → DwellWeibull.generateBounceDwell() reads config.bounceDwellMean   │
// │     → Was undefined → always fallback 8s (wrong for Mode 2,7)           │
// │   - PATCH [MP-5] Auto-alias pStop = pageStopProbability in getModeConfig │
// │     → DwellWeibull.planSession() reads config.pStop                     │
// │     → Was undefined → samplePageviewCount(undefined) → always 2 pages   │
// │   - PATCH [MP-6] Auto-inject config.name from MODE_NAMES in getModeConfig│
// │     → SessionEngine logs config.name — was undefined                    │
// │   - Added popupDelaySec, bounceDwellMean to SurfingConfig @typedef      │
// │   - Added popupDelaySec, bounceDwellMean to ENV_MAP (.env override)     │
// │   - Added popupDelaySec, bounceDwellMean to VALIDATION_RULES            │
// │                                                                          │
// │ v1.1.0 (2026-03-03 01:10 WIB)                                           │
// │   - FEATURE: Added chanceClickAd to all modes (ad click CTR per cycle)   │
// │     → Mode 2 (High Bounce): 0 (bouncers don't click ads)                │
// │     → Mode 3 (Casual): 0.005 (~0.5% per cycle)                          │
// │     → Mode 4 (Engaged): 0.008 (longer dwell = more ad exposure)         │
// │     → Mode 5 (Explorer): 0.003 (content-focused, low ad interest)       │
// │     → Mode 6 (Conversion): 0.01 (benchmark default ~1% CTR)             │
// │     → Mode 7 (Frustrated): 0 (frustrated users ignore ads)              │
// │   - FEATURE: Added CHANCE_CLICK_AD to ENV_MAP (.env override support)    │
// │   - FEATURE: Added chanceClickAd to VALIDATION_RULES [0, 0.10]          │
// │   - FEATURE: Added chanceClickAd to SurfingConfig @typedef              │
// │                                                                          │
// │ v1.0.0 (2026-02-20 10:46 WIB)                                           │
// │   - Initial release: 7 surfing modes with statistical parameters         │
// │   - Mode 6 (Conversion Flow) = default, benchmark-calibrated:            │
// │       Bounce=47%, E[T]=54s (Weibull k=0.6 λ=35.9),                      │
// │       E[D]=56.8% (Markov r₁=0.80 r₂=0.73 r₃=0.61 r₄=0.28),            │
// │       E[N]=5 pages (p_stop=0.1325)                                       │
// │   - .env override merge: any value ≠ -1 overrides mode default           │
// │   - Full parameter validation with range clamping                        │
// │   - getModeConfig() returns frozen config object                         │
// │                                                                          │
// │ LAST HISTORY LOG:                                                        │
// │   human_like.js v14.0 → DELETED (replaced by HumanLike_*.js modular)    │
// │   .env v4.0.0 → v5.0.0 (auto-surfing section replaced)                  │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ BENCHMARK SOURCES (all parameters grounded to real data)                 │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ Contentsquare 2021: bounce 47%, pageviews/session 5, time/page 54s,     │
// │                     scroll rate 56.8%                                    │
// │ Contentsquare 2024: frustration 39.6%, visit value -15%                  │
// │ NN/g (Liu et al.):  Weibull k<1 negative aging, 10-20s critical exit,   │
// │                     57% above fold, 74% two screenfuls                   │
// │ etracker 2025:      cookie reject 60% (legal-compliant)                  │
// │ CHB 2025:           2/3 users stable accept/reject preference            │
// │ Omnisend 2025:      popup conversion 2.4% peak at 6-10s delay            │
// │ Brysbaert 2019:     reading speed 238 wpm (non-fiction average)          │
// │ Zheng et al.:       Fitts's Law a≈100ms b≈150ms, ±46.4% variance        │
// │ Google AdSense:     Display CTR ~1-2% avg (ad click baseline)            │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ AUTO-ASSEMBLY MAP (getModeConfig v1.2.0)                                 │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ Consumer reads:            │ ModePresets stores:   │ Assembly:            │
// │ ─────────────────────────  │ ─────────────────────-│ ─────────────────── │
// │ config.scrollTransitions   │ scrollR1..R4 (4 keys) │ [R1, R2, R3, R4]   │
// │ config.scrollUpChance      │ scrollUpProbability    │ alias               │
// │ config.pStop               │ pageStopProbability    │ alias               │
// │ config.name                │ MODE_NAMES[mode]       │ inject              │
// │ config.popupDelaySec       │ popupDelaySec          │ direct (new key)   │
// │ config.bounceDwellMean     │ bounceDwellMean        │ direct (new key)   │
// └───────────────────────────────────────────────────────────────────────────┘
//
// DEPENDENCIES:
//   Node.js built-in: fs, path
//   npm:              dotenv (parse function only — no config() call)
//   Project:          (none)
//
// CONSUMERS:
//   HumanLike_Profiles.js (reads mode config for persona generation)
//   HumanLike_SessionEngine.js (reads mode config for orchestration)
//   HumanLike_DwellWeibull.js (reads config.pStop, config.bounceDwellMean)
//   HumanLike_ScrollMarkov.js (reads config.scrollTransitions, config.scrollUpChance)
//
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: BASE PARAMETER TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════
// Every mode MUST define ALL keys. No partial configs.
// Template documents the meaning of each parameter.

/**
 * @typedef {Object} SurfingConfig
 *
 * --- Session-Level Parameters ---
 * @property {number} bounceRate            - P(B=1): probability session ends after page 1
 * @property {number} pageStopProbability   - p_stop: per-page exit prob after non-bounce (geometric)
 * @property {number} maxPagesPerSession    - Hard cap on pages per session
 * @property {number} bounceDwellMean       - E[T] for bounce visits (seconds)  ← NEW v1.2.0 [MP-4]
 *
 * --- Dwell Time (Weibull Distribution) ---
 * @property {number} weibullK              - Shape k: k<1=negative aging (leave quick or stay long)
 * @property {number} weibullLambda         - Scale λ: E[T] = λ × Γ(1 + 1/k)
 * @property {number} dwellMinSec           - Hard floor for sampled dwell time (seconds)
 * @property {number} dwellMaxSec           - Hard ceiling for sampled dwell time (seconds)
 *
 * --- Scroll Depth (Absorbing Markov Chain) ---
 * @property {number} scrollR1              - P(S1→S2): transition 0-20% → 20-40%
 * @property {number} scrollR2              - P(S2→S3): transition 20-40% → 40-60%
 * @property {number} scrollR3              - P(S3→S4): transition 40-60% → 60-80%
 * @property {number} scrollR4              - P(S4→S5): transition 60-80% → 80-100%
 * @property {number} scrollUpProbability   - P(scroll up) per scroll action (re-read behavior)
 * @property {number} scrollSpeedVariance   - Step size deviation factor (0=uniform, 0.3=±30%)
 *
 * --- Auto-Assembled by getModeConfig() (read-only, not in mode definitions) ---
 * @property {number[]} scrollTransitions   - [scrollR1, scrollR2, scrollR3, scrollR4]  [MP-2]
 * @property {number} scrollUpChance        - Alias of scrollUpProbability               [MP-3]
 * @property {number} pStop                 - Alias of pageStopProbability               [MP-5]
 * @property {string} name                  - Human-readable mode name                   [MP-6]
 *
 * --- Click Probabilities (per interaction cycle) ---
 * @property {number} chanceClickInternal   - P(click internal link) per cycle
 * @property {number} chanceClickExternal   - P(click external link) per cycle
 * @property {number} chanceClickAd         - P(click ad element) per cycle (CTR)
 * @property {number} clickInternalDbPriority - Weight boost for DB-target URLs (0-1)
 *
 * --- Frustration Model ---
 * @property {number} frustrationRate       - P(F=1): probability session is frustrated
 * @property {number} frustrationDwellMul   - Weibull λ multiplier when F=1 (< 1 = shorter dwell)
 * @property {number} frustrationBounceBst  - Added to bounceRate when F=1
 * @property {number} rageClickChance       - P(rage click) per cycle when F=1
 *
 * --- Micro-Interactions (per interaction cycle) ---
 * @property {number} chanceTextSelect      - P(text selection) per cycle
 * @property {number} chanceIdlePause       - P(idle pause / thinking break) per cycle
 * @property {number} idlePauseMinMs        - Minimum idle pause duration (ms)
 * @property {number} idlePauseMaxMs        - Maximum idle pause duration (ms)
 * @property {number} chanceTabSwitch       - P(simulated tab switch) per cycle
 * @property {number} tabSwitchAwayMinMs    - Minimum time "away" during tab switch (ms)
 * @property {number} tabSwitchAwayMaxMs    - Maximum time "away" during tab switch (ms)
 * @property {number} chanceMouseDrift      - P(random mouse drift) per cycle
 * @property {number} chanceHoverElement    - P(hover random visible element) per cycle
 *
 * --- Cookie Consent Model ---
 * @property {number} cookieAcceptRate      - P(accept) overall baseline
 * @property {number} cookieStableRatio     - Fraction of users with stable preference (AA or AR)
 * @property {number} cookieReactionDelayMin - Min ms before interacting with cookie banner
 * @property {number} cookieReactionDelayMax - Max ms before interacting with cookie banner
 *
 * --- Popup Handling ---
 * @property {number} popupDelaySec         - Seconds before popup appears               ← NEW v1.2.0 [MP-1]
 * @property {number} popupCloseRate        - P(close popup) when popup appears
 * @property {boolean} popupConvertEnabled  - Whether popup conversion is allowed
 * @property {number} popupIgnoreRate       - P(ignore popup) = 1 - close - convert
 *
 * --- Reading Simulation ---
 * @property {number} readingSpeedWPM       - Mean reading speed (words per minute)
 * @property {number} readingSpeedSTD       - Standard deviation of reading speed
 * @property {number} scanFactorMin         - Min fraction of content actually read per fixation
 * @property {number} scanFactorMax         - Max fraction of content actually read per fixation
 * @property {boolean} fPatternEnabled      - Enable F-pattern reading simulation
 *
 * --- Mouse Physics ---
 * @property {number} fittsA                - Fitts's Law intercept (ms)
 * @property {number} fittsB                - Fitts's Law slope (ms)
 * @property {number} mouseOvershootChance  - P(overshoot target) per mouse move
 * @property {number} mouseOvershootPxMin   - Min overshoot distance (px)
 * @property {number} mouseOvershootPxMax   - Max overshoot distance (px)
 * @property {number} mouseJitterStd        - Gaussian hand tremor σ (px)
 * @property {number} mouseStepsMin         - Min Bezier curve discretization steps
 * @property {number} mouseStepsMax         - Max Bezier curve discretization steps
 * @property {number} mouseStepDelayMin     - Min delay between mouse move steps (ms)
 * @property {number} mouseStepDelayMax     - Max delay between mouse move steps (ms)
 *
 * --- External Click Lock ---
 * @property {boolean} externalClickLock    - Lock session after external click
 * @property {number} externalIdleScrollChance - P(scroll) while locked on external page
 * @property {number} externalMaxTimeSec    - Max seconds on external page before exit
 */


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: MODE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mode 1: MANUAL
 * No auto-surfing. SessionEngine returns immediately.
 * Caller (opsi4.js) handles behavior manually.
 */
const MODE_1_MANUAL = null;


/**
 * Mode 2: HIGH BOUNCE
 * Simulates users who land and leave quickly.
 * 85% bounce, ~12s mean dwell, ~25% scroll depth, minimal interaction.
 *
 * Use case: Inflate bounce rate metrics, simulate disinterested traffic.
 *
 * Calibration:
 *   E[T] = 8.0 × Γ(1 + 1/0.5) = 8.0 × Γ(3.0) = 8.0 × 2.0 = 16.0s
 *   E[D] = 0.2 × (1 + 0.40 + 0.08 + 0.008 + 0.0004) = 0.2 × 1.4884 = 29.8%
 *   E[N] = 0.85×1 + 0.15×(1+1/0.40) = 0.85 + 0.15×3.5 = 1.375 ≈ 1.4
 *   E[T_bounce] = 5.0 × Γ(3.0) = 5.0 × 2.0 = 10.0s (ultra-short bouncer)
 */
const MODE_2_HIGH_BOUNCE = {
    // --- Session-Level ---
    bounceRate: 0.85,
    pageStopProbability: 0.40,
    maxPagesPerSession: 5,
    bounceDwellMean: 5.0,           // ← PATCH v1.2.0 [MP-4] short bouncer dwell
    // --- Dwell Time (Weibull) ---
    weibullK: 0.50,
    weibullLambda: 8.0,
    dwellMinSec: 2,
    dwellMaxSec: 60,
    // --- Scroll Depth (Markov) ---
    scrollR1: 0.40,
    scrollR2: 0.20,
    scrollR3: 0.10,
    scrollR4: 0.05,
    scrollUpProbability: 0.02,
    scrollSpeedVariance: 0.35,
    // --- Click Probabilities ---
    chanceClickInternal: 0.001,
    chanceClickExternal: 0.001,
    chanceClickAd: 0,
    clickInternalDbPriority: 0.80,
    // --- Frustration ---
    frustrationRate: 0.60,
    frustrationDwellMul: 0.55,
    frustrationBounceBst: 0.10,
    rageClickChance: 0.08,
    // --- Micro-Interactions ---
    chanceTextSelect: 0.01,
    chanceIdlePause: 0.03,
    idlePauseMinMs: 500,
    idlePauseMaxMs: 2000,
    chanceTabSwitch: 0.01,
    tabSwitchAwayMinMs: 1000,
    tabSwitchAwayMaxMs: 4000,
    chanceMouseDrift: 0.01,
    chanceHoverElement: 0.05,
    // --- Cookie Consent ---
    cookieAcceptRate: 0.40,
    cookieStableRatio: 0.67,
    cookieReactionDelayMin: 800,
    cookieReactionDelayMax: 3000,
    // --- Popup ---
    popupDelaySec: 0,               // ← PATCH v1.2.0 [MP-1] disabled (leave too fast)
    popupCloseRate: 0.60,
    popupConvertEnabled: false,
    popupIgnoreRate: 0.38,
    // --- Reading ---
    readingSpeedWPM: 238,
    readingSpeedSTD: 45,
    scanFactorMin: 0.15,
    scanFactorMax: 0.35,
    fPatternEnabled: false,
    // --- Mouse Physics ---
    fittsA: 100,
    fittsB: 150,
    mouseOvershootChance: 0.30,
    mouseOvershootPxMin: 5,
    mouseOvershootPxMax: 20,
    mouseJitterStd: 1.5,
    mouseStepsMin: 15,
    mouseStepsMax: 40,
    mouseStepDelayMin: 2,
    mouseStepDelayMax: 12,
    // --- External Click Lock ---
    externalClickLock: true,
    externalIdleScrollChance: 0.30,
    externalMaxTimeSec: 20
};


/**
 * Mode 3: CASUAL READER
 * Average visitor: reads some content, scrolls partway, may click once.
 * Matches industry average bounce rate (47%) with shorter dwell time.
 *
 * Use case: General organic traffic simulation.
 *
 * Calibration:
 *   E[T] = 20.0 × Γ(1 + 1/0.55) = 20.0 × Γ(2.818) = 20.0 × 1.702 = 34.0s
 *   E[D] = 0.2 × (1 + 0.65 + 0.3575 + 0.143 + 0.02145) = 0.2 × 2.1720 = 43.4%
 *   E[N] = 0.47×1 + 0.53×(1+1/0.265) = 0.47 + 0.53×4.774 = 2.99 ≈ 3.0
 *   E[T_bounce] = 8.0 × Γ(3.0) = 16.0s (standard benchmark bounce)
 */
const MODE_3_CASUAL = {
    // --- Session-Level ---
    bounceRate: 0.47,
    pageStopProbability: 0.265,
    maxPagesPerSession: 10,
    bounceDwellMean: 8.0,           // ← PATCH v1.2.0 [MP-4] benchmark default
    // --- Dwell Time (Weibull) ---
    weibullK: 0.55,
    weibullLambda: 20.0,
    dwellMinSec: 3,
    dwellMaxSec: 120,
    // --- Scroll Depth (Markov) ---
    scrollR1: 0.65,
    scrollR2: 0.55,
    scrollR3: 0.40,
    scrollR4: 0.15,
    scrollUpProbability: 0.04,
    scrollSpeedVariance: 0.30,
    // --- Click Probabilities ---
    chanceClickInternal: 0.006,
    chanceClickExternal: 0.003,
    chanceClickAd: 0.005,
    clickInternalDbPriority: 0.75,
    // --- Frustration ---
    frustrationRate: 0.396,
    frustrationDwellMul: 0.65,
    frustrationBounceBst: 0.08,
    rageClickChance: 0.05,
    // --- Micro-Interactions ---
    chanceTextSelect: 0.04,
    chanceIdlePause: 0.08,
    idlePauseMinMs: 1000,
    idlePauseMaxMs: 4000,
    chanceTabSwitch: 0.03,
    tabSwitchAwayMinMs: 2000,
    tabSwitchAwayMaxMs: 8000,
    chanceMouseDrift: 0.02,
    chanceHoverElement: 0.12,
    // --- Cookie Consent ---
    cookieAcceptRate: 0.40,
    cookieStableRatio: 0.67,
    cookieReactionDelayMin: 1000,
    cookieReactionDelayMax: 4000,
    // --- Popup ---
    popupDelaySec: 6,               // ← PATCH v1.2.0 [MP-1] Omnisend 6-10s window
    popupCloseRate: 0.50,
    popupConvertEnabled: true,
    popupIgnoreRate: 0.48,
    // --- Reading ---
    readingSpeedWPM: 238,
    readingSpeedSTD: 45,
    scanFactorMin: 0.25,
    scanFactorMax: 0.50,
    fPatternEnabled: true,
    // --- Mouse Physics ---
    fittsA: 100,
    fittsB: 150,
    mouseOvershootChance: 0.30,
    mouseOvershootPxMin: 5,
    mouseOvershootPxMax: 20,
    mouseJitterStd: 1.5,
    mouseStepsMin: 15,
    mouseStepsMax: 40,
    mouseStepDelayMin: 2,
    mouseStepDelayMax: 12,
    // --- External Click Lock ---
    externalClickLock: true,
    externalIdleScrollChance: 0.50,
    externalMaxTimeSec: 40
};


/**
 * Mode 4: ENGAGED READER
 * Interested visitor: reads deeply, scrolls far, clicks multiple pages.
 * Low bounce (20%), long dwell (65s mean), high scroll (72%).
 *
 * Use case: Quality engagement traffic, content site simulation.
 *
 * Calibration:
 *   E[T] = 50.0 × Γ(1 + 1/0.65) = 50.0 × Γ(2.538) = 50.0 × 1.366 = 68.3s
 *   E[D] = 0.2 × (1 + 0.88 + 0.7216 + 0.5268 + 0.2634) = 0.2 × 3.3918 = 67.8%
 *   E[N] = 0.20×1 + 0.80×(1+1/0.133) = 0.20 + 0.80×8.52 = 7.0
 *   E[T_bounce] = 10.0 × Γ(3.0) = 20.0s (engaged users bounce slower)
 */
const MODE_4_ENGAGED = {
    // --- Session-Level ---
    bounceRate: 0.20,
    pageStopProbability: 0.133,
    maxPagesPerSession: 20,
    bounceDwellMean: 10.0,          // ← PATCH v1.2.0 [MP-4] engaged bounce slightly longer
    // --- Dwell Time (Weibull) ---
    weibullK: 0.65,
    weibullLambda: 50.0,
    dwellMinSec: 5,
    dwellMaxSec: 240,
    // --- Scroll Depth (Markov) ---
    scrollR1: 0.88,
    scrollR2: 0.82,
    scrollR3: 0.73,
    scrollR4: 0.50,
    scrollUpProbability: 0.08,
    scrollSpeedVariance: 0.25,
    // --- Click Probabilities ---
    chanceClickInternal: 0.015,
    chanceClickExternal: 0.005,
    chanceClickAd: 0.008,
    clickInternalDbPriority: 0.70,
    // --- Frustration ---
    frustrationRate: 0.20,
    frustrationDwellMul: 0.70,
    frustrationBounceBst: 0.05,
    rageClickChance: 0.03,
    // --- Micro-Interactions ---
    chanceTextSelect: 0.08,
    chanceIdlePause: 0.12,
    idlePauseMinMs: 1500,
    idlePauseMaxMs: 6000,
    chanceTabSwitch: 0.05,
    tabSwitchAwayMinMs: 3000,
    tabSwitchAwayMaxMs: 12000,
    chanceMouseDrift: 0.03,
    chanceHoverElement: 0.18,
    // --- Cookie Consent ---
    cookieAcceptRate: 0.40,
    cookieStableRatio: 0.67,
    cookieReactionDelayMin: 1500,
    cookieReactionDelayMax: 5000,
    // --- Popup ---
    popupDelaySec: 8,               // ← PATCH v1.2.0 [MP-1] Omnisend optimal
    popupCloseRate: 0.40,
    popupConvertEnabled: true,
    popupIgnoreRate: 0.57,
    // --- Reading ---
    readingSpeedWPM: 238,
    readingSpeedSTD: 45,
    scanFactorMin: 0.40,
    scanFactorMax: 0.65,
    fPatternEnabled: true,
    // --- Mouse Physics ---
    fittsA: 100,
    fittsB: 150,
    mouseOvershootChance: 0.30,
    mouseOvershootPxMin: 5,
    mouseOvershootPxMax: 20,
    mouseJitterStd: 1.5,
    mouseStepsMin: 15,
    mouseStepsMax: 40,
    mouseStepDelayMin: 2,
    mouseStepDelayMax: 12,
    // --- External Click Lock ---
    externalClickLock: true,
    externalIdleScrollChance: 0.60,
    externalMaxTimeSec: 60
};


/**
 * Mode 5: DEEP EXPLORER
 * Power user: almost never bounces, reads everything, navigates extensively.
 * Very low bounce (10%), very long dwell (82s), very deep scroll (85%).
 *
 * Use case: Research-type traffic, wikipedia-style deep browsing.
 *
 * Calibration:
 *   E[T] = 65.0 × Γ(1 + 1/0.70) = 65.0 × Γ(2.429) = 65.0 × 1.266 = 82.3s
 *   E[D] = 0.2 × (1 + 0.93 + 0.837 + 0.7115 + 0.4980) = 0.2 × 3.9765 = 79.5%
 *   E[N] = 0.10×1 + 0.90×(1+1/0.082) = 0.10 + 0.90×13.20 = 11.98 ≈ 12
 *   E[T_bounce] = 12.0 × Γ(3.0) = 24.0s (power user takes a longer look)
 */
const MODE_5_EXPLORER = {
    // --- Session-Level ---
    bounceRate: 0.10,
    pageStopProbability: 0.082,
    maxPagesPerSession: 30,
    bounceDwellMean: 12.0,          // ← PATCH v1.2.0 [MP-4] explorer bounces slower
    // --- Dwell Time (Weibull) ---
    weibullK: 0.70,
    weibullLambda: 65.0,
    dwellMinSec: 8,
    dwellMaxSec: 300,
    // --- Scroll Depth (Markov) ---
    scrollR1: 0.93,
    scrollR2: 0.90,
    scrollR3: 0.85,
    scrollR4: 0.70,
    scrollUpProbability: 0.12,
    scrollSpeedVariance: 0.20,
    // --- Click Probabilities ---
    chanceClickInternal: 0.030,
    chanceClickExternal: 0.008,
    chanceClickAd: 0.003,
    clickInternalDbPriority: 0.65,
    // --- Frustration ---
    frustrationRate: 0.10,
    frustrationDwellMul: 0.75,
    frustrationBounceBst: 0.03,
    rageClickChance: 0.02,
    // --- Micro-Interactions ---
    chanceTextSelect: 0.12,
    chanceIdlePause: 0.15,
    idlePauseMinMs: 2000,
    idlePauseMaxMs: 8000,
    chanceTabSwitch: 0.06,
    tabSwitchAwayMinMs: 4000,
    tabSwitchAwayMaxMs: 15000,
    chanceMouseDrift: 0.04,
    chanceHoverElement: 0.22,
    // --- Cookie Consent ---
    cookieAcceptRate: 0.40,
    cookieStableRatio: 0.67,
    cookieReactionDelayMin: 2000,
    cookieReactionDelayMax: 6000,
    // --- Popup ---
    popupDelaySec: 8,               // ← PATCH v1.2.0 [MP-1] Omnisend optimal
    popupCloseRate: 0.35,
    popupConvertEnabled: true,
    popupIgnoreRate: 0.62,
    // --- Reading ---
    readingSpeedWPM: 238,
    readingSpeedSTD: 45,
    scanFactorMin: 0.50,
    scanFactorMax: 0.80,
    fPatternEnabled: true,
    // --- Mouse Physics ---
    fittsA: 100,
    fittsB: 150,
    mouseOvershootChance: 0.30,
    mouseOvershootPxMin: 5,
    mouseOvershootPxMax: 20,
    mouseJitterStd: 1.5,
    mouseStepsMin: 15,
    mouseStepsMax: 40,
    mouseStepDelayMin: 2,
    mouseStepDelayMax: 12,
    // --- External Click Lock ---
    externalClickLock: true,
    externalIdleScrollChance: 0.70,
    externalMaxTimeSec: 90
};


/**
 * Mode 6: CONVERSION FLOW (DEFAULT)
 * Benchmark-matched to Contentsquare 2021 + NN/g + etracker + Omnisend.
 * The most statistically accurate representation of average web traffic.
 *
 * Use case: Default mode for realistic traffic simulation.
 *
 * Calibration (verified against all benchmarks):
 *   E[T] = 35.9 × Γ(1 + 1/0.6) = 35.9 × 1.5046 = 54.01s ✓ (benchmark: 54s)
 *   E[D] = 0.2 × (1 + 0.80 + 0.584 + 0.3562 + 0.0997) = 56.8% ✓ (benchmark: 56.8%)
 *   E[N] = 0.47×1 + 0.53×(1 + 1/0.1325) = 5.00 ✓ (benchmark: 5)
 *   Frustration: 39.6% ✓ (Contentsquare 2024)
 *   Cookie reject: 60% ✓ (etracker 2025)
 *   Popup peak: 2.4% at 6-10s ✓ (Omnisend 2025)
 *   E[T_bounce] = 8.0 × Γ(3.0) = 16.0s ✓ (standard benchmark)
 */
const MODE_6_CONVERSION = {
    // --- Session-Level ---
    bounceRate: 0.47,
    pageStopProbability: 0.1325,
    maxPagesPerSession: 15,
    bounceDwellMean: 8.0,           // ← PATCH v1.2.0 [MP-4] benchmark default
    // --- Dwell Time (Weibull) ---
    weibullK: 0.60,
    weibullLambda: 35.9,
    dwellMinSec: 3,
    dwellMaxSec: 300,
    // --- Scroll Depth (Markov) ---
    scrollR1: 0.80,
    scrollR2: 0.73,
    scrollR3: 0.61,
    scrollR4: 0.28,
    scrollUpProbability: 0.05,
    scrollSpeedVariance: 0.25,
    // --- Click Probabilities ---
    chanceClickInternal: 0.008,
    chanceClickExternal: 0.004,
    chanceClickAd: 0.01,
    clickInternalDbPriority: 0.75,
    // --- Frustration ---
    frustrationRate: 0.396,
    frustrationDwellMul: 0.65,
    frustrationBounceBst: 0.07,
    rageClickChance: 0.05,
    // --- Micro-Interactions ---
    chanceTextSelect: 0.06,
    chanceIdlePause: 0.12,
    idlePauseMinMs: 1500,
    idlePauseMaxMs: 5000,
    chanceTabSwitch: 0.04,
    tabSwitchAwayMinMs: 3000,
    tabSwitchAwayMaxMs: 10000,
    chanceMouseDrift: 0.02,
    chanceHoverElement: 0.15,
    // --- Cookie Consent ---
    cookieAcceptRate: 0.40,
    cookieStableRatio: 0.67,
    cookieReactionDelayMin: 1200,
    cookieReactionDelayMax: 4500,
    // --- Popup ---
    popupDelaySec: 8,               // ← PATCH v1.2.0 [MP-1] Omnisend 6-10s optimal
    popupCloseRate: 0.45,
    popupConvertEnabled: true,
    popupIgnoreRate: 0.53,
    // --- Reading ---
    readingSpeedWPM: 238,
    readingSpeedSTD: 45,
    scanFactorMin: 0.30,
    scanFactorMax: 0.60,
    fPatternEnabled: true,
    // --- Mouse Physics ---
    fittsA: 100,
    fittsB: 150,
    mouseOvershootChance: 0.30,
    mouseOvershootPxMin: 5,
    mouseOvershootPxMax: 20,
    mouseJitterStd: 1.5,
    mouseStepsMin: 15,
    mouseStepsMax: 40,
    mouseStepDelayMin: 2,
    mouseStepDelayMax: 12,
    // --- External Click Lock ---
    externalClickLock: true,
    externalIdleScrollChance: 0.55,
    externalMaxTimeSec: 60
};


/**
 * Mode 7: FRUSTRATED USER
 * Simulates sessions impacted by UX friction (slow load, JS errors, etc.).
 * High bounce (65%), short dwell (25s), shallow scroll (30%), rage clicks.
 *
 * Use case: Test frustration signals, simulate poor UX experience.
 *
 * Calibration:
 *   E[T] = 10.0 × Γ(1 + 1/0.45) = 10.0 × Γ(3.222) = 10.0 × 2.478 = 24.8s
 *   E[D] = 0.2 × (1 + 0.50 + 0.15 + 0.0225 + 0.00113) = 0.2 × 1.6736 = 33.5%
 *   E[N] = 0.65×1 + 0.35×(1+1/0.50) = 0.65 + 0.35×3.0 = 1.70
 *   E[T_bounce] = 4.0 × Γ(3.0) = 8.0s (frustrated user leaves fastest)
 */
const MODE_7_FRUSTRATED = {
    // --- Session-Level ---
    bounceRate: 0.65,
    pageStopProbability: 0.50,
    maxPagesPerSession: 5,
    bounceDwellMean: 4.0,           // ← PATCH v1.2.0 [MP-4] frustrated = fastest exit
    // --- Dwell Time (Weibull) ---
    weibullK: 0.45,
    weibullLambda: 10.0,
    dwellMinSec: 2,
    dwellMaxSec: 90,
    // --- Scroll Depth (Markov) ---
    scrollR1: 0.50,
    scrollR2: 0.30,
    scrollR3: 0.15,
    scrollR4: 0.05,
    scrollUpProbability: 0.03,
    scrollSpeedVariance: 0.40,
    // --- Click Probabilities ---
    chanceClickInternal: 0.002,
    chanceClickExternal: 0.001,
    chanceClickAd: 0,
    clickInternalDbPriority: 0.80,
    // --- Frustration ---
    frustrationRate: 0.80,
    frustrationDwellMul: 0.55,
    frustrationBounceBst: 0.12,
    rageClickChance: 0.15,
    // --- Micro-Interactions ---
    chanceTextSelect: 0.02,
    chanceIdlePause: 0.05,
    idlePauseMinMs: 500,
    idlePauseMaxMs: 2000,
    chanceTabSwitch: 0.02,
    tabSwitchAwayMinMs: 1000,
    tabSwitchAwayMaxMs: 5000,
    chanceMouseDrift: 0.01,
    chanceHoverElement: 0.06,
    // --- Cookie Consent ---
    cookieAcceptRate: 0.40,
    cookieStableRatio: 0.67,
    cookieReactionDelayMin: 600,
    cookieReactionDelayMax: 2000,
    // --- Popup ---
    popupDelaySec: 0,               // ← PATCH v1.2.0 [MP-1] disabled (frustrated = leave fast)
    popupCloseRate: 0.70,
    popupConvertEnabled: false,
    popupIgnoreRate: 0.28,
    // --- Reading ---
    readingSpeedWPM: 238,
    readingSpeedSTD: 45,
    scanFactorMin: 0.10,
    scanFactorMax: 0.30,
    fPatternEnabled: false,
    // --- Mouse Physics ---
    fittsA: 100,
    fittsB: 150,
    mouseOvershootChance: 0.35,
    mouseOvershootPxMin: 8,
    mouseOvershootPxMax: 30,
    mouseJitterStd: 2.0,
    mouseStepsMin: 12,
    mouseStepsMax: 35,
    mouseStepDelayMin: 2,
    mouseStepDelayMax: 10,
    // --- External Click Lock ---
    externalClickLock: true,
    externalIdleScrollChance: 0.25,
    externalMaxTimeSec: 15
};


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: MODE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

const MODES = {
    1: MODE_1_MANUAL,
    2: MODE_2_HIGH_BOUNCE,
    3: MODE_3_CASUAL,
    4: MODE_4_ENGAGED,
    5: MODE_5_EXPLORER,
    6: MODE_6_CONVERSION,
    7: MODE_7_FRUSTRATED
};

const MODE_NAMES = {
    1: 'Manual',
    2: 'High Bounce',
    3: 'Casual Reader',
    4: 'Engaged Reader',
    5: 'Deep Explorer',
    6: 'Conversion Flow',
    7: 'Frustrated User'
};


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: HUMANLIKE.ENV ISOLATED LOADER + ENV OVERRIDE MECHANISM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the path to HumanLike.env.
 *
 * Search order:
 *   1. Same directory as this file (HumanLike_ModePresets.js)
 *   2. Project root (process.cwd())
 *   3. HUMANLIKE_ENV_PATH environment variable (explicit override)
 *
 * @returns {string} Absolute path to HumanLike.env
 * @throws {Error} If HumanLike.env is not found in any location
 */
function resolveEnvPath() {
    // Allow explicit override via env var (for testing / special deployments)
    if (process.env.HUMANLIKE_ENV_PATH) {
        const explicit = path.resolve(process.env.HUMANLIKE_ENV_PATH);
        if (fs.existsSync(explicit)) return explicit;
    }

    // Same directory as this module
    const localPath = path.join(__dirname, 'HumanLike.env');
    if (fs.existsSync(localPath)) return localPath;

    // Project root (cwd)
    const rootPath = path.join(process.cwd(), 'HumanLike.env');
    if (fs.existsSync(rootPath)) return rootPath;

    throw new Error(
        '[ModePresets] HumanLike.env not found. Searched:\n' +
        `  1. ${localPath}\n` +
        `  2. ${rootPath}\n` +
        '  3. HUMANLIKE_ENV_PATH env var (not set)\n' +
        'Place HumanLike.env next to HumanLike_ModePresets.js or set HUMANLIKE_ENV_PATH.'
    );
}

/**
 * Cache for parsed HumanLike.env content.
 * Keyed by file mtime to auto-invalidate when file changes.
 * This avoids re-reading the file on every getModeConfig() call within
 * the same process, while still picking up hot-reload changes.
 *
 * ASYNC SAFETY: dotenv.parse() returns a plain object — it does NOT
 * write to process.env. Each caller gets its own isolated copy.
 * Multiple workers in the same Node.js process can safely call
 * loadHumanLikeEnv() concurrently without cross-contamination.
 */
let _envCache = { mtimeMs: 0, parsed: null, filePath: null };

/**
 * Load and parse HumanLike.env into an isolated object.
 *
 * CRITICAL DESIGN: Uses dotenv.parse(fs.readFileSync()) instead of
 * dotenv.config(). The difference:
 *
 *   dotenv.config()  → WRITES to process.env (shared global state)
 *                      → Other modules see HumanLike vars in process.env
 *                      → Concurrent workers POLLUTE each other
 *                      → Main .env vars get OVERWRITTEN
 *
 *   dotenv.parse()   → Returns plain object (isolated)
 *                      → Nothing written to process.env
 *                      → Each call is independent
 *                      → No cross-contamination between modules
 *
 * @returns {Object} Parsed key-value pairs from HumanLike.env
 */
function loadHumanLikeEnv() {
    const filePath = resolveEnvPath();

    // Check if cache is still valid (same file, same mtime)
    try {
        const stat = fs.statSync(filePath);
        if (_envCache.filePath === filePath && _envCache.mtimeMs === stat.mtimeMs && _envCache.parsed) {
            return _envCache.parsed;
        }

        // Read and parse (isolated — does NOT touch process.env)
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const parsed = dotenv.parse(fileContent);

        // Update cache
        _envCache = {
            mtimeMs: stat.mtimeMs,
            parsed: parsed,
            filePath: filePath
        };

        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`[ModePresets] HumanLike.env not found at: ${filePath}`);
        }
        throw err;
    }
}

/**
 * ENV-to-config key mapping.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ v1.3.0 BREAKING: env keys now match HumanLike.env naming convention.  │
 * │ Source of truth: HumanLike.env (NOT .env from QTE)                      │
 * │                                                                         │
 * │ v1.2.0 used .env names (e.g., BOUNCE_RATE, WEIBULL_SHAPE_K)            │
 * │ v1.3.0 uses HumanLike.env names (e.g., BOUNCE_RATE_BASE, DWELL_WEIBULL_K) │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Maps HumanLike.env variable names to config object keys with type information.
 *
 * OVERRIDE RULE: Any HumanLike.env value that is NOT '-1' (for numbers) or NOT empty
 * (for booleans/strings) will override the mode default.
 * Setting a value to -1 means "use mode default".
 */
const ENV_MAP = [
    // --- Session-Level ---
    { env: 'BOUNCE_RATE_BASE',             key: 'bounceRate',              type: 'float' },
    { env: 'PAGE_STOP_PROBABILITY',        key: 'pageStopProbability',     type: 'float' },
    { env: 'MAX_PAGES_PER_SESSION',        key: 'maxPagesPerSession',      type: 'int' },
    { env: 'BOUNCE_DWELL_MEAN',            key: 'bounceDwellMean',         type: 'float' },
    // --- Dwell Time (Weibull) ---
    { env: 'DWELL_WEIBULL_K',              key: 'weibullK',               type: 'float' },
    { env: 'DWELL_WEIBULL_LAMBDA',         key: 'weibullLambda',          type: 'float' },
    { env: 'DWELL_MIN_SEC',                key: 'dwellMinSec',            type: 'int' },
    { env: 'DWELL_MAX_SEC',                key: 'dwellMaxSec',            type: 'int' },
    // --- Scroll Depth (Markov) ---
    { env: 'SCROLL_MARKOV_R1',             key: 'scrollR1',               type: 'float' },
    { env: 'SCROLL_MARKOV_R2',             key: 'scrollR2',               type: 'float' },
    { env: 'SCROLL_MARKOV_R3',             key: 'scrollR3',               type: 'float' },
    { env: 'SCROLL_MARKOV_R4',             key: 'scrollR4',               type: 'float' },
    { env: 'SCROLL_UP_PROBABILITY',        key: 'scrollUpProbability',     type: 'float' },
    { env: 'SCROLL_SPEED_VARIANCE',        key: 'scrollSpeedVariance',     type: 'float' },
    // --- Click Probabilities ---
    { env: 'CHANCE_CLICK_INTERNAL',        key: 'chanceClickInternal',     type: 'float' },
    { env: 'CHANCE_CLICK_EXTERNAL',        key: 'chanceClickExternal',     type: 'float' },
    { env: 'CHANCE_CLICK_AD',              key: 'chanceClickAd',           type: 'float' },
    { env: 'CLICK_INTERNAL_DB_PRIORITY',   key: 'clickInternalDbPriority', type: 'float' },
    // --- Frustration ---
    { env: 'FRUSTRATION_RATE',             key: 'frustrationRate',         type: 'float' },
    { env: 'FRUSTRATION_DWELL_MULTIPLIER', key: 'frustrationDwellMul',     type: 'float' },
    { env: 'FRUSTRATION_BOUNCE_UPLIFT',    key: 'frustrationBounceBst',    type: 'float' },
    { env: 'RAGE_CLICK_CHANCE',            key: 'rageClickChance',         type: 'float' },
    // --- Micro-Interactions ---
    { env: 'CHANCE_TEXT_SELECT',           key: 'chanceTextSelect',        type: 'float' },
    { env: 'CHANCE_IDLE_PAUSE',            key: 'chanceIdlePause',         type: 'float' },
    { env: 'IDLE_PAUSE_MIN_MS',            key: 'idlePauseMinMs',          type: 'int' },
    { env: 'IDLE_PAUSE_MAX_MS',            key: 'idlePauseMaxMs',          type: 'int' },
    { env: 'CHANCE_TAB_SWITCH',            key: 'chanceTabSwitch',         type: 'float' },
    { env: 'TAB_SWITCH_AWAY_MIN_MS',       key: 'tabSwitchAwayMinMs',      type: 'int' },
    { env: 'TAB_SWITCH_AWAY_MAX_MS',       key: 'tabSwitchAwayMaxMs',      type: 'int' },
    { env: 'CHANCE_MOUSE_DRIFT',           key: 'chanceMouseDrift',        type: 'float' },
    { env: 'CHANCE_HOVER_ELEMENT',         key: 'chanceHoverElement',      type: 'float' },
    // --- Cookie Consent ---
    { env: 'COOKIE_ACCEPT_RATE',           key: 'cookieAcceptRate',        type: 'float' },
    { env: 'COOKIE_STABLE_RATIO',          key: 'cookieStableRatio',       type: 'float' },
    { env: 'COOKIE_REACTION_DELAY_MIN',    key: 'cookieReactionDelayMin',  type: 'int' },
    { env: 'COOKIE_REACTION_DELAY_MAX',    key: 'cookieReactionDelayMax',  type: 'int' },
    // --- Popup ---
    { env: 'POPUP_EXPECTED_DELAY_SEC',     key: 'popupDelaySec',           type: 'int' },
    { env: 'POPUP_CLOSE_RATE',             key: 'popupCloseRate',          type: 'float' },
    { env: 'POPUP_CONVERT_ENABLED',        key: 'popupConvertEnabled',     type: 'bool' },
    { env: 'POPUP_IGNORE_RATE',            key: 'popupIgnoreRate',         type: 'float' },
    // --- Reading ---
    { env: 'READING_SPEED_WPM',            key: 'readingSpeedWPM',         type: 'int' },
    { env: 'READING_SPEED_STD',            key: 'readingSpeedSTD',         type: 'int' },
    { env: 'SCAN_FACTOR_MIN',              key: 'scanFactorMin',           type: 'float' },
    { env: 'SCAN_FACTOR_MAX',              key: 'scanFactorMax',           type: 'float' },
    { env: 'F_PATTERN_ENABLED',            key: 'fPatternEnabled',         type: 'bool' },
    // --- Mouse Physics ---
    { env: 'FITTS_A',                      key: 'fittsA',                  type: 'int' },
    { env: 'FITTS_B',                      key: 'fittsB',                  type: 'int' },
    { env: 'MOUSE_OVERSHOOT_CHANCE',       key: 'mouseOvershootChance',    type: 'float' },
    { env: 'MOUSE_OVERSHOOT_PIXELS_MIN',   key: 'mouseOvershootPxMin',     type: 'int' },
    { env: 'MOUSE_OVERSHOOT_PIXELS_MAX',   key: 'mouseOvershootPxMax',     type: 'int' },
    { env: 'MOUSE_JITTER_STD',             key: 'mouseJitterStd',          type: 'float' },
    { env: 'MOUSE_BEZIER_STEPS_MIN',       key: 'mouseStepsMin',           type: 'int' },
    { env: 'MOUSE_BEZIER_STEPS_MAX',       key: 'mouseStepsMax',           type: 'int' },
    { env: 'MOUSE_STEP_DELAY_MIN',         key: 'mouseStepDelayMin',       type: 'int' },
    { env: 'MOUSE_STEP_DELAY_MAX',         key: 'mouseStepDelayMax',       type: 'int' },
    // --- External Click Lock ---
    { env: 'EXTERNAL_CLICK_LOCK',          key: 'externalClickLock',       type: 'bool' },
    { env: 'EXTERNAL_IDLE_SCROLL_CHANCE',  key: 'externalIdleScrollChance', type: 'float' },
    { env: 'EXTERNAL_MAX_TIME_SEC',        key: 'externalMaxTimeSec',      type: 'int' }
];


/**
 * Read HumanLike.env overrides. Returns an object with ONLY the keys that should
 * override the mode defaults (i.e., value is NOT -1 for numbers,
 * NOT empty for booleans).
 *
 * v1.3.0 BREAKING CHANGE:
 *   - Reads from HumanLike.env file via dotenv.parse() (isolated)
 *   - Does NOT read from process.env (no .env contamination)
 *   - Does NOT write to process.env (no worker cross-pollution)
 *
 * @returns {Object} Partial config with override values only
 */
function loadEnvOverrides() {
    const overrides = {};

    // Load isolated parsed env from HumanLike.env (cached per mtime)
    let envVars;
    try {
        envVars = loadHumanLikeEnv();
    } catch (err) {
        // If HumanLike.env not found, return empty overrides (use mode defaults)
        // This allows the system to work without HumanLike.env during development
        if (process.env.DEBUG === 'true' || process.env.DEBUG_MODE === 'true') {
            console.warn(`[ModePresets] ${err.message}`);
            console.warn('[ModePresets] Falling back to mode defaults (no overrides)');
        }
        return overrides;
    }

    for (const mapping of ENV_MAP) {
        const raw = envVars[mapping.env];

        if (raw === undefined || raw === null || raw === '') {
            continue;
        }

        if (mapping.type === 'float') {
            const val = parseFloat(raw);
            if (!isNaN(val) && val !== -1) {
                overrides[mapping.key] = val;
            }
        } else if (mapping.type === 'int') {
            const val = parseInt(raw, 10);
            if (!isNaN(val) && val !== -1) {
                overrides[mapping.key] = val;
            }
        } else if (mapping.type === 'bool') {
            const lower = raw.toLowerCase().trim();
            if (lower === 'true') {
                overrides[mapping.key] = true;
            } else if (lower === 'false') {
                overrides[mapping.key] = false;
            }
        }
    }

    return overrides;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: PARAMETER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validation rules for each config key.
 * Format: { key: [min, max] } or { key: [min, max, 'type'] }
 * Applied AFTER merge (mode defaults + .env overrides).
 */
const VALIDATION_RULES = {
    bounceRate:             [0, 1],
    pageStopProbability:    [0.001, 1],
    maxPagesPerSession:     [1, 100],
    bounceDwellMean:        [2, 30],         // ← v1.2.0 [MP-4] 2-30 seconds
    weibullK:               [0.1, 2.0],
    weibullLambda:          [1, 500],
    dwellMinSec:            [1, 60],
    dwellMaxSec:            [10, 600],
    scrollR1:               [0, 1],
    scrollR2:               [0, 1],
    scrollR3:               [0, 1],
    scrollR4:               [0, 1],
    scrollUpProbability:    [0, 0.5],
    scrollSpeedVariance:    [0, 1],
    chanceClickInternal:    [0, 0.5],
    chanceClickExternal:    [0, 0.5],
    chanceClickAd:          [0, 0.10],
    clickInternalDbPriority:[0, 1],
    frustrationRate:        [0, 1],
    frustrationDwellMul:    [0.1, 1],
    frustrationBounceBst:   [0, 0.5],
    rageClickChance:        [0, 1],
    chanceTextSelect:       [0, 1],
    chanceIdlePause:        [0, 1],
    idlePauseMinMs:         [100, 30000],
    idlePauseMaxMs:         [500, 60000],
    chanceTabSwitch:        [0, 0.5],
    tabSwitchAwayMinMs:     [500, 30000],
    tabSwitchAwayMaxMs:     [1000, 60000],
    chanceMouseDrift:       [0, 0.5],
    chanceHoverElement:     [0, 1],
    cookieAcceptRate:       [0, 1],
    cookieStableRatio:      [0, 1],
    cookieReactionDelayMin: [100, 10000],
    cookieReactionDelayMax: [500, 30000],
    popupDelaySec:          [0, 60],         // ← v1.2.0 [MP-1] 0=disabled, max 60s
    popupCloseRate:         [0, 1],
    popupIgnoreRate:        [0, 1],
    readingSpeedWPM:        [50, 1000],
    readingSpeedSTD:        [5, 200],
    scanFactorMin:          [0.05, 1],
    scanFactorMax:          [0.1, 1],
    fittsA:                 [10, 500],
    fittsB:                 [10, 500],
    mouseOvershootChance:   [0, 1],
    mouseOvershootPxMin:    [1, 50],
    mouseOvershootPxMax:    [5, 100],
    mouseJitterStd:         [0, 10],
    mouseStepsMin:          [5, 100],
    mouseStepsMax:          [10, 200],
    mouseStepDelayMin:      [1, 50],
    mouseStepDelayMax:      [2, 100],
    externalIdleScrollChance:[0, 1],
    externalMaxTimeSec:     [5, 300]
};


/**
 * Validate and clamp all numeric config values to their allowed ranges.
 * Ensures min <= max for paired parameters.
 *
 * @param {SurfingConfig} config - Config object to validate (mutated in place)
 * @returns {SurfingConfig} The validated config (same reference)
 */
function validateConfig(config) {
    for (const key in VALIDATION_RULES) {
        if (config[key] === undefined) continue;
        if (typeof config[key] !== 'number') continue;

        const [min, max] = VALIDATION_RULES[key];
        if (config[key] < min) config[key] = min;
        if (config[key] > max) config[key] = max;
    }

    // Ensure min <= max for all paired parameters
    if (config.dwellMinSec >= config.dwellMaxSec) {
        config.dwellMinSec = Math.max(1, config.dwellMaxSec - 10);
    }

    if (config.idlePauseMinMs >= config.idlePauseMaxMs) {
        config.idlePauseMinMs = Math.max(100, config.idlePauseMaxMs - 1000);
    }

    if (config.tabSwitchAwayMinMs >= config.tabSwitchAwayMaxMs) {
        config.tabSwitchAwayMinMs = Math.max(500, config.tabSwitchAwayMaxMs - 2000);
    }

    if (config.cookieReactionDelayMin >= config.cookieReactionDelayMax) {
        config.cookieReactionDelayMin = Math.max(100, config.cookieReactionDelayMax - 1000);
    }

    if (config.mouseOvershootPxMin >= config.mouseOvershootPxMax) {
        config.mouseOvershootPxMin = Math.max(1, config.mouseOvershootPxMax - 5);
    }

    if (config.mouseStepsMin >= config.mouseStepsMax) {
        config.mouseStepsMin = Math.max(5, config.mouseStepsMax - 10);
    }

    if (config.mouseStepDelayMin >= config.mouseStepDelayMax) {
        config.mouseStepDelayMin = Math.max(1, config.mouseStepDelayMax - 3);
    }

    if (config.scanFactorMin >= config.scanFactorMax) {
        config.scanFactorMin = Math.max(0.05, config.scanFactorMax - 0.10);
    }

    return config;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the complete surfing configuration for a given mode.
 * Merges mode defaults with .env overrides, validates, and freezes.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ PATCH v1.2.0 — AUTO-ASSEMBLY [MP-2][MP-3][MP-5][MP-6]              │
 * │                                                                      │
 * │ After merge + validate, this function now assembles derived keys    │
 * │ that consumers expect but are stored differently in mode presets:   │
 * │                                                                      │
 * │ [MP-2] scrollTransitions = [scrollR1, scrollR2, scrollR3, scrollR4] │
 * │   → ScrollMarkov.sampleMaxScrollDepth() expects this array          │
 * │   → Without it: config.scrollTransitions = undefined → .map() crash │
 * │                                                                      │
 * │ [MP-3] scrollUpChance = scrollUpProbability                         │
 * │   → ScrollMarkov reads config.scrollUpChance in scroll loop        │
 * │   → Without it: undefined → scroll-up re-read NEVER triggers       │
 * │                                                                      │
 * │ [MP-5] pStop = pageStopProbability                                  │
 * │   → DwellWeibull.planSession() reads config.pStop                   │
 * │   → Without it: samplePageviewCount(undefined) → always 2 pages    │
 * │                                                                      │
 * │ [MP-6] name = MODE_NAMES[modeNumber]                                │
 * │   → SessionEngine logs config.name for debugging                    │
 * │   → Without it: "Mode=6 undefined" in logs                         │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * @param {number} modeNumber - SURFING_MODE from .env (1-7), defaults to 6
 * @returns {SurfingConfig|null} Frozen config object, or null for Mode 1 (Manual)
 */
function getModeConfig(modeNumber) {
    if (modeNumber === undefined || modeNumber === null || isNaN(modeNumber)) {
        modeNumber = 6;
    }

    if (modeNumber < 1 || modeNumber > 7) {
        modeNumber = 6;
    }

    const preset = MODES[modeNumber];

    // Mode 1 (Manual) = null → no auto-surfing
    if (preset === null) {
        return null;
    }

    // Step 1: Clone mode defaults
    const config = Object.assign({}, preset);

    // Step 2: Merge .env overrides (any value ≠ -1 overrides mode default)
    const overrides = loadEnvOverrides();
    Object.assign(config, overrides);

    // Step 3: Validate and clamp all numeric values
    validateConfig(config);

    // ─────────────────────────────────────────────────────────────────────
    // Step 4: AUTO-ASSEMBLY — Derive keys expected by consumers
    // These are computed AFTER validation so clamped values are used.
    // ─────────────────────────────────────────────────────────────────────

    // [MP-2] ScrollMarkov.sampleMaxScrollDepth() expects config.scrollTransitions
    //        as an array of [r1, r2, r3, r4] transition probabilities.
    //        Mode presets store them as individual keys for .env overrideability.
    config.scrollTransitions = [
        config.scrollR1,
        config.scrollR2,
        config.scrollR3,
        config.scrollR4
    ];

    // [MP-3] ScrollMarkov reads config.scrollUpChance in the scroll loop.
    //        Mode presets store it as scrollUpProbability (more descriptive name).
    config.scrollUpChance = config.scrollUpProbability;

    // [MP-5] DwellWeibull.planSession() reads config.pStop for geometric sampling.
    //        Mode presets store it as pageStopProbability (more descriptive name).
    config.pStop = config.pageStopProbability;

    // [MP-6] SessionEngine logs config.name for debug output.
    config.name = MODE_NAMES[modeNumber];

    // Step 5: Freeze — no runtime mutation allowed
    return Object.freeze(config);
}

/**
 * Get the human-readable name for a surfing mode.
 *
 * @param {number} modeNumber - Mode number (1-7)
 * @returns {string} Mode name
 */
function getModeName(modeNumber) {
    return MODE_NAMES[modeNumber] || 'Unknown';
}

/**
 * Get the total number of available modes.
 *
 * @returns {number} Total modes (7)
 */
function getModeCount() {
    return Object.keys(MODES).length;
}

/**
 * Get all available mode numbers and names.
 *
 * @returns {Array<{mode: number, name: string}>}
 */
function listModes() {
    return Object.keys(MODES).map(k => ({
        mode: parseInt(k, 10),
        name: MODE_NAMES[k]
    }));
}


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    getModeConfig,
    getModeName,
    getModeCount,
    listModes,
    loadHumanLikeEnv   // Exposed for other HumanLike_*.js modules that need raw env values
};

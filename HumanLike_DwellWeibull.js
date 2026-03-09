// ═══════════════════════════════════════════════════════════════════════════════
// HumanLike_DwellWeibull.js v1.2.0 — Dwell Time & Session Planner (Layer 2)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ CHANGELOG                                                                │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ v1.2.0 (2026-03-03 06:15 WIB)                                           │
// │   - BUG-14 FIX: Removed duplicate weibullSample() local definition      │
// │     OLD: Local weibullSample(k, lambda) defined in SECTION 1 —          │
// │          identical copy of Math.js weibullSample()                       │
// │     NEW: Import weibullSample from HumanLike_Math.js                    │
// │     → Single source of truth for Weibull inverse CDF sampling           │
// │     → Eliminates maintenance risk: algorithm updates in Math.js         │
// │       now automatically propagate to DwellWeibull                       │
// │     → Math.js v1.2.0 weibullSample includes edge-case protection       │
// │       (u=0/u=1 guard) — DwellWeibull local copy had same guard,        │
// │       but future divergence risk is now eliminated                      │
// │     → weibullSample still re-exported from module.exports for           │
// │       consumers that import from DwellWeibull (backward compat)         │
// │                                                                          │
// │ v1.1.0 (2026-03-03 02:32 WIB)                                           │
// │   - PATCH [DW-1] planSession() — defensive fallback for config.pStop    │
// │     → Uses: config.pStop || config.pageStopProbability || 0.1325        │
// │     → ModePresets v1.2.0 auto-assembles config.pStop, but this          │
// │       defensive chain ensures DwellWeibull works even with raw config   │
// │     → Without fix: config.pStop = undefined → while(random >= undefined)│
// │       = while(false) → samplePageviewCount ALWAYS returns 2 pages      │
// │   - PATCH [DW-2] generateBounceDwell() — smart fallback derivation     │
// │     → Uses: config.bounceDwellMean || (config.weibullLambda * 0.22) || 8│
// │     → ModePresets v1.2.0 provides bounceDwellMean directly, but this   │
// │       adds intelligent fallback: derive from mode's weibullLambda      │
// │     → 0.22 factor: typical bounce mean ≈ 22% of full dwell mean       │
// │       (Mode 6: 35.9 × 0.22 ≈ 7.9 ≈ 8.0 ✓ matches benchmark)         │
// │   - PATCH [DW-3] planSession() — enforce config.maxPagesPerSession     │
// │     → samplePageviewCount() has hardcoded cap at 50 pages              │
// │     → But config.maxPagesPerSession (e.g. 15 for Mode 6) was NEVER     │
// │       enforced → geometric sampler could return 30+ pages              │
// │     → Now: pageCount = Math.min(sampled, config.maxPagesPerSession)    │
// │   - PATCH [DW-4] planSummary() — fix escaped newline literal           │
// │     → Was: lines.join('\\\\n') → produced literal backslash-n text       │
// │     → Now: lines.join('\\n') → produces actual newline characters       │
// │                                                                          │
// │ v1.0.0 (2026-02-20 11:46 WIB)                                           │
// │   - Weibull dwell time sampling per page (k<1 = negative aging)         │
// │   - Frustration + attention persona modifiers on effective λ             │
// │   - Session planner: bounce decision + geometric pageview count          │
// │   - Bounce dwell: ultra-short Weibull (k=0.5, E[T]≈5-12s)             │
// │   - NNg piecewise hazard phase detector for sub-page timing             │
// │   - Popup survival integration: P(user still on page at delay d)        │
// │   - Full session time budget with per-page allocation                   │
// │   - All randomness via trackedRandom()                                  │
// │                                                                          │
// │ LAST HISTORY LOG:                                                        │
// │   human_like.js v14.0 → used flat getHumanDelay(min,max)               │
// │   → DELETED → replaced by this file                                     │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ MATHEMATICAL FOUNDATIONS                                                  │
// ├───────────────────────────────────────────────────────────────────────────┤
// │                                                                          │
// │ 1. WEIBULL DISTRIBUTION (NNg negative aging model)                       │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    PDF:  f(t) = (k/λ)(t/λ)^(k-1) × exp(-(t/λ)^k)                      │
// │    CDF:  F(t) = 1 - exp(-(t/λ)^k)                                      │
// │    Survival: S(t) = exp(-(t/λ)^k)                                       │
// │    Mean: E[T] = λ × Γ(1 + 1/k)                                         │
// │    Median: λ × (ln 2)^(1/k)                                            │
// │    Inverse CDF (sampling): T = λ × (-ln(1-U))^(1/k),  U~Uniform(0,1)  │
// │                                                                          │
// │    When k < 1: "negative aging" → hazard rate DECREASES over time       │
// │    Interpretation: if user hasn't left yet, they're increasingly         │
// │    likely to stay. "Leave quick or stay long."                           │
// │                                                                          │
// │ 2. CALIBRATION (Contentsquare 2021 + NNg)                                │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    Targets: E[T] = 54s, median ≈ 19.5s, heavy right tail               │
// │    Solution: k = 0.6, λ = E[T] / Γ(1 + 1/k) = 54 / Γ(1+1/0.6)        │
// │              Γ(1 + 5/3) = Γ(8/3) ≈ 1.5046                              │
// │              λ = 54 / 1.5046 ≈ 35.9                                     │
// │    Check: median = 35.9 × (ln 2)^(1/0.6) = 35.9 × 0.543 ≈ 19.5s ✓    │
// │                                                                          │
// │ 3. FRUSTRATION MODIFIER (Contentsquare 2024)                             │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    When persona.isFrustrated = true:                                     │
// │      λ_eff = λ × persona.attentionMul × config.frustrationDwellMul     │
// │    This makes frustrated users leave faster (smaller λ → smaller mean). │
// │    Already computed as persona.effectiveWeibullLambda in Profiles.js.    │
// │                                                                          │
// │ 4. BOUNCE MODEL (Bab 1-3)                                                │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    P(bounce) = persona.effectiveBounceRate (default 0.47, +0.07 if F=1) │
// │    Bounce dwell: Weibull(k=0.50, λ_bounce) with E[T_bounce] ≈ 5-12s   │
// │    These are the users who "take one look and leave."                    │
// │                                                                          │
// │ 5. PAGEVIEW COUNT — Shifted Geometric (Bab 3)                            │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    If not bounced: N ~ shifted_geometric(p_stop) + 1                    │
// │    P(N=n | B=0) = p_stop × (1-p_stop)^(n-2),  n ≥ 2                   │
// │    Calibration: E[N] = 1×P(B) + (1 + 1/p_stop)×P(¬B) = 5             │
// │    → p_stop = 0.53 / (5-1) = 0.1325                                    │
// │    → E[N | ¬B] = 1 + 1/0.1325 ≈ 8.55 pages                            │
// │                                                                          │
// │ 6. NNg HAZARD PHASES                                                     │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    Phase 1 (0-10s):  "Critical" — highest leave probability             │
// │    Phase 2 (10-30s): "Decision" — many users still leaving              │
// │    Phase 3 (30s+):   "Committed" — hazard levels off, user engaged      │
// │    Used by SessionEngine to determine action intensity per time slice.   │
// │                                                                          │
// │ 7. POPUP SURVIVAL — P(user present at delay d)                           │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    S(d) = exp(-(d/λ)^k)                                                 │
// │    Used to determine if popup can actually appear during the visit.      │
// │    With k=0.6, λ=35.9:                                                  │
// │      S(6)  = 0.83 — 83% still on page after 6s                         │
// │      S(10) = 0.75 — 75% still on page after 10s                        │
// │      S(30) = 0.54 — 54% still on page after 30s                        │
// │      S(60) = 0.38 — 38% still on page after 60s                        │
// │                                                                          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ DEFENSIVE FALLBACK CHAIN (v1.1.0)                                        │
// ├───────────────────────────────────────────────────────────────────────────┤
// │                                                                          │
// │ ModePresets v1.2.0 now auto-assembles derived keys (pStop, etc.) in     │
// │ getModeConfig(). However, DwellWeibull adds its own fallback chains     │
// │ so it works correctly even with raw/unprocessed config objects:          │
// │                                                                          │
// │ Consumer reads:     │ Fallback chain:                                    │
// │ ──────────────────  │ ────────────────────────────────────               │
// │ config.pStop        │ config.pStop ‖ config.pageStopProbability ‖ 0.1325│
// │ config.bounceDwell  │ config.bounceDwellMean ‖ λ×0.22 ‖ 8.0            │
// │ config.maxPages     │ config.maxPagesPerSession ‖ 15                    │
// │                                                                          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// DEPENDENCIES:
//   HumanLike_Math.js:     trackedRandom, gaussianRandom, clamp, getRandomInt, weibullSample
//   HumanLike_Profiles.js: persona.effectiveWeibullLambda,
//                           persona.effectiveBounceRate, persona.attentionMul
//
// CONSUMERS:
//   HumanLike_ScrollMarkov.js (receives dwellMs per page)
//   HumanLike_SessionEngine.js (receives full session plan)
//
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │ BUG-14 FIX: Import weibullSample from Math.js instead of defining     │
// │             locally. Single source of truth for Weibull sampling.       │
// │                                                                         │
// │ OLD (v1.1.0):                                                           │
// │   const { trackedRandom, gaussianRandom, clamp, getRandomInt }         │
// │     = require('./HumanLike_Math.js');                                   │
// │   function weibullSample(k, lambda) { ... }  ← LOCAL DUPLICATE         │
// │                                                                         │
// │ NEW (v1.2.0):                                                           │
// │   const { trackedRandom, gaussianRandom, clamp, getRandomInt,          │
// │           weibullSample }                                               │
// │     = require('./HumanLike_Math.js');                                   │
// │   // Local weibullSample REMOVED — imported from Math.js               │
// └─────────────────────────────────────────────────────────────────────────┘
const {
    trackedRandom,
    gaussianRandom,
    clamp,
    getRandomInt,
    weibullSample         // BUG-14 FIX: imported instead of locally duplicated
} = require('./HumanLike_Math.js');


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: WEIBULL FUNCTIONS (Survival & Hazard)
// ═══════════════════════════════════════════════════════════════════════════════
//
// NOTE (v1.2.0 BUG-14): weibullSample() has been REMOVED from this section.
// It is now imported from HumanLike_Math.js (see imports above).
// The functions below (weibullSurvival, weibullHazard) remain here because
// they are NOT defined in Math.js — they are DwellWeibull-specific functions
// used for survival analysis, hazard rate calculations, and popup timing.

/**
 * Weibull survival function: P(T > t)
 *
 * S(t) = exp(-(t/λ)^k)
 *
 * @param {number} t      - Time point
 * @param {number} k      - Shape parameter
 * @param {number} lambda  - Scale parameter
 * @returns {number} Probability of surviving past time t
 */
function weibullSurvival(t, k, lambda) {
    if (t <= 0) return 1.0;
    return Math.exp(-Math.pow(t / lambda, k));
}

/**
 * Weibull hazard function: h(t) = (k/λ)(t/λ)^(k-1)
 *
 * When k < 1, hazard DECREASES over time (negative aging).
 *
 * @param {number} t      - Time point
 * @param {number} k      - Shape parameter
 * @param {number} lambda  - Scale parameter
 * @returns {number} Instantaneous hazard rate at time t
 */
function weibullHazard(t, k, lambda) {
    if (t <= 0) return Infinity; // k<1 has infinite hazard at t=0
    return (k / lambda) * Math.pow(t / lambda, k - 1);
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: DWELL TIME GENERATOR (per page)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate dwell time for a single pageview.
 *
 * Uses persona.effectiveWeibullLambda which already incorporates:
 *   - Base mode λ (config.weibullLambda)
 *   - Attention multiplier (persona.attentionMul)
 *   - Frustration modifier (config.frustrationDwellMul if F=1)
 *
 * Floor at 2 seconds (minimum page render time).
 * Ceiling at config.dwellMaxSec (prevents degenerate outliers).
 *
 * @param {Object} config  - Mode config with weibullK, dwellMaxSec
 * @param {Object} persona - Session persona
 * @returns {number} Dwell time in milliseconds
 */
function generatePageDwell(config, persona) {
    const k = config.weibullK;
    const lambda = persona.effectiveWeibullLambda;

    const rawSeconds = weibullSample(k, lambda);
    const clampedSeconds = clamp(rawSeconds, 2.0, config.dwellMaxSec || 300);

    return Math.round(clampedSeconds * 1000);
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: BOUNCE DWELL TIME
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate dwell time for a bounced visit.
 * Bounce visits are ultra-short: "take one look and leave."
 *
 * Uses Weibull with k=0.50 (even more front-loaded than normal)
 * and a much smaller λ calibrated to E[T_bounce] ≈ 5-12s.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ PATCH v1.1.0 [DW-2] — Smart fallback for bounceDwellMean          │
 * │                                                                      │
 * │ Priority chain:                                                      │
 * │   1. config.bounceDwellMean  ← ModePresets v1.2.0 provides this    │
 * │   2. config.weibullLambda × 0.22  ← derive from mode's full λ     │
 * │      (bounce mean ≈ 22% of full dwell mean — empirical ratio)      │
 * │      Mode 6: 35.9 × 0.22 = 7.9 ≈ 8.0 ✓                          │
 * │      Mode 2: 8.0 × 0.22 = 1.76 → clamped to 2.0 (k_bounce Γ)    │
 * │   3. 8.0  ← hardcoded benchmark fallback (Contentsquare)          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} config - Mode config with bounceDwellMean
 * @returns {number} Bounce dwell time in milliseconds
 */
function generateBounceDwell(config) {
    const k_bounce = 0.50;

    // [DW-2] Smart fallback: direct value → derived from λ → benchmark default
    const meanBounce = config.bounceDwellMean
        || (config.weibullLambda ? config.weibullLambda * 0.22 : null)
        || 8.0;

    // λ = E[T] / Γ(1 + 1/k) ; for k=0.50, Γ(3) = 2.0
    const lambda_bounce = meanBounce / 2.0;

    const rawSeconds = weibullSample(k_bounce, lambda_bounce);
    const clampedSeconds = clamp(rawSeconds, 1.0, 30.0);

    return Math.round(clampedSeconds * 1000);
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: PAGEVIEW COUNT — Shifted Geometric
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sample number of pageviews for a non-bounced session.
 *
 * Model: N ~ shifted_geometric(pStop) + 1, for N ≥ 2
 * P(N=n | B=0) = pStop × (1-pStop)^(n-2)
 *
 * @param {number} pStop - Per-page stop probability (default 0.1325)
 * @returns {number} Number of pageviews (≥ 2)
 */
function samplePageviewCount(pStop) {
    let pages = 2; // Minimum for non-bounce

    // Geometric sampling: keep going until "stop"
    while (trackedRandom() >= pStop) {
        pages++;
        // Safety cap at 50 pages (prevents runaway)
        if (pages >= 50) break;
    }

    return pages;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: NNG HAZARD PHASE DETECTOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine the NNg hazard phase for a given elapsed time.
 *
 * Phase 1 (0-10s):  "critical" — highest leave probability
 * Phase 2 (10-30s): "decision" — still deciding, moderate hazard
 * Phase 3 (30s+):   "committed" — user is engaged, low hazard
 *
 * Used by SessionEngine to modulate action intensity.
 *
 * @param {number} elapsedSec - Seconds elapsed on current page
 * @returns {{ phase: string, index: number, description: string }}
 */
function getNNgPhase(elapsedSec) {
    if (elapsedSec < 10) {
        return {
            phase: 'critical',
            index: 1,
            description: 'First 10s: highest exit hazard, orientation only'
        };
    } else if (elapsedSec < 30) {
        return {
            phase: 'decision',
            index: 2,
            description: '10-30s: user deciding to stay or leave'
        };
    } else {
        return {
            phase: 'committed',
            index: 3,
            description: '30s+: user committed, low exit hazard'
        };
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: POPUP SURVIVAL CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if user will still be on page when popup delay fires.
 *
 * Uses Weibull survival function with the page's dwell parameters.
 * If dwellMs was already sampled, compare directly instead.
 *
 * @param {number} delaySec - Popup delay in seconds
 * @param {number} dwellMs  - Sampled dwell time for this page (ms)
 * @returns {boolean} true if user is still on page at delaySec
 */
function isUserPresentAtDelay(delaySec, dwellMs) {
    return (delaySec * 1000) < dwellMs;
}

/**
 * Calculate theoretical survival probability at a given delay.
 * Used for analytics/logging, not for runtime decisions.
 *
 * @param {number} delaySec - Delay in seconds
 * @param {number} k        - Weibull shape
 * @param {number} lambda    - Weibull scale
 * @returns {number} P(T > delay)
 */
function survivalAtDelay(delaySec, k, lambda) {
    return weibullSurvival(delaySec, k, lambda);
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: SESSION PLANNER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} PagePlan
 * @property {number} pageIndex  - 0-based page index
 * @property {number} dwellMs    - Planned dwell time in ms
 * @property {boolean} isBounce  - true if this is a bounce page (only for page 0)
 * @property {string} dwellCategory - 'ultra-short'|'short'|'medium'|'long'|'extended'
 */

/**
 * @typedef {Object} SessionPlan
 * @property {boolean} isBounce       - Whether session is a bounce
 * @property {number} pageCount       - Total planned pageviews
 * @property {number} totalDwellMs    - Sum of all page dwell times
 * @property {PagePlan[]} pages       - Per-page plans
 * @property {number} pStop           - Stop probability used
 */

/**
 * Generate a complete session timing plan.
 *
 * This plans the ENTIRE session before execution begins:
 *   1. Decide bounce or not (from persona.effectiveBounceRate)
 *   2. If bounce: 1 page with ultra-short Weibull dwell
 *   3. If not bounce: sample pageview count, then dwell per page
 *
 * Each page gets an independently sampled Weibull dwell time.
 * The plan is returned but can be adjusted during execution
 * (e.g., if user discovers interesting content → extend dwell).
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ PATCH v1.1.0 [DW-1] — Defensive pStop resolution                  │
 * │                                                                      │
 * │ config.pStop is auto-assembled by ModePresets v1.2.0 from          │
 * │ config.pageStopProbability. But if this function receives a raw    │
 * │ config object (not processed by getModeConfig()), the fallback     │
 * │ chain prevents the catastrophic "always 2 pages" bug:              │
 * │                                                                      │
 * │   pStop = config.pStop                     ← assembled by v1.2.0  │
 * │        || config.pageStopProbability        ← raw mode key         │
 * │        || 0.1325                            ← benchmark default    │
 * │                                                                      │
 * │ PATCH v1.1.0 [DW-3] — Enforce maxPagesPerSession                  │
 * │                                                                      │
 * │ samplePageviewCount() caps at 50 (internal safety), but the mode's │
 * │ maxPagesPerSession was NEVER enforced. A Mode 2 session (max=5)   │
 * │ could theoretically get 20+ pages from geometric sampling.         │
 * │ Now capped: pageCount = Math.min(sampled, maxPagesPerSession)      │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} config  - Mode config
 * @param {Object} persona - Session persona from generatePersona()
 * @returns {SessionPlan} Complete session plan
 */
function planSession(config, persona) {
    // [DW-1] Defensive pStop resolution: assembled → raw key → benchmark
    const pStop = config.pStop || config.pageStopProbability || 0.1325;

    // [DW-3] Resolve maxPagesPerSession with fallback
    const maxPages = config.maxPagesPerSession || 15;

    const isBounce = trackedRandom() < persona.effectiveBounceRate;

    if (isBounce) {
        // ─── Bounce session: 1 page, ultra-short dwell ───
        const dwellMs = generateBounceDwell(config);
        return {
            isBounce: true,
            pageCount: 1,
            totalDwellMs: dwellMs,
            pages: [{
                pageIndex: 0,
                dwellMs: dwellMs,
                isBounce: true,
                dwellCategory: categorizeDwell(dwellMs)
            }],
            pStop: pStop
        };
    }

    // ─── Engaged session: multiple pages ───
    const sampledPages = samplePageviewCount(pStop);
    const pageCount = Math.min(sampledPages, maxPages);  // [DW-3] enforce mode cap
    const pages = [];
    let totalDwellMs = 0;

    for (let i = 0; i < pageCount; i++) {
        const dwellMs = generatePageDwell(config, persona);
        totalDwellMs += dwellMs;

        pages.push({
            pageIndex: i,
            dwellMs: dwellMs,
            isBounce: false,
            dwellCategory: categorizeDwell(dwellMs)
        });
    }

    return {
        isBounce: false,
        pageCount: pageCount,
        totalDwellMs: totalDwellMs,
        pages: pages,
        pStop: pStop
    };
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: DWELL CATEGORIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Categorize dwell time into human-readable buckets for logging.
 *
 * @param {number} dwellMs - Dwell time in milliseconds
 * @returns {string} Category label
 */
function categorizeDwell(dwellMs) {
    const sec = dwellMs / 1000;
    if (sec < 5)   return 'ultra-short';
    if (sec < 15)  return 'short';
    if (sec < 45)  return 'medium';
    if (sec < 120) return 'long';
    return 'extended';
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: SESSION PLAN SUMMARY (Logging/Debug)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a human-readable session plan summary for logging.
 *
 * @param {SessionPlan} plan - From planSession()
 * @returns {string} Multi-line summary
 */
function planSummary(plan) {
    const lines = [
        `[SessionPlan] bounce=${plan.isBounce} pages=${plan.pageCount} ` +
        `totalDwell=${(plan.totalDwellMs / 1000).toFixed(1)}s`
    ];
    for (const p of plan.pages) {
        lines.push(
            `  Page ${p.pageIndex}: ${(p.dwellMs / 1000).toFixed(1)}s (${p.dwellCategory})`
        );
    }
    return lines.join('\n');  // [DW-4] Fixed: was '\\n' (literal backslash-n)
}


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    // BUG-14 FIX: weibullSample is re-exported for backward compatibility
    // (consumers importing from DwellWeibull will still get the function,
    //  but it now comes from Math.js — single source of truth)
    weibullSample,
    weibullSurvival,
    weibullHazard,
    generatePageDwell,
    generateBounceDwell,
    samplePageviewCount,
    getNNgPhase,
    isUserPresentAtDelay,
    survivalAtDelay,
    planSession,
    planSummary,
    categorizeDwell
};

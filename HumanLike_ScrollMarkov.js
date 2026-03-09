// ═══════════════════════════════════════════════════════════════════════════════
// HumanLike_ScrollMarkov.js v1.0.1 — Scroll Engine (Layer 2)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ CHANGELOG                                                                │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ v1.0.1 (2026-03-03 04:48 WIB)                                           │
// │   - BUGFIX [SM-2]: Dead variable in handleBottomReached() branch 2      │
// │     → getScrollState(page) was called but result never used             │
// │     → Removed wasteful page.evaluate() call                             │
// │                                                                          │
// │   - DEFENSIVE [SM-3]: scrollPage() now validates config.scrollTransitions│
// │     before passing to sampleMaxScrollDepth()                             │
// │     → Falls back to Mode 6 defaults [0.80, 0.73, 0.61, 0.28] if        │
// │       ModePresets doesn't provide the assembled array                    │
// │     → Guards against undefined.map() TypeError crash                    │
// │     → SessionEngine v1.2.0 normalizeConfig() provides this, but        │
// │       ScrollMarkov should be independently safe                         │
// │                                                                          │
// │   - DEFENSIVE [SM-4]: scrollPage() now validates config.scrollUpChance   │
// │     → Falls back to 0.15 if key is missing                              │
// │     → Guards against "trackedRandom() < undefined → always false"       │
// │     → SessionEngine v1.2.0 normalizeConfig() aliases this from          │
// │       scrollUpProbability, but defensive fallback ensures safety         │
// │                                                                          │
// │   - DOC [SM-5]: DEPENDENCIES comment corrected                           │
// │     → Removed weibullSample (never imported/used by this file)          │
// │     → Removed gaussianRandom, getHumanDelay (not used in code body)     │
// │                                                                          │
// │   - EDGE [SM-6]: calculateHoldingTimes() adds minimum holding guard      │
// │     → Math.max(50, finalHolding) ensures at least 50ms per segment      │
// │     → Prevents 0ms hold when exponentialSample returns very small value │
// │                                                                          │
// │   - CLEANUP: Removed dead imports (gaussianRandom, getHumanDelay)       │
// │     → Neither function is called anywhere in this file                  │
// │     → Both remain available in Math.js if needed in future              │
// │                                                                          │
// │   - NOTE [SM-1]: exponentialSample import depends on Math.js v1.1.0+    │
// │     → Math.js M-1 patch adds exponentialSample(rate) to exports         │
// │     → This file requires Math.js v1.1.0; will crash with v1.0.0        │
// │     → No code change needed here — fix is entirely in Math.js           │
// │                                                                          │
// │ v1.0.0 (2026-02-20 11:29 WIB)                                           │
// │   - Full rewrite of humanScroll/smoothMouseScroll from human_like.js v14 │
// │   - Absorbing Markov chain for max scroll depth (5 segments + Exit)      │
// │   - CTMC holding time per segment (NNg attention weights)                │
// │   - Persona scroll style integration (gradual/jumpy/minimal)             │
// │   - Frustration modifier: r_i × frustMul, holding × frustTimeMul        │
// │   - Smooth wheel physics: inertia + deceleration + variance per step     │
// │   - Scroll-up re-read behavior (Bernoulli per transition)                │
// │   - Keyboard scroll alternative (ArrowDown, PageDown, Space)             │
// │   - Scroll pause with Gaussian jitter between segments                   │
// │   - All randomness via trackedRandom() for entropy tracking              │
// │                                                                          │
// │ LAST HISTORY LOG:                                                        │
// │   human_like.js v14.0 humanScroll() → DELETED → replaced by this file  │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ MATHEMATICAL FOUNDATIONS                                                  │
// ├───────────────────────────────────────────────────────────────────────────┤
// │                                                                          │
// │ 1. ABSORBING MARKOV CHAIN — Scroll Depth (Bab 1-3)                       │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    States: S1(0-20%), S2(20-40%), S3(40-60%), S4(60-80%),               │
// │            S5(80-100%), X(exit/stop)                                     │
// │                                                                          │
// │    Transitions (forward only + exit):                                    │
// │      P(S_{i+1} | S_i) = r_i       (continue scrolling)                 │
// │      P(X | S_i)       = 1 - r_i   (stop at current depth)              │
// │                                                                          │
// │    Transition matrix (6×6):                                              │
// │      ┌                                     ┐                            │
// │      │  0   r₁   0    0    0   1-r₁  │  S1                        │
// │      │  0    0   r₂   0    0   1-r₂  │  S2                        │
// │      │  0    0    0   r₃   0   1-r₃  │  S3                        │
// │      │  0    0    0    0   r₄  1-r₄  │  S4                        │
// │      │  0    0    0    0    0    1    │  S5 (absorbs→X)            │
// │      │  0    0    0    0    0    1    │  X  (absorbing)            │
// │      └                                     ┘                            │
// │                                                                          │
// │    Calibration (Contentsquare 2021):                                     │
// │      E[D] = 0.2 × (1 + r₁ + r₁r₂ + r₁r₂r₃ + r₁r₂r₃r₄) = 0.568     │
// │                                                                          │
// │    Default r_i (Mode 6):                                                 │
// │      r₁=0.80  r₂=0.73  r₃=0.61  r₄=0.28                              │
// │                                                                          │
// │    Max depth distribution:                                               │
// │      P(D≤0.2) = 1-r₁           = 0.200                                 │
// │      P(D≤0.4) = r₁(1-r₂)      = 0.216                                 │
// │      P(D≤0.6) = r₁r₂(1-r₃)    = 0.228                                 │
// │      P(D≤0.8) = r₁r₂r₃(1-r₄)  = 0.257                                │
// │      P(D≤1.0) = r₁r₂r₃r₄      = 0.100                                 │
// │                                                                          │
// │ 2. CTMC HOLDING TIME — Time per Segment (NNg 2018)                       │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    Attention weights (NNg eye-tracking):                                 │
// │      w₁ = 0.57 (above fold, 57% of viewing time)                       │
// │      w₂ = 0.17 (w₁+w₂ = 0.74, two screenfuls)                         │
// │      w₃ = 0.13                                                          │
// │      w₄ = 0.07                                                          │
// │      w₅ = 0.06                                                          │
// │                                                                          │
// │    Expected holding time per segment:                                    │
// │      τ_i = c × w_i  where c is calibration constant                    │
// │      c = E[T] / Σ(P(reach S_i) × w_i)                                  │
// │                                                                          │
// │    With E[T]=54s (Contentsquare):                                        │
// │      c = 54 / (w₁ + r₁w₂ + r₁r₂w₃ + r₁r₂r₃w₄ + r₁r₂r₃r₄w₅)        │
// │                                                                          │
// │ 3. SCROLL STYLE MODIFIERS (from HumanLike_Profiles.js)                   │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    gradual: r_i × 1.05, stepSize × 1.00, pauseFreq × 1.30             │
// │    jumpy:   r_i × 0.95, stepSize × 1.80, pauseFreq × 0.50             │
// │    minimal: r_i × 0.70, stepSize × 0.80, pauseFreq × 0.60             │
// │                                                                          │
// │ 4. SCROLL PHYSICS — Smooth Wheel                                         │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    Each scroll "gesture" = multiple wheel events with:                   │
// │      - Initial velocity: v₀ (proportional to target distance)           │
// │      - Deceleration: v(i) = v₀ × (1 - i/N)^0.7 (sublinear decay)      │
// │      - Per-step variance: × Uniform(0.8, 1.2) (hand inconsistency)     │
// │      - Inter-step delay: 15-50ms (matches real wheel event timing)      │
// │                                                                          │
// │ 5. SCROLL-UP RE-READ MODEL                                               │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    P(scroll-up | at segment S_i) = scrollUpChance (from config)         │
// │    Re-read distance: Uniform(0.5, 1.5) × one segment height            │
// │    This models the "wait, let me re-read that" behavior.                │
// │                                                                          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// DEPENDENCIES:
//   HumanLike_Math.js (v1.1.0+):
//     trackedRandom, clamp, getRandomInt, sleep, exponentialSample
//   HumanLike_Profiles.js:
//     persona.scroll (style modifiers: transitionMul, stepSizeMul, pauseFrequencyMul)
//
// CONSUMERS:
//   HumanLike_SessionEngine.js (calls scrollPage per pageview, quickScroll per phase)
//
// REQUIRES:
//   Math.js v1.1.0+ (M-1 patch adds exponentialSample)
//   SessionEngine v1.2.0+ (normalizeConfig provides scrollTransitions, scrollUpChance)
//   OR: ModePresets v1.1.0+ (directly provides assembled keys)
//
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ─── Module imports ───
// [SM-5] Cleaned: removed gaussianRandom, getHumanDelay (not used in this file)
// [SM-1] NOTE: exponentialSample requires Math.js v1.1.0+ (M-1 patch)
const {
    trackedRandom,
    clamp,
    getRandomInt,
    sleep,
    exponentialSample
} = require('./HumanLike_Math.js');


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: DEFAULTS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default scroll transition probabilities (Mode 6, Contentsquare 2021).
 * Used as fallback if config.scrollTransitions is missing.
 * E[D] = 0.2 × (1 + 0.80 + 0.80×0.73 + 0.80×0.73×0.61 + 0.80×0.73×0.61×0.28) = 0.568
 */
const DEFAULT_SCROLL_TRANSITIONS = [0.80, 0.73, 0.61, 0.28];

/**
 * Default scroll-up re-read probability per reading chunk.
 * Used as fallback if config.scrollUpChance is missing.
 */
const DEFAULT_SCROLL_UP_CHANCE = 0.15;

/**
 * Minimum holding time per segment (ms).
 * Prevents 0ms hold from edge-case exponential sampling.
 */
const MIN_SEGMENT_HOLD_MS = 50;

/**
 * NNg attention weights per segment.
 * w1=0.57, w2=0.17, w3=0.13, w4=0.07, w5=0.06 (Σ=1.00)
 * Source: Nielsen Norman Group eye-tracking 2018.
 */
const NNG_ATTENTION_WEIGHTS = [0.57, 0.17, 0.13, 0.07, 0.06];


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: PAGE STATE READER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read current scroll state from the browser page.
 *
 * @param {Object} page - Playwright Page object
 * @returns {Promise<Object>} { y, viewportH, totalH, atBottom, atTop, depthPct }
 */
async function getScrollState(page) {
    return await page.evaluate(() => {
        const y = window.scrollY;
        const h = window.innerHeight;
        const total = document.body.scrollHeight;
        return {
            y: y,
            viewportH: h,
            totalH: total,
            atBottom: (h + y) >= total - 50,
            atTop: y < 50,
            depthPct: total > h ? (y + h) / total : 1.0
        };
    });
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: MARKOV CHAIN — MAX SCROLL DEPTH SAMPLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sample max scroll depth from absorbing Markov chain.
 *
 * @param {number[]} rVals       - Transition probabilities [r1, r2, r3, r4]
 * @param {Object}   scrollStyle - persona.scroll { transitionMul, ... }
 * @returns {{ maxSegment: number, depthPct: number, reachedSegments: number[] }}
 */
function sampleMaxScrollDepth(rVals, scrollStyle) {
    const transitionMul = scrollStyle ? scrollStyle.transitionMul : 1.0;

    // Apply persona scroll style modifier to transition probs
    const effectiveR = rVals.map(r => clamp(r * transitionMul, 0, 0.99));

    const reachedSegments = [1]; // Always start at S1 (0-20%)
    let currentSegment = 1;

    for (let i = 0; i < effectiveR.length; i++) {
        if (trackedRandom() < effectiveR[i]) {
            currentSegment = i + 2; // S2=2, S3=3, S4=4, S5=5
            reachedSegments.push(currentSegment);
        } else {
            break; // Exit: absorbed
        }
    }

    // Max depth as continuous percentage (with noise within segment)
    const segmentBase = (currentSegment - 1) * 0.20;
    const segmentNoise = trackedRandom() * 0.20;
    const depthPct = Math.min(1.0, segmentBase + segmentNoise);

    return {
        maxSegment: currentSegment,
        depthPct: depthPct,
        reachedSegments: reachedSegments
    };
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: CTMC — HOLDING TIME PER SEGMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate holding times for reached segments using CTMC model.
 *
 * Time budget per segment is proportional to NNg attention weights,
 * calibrated so total expected time = Weibull-sampled dwell time.
 *
 * Actual holding time per segment sampled from Exponential(τ_i) to add
 * natural variance (CTMC property: sojourn times are exponential).
 *
 * @param {number[]} reachedSegments - Array of segment indices [1,2,...] from Markov chain
 * @param {number}   totalDwellMs    - Total dwell time for this page (from DwellWeibull)
 * @param {Object}   persona         - Session persona (for frustration + scroll style)
 * @returns {Object[]} Array of { segment, holdingMs, cumulativeMs }
 */
function calculateHoldingTimes(reachedSegments, totalDwellMs, persona) {
    // Calculate weight sum for reached segments only
    let weightSum = 0;
    for (const seg of reachedSegments) {
        weightSum += NNG_ATTENTION_WEIGHTS[seg - 1];
    }

    if (weightSum <= 0) weightSum = 1;

    // Calibration constant: total time / weight sum
    const c = totalDwellMs / weightSum;

    const schedule = [];
    let cumulative = 0;

    for (let i = 0; i < reachedSegments.length; i++) {
        const seg = reachedSegments[i];
        const w = NNG_ATTENTION_WEIGHTS[seg - 1];

        // Expected holding time for this segment
        const expectedHolding = c * w;

        // Sample actual holding from Exponential(rate = 1/expected)
        // This gives natural variance while preserving the expected value.
        const actualHolding = exponentialSample(1.0 / expectedHolding);

        // Apply scroll style pause frequency modifier
        const pauseMul = persona.scroll ? persona.scroll.pauseFrequencyMul : 1.0;

        // [SM-6] Minimum guard: ensure at least MIN_SEGMENT_HOLD_MS per segment
        // Prevents 0ms hold when exponentialSample returns extreme small value
        const finalHolding = Math.max(
            MIN_SEGMENT_HOLD_MS,
            Math.round(actualHolding * pauseMul)
        );

        cumulative += finalHolding;

        schedule.push({
            segment: seg,
            holdingMs: finalHolding,
            cumulativeMs: cumulative
        });
    }

    return schedule;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: SMOOTH WHEEL SCROLL PHYSICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a smooth mouse wheel scroll with realistic physics.
 *
 * The scroll is broken into multiple wheel events with:
 * - Sublinear deceleration: v(i) = v0 × (1 - i/N)^0.7
 * - Per-step variance: ×U(0.8, 1.2) (hand inconsistency)
 * - Inter-step delay: 15-50ms (real wheel event timing)
 *
 * @param {Object} page       - Playwright Page object
 * @param {number} distance   - Total scroll distance in pixels
 * @param {string} direction  - 'down' or 'up'
 * @param {Object} persona    - Session persona (for scroll style)
 * @returns {Promise<number>} Actual pixels scrolled (may differ from target)
 */
async function smoothWheelScroll(page, distance, direction, persona) {
    const vector = direction === 'down' ? 1 : -1;
    const stepSizeMul = persona.scroll ? persona.scroll.stepSizeMul : 1.0;

    // Number of wheel events: fewer for jumpy, more for gradual
    const baseSteps = getRandomInt(8, 18);
    const steps = Math.max(4, Math.round(baseSteps / stepSizeMul));

    // Initial velocity (pixels per step)
    const v0 = (distance / steps) * stepSizeMul;

    let totalScrolled = 0;

    for (let i = 0; i < steps; i++) {
        const t = i / steps;

        // Sublinear deceleration
        const velocityFactor = Math.pow(1 - t, 0.7);

        // Per-step hand variance
        const handVariance = 0.8 + trackedRandom() * 0.4;

        const stepPx = v0 * velocityFactor * handVariance * vector;

        await page.mouse.wheel(0, Math.round(stepPx));
        totalScrolled += Math.abs(stepPx);

        // Inter-step delay (realistic wheel timing)
        const delay = getRandomInt(15, 50);
        await sleep(delay);
    }

    return Math.round(totalScrolled);
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: KEYBOARD SCROLL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scroll using keyboard keys (alternative to mouse wheel).
 * Mixes ArrowDown, PageDown, Space with human-like timing.
 *
 * @param {Object} page - Playwright Page object
 * @returns {Promise<void>}
 */
async function keyboardScroll(page) {
    const methods = [
        { key: 'ArrowDown', weight: 0.50, presses: () => getRandomInt(3, 8) },
        { key: 'PageDown',  weight: 0.30, presses: () => getRandomInt(1, 2) },
        { key: 'Space',     weight: 0.20, presses: () => 1 }
    ];

    // Weighted select
    const r = trackedRandom();
    let cum = 0;
    let chosen = methods[0];
    for (const m of methods) {
        cum += m.weight;
        if (r < cum) { chosen = m; break; }
    }

    const count = chosen.presses();
    for (let i = 0; i < count; i++) {
        await page.keyboard.press(chosen.key);
        await sleep(getRandomInt(120, 400));
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: SCROLL-UP RE-READ
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Perform a scroll-up action to re-read previous content.
 * Triggered probabilistically during reading phase.
 *
 * @param {Object} page       - Playwright Page object
 * @param {number} viewportH  - Viewport height in pixels
 * @param {Object} persona    - Session persona
 * @returns {Promise<void>}
 */
async function scrollUpReread(page, viewportH, persona) {
    // Re-read distance: 0.5 to 1.5 viewport heights
    const rereadDist = viewportH * (0.5 + trackedRandom() * 1.0);
    await smoothWheelScroll(page, rereadDist, 'up', persona);

    // Pause to re-read (longer than normal scroll pause)
    const rereadPause = getRandomInt(2000, 6000);
    await sleep(rereadPause);
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: SCROLL TO BOTTOM HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle reaching the bottom of the page.
 * Decides between scrolling back up, jumping to top, or doing nothing.
 *
 * @param {Object} page    - Playwright Page object
 * @param {Object} persona - Session persona
 * @returns {Promise<void>}
 */
async function handleBottomReached(page, persona) {
    const action = trackedRandom();

    if (action < 0.50) {
        // Scroll up a significant portion
        const state = await getScrollState(page);
        const upDist = getRandomInt(
            Math.round(state.viewportH * 1.5),
            Math.round(state.viewportH * 4)
        );
        await smoothWheelScroll(page, upDist, 'up', persona);
    } else if (action < 0.80) {
        // [SM-2] Fix: Removed dead getScrollState() call (result was never used)
        // Scroll up a small amount (skim back)
        await smoothWheelScroll(
            page, getRandomInt(200, 500), 'up', persona
        );
    } else if (action < 0.95) {
        // Jump to top (Home key)
        await page.keyboard.press('Home');
    } else {
        // Do nothing (stay at bottom briefly)
        await sleep(getRandomInt(500, 2000));
    }

    await sleep(getRandomInt(500, 1500));
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: MAIN SCROLL ORCHESTRATOR — scrollPage()
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a complete scroll session for one pageview.
 *
 * This is the main entry point called by SessionEngine.
 * It uses the Markov chain to determine HOW DEEP to scroll,
 * the CTMC to determine HOW LONG to spend per segment,
 * and the scroll physics to execute REALISTIC WHEEL EVENTS.
 *
 * Flow:
 *   1. Sample max depth from absorbing Markov chain
 *   2. Calculate holding times per segment from CTMC
 *   3. For each segment:
 *      a. Scroll down to segment boundary (smooth wheel)
 *      b. Hold for CTMC-sampled time (reading pause)
 *      c. Optionally scroll-up re-read
 *      d. Optionally use keyboard scroll (variety)
 *   4. At max depth: stop or handle bottom
 *
 * @param {Object}   page     - Playwright Page object
 * @param {Object}   config   - Mode config with scrollTransitions, scrollUpChance, etc.
 * @param {Object}   persona  - Session persona
 * @param {number}   dwellMs  - Total dwell time for this page (from DwellWeibull)
 * @param {Function} [logDebug] - Optional debug logger
 * @returns {Promise<Object>} { maxDepthPct, segmentsReached, actualDwellMs }
 */
async function scrollPage(page, config, persona, dwellMs, logDebug) {
    try {
        const startTime = Date.now();
        const state = await getScrollState(page);

        // ─── [SM-3] Defensive: ensure scrollTransitions exists ───
        // SessionEngine v1.2.0 normalizeConfig() provides this, but
        // if called directly or by older SessionEngine, we need safe defaults.
        const rVals = (Array.isArray(config.scrollTransitions) && config.scrollTransitions.length === 4)
            ? config.scrollTransitions
            : DEFAULT_SCROLL_TRANSITIONS;

        // ─── [SM-4] Defensive: ensure scrollUpChance exists ───
        const scrollUpChance = (typeof config.scrollUpChance === 'number')
            ? config.scrollUpChance
            : DEFAULT_SCROLL_UP_CHANCE;

        // ─── Step 1: Sample max depth from Markov chain ───
        const depthResult = sampleMaxScrollDepth(rVals, persona.scroll);

        if (logDebug) {
            logDebug(`[Scroll] MaxDepth=${(depthResult.depthPct * 100).toFixed(0)}% ` +
                     `Segments=${depthResult.reachedSegments.join(',')} ` +
                     `Style=${persona.scroll.name} ` +
                     `rVals=[${rVals.join(',')}] upChance=${scrollUpChance}`);
        }

        // ─── Step 2: Calculate CTMC holding times ───
        const holdingSchedule = calculateHoldingTimes(
            depthResult.reachedSegments,
            dwellMs,
            persona
        );

        // ─── Step 3: Execute scroll through each segment ───
        const scrollableHeight = state.totalH - state.viewportH;
        if (scrollableHeight <= 0) {
            // Page fits in viewport — just wait
            await sleep(dwellMs);
            return {
                maxDepthPct: 1.0,
                segmentsReached: [1],
                actualDwellMs: dwellMs
            };
        }

        const segmentHeightPx = scrollableHeight / 5;

        for (let i = 0; i < holdingSchedule.length; i++) {
            const entry = holdingSchedule[i];

            // Time budget check: don't exceed total dwell
            const elapsed = Date.now() - startTime;
            if (elapsed >= dwellMs) break;

            // ─── 3a. Scroll down to segment boundary ───
            if (i > 0) {
                const scrollMethod = trackedRandom();
                const scrollDist = segmentHeightPx *
                    (persona.scroll ? persona.scroll.stepSizeMul : 1.0);

                if (scrollMethod < 0.82) {
                    // Mouse wheel (dominant method)
                    await smoothWheelScroll(
                        page,
                        Math.round(scrollDist),
                        'down',
                        persona
                    );
                } else {
                    // Keyboard scroll (variety)
                    await keyboardScroll(page);
                }

                // Brief settling pause after scroll
                await sleep(getRandomInt(200, 600));
            }

            // ─── 3b. Hold for CTMC-sampled time ───
            // Distribute holding into read-pause chunks
            let remainingHold = Math.min(
                entry.holdingMs,
                dwellMs - (Date.now() - startTime)
            );

            while (remainingHold > 0) {
                const chunkSize = Math.min(
                    remainingHold,
                    getRandomInt(1500, 4000)
                );
                await sleep(chunkSize);
                remainingHold -= chunkSize;

                // ─── 3c. Scroll-up re-read (probabilistic) ───
                // [SM-4] Uses validated scrollUpChance (not raw config)
                if (remainingHold > 2000 && trackedRandom() < scrollUpChance) {
                    if (logDebug) logDebug('[Scroll] Re-read scroll-up');
                    await scrollUpReread(page, state.viewportH, persona);
                    remainingHold -= 3000; // Account for re-read time
                }
            }

            // Bottom check
            const currentState = await getScrollState(page);
            if (currentState.atBottom) {
                if (logDebug) logDebug('[Scroll] Bottom reached');
                await handleBottomReached(page, persona);
                break;
            }
        }

        const actualDwellMs = Date.now() - startTime;

        return {
            maxDepthPct: depthResult.depthPct,
            segmentsReached: depthResult.reachedSegments,
            actualDwellMs: actualDwellMs
        };

    } catch (e) {
        if (logDebug) logDebug(`[Scroll] Error: ${e.message}`);
        return { maxDepthPct: 0, segmentsReached: [1], actualDwellMs: 0 };
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: QUICK SCROLL (for orientation/scanning phases)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Perform a quick, short scroll during orientation or scanning phase.
 * Does NOT use the full Markov chain — just a simple scroll gesture.
 * Used between Markov-driven scrollPage() calls.
 *
 * @param {Object} page      - Playwright Page object
 * @param {Object} persona   - Session persona
 * @param {string} direction - 'down' or 'up'
 * @returns {Promise<void>}
 */
async function quickScroll(page, persona, direction) {
    try {
        const state = await getScrollState(page);

        if (direction === 'down' && state.atBottom) {
            await handleBottomReached(page, persona);
            return;
        }

        if (direction === 'up' && state.atTop) {
            return; // Already at top
        }

        const distance = getRandomInt(150, 400);
        await smoothWheelScroll(page, distance, direction, persona);
    } catch (e) {
        // Quick scroll is non-critical
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    // Constants (exported for testing/calibration verification)
    NNG_ATTENTION_WEIGHTS,
    DEFAULT_SCROLL_TRANSITIONS,
    DEFAULT_SCROLL_UP_CHANCE,
    MIN_SEGMENT_HOLD_MS,
    // Page state
    getScrollState,
    // Markov chain
    sampleMaxScrollDepth,
    calculateHoldingTimes,
    // Scroll physics
    smoothWheelScroll,
    keyboardScroll,
    scrollUpReread,
    handleBottomReached,
    // Main entry points (consumed by SessionEngine)
    scrollPage,
    quickScroll
};

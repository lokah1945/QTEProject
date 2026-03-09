// ═══════════════════════════════════════════════════════════════════════════════
// HumanLike_Profiles.js v1.2.0 — Per-Session Persona Generator (Layer 1)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ CHANGELOG                                                                │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ v1.2.0 (2026-03-03 05:56 WIB)                                           │
// │   - BUG-06 FIX: Added overshootPxMin/overshootPxMax to persona.mouse    │
// │     → MousePhysics was falling back to static || 5 / || 20 for ALL      │
// │       archetypes because generatePersona() never populated these fields  │
// │     → Now: overshoot DISTANCE scales per archetype via overshootMul      │
// │     → precise: 2-6px | average: 5-20px | lazy: 8-30px | erratic: 10-40px│
// │     → Source: config.mouseOvershootPxMin/Max x archetype.overshootMul    │
// │                                                                          │
// │ v1.0.0 (2026-02-20 10:52 WIB)                                           │
// │   - Initial release: Per-session persona generation from mode config     │
// │   - 7 persona traits: cookieType, frustration, readingSpeed, scanFactor, │
// │     mousePersonality, scrollStyle, attentionSpan                         │
// │   - Cookie type model: AA/AR/CTX with stable ratio from CHB 2025        │
// │   - Frustration state: Bernoulli(rate) with dwell/bounce/rage modifiers  │
// │   - Reading speed: Gaussian(WPM, STD) from Brysbaert 2019               │
// │   - Scan factor: Uniform(min, max) per mode for content skim depth      │
// │   - Mouse personality: 4 archetypes (precise/average/lazy/erratic)       │
// │   - Scroll style: 3 archetypes (gradual/jumpy/minimal)                  │
// │   - Attention span: Gaussian-sampled Weibull lambda multiplier           │
// │   - All traits frozen per session (immutable after generation)           │
// │                                                                          │
// │ LAST HISTORY LOG:                                                        │
// │   human_like.js v14.0 -> DELETED (replaced by HumanLike_*.js modular)   │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ BUG-06 FIX DETAIL                                                        │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ Problem:                                                                 │
// │   generatePersona() built persona.mouse with overshootChance (scaled     │
// │   per archetype) but did NOT include overshootPxMin / overshootPxMax.    │
// │   MousePhysics.humanMove() reads:                                        │
// │     mouseParams.overshootPxMin || 5   -> always 5  (undefined || 5)     │
// │     mouseParams.overshootPxMax || 20  -> always 20 (undefined || 20)    │
// │   Result: ALL archetypes had identical 5-20px overshoot distance.        │
// │   "erratic" had 2x chance of overshooting but same distance as "precise"│
// │                                                                          │
// │ Fix:                                                                     │
// │   Added overshootPxMin and overshootPxMax to mouse object, computed as:  │
// │     overshootPxMin = max(1, round(config.mouseOvershootPxMin x mul))     │
// │     overshootPxMax = max(5, round(config.mouseOvershootPxMax x mul))     │
// │   where mul = archetype.overshootMul                                     │
// │                                                                          │
// │ Computed values (base: min=5, max=20):                                   │
// │   precise  (mul=0.30): min=2px,  max=6px   — tight, controlled          │
// │   average  (mul=1.00): min=5px,  max=20px  — baseline (same as before)  │
// │   lazy     (mul=1.50): min=8px,  max=30px  — sloppy, wide               │
// │   erratic  (mul=2.00): min=10px, max=40px  — wild overshoots            │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ PERSONA ENTROPY CONTRIBUTION                                             │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ generatePersona() makes 7+ calls to trackedRandom(), contributing        │
// │ 7 x 53 = 371 bits of entropy to the session fingerprint.                │
// │ Combined with mode config variance + downstream behavioral variance,     │
// │ each persona is unique even across identical mode configurations.        │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ MATHEMATICAL FOUNDATIONS                                                  │
// ├───────────────────────────────────────────────────────────────────────────┤
// │                                                                          │
// │ 1. COOKIE TYPE MODEL (CHB 2025 + etracker 2025)                          │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    P(C in {AA, AR}) = 2/3 (stable preference, CHB 2025)                 │
// │    P(C = CTX) = 1/3 (contextual, varies by banner)                      │
// │                                                                          │
// │    Within stable group:                                                   │
// │      P(AA) = acceptRate x (2/3) / (acceptRate x (2/3) + (1-acceptRate)  │
// │              x (2/3))                                                     │
// │      Simplifies to: P(AA | stable) = acceptRate                          │
// │      P(AR | stable) = 1 - acceptRate                                     │
// │                                                                          │
// │    With default acceptRate = 0.40:                                        │
// │      P(AA) = 0.40 x (2/3) = 0.267                                       │
// │      P(AR) = 0.60 x (2/3) = 0.400                                       │
// │      P(CTX) = 1/3 = 0.333                                               │
// │                                                                          │
// │    Consent outcome per type:                                              │
// │      P(Z=1 | AA) = 1.00 (always accept)                                 │
// │      P(Z=1 | AR) = 0.00 (always reject)                                 │
// │      P(Z=1 | CTX) = acceptRate (varies, default 0.40)                   │
// │                                                                          │
// │    Marginal: P(Z=1) = P(AA) + P(CTX) x acceptRate                       │
// │            = 0.267 + 0.333 x 0.40 = 0.400 (matches etracker 2025)      │
// │                                                                          │
// │ 2. FRUSTRATION MODEL (Contentsquare 2024)                                │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    F ~ Bernoulli(frustrationRate)                                        │
// │    Default: frustrationRate = 0.396                                      │
// │                                                                          │
// │    When F=1, modifiers applied:                                          │
// │      - Weibull lambda *= frustrationDwellMul (shorter dwell)             │
// │      - bounceRate += frustrationBounceBst (more bounces)                 │
// │      - rageClickChance activated per cycle                               │
// │                                                                          │
// │ 3. READING SPEED (Brysbaert 2019)                                        │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    WPM ~ N(238, 45^2) — non-fiction silent reading average               │
// │    Clamped to [80, 600] WPM to avoid degenerate values                  │
// │                                                                          │
// │ 4. MOUSE PERSONALITY (Zheng et al. / Fitts's Law)                        │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    4 archetypes with Fitts parameter modifiers:                          │
// │      precise  (15%): a*0.8  b*0.8  overshoot*0.3  jitter*0.6           │
// │      average  (50%): a*1.0  b*1.0  overshoot*1.0  jitter*1.0           │
// │      lazy     (25%): a*1.3  b*1.2  overshoot*1.5  jitter*1.3           │
// │      erratic  (10%): a*0.7  b*1.5  overshoot*2.0  jitter*2.0           │
// │                                                                          │
// │    These modifiers scale the base Fitts parameters from ModePresets.     │
// │    Variance +/-46.4% (Zheng) is applied per-move in MousePhysics,       │
// │    NOT here — persona sets the baseline motor style.                     │
// │                                                                          │
// │    [v1.2.0] overshootMul now also scales overshootPxMin/Max:            │
// │      precise  -> min=2px,  max=6px   (tight corrections)                │
// │      average  -> min=5px,  max=20px  (normal range)                     │
// │      lazy     -> min=8px,  max=30px  (sloppy overshoots)               │
// │      erratic  -> min=10px, max=40px  (wild overshoots)                  │
// │                                                                          │
// │ 5. SCROLL STYLE                                                          │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    3 archetypes affecting scroll step size and pause behavior:           │
// │      gradual  (45%): small steps, frequent pauses, smooth reading       │
// │      jumpy    (35%): large jumps, few pauses, scanning behavior         │
// │      minimal  (20%): barely scrolls, relies on above-fold content       │
// │                                                                          │
// │    Modifiers applied to Markov chain transition probabilities:           │
// │      gradual: r_i x 1.05 (slightly more likely to continue)             │
// │      jumpy:   r_i x 0.95, but step size x 1.8 (big jumps, less depth)  │
// │      minimal: r_i x 0.70 (much less likely to continue scrolling)       │
// │                                                                          │
// │ 6. ATTENTION SPAN (Weibull lambda multiplier)                            │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    lambda_multiplier ~ N(1.0, 0.15^2), clamped to [0.5, 2.0]           │
// │    This creates natural variation in how long people stay on pages.      │
// │    A user with lambda_mul = 0.7 has 30% shorter dwell times.            │
// │    A user with lambda_mul = 1.4 has 40% longer dwell times.             │
// │    Combined with frustration modifier, produces rich dwell variance.     │
// │                                                                          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// DEPENDENCIES:
//   HumanLike_Math.js: trackedRandom, gaussianRandom, clamp
//
// CONSUMERS:
//   HumanLike_DwellWeibull.js (reads attentionSpan, frustration)
//   HumanLike_ScrollMarkov.js (reads scrollStyle)
//   HumanLike_MousePhysics.js (reads mousePersonality, overshootPxMin/Max)
//   HumanLike_ReadingPattern.js (reads readingSpeed, scanFactor)
//   HumanLike_MicroHabits.js (reads frustration for rage clicks)
//   HumanLike_SessionEngine.js (orchestrates persona lifecycle)
//
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const { trackedRandom, gaussianRandom, clamp } = require('./HumanLike_Math.js');


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: ARCHETYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mouse personality archetypes.
 * Each archetype modifies base Fitts parameters from ModePresets.
 *
 * Weights must sum to 1.0.
 * Modifiers are multiplied against base values.
 */
const MOUSE_ARCHETYPES = [
    {
        name: 'precise',
        weight: 0.15,
        fittsAMul: 0.80,
        fittsBMul: 0.80,
        overshootMul: 0.30,
        jitterMul: 0.60,
        stepsMul: 1.30,
        stepDelayMul: 0.80
    },
    {
        name: 'average',
        weight: 0.50,
        fittsAMul: 1.00,
        fittsBMul: 1.00,
        overshootMul: 1.00,
        jitterMul: 1.00,
        stepsMul: 1.00,
        stepDelayMul: 1.00
    },
    {
        name: 'lazy',
        weight: 0.25,
        fittsAMul: 1.30,
        fittsBMul: 1.20,
        overshootMul: 1.50,
        jitterMul: 1.30,
        stepsMul: 0.75,
        stepDelayMul: 1.40
    },
    {
        name: 'erratic',
        weight: 0.10,
        fittsAMul: 0.70,
        fittsBMul: 1.50,
        overshootMul: 2.00,
        jitterMul: 2.00,
        stepsMul: 0.60,
        stepDelayMul: 0.60
    }
];

/**
 * Scroll style archetypes.
 * Each archetype modifies Markov chain transition probabilities.
 *
 * Weights must sum to 1.0.
 */
const SCROLL_ARCHETYPES = [
    {
        name: 'gradual',
        weight: 0.45,
        transitionMul: 1.05,
        stepSizeMul: 1.00,
        pauseFrequencyMul: 1.30
    },
    {
        name: 'jumpy',
        weight: 0.35,
        transitionMul: 0.95,
        stepSizeMul: 1.80,
        pauseFrequencyMul: 0.50
    },
    {
        name: 'minimal',
        weight: 0.20,
        transitionMul: 0.70,
        stepSizeMul: 0.80,
        pauseFrequencyMul: 0.60
    }
];


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: WEIGHTED RANDOM SELECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Select an item from an array of {weight, ...} objects using trackedRandom.
 * Weights must sum to 1.0 (or close to it).
 *
 * @param {Array<Object>} items - Array of objects with .weight property
 * @returns {Object} Selected item
 */
function weightedSelect(items) {
    const r = trackedRandom();
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
        cumulative += items[i].weight;
        if (r < cumulative) {
            return items[i];
        }
    }
    return items[items.length - 1];
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: COOKIE TYPE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate cookie preference type for this session.
 *
 * Model (CHB 2025 + etracker 2025):
 *   - 2/3 users have stable preference (AA=always accept, AR=always reject)
 *   - 1/3 users are contextual (CTX, decision depends on banner design)
 *   - Within stable group, split by acceptRate
 *   - Marginal P(accept) = acceptRate (default 0.40) matches etracker
 *
 * @param {number} acceptRate    - Baseline accept rate (default 0.40)
 * @param {number} stableRatio   - Fraction with stable preference (default 0.67)
 * @returns {Object} { type: 'AA'|'AR'|'CTX', willAccept: boolean }
 */
function generateCookieType(acceptRate, stableRatio) {
    const r = trackedRandom();

    if (r < stableRatio) {
        const isAccepter = trackedRandom() < acceptRate;
        if (isAccepter) {
            return { type: 'AA', willAccept: true };
        } else {
            return { type: 'AR', willAccept: false };
        }
    } else {
        const willAccept = trackedRandom() < acceptRate;
        return { type: 'CTX', willAccept: willAccept };
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: MAIN PERSONA GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SessionPersona
 * @property {Object} cookie        - { type: 'AA'|'AR'|'CTX', willAccept: boolean }
 * @property {boolean} isFrustrated - Whether this session experiences frustration
 * @property {number} readingWPM    - Personal reading speed (words per minute)
 * @property {number} scanFactor    - Fraction of content actually processed per fixation
 * @property {Object} mouse         - Mouse personality archetype with modifiers
 * @property {number} mouse.overshootPxMin - [v1.2.0] Min overshoot distance in px (archetype-scaled)
 * @property {number} mouse.overshootPxMax - [v1.2.0] Max overshoot distance in px (archetype-scaled)
 * @property {Object} scroll        - Scroll style archetype with modifiers
 * @property {number} attentionMul  - Weibull lambda multiplier (>1 = longer dwell, <1 = shorter)
 * @property {number} effectiveBounceRate - Mode bounceRate + frustration boost if applicable
 * @property {number} effectiveWeibullLambda - Mode lambda x attentionMul x frustration modifier
 */

/**
 * Generate a complete persona for one session.
 * All randomness flows through trackedRandom() for entropy tracking.
 *
 * This function is called ONCE per session by SessionEngine.
 * The returned persona is frozen (immutable) and passed to all sub-modules.
 *
 * @param {SurfingConfig} config - Mode config from getModeConfig()
 * @returns {SessionPersona} Frozen persona object
 */
function generatePersona(config) {
    // --- 1. Cookie preference ---
    const cookie = generateCookieType(
        config.cookieAcceptRate,
        config.cookieStableRatio
    );

    // --- 2. Frustration state ---
    const isFrustrated = trackedRandom() < config.frustrationRate;

    // --- 3. Reading speed (Gaussian) ---
    const rawWPM = gaussianRandom(config.readingSpeedWPM, config.readingSpeedSTD);
    const readingWPM = Math.round(clamp(rawWPM, 80, 600));

    // --- 4. Scan factor (Uniform) ---
    const scanFactor = config.scanFactorMin +
        trackedRandom() * (config.scanFactorMax - config.scanFactorMin);

    // --- 5. Mouse personality ---
    const mouseArchetype = weightedSelect(MOUSE_ARCHETYPES);
    const mouse = {
        name: mouseArchetype.name,
        fittsA: Math.round(config.fittsA * mouseArchetype.fittsAMul),
        fittsB: Math.round(config.fittsB * mouseArchetype.fittsBMul),
        overshootChance: clamp(
            config.mouseOvershootChance * mouseArchetype.overshootMul, 0, 1
        ),
        // ┌─────────────────────────────────────────────────────────────────┐
        // │ BUG-06 FIX: overshootPxMin/Max now archetype-scaled            │
        // │ OLD: these properties were MISSING -> MousePhysics used        │
        // │      static fallback || 5 and || 20 for ALL archetypes         │
        // │ NEW: scaled via overshootMul per archetype, so:                │
        // │   precise=2-6px | average=5-20px | lazy=8-30px | erratic=10-40│
        // └─────────────────────────────────────────────────────────────────┘
        overshootPxMin: Math.max(1, Math.round(
            config.mouseOvershootPxMin * mouseArchetype.overshootMul
        )),
        overshootPxMax: Math.max(5, Math.round(
            config.mouseOvershootPxMax * mouseArchetype.overshootMul
        )),
        jitterStd: config.mouseJitterStd * mouseArchetype.jitterMul,
        stepsMin: Math.max(5, Math.round(
            config.mouseStepsMin * mouseArchetype.stepsMul
        )),
        stepsMax: Math.max(10, Math.round(
            config.mouseStepsMax * mouseArchetype.stepsMul
        )),
        stepDelayMin: Math.max(1, Math.round(
            config.mouseStepDelayMin * mouseArchetype.stepDelayMul
        )),
        stepDelayMax: Math.max(2, Math.round(
            config.mouseStepDelayMax * mouseArchetype.stepDelayMul
        )),
        rightHandBias: gaussianRandom(0.6, 0.1) // P1-1: directional bias (right-hand tendency)
    };

    // --- 6. Scroll style ---
    const scrollArchetype = weightedSelect(SCROLL_ARCHETYPES);
    const scroll = {
        name: scrollArchetype.name,
        transitionMul: scrollArchetype.transitionMul,
        stepSizeMul: scrollArchetype.stepSizeMul,
        pauseFrequencyMul: scrollArchetype.pauseFrequencyMul
    };

    // --- 7. Attention span (Gaussian multiplier for Weibull lambda) ---
    const rawAttention = gaussianRandom(1.0, 0.15);
    const attentionMul = clamp(rawAttention, 0.5, 2.0);

    // --- Derived: effective parameters incorporating frustration ---
    const effectiveBounceRate = isFrustrated
        ? clamp(config.bounceRate + config.frustrationBounceBst, 0, 0.99)
        : config.bounceRate;

    const frustrationLambdaMul = isFrustrated
        ? config.frustrationDwellMul
        : 1.0;

    const effectiveWeibullLambda = config.weibullLambda
        * attentionMul
        * frustrationLambdaMul;

    // --- Assemble and freeze ---
    const persona = {
        cookie: cookie,
        isFrustrated: isFrustrated,
        readingWPM: readingWPM,
        scanFactor: Math.round(scanFactor * 1000) / 1000,
        mouse: mouse,
        scroll: scroll,
        attentionMul: Math.round(attentionMul * 1000) / 1000,
        effectiveBounceRate: Math.round(effectiveBounceRate * 10000) / 10000,
        effectiveWeibullLambda: Math.round(effectiveWeibullLambda * 100) / 100
    };

    return Object.freeze(persona);
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: PERSONA SUMMARY (Logging/Debug)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a human-readable summary string for logging.
 *
 * @param {SessionPersona} persona - Frozen persona from generatePersona()
 * @returns {string} One-line summary
 */
function personaSummary(persona) {
    const parts = [
        'cookie=' + persona.cookie.type +
            (persona.cookie.willAccept ? '->accept' : '->reject'),
        'frust=' + (persona.isFrustrated ? 'YES' : 'no'),
        'wpm=' + persona.readingWPM,
        'scan=' + persona.scanFactor,
        'mouse=' + persona.mouse.name,
        'scroll=' + persona.scroll.name,
        'lmul=' + persona.attentionMul,
        'effBounce=' + persona.effectiveBounceRate,
        'effL=' + persona.effectiveWeibullLambda
    ];
    return '[Persona] ' + parts.join(' | ');
}


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    generatePersona,
    personaSummary,
    MOUSE_ARCHETYPES,
    SCROLL_ARCHETYPES
};

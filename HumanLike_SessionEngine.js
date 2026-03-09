// ═══════════════════════════════════════════════════════════════════════════════
// HumanLike_SessionEngine.js v1.2.1 — Master Orchestrator (Layer 3)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ CHANGELOG                                                                │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ v1.2.1 (2026-03-03 05:42 WIB)                                           │
// │   - BUGFIX [BUG-01] CRITICAL: Object.freeze() vs normalizeConfig()      │
// │     → getModeConfig() returns Object.freeze(config) — frozen object      │
// │     → normalizeConfig() tried to mutate frozen object in 'use strict'    │
// │     → EVERY session crashed with TypeError on property assignment        │
// │     → Fix: normalizeConfig() now receives rawConfig, creates shallow     │
// │       copy via { ...rawConfig } BEFORE any mutation                      │
// │     → runSession() now captures RETURN value: config = normalizeConfig() │
// │     → Old code: normalizeConfig(config) mutated in-place (broken)        │
// │     → New code: const config = normalizeConfig(rawConfig) (safe)         │
// │                                                                          │
// │   - BUGFIX [BUG-07] HIGH: Stale page reference after popup tab switch   │
// │     → scrollPage() captured 'page' in closure at call time              │
// │     → After handlePopupTab() follow, page variable reassigned but       │
// │       scrollPromise still held OLD page reference in closure            │
// │     → scrollPage() continued scrolling on wrong/closed tab             │
// │     → Fix: Track scrollAborted flag in executePageview()                │
// │     → When tab switch follow occurs, set scrollAborted = true           │
// │     → After tab switch, do NOT await stale scrollPromise               │
// │     → scrollPromise is fire-and-forget on old tab (will error-catch)   │
// │     → New scrollPage() is NOT started for new tab (action loop          │
// │       continues with micro-habits + clicks on new page instead)         │
// │     → This avoids modifying ScrollMarkov.js interface (page param)      │
// │                                                                          │
// │   - BUGFIX [BUG-08] HIGH: Concurrent scroll race condition              │
// │     → scrollPage() runs as parallel Promise while action loop also      │
// │       sends wheel events via executeMicroHabit() → idleFidget()        │
// │     → Interleaved wheel events make scroll position unpredictable      │
// │     → CTMC model (NNg attention weights) assumes controlled position   │
// │     → Fix: Add state.scrollActive flag to SessionState                  │
// │     → Set true before scrollPromise, set false in .finally()            │
// │     → executeMicroHabit() skipped while state.scrollActive is true      │
// │       (micro-habits deferred to action-slice pause instead)             │
// │     → This is SessionEngine-side only fix; MicroHabits unchanged       │
// │                                                                          │
// │   - BUGFIX [BUG-15] LOW: endSessionEntropy() double-call returns null   │
// │     → endSessionEntropy() finalizes SHA-256 and sets _entropy.active    │
// │       = false; second call returns null                                  │
// │     → If generateReport() called twice (error recovery / external),     │
// │       second report loses entropy data                                  │
// │     → Fix: Cache entropy result in state._entropyCache                  │
// │     → generateReport() checks cache before calling endSessionEntropy()  │
// │                                                                          │
// │ v1.2.0 (2026-03-03 03:22 WIB)                                           │
// │   - BUGFIX [SE-1] CRASH: getEntropyReport imported from Math.js but     │
// │     does NOT exist in Math.js exports → crash on report generation      │
// │     → Fix: Replace getEntropyReport with endSessionEntropy              │
// │     → Math.js exports: startSessionEntropy, endSessionEntropy           │
// │     → endSessionEntropy() returns { fingerprint, callCount,             │
// │       entropyBits, collisionBoundAt1B }                                 │
// │                                                                          │
// │   - BUGFIX [SE-2] CRASH: networkJitter imported from MousePhysics.js    │
// │     but it does NOT exist in MousePhysics exports                       │
// │     → networkJitter is actually exported by Math.js                     │
// │     → Fix: Move networkJitter to Math.js import line                    │
// │     → Remove from MousePhysics import                                   │
// │                                                                          │
// │   - BUGFIX [SE-3] SILENT: startSessionEntropy() never called in         │
// │     runSession → entropy tracking never activated → fingerprint         │
// │     always null → entire SHA-256 entropy system was dead                │
// │     → Fix: Call startSessionEntropy() at start of runSession()          │
// │     → Call endSessionEntropy() in generateReport() to finalize          │
// │                                                                          │
// │   - BUGFIX [SE-4] SILENT: persona.cookie === 'AA' in bounce session     │
// │     compared object to string → always false → bounce cookie            │
// │     handling NEVER triggered                                             │
// │     → persona.cookie is { type: 'AA'|'AR'|'CTX', willAccept: bool }   │
// │     → Fix: persona.cookie.type === 'AA' (+ defensive guard)            │
// │     → Also affects generateReport() logging (SE-8)                      │
// │                                                                          │
// │   - BUGFIX [SE-5] SILENT: config.popupDelaySec read but NEVER exists    │
// │     in ModePresets → undefined → 0 → false → popup handler dead        │
// │     → Fix: normalizeConfig() derives popupDelaySec with safe default   │
// │     → Mode 2,7 → 0; Mode 3 → 6; Mode 4,5,6 → 8                       │
// │     → If ModePresets is patched (v1.1.0+), value passes through        │
// │                                                                          │
// │   - BUGFIX [SE-6] CRASH: ScrollMarkov reads config.scrollTransitions   │
// │     (array) but ModePresets stores scrollR1, scrollR2, scrollR3,        │
// │     scrollR4 as separate keys → undefined.map → TypeError crash         │
// │     → Fix: normalizeConfig() auto-assembles array from R1..R4          │
// │     → [config.scrollR1, scrollR2, scrollR3, scrollR4]                   │
// │                                                                          │
// │   - BUGFIX [SE-7] SILENT: ScrollMarkov reads config.scrollUpChance     │
// │     but ModePresets key is scrollUpProbability → scroll-up re-read      │
// │     NEVER triggers → reading behavior model broken                      │
// │     → Fix: normalizeConfig() aliases scrollUpChance ←                   │
// │       scrollUpProbability                                                │
// │                                                                          │
// │   - BUGFIX [SE-8] SILENT: generateReport() logs persona.cookie as       │
// │     string → prints "[object Object]" → report unreadable              │
// │     → Fix: Extract persona.cookie.type for logging                      │
// │     → Also in runSession() debug log                                    │
// │                                                                          │
// │   - BUGFIX [SE-9] LOGIC: clickInternalLink() called with only 3        │
// │     params (page, blacklist, targetDbUrls) but needs 5 params           │
// │     (page, blacklist, targetDbUrls, config, persona)                    │
// │     → Without config: DB priority defaults to 0.70 (minor)             │
// │     → Without persona: humanPreClickSequence(page, el, undefined)      │
// │       → persona.isFrustrated crashes OR abandon chance wrong            │
// │     → Fix: Pass state.config, state.persona to ALL clickInternalLink   │
// │       calls (in executePageview AND transition section)                  │
// │                                                                          │
// │   - BUGFIX [SE-10] LOGIC: resetMousePos() from MousePhysics never      │
// │     called at session start → mouse position stale from previous        │
// │     session in same worker → first humanMove uses wrong start pos      │
// │     → Fix: Import resetMousePos, call at start of runSession()         │
// │                                                                          │
// │ v1.1.0 (2026-03-03 01:23 WIB)                                           │
// │   - FEATURE: Import clickAdElement + ensureAdImpressions from            │
// │     ClickActions (ad interaction integration)                            │
// │   - FEATURE: ensureAdImpressions() called per-page in executePageview()  │
// │     after overlay dismiss, before scroll — passive IAB/MRC viewable      │
// │     impression guarantee on every page load                              │
// │   - FEATURE: clickAdElement() integrated into click lottery in           │
// │     executePageview() as 3rd else-if band after internal+external        │
// │     → Uses config.chanceClickAd from ModePresets (env-overrideable)      │
// │     → Ad click triggers externalLocked (same as external click)          │
// │   - FEATURE: Ad impression + ad click events logged to sessionReport     │
// │   - BUGFIX: Click lottery now reads config.chanceClickInternal and       │
// │     config.chanceClickExternal (was config.internalClickChance —         │
// │     key name mismatch with ModePresets)                                  │
// │   - FEATURE: Bounce session also calls ensureAdImpressions() for         │
// │     passive ad view even on bounced pages                                │
// │   - FEATURE: generateReport() now includes adImpressions and adClicks    │
// │     counts in eventCounts                                                │
// │                                                                          │
// │ v1.0.0 (2026-02-20 12:15 WIB)                                           │
// │   - Full rewrite of simulateHumanBehavior() from human_like.js v14      │
// │   - Unified generative process: Bab 3 §3 (joint probability model)     │
// │   - Session lifecycle: persona → plan → cookie → [page loop] → exit    │
// │   - Per-page lifecycle: load → orient → scan → read → transition       │
// │   - NNg 3-phase time slicing per page (critical/decision/committed)     │
// │   - Integrated: ScrollMarkov + DwellWeibull + MicroHabits + ClickActs  │
// │   - External click lock (preserved from v14) + post-conversion idle    │
// │   - Structured session log with per-event timing                        │
// │   - All randomness via trackedRandom()                                  │
// │                                                                          │
// │ LAST HISTORY LOG:                                                        │
// │   v1.2.0 (2026-03-03 03:22 WIB) — SE-1 thru SE-10 bug fixes           │
// │   human_like.js v14.0 simulateHumanBehavior() → DELETED                │
// │   → replaced by this file                                               │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ SESSION LIFECYCLE — Generative Process (Bab 3 §3)                        │
// ├───────────────────────────────────────────────────────────────────────────┤
// │                                                                          │
// │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────────────┐  │
// │  │ INIT     │──▷│ COOKIE   │──▷│ PAGE     │──▷│ TRANSITION           │  │
// │  │ Persona  │   │ Consent  │   │ LOOP     │   │ next page / exit     │  │
// │  │ Plan     │   │ (once)   │   │ (×N)     │   │ / ext-click-lock     │  │
// │  └──────────┘   └──────────┘   └──────────┘   └──────────────────────┘  │
// │                                                                          │
// │  PER-PAGE LIFECYCLE (NNg Phase-Driven):                                  │
// │  ┌─────────────────────────────────────────────────────────────────────┐ │
// │  │                                                                     │ │
// │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │ │
// │  │  │ CRITICAL │─▷│ DECISION │─▷│COMMITTED │─▷│ PAGE TRANSITION  │   │ │
// │  │  │ 0-10s    │  │ 10-30s   │  │ 30s+     │  │ click / exit     │   │ │
// │  │  │ orient   │  │ scan     │  │ deep-read│  │                  │   │ │
// │  │  │ overlay  │  │ scroll   │  │ scroll   │  │                  │   │ │
// │  │  │ ad-impr* │  │ hover    │  │ select   │  │                  │   │ │
// │  │  │ cookie*  │  │ fidget   │  │ tab-sw   │  │                  │   │ │
// │  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │ │
// │  │  * cookie only on page 0  │  ad-impr = passive IAB/MRC viewable   │ │
// │  └─────────────────────────────────────────────────────────────────────┘ │
// │                                                                          │
// │  CLICK LOTTERY (per action-slice in decision/committed phase):           │
// │    roll = trackedRandom()                                                │
// │    [0, chanceClickInternal)          → clickInternalLink                 │
// │    [internal, internal+external)     → clickExternalLink                 │
// │    [int+ext, int+ext+chanceClickAd)  → clickAdElement  ← v1.1.0        │
// │                                                                          │
// │  EXTERNAL CLICK LOCK (preserved from v14):                               │
// │  After clicking an external link OR ad, session enters "locked" mode:    │
// │    - No more internal navigation                                        │
// │    - Only idle scroll + fidget on external page                         │
// │    - Session ends after post-conversion dwell                           │
// │                                                                          │
// │  JOINT PROBABILITY (Bab 3 §4):                                           │
// │  P(B,N,F,C,Z,{Tj,Dj,Pj,Rj,Sj}_{j=1..N}, Y)                          │
// │    = P(B)·P(F)·P(C)·P(Z|C)·P(N|B,F)                                   │
// │      · ∏_j P(Tj|F)·P(Sj|Tj,F)·P(Dj|Sj)·P(Pj)·P(Rj|Pj,Tj,d)        │
// │      · P(Y|Z,{Sj,Pj,Rj})                                              │
// │                                                                          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// DEPENDENCIES (all Layer 1-2 modules):
//   HumanLike_Math.js         — trackedRandom, sleep, clamp, getRandomInt,
//                                startSessionEntropy, endSessionEntropy,
//                                networkJitter
//   HumanLike_ModePresets.js  — getModeConfig(surfingMode)
//   HumanLike_Profiles.js     — generatePersona(config)
//   HumanLike_MousePhysics.js — humanMove, resetMousePos
//   HumanLike_ScrollMarkov.js — scrollPage, quickScroll
//   HumanLike_DwellWeibull.js — planSession, getNNgPhase, isUserPresentAtDelay
//   HumanLike_MicroHabits.js  — handleCookie, dismissOverlay, handlePopupTab,
//                                handlePopupModal, executeMicroHabit
//   HumanLike_ClickActions.js — clickInternalLink, clickExternalLink,
//                                clickAdElement, ensureAdImpressions
//
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// W6/W12 FIX: Pareto-weighted delay for inter-action timing
// Real humans have heavy-tailed micro-delays: mostly fast, occasionally long pauses
// Pareto Type II (Lomax): P(X>x) = (1 + x/σ)^(-α), α=2.5, σ=scale
function paretoDelay(minMs, maxMs) {
    var alpha = 2.5; // shape (heavy tail)
    var u = Math.random(); // use raw random for timing (not tracked — timing entropy is separate)
    // Inverse CDF: x = σ * ((1-u)^(-1/α) - 1)
    var sigma = (maxMs - minMs) * 0.3; // scale so most values cluster near min
    var pareto = sigma * (Math.pow(1 - u, -1/alpha) - 1);
    return Math.round(Math.min(minMs + pareto, maxMs));
}

// ─── Module imports ───
// [SE-1] Fix: getEntropyReport → startSessionEntropy + endSessionEntropy
// [SE-2] Fix: networkJitter moved HERE from MousePhysics import (it's in Math.js)
const {
    trackedRandom, sleep, clamp, getRandomInt, getHumanDelay,
    startSessionEntropy, endSessionEntropy,
    networkJitter
} = require('./HumanLike_Math.js');

const { getModeConfig } = require('./HumanLike_ModePresets.js');
const { generatePersona } = require('./HumanLike_Profiles.js');

// [SE-2] Fix: networkJitter REMOVED from MousePhysics import
// [SE-10] Fix: resetMousePos ADDED to MousePhysics import
const { humanMove, resetMousePos } = require('./HumanLike_MousePhysics.js');

const { scrollPage, quickScroll } = require('./HumanLike_ScrollMarkov.js');
const {
    planSession, getNNgPhase, isUserPresentAtDelay, planSummary
} = require('./HumanLike_DwellWeibull.js');
const {
    handleCookie, dismissOverlay, handlePopupTab,
    handlePopupModal, executeMicroHabit
} = require('./HumanLike_MicroHabits.js');
const {
    clickInternalLink, clickExternalLink,
    clickAdElement, ensureAdImpressions
} = require('./HumanLike_ClickActions.js');


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 0: TIME-OF-DAY BEHAVIORAL VARIANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * P2-7 FIX: Time-of-day behavioral variance modifier.
 *
 * Real user behavior varies by time of day:
 *   - Night (22:00–05:59): Fatigue, slower responses, longer dwell
 *   - Morning peak (10:00–13:59): Alert, faster interactions
 *   - Post-lunch dip (14:00–16:59): Slight slowdown
 *   - Default: neutral
 *
 * Applied as a multiplier on dwell times and scroll pacing.
 *
 * @returns {number} Multiplier in range [0.85, 1.15]
 */
function getTimeOfDayModifier() {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6)  return 0.85;  // Night: slower, more fatigue
    if (hour >= 10 && hour < 14) return 1.15;  // Morning peak: faster, more alert
    if (hour >= 14 && hour < 17) return 0.95;  // Post-lunch dip
    return 1.0;                                  // Default
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: CONFIG NORMALIZER — Bridge ModePresets ↔ ScrollMarkov/Popup
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize config from ModePresets to fill gaps expected by other modules.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ This function exists because ModePresets (v1.0.0) stores config    │
 * │ keys with DIFFERENT NAMES than what ScrollMarkov and SessionEngine │
 * │ popup handler expect. Rather than requiring ModePresets to be      │
 * │ patched first, we bridge the gap here defensively.                 │
 * │                                                                     │
 * │ If ModePresets v1.1.0+ already provides the correct keys,          │
 * │ this function harmlessly passes them through (no overwrite).       │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * [BUG-01] CRITICAL FIX: getModeConfig() returns Object.freeze(config).
 * In 'use strict' mode, ANY property assignment to a frozen object throws
 * TypeError. Previous code mutated rawConfig in-place — crashed every session.
 * Now creates shallow copy FIRST via { ...rawConfig }, all mutations safe.
 *
 * Fixes applied:
 *   [SE-6] scrollTransitions: assembled from scrollR1..R4 if missing
 *   [SE-7] scrollUpChance: aliased from scrollUpProbability if missing
 *   [SE-5] popupDelaySec: derived from mode characteristics if missing
 *
 * @param {Object} rawConfig - Raw FROZEN config from getModeConfig()
 * @returns {Object} New UNFROZEN normalized config object
 */
function normalizeConfig(rawConfig) {
    // [BUG-01] CRITICAL: Create shallow copy — rawConfig is Object.freeze()'d
    // Every assignment below would throw TypeError on frozen object in strict mode
    const config = { ...rawConfig };

    // [SE-6] Auto-assemble scrollTransitions array from individual R values
    // ScrollMarkov.scrollPage() expects config.scrollTransitions = [r1, r2, r3, r4]
    // ModePresets stores them as config.scrollR1, scrollR2, scrollR3, scrollR4
    if (!config.scrollTransitions || !Array.isArray(config.scrollTransitions)) {
        if (config.scrollR1 !== undefined) {
            config.scrollTransitions = [
                config.scrollR1,
                config.scrollR2,
                config.scrollR3,
                config.scrollR4
            ];
        } else {
            // Ultimate fallback: Mode 6 defaults (Contentsquare 2021)
            config.scrollTransitions = [0.80, 0.73, 0.61, 0.28];
        }
    }

    // [SE-7] Alias scrollUpChance from scrollUpProbability
    // ScrollMarkov reads config.scrollUpChance, ModePresets stores scrollUpProbability
    if (config.scrollUpChance === undefined) {
        config.scrollUpChance = config.scrollUpProbability !== undefined
            ? config.scrollUpProbability
            : 0.15; // Safe default
    }

    // [SE-5] Derive popupDelaySec if missing
    // ModePresets v1.0.0 does NOT include this key → undefined → popup dead
    // Omnisend 2025: optimal popup delay = 6-10s (sweet spot 2.4% conversion)
    if (config.popupDelaySec === undefined) {
        // Derive from mode characteristics:
        //   High-bounce modes (2, 7): 0 (no popup — too short dwell)
        //   Quick mode (3): 6s (shorter dwell, earlier popup)
        //   Engaged modes (4, 5, 6): 8s (Omnisend sweet spot)
        if (config.bounceRate >= 0.70) {
            config.popupDelaySec = 0; // High bounce = skip popups
        } else if (config.weibullLambda && config.weibullLambda < 30) {
            config.popupDelaySec = 6; // Short sessions
        } else {
            config.popupDelaySec = 8; // Default: Omnisend sweet spot
        }
    }

    // Ensure chanceClickAd exists (0 = disabled)
    if (config.chanceClickAd === undefined) {
        config.chanceClickAd = 0;
    }

    return config;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: COOKIE TYPE HELPER — Safe Extraction
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Safely extract cookie type string from persona.cookie.
 *
 * persona.cookie can be:
 *   1. Object { type: 'AA', willAccept: true }  ← correct (from Profiles.js)
 *   2. String 'AA'                               ← legacy callers
 *   3. undefined/null                             ← missing persona
 *
 * [SE-4] [SE-8] This helper prevents the object-vs-string comparison bug
 * in bounce session AND the [object Object] logging bug in reports.
 *
 * @param {*} cookie - persona.cookie value (object, string, or undefined)
 * @returns {string} Cookie type string: 'AA', 'AR', or 'CTX'
 */
function getCookieType(cookie) {
    if (cookie && typeof cookie === 'object') return cookie.type || 'CTX';
    if (typeof cookie === 'string') return cookie;
    return 'CTX';
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: SESSION STATE MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SessionState
 * @property {string}  status           - Current human-readable status
 * @property {string}  phase            - Current NNg phase
 * @property {number}  currentPageIdx   - 0-based page index in session plan
 * @property {boolean} cookieHandled    - Whether cookie banner was addressed
 * @property {boolean} externalLocked   - Whether external link was clicked (lock)
 * @property {boolean} sessionEnded     - Whether session has ended
 * @property {boolean} scrollActive     - [BUG-08] Whether scrollPage() Promise is running
 * @property {Object}  persona          - The session's persona
 * @property {Object}  plan             - The session's plan from DwellWeibull
 * @property {Object}  config           - The mode config
 * @property {Array}   eventLog         - Structured event log
 * @property {number}  sessionStartMs   - Timestamp of session start
 * @property {Object|null} _entropyCache - [BUG-15] Cached entropy report
 */

/**
 * Create initial session state.
 */
function createSessionState(persona, plan, config) {
    return {
        status: 'initializing',
        phase: 'critical',
        currentPageIdx: 0,
        cookieHandled: false,
        externalLocked: false,
        sessionEnded: false,
        scrollActive: false,
        persona: persona,
        plan: plan,
        config: config,
        eventLog: [],
        sessionStartMs: Date.now(),
        _entropyCache: null
    };
}

/**
 * Log a structured event to session state.
 */
function logEvent(state, type, detail) {
    state.eventLog.push({
        ts: Date.now() - state.sessionStartMs,
        page: state.currentPageIdx,
        phase: state.phase,
        type: type,
        detail: detail
    });
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: PER-PAGE EXECUTOR — Phase-Driven Time Slicing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute one complete pageview.
 *
 * Time is divided into NNg phases, with each phase running a mix
 * of scroll + micro-habits at phase-appropriate frequencies.
 *
 * Timeline:
 *   [0, 10s)  → CRITICAL: orientation, overlay dismiss, ad impression, first scroll
 *   [10s, 30s) → DECISION: scanning scroll, hover exploration, fidgets
 *   [30s, ∞)  → COMMITTED: deep reading, text select, tab switch
 *
 * Within each phase, time is consumed in "action slices":
 *   - Each slice is a Weibull-like pause + one probabilistic action
 *   - Actions are drawn from executeMicroHabit() weights per phase
 *   - Scroll is handled separately by ScrollMarkov engine
 *
 * Click lottery bands (per action-slice, decision/committed phase only):
 *   [0, chanceClickInternal)                              → internal link
 *   [chanceClickInternal, +chanceClickExternal)           → external link
 *   [chanceClickInternal+External, +chanceClickAd)        → ad click
 *
 * [BUG-07] Stale page reference fix:
 *   scrollPromise captures 'page' at call time. If handlePopupTab() causes
 *   tab switch (page = newPage), scrollPromise still operates on old page.
 *   Fix: track scrollAborted flag; when tab switches, mark scroll as aborted
 *   and stop awaiting stale promise. Old scrollPromise will error-catch on
 *   closed page and exit gracefully via its own try-catch.
 *
 * [BUG-08] Concurrent scroll race condition fix:
 *   scrollPage() and executeMicroHabit() both send wheel events concurrently.
 *   Fix: set state.scrollActive = true while scrollPromise runs.
 *   Skip executeMicroHabit() while scrollActive to prevent interleaved wheels.
 *
 * @param {Object}  page       - Playwright Page object
 * @param {Object}  context    - Browser context
 * @param {Object}  state      - SessionState
 * @param {number}  dwellMs    - Planned dwell for this page
 * @param {boolean} isFirstPage - Whether this is the landing page
 * @param {Object}  opts       - { blacklist, targetDbUrls, logDebug }
 * @returns {Promise<{navigated: boolean, externalClicked: boolean, page: Object}>}
 */
async function executePageview(page, context, state, dwellMs, isFirstPage, opts) {
    const { blacklist, targetDbUrls, logDebug } = opts;
    const { config, persona } = state;
    const pageStart = Date.now();

    let navigated = false;
    let externalClicked = false;

    // ─── Phase 0: Page Load Settling ───
    state.status = 'page-loading';
    state.phase = 'critical';
    await sleep(getRandomInt(500, 1500));

    // ─── Cookie handling (first page only, once per session) ───
    if (isFirstPage && !state.cookieHandled) {
        state.status = 'cookie-decision';
        const cookieResult = await handleCookie(page, persona, logDebug);
        state.cookieHandled = true;
        logEvent(state, 'cookie', cookieResult);
    }

    // ─── Overlay check (every page) ───
    try {
        const overlayResult = await dismissOverlay(page, persona, logDebug);
        if (overlayResult.dismissed) {
            logEvent(state, 'overlay', overlayResult);
        }
    } catch (e) { /* non-critical */ }

    // ─── Ad viewable impressions (passive — every page) ───
    try {
        const adImprResult = await ensureAdImpressions(page, persona);
        if (adImprResult.adsViewed > 0) {
            logEvent(state, 'ad-impression', {
                found: adImprResult.adsFound,
                viewed: adImprResult.adsViewed,
                details: adImprResult.details
            });
            if (logDebug) {
                logDebug(`[Session] Ad impressions: ${adImprResult.adsViewed}/${adImprResult.adsFound} viewable`);
            }
        }
    } catch (e) { /* non-critical */ }

    // ─── Start ScrollMarkov in parallel concept ───
    // [SE-6][SE-7] config is now normalized: scrollTransitions + scrollUpChance exist
    // [BUG-08] Set scrollActive BEFORE starting scrollPromise
    state.scrollActive = true;
    let scrollAborted = false;

    const scrollPromise = scrollPage(page, config, persona, dwellMs, logDebug)
        .finally(() => { state.scrollActive = false; });

    // ─── Phase-driven action loop ───
    let scrollDone = false;
    let scrollResult = null;
    let popupHandled = false;

    scrollPromise.then(r => { scrollResult = r; scrollDone = true; })
                 .catch(() => { scrollDone = true; });

    while (Date.now() - pageStart < dwellMs) {
        const elapsedMs = Date.now() - pageStart;
        const elapsedSec = elapsedMs / 1000;

        const phaseInfo = getNNgPhase(elapsedSec);
        state.phase = phaseInfo.phase;

        const statusMap = {
            'critical': 'orienting',
            'decision': 'scanning',
            'committed': 'deep-reading'
        };
        state.status = statusMap[state.phase] || 'browsing';

        // ─── Handle browser popup tabs ───
        try {
            const tabResult = await handlePopupTab(
                page, context, elapsedMs, persona, logDebug
            );
            if (tabResult.action !== 'none') {
                logEvent(state, 'popup-tab', tabResult.action);
                if (tabResult.action === 'follow') {
                    // [BUG-07] Fix: Mark scroll as aborted before switching page
                    // scrollPromise still holds reference to OLD page in its closure.
                    // Old page may close → scrollPage() hits error → caught by its try-catch.
                    // We do NOT start a new scrollPage() for the new tab; the action loop
                    // continues with micro-habits + clicks on the new page instead.
                    scrollAborted = true;
                    state.scrollActive = false;
                    page = tabResult.currentPage;
                }
            }
        } catch (e) { /* non-critical */ }

        // ─── In-page popup detection ───
        // [SE-5] config.popupDelaySec now guaranteed by normalizeConfig()
        if (!popupHandled && config.popupDelaySec > 0) {
            if (elapsedSec >= config.popupDelaySec) {
                if (isUserPresentAtDelay(config.popupDelaySec, dwellMs)) {
                    state.status = 'popup-response';
                    const popupResult = await handlePopupModal(
                        page, persona, config.popupDelaySec, logDebug
                    );
                    logEvent(state, 'popup-modal', popupResult);
                    popupHandled = true;
                }
            }
        }

        // ─── Check if page closed unexpectedly ───
        try {
            if (page.isClosed()) {
                const pgs = context.pages();
                if (pgs.length > 0) {
                    page = pgs[0];
                    await page.bringToFront();
                } else {
                    break;
                }
            }
        } catch (e) { break; }

        // ─── Execute a micro-habit (phase-weighted) ───
        // [BUG-08] Fix: Skip micro-habits while scrollPage() is actively running.
        // Both scrollPage() and executeMicroHabit() → idleFidget() send wheel events.
        // Concurrent wheel events make scroll position unpredictable, breaking the
        // CTMC model which assumes controlled position. We defer micro-habits to
        // the action-slice pause when scroll is not active.
        if (!state.scrollActive) {
            const microResult = await executeMicroHabit(
                page, persona, state.phase, logDebug
            );
            logEvent(state, 'micro-habit', microResult);
        }

        // ─── Click decision (only in decision/committed phases) ───
        if (state.phase !== 'critical' && !state.externalLocked) {
            const clickRoll = trackedRandom();

            // Band 1: Internal click
            if (clickRoll < config.chanceClickInternal) {
                state.status = 'clicking-internal';
                // [SE-9] Fix: pass config + persona to clickInternalLink
                const ok = await clickInternalLink(
                    page, blacklist, targetDbUrls, config, persona
                );
                if (ok) {
                    logEvent(state, 'click', 'internal');
                    await networkJitter(page);
                    navigated = true;
                    break;
                }
            }
            // Band 2: External click
            else if (clickRoll < config.chanceClickInternal + config.chanceClickExternal) {
                state.status = 'clicking-external';
                const ok = await clickExternalLink(page, blacklist, persona);
                if (ok) {
                    logEvent(state, 'click', 'external');
                    externalClicked = true;
                    state.externalLocked = true;
                    await networkJitter(page);
                    if (logDebug) {
                        logDebug('[Session] EXTERNAL CLICK → Locking session');
                    }
                    break;
                }
            }
            // Band 3: Ad click (CTR — v1.1.0)
            else if (
                config.chanceClickAd > 0 &&
                clickRoll < config.chanceClickInternal + config.chanceClickExternal + config.chanceClickAd
            ) {
                state.status = 'clicking-ad';
                const adResult = await clickAdElement(page, persona);

                logEvent(state, 'ad-click', {
                    clicked: adResult.clicked,
                    type: adResult.type,
                    viewable: adResult.viewable
                });

                if (adResult.clicked) {
                    if (logDebug) {
                        logDebug(`[Session] AD CLICK (${adResult.type}) → Locking session`);
                    }
                    externalClicked = true;
                    state.externalLocked = true;
                    await networkJitter(page);
                    break;
                }
            }
        }

        // ─── Action slice pause ───
        const slicePause = getRandomInt(1500, 4000);
        const remainingMs = dwellMs - (Date.now() - pageStart);
        if (remainingMs <= 0) break;
        await sleep(Math.min(slicePause, remainingMs));
    }

    // ─── Wait for scroll promise to settle ───
    // [BUG-07] Fix: If scroll was aborted due to tab switch, do NOT await
    // the stale promise — it holds a reference to the old page. Let it
    // error-catch on its own. We only await if scroll is still relevant.
    if (!scrollDone && !scrollAborted) {
        try {
            scrollResult = await Promise.race([
                scrollPromise,
                new Promise(resolve =>
                    setTimeout(() => resolve({ maxDepthPct: 0 }), 2000)
                )
            ]);
        } catch (e) { /* ok */ }
    }

    if (scrollResult) {
        logEvent(state, 'scroll-complete', {
            depth: scrollResult.maxDepthPct,
            segments: scrollResult.segmentsReached
        });
    }

    return { navigated, externalClicked, page };
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: POST-CONVERSION IDLE (External Lock Mode)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute post-conversion idle behavior after external link click.
 *
 * @param {Object} page     - Playwright Page (now on external site)
 * @param {Object} state    - SessionState
 * @param {Function} [logDebug]
 * @returns {Promise<void>}
 */
async function postConversionIdle(page, state, logDebug) {
    state.status = 'post-conversion-idle';

    const idleDuration = getRandomInt(10000, 30000);
    const idleStart = Date.now();

    if (logDebug) {
        logDebug(`[Session] Post-conversion idle: ${(idleDuration/1000).toFixed(0)}s`);
    }

    while (Date.now() - idleStart < idleDuration) {
        try {
            if (page.isClosed()) break;

            const r = trackedRandom();
            if (r < 0.60) {
                await quickScroll(page, state.persona, 'down');
            } else if (r < 0.85) {
                await executeMicroHabit(page, state.persona, 'committed', logDebug);
            } else {
                await sleep(getRandomInt(2000, 5000));
            }

            await sleep(getRandomInt(1000, 3000));
        } catch (e) {
            break;
        }
    }

    logEvent(state, 'post-conversion', { durationMs: Date.now() - idleStart });
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: BOUNCE SESSION EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a bounce session: single page, ultra-short dwell, minimal actions.
 *
 * @param {Object} page    - Playwright Page
 * @param {Object} context - Browser context
 * @param {Object} state   - SessionState
 * @param {Object} opts    - { blacklist, targetDbUrls, logDebug }
 * @returns {Promise<void>}
 */
async function executeBounceSession(page, context, state, opts) {
    const { logDebug } = opts;
    const dwellMs = state.plan.pages[0].dwellMs;

    state.status = 'bounce-landing';
    logEvent(state, 'bounce-start', { dwellMs });

    if (logDebug) {
        logDebug(`[Session] BOUNCE: dwell=${(dwellMs/1000).toFixed(1)}s`);
    }

    const bounceStart = Date.now();

    // ─── Cookie (quick, if AA type — most bouncers don't bother) ───
    // [SE-4] Fix: persona.cookie is OBJECT, use getCookieType() helper
    const cookieType = getCookieType(state.persona.cookie);
    if (cookieType === 'AA' && trackedRandom() < 0.40) {
        await handleCookie(page, state.persona, logDebug);
        state.cookieHandled = true;
    }

    // ─── Ad impressions (passive — even bouncers see ads) ───
    try {
        const adImprResult = await ensureAdImpressions(page, state.persona);
        if (adImprResult.adsViewed > 0) {
            logEvent(state, 'ad-impression', {
                found: adImprResult.adsFound,
                viewed: adImprResult.adsViewed,
                details: adImprResult.details
            });
            if (logDebug) {
                logDebug(`[Session] Bounce ad impressions: ${adImprResult.adsViewed}/${adImprResult.adsFound}`);
            }
        }
    } catch (e) { /* non-critical */ }

    // ─── Minimal orientation ───
    state.status = 'bounce-glancing';

    if (trackedRandom() < 0.35) {
        await quickScroll(page, state.persona, 'down');
    }

    if (trackedRandom() < 0.25) {
        await executeMicroHabit(page, state.persona, 'critical', logDebug);
    }

    const elapsed = Date.now() - bounceStart;
    const remaining = Math.max(0, dwellMs - elapsed);
    if (remaining > 0) {
        await sleep(remaining);
    }

    logEvent(state, 'bounce-end', { actualDwellMs: Date.now() - bounceStart });
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: MAIN SESSION EXECUTOR — runSession()
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run a complete human-like browsing session.
 *
 * This is the PRIMARY ENTRY POINT replacing simulateHumanBehavior().
 *
 * @param {Object} page           - Playwright Page (already navigated to URL)
 * @param {Object} context        - Playwright BrowserContext
 * @param {number} surfingMode    - Mode 1-7 from .env SURFING_MODE
 * @param {Object} options        - Additional options
 * @param {string[]} options.blacklist     - URL patterns to avoid clicking
 * @param {string[]} options.targetDbUrls  - Priority internal URLs from DB
 * @param {Function} [options.logDebug]    - Debug logger function
 * @param {Function} [options.onStatus]    - Status callback: (status) => void
 * @returns {Promise<SessionReport>} Structured session report
 */
async function runSession(page, context, surfingMode, options = {}) {
    const {
        blacklist = [],
        targetDbUrls = [],
        logDebug = null,
        onStatus = null
    } = options;

    const opts = { blacklist, targetDbUrls, logDebug };

    // ─── [SE-3] Start entropy tracking FIRST (before any trackedRandom calls) ───
    startSessionEntropy();

    // ─── [SE-10] Reset mouse position for clean session ───
    resetMousePos();

    // ─── Step 1: Load mode configuration ───
    // [BUG-01] CRITICAL FIX: getModeConfig() returns Object.freeze(config).
    // Old code: normalizeConfig(config) mutated frozen object → TypeError crash.
    // New code: normalizeConfig() creates shallow copy internally, returns new object.
    const rawConfig = getModeConfig(surfingMode);

    // ─── [SE-5][SE-6][SE-7][BUG-01] Normalize config — bridge key mismatches ───
    // normalizeConfig() returns a NEW unfrozen object (shallow copy of rawConfig)
    const config = normalizeConfig(rawConfig);

    if (logDebug) {
        logDebug(`[Session] Mode=${surfingMode} (${config.name})`);
        logDebug(`[Session] Click lottery: int=${config.chanceClickInternal} ` +
                 `ext=${config.chanceClickExternal} ad=${config.chanceClickAd}`);
        logDebug(`[Session] Scroll: transitions=[${config.scrollTransitions.join(',')}] ` +
                 `upChance=${config.scrollUpChance} popup=${config.popupDelaySec}s`);
    }

    // ─── Step 2: Generate session persona ───
    const persona = generatePersona(config);

    if (logDebug) {
        // [SE-8] Fix: Extract cookie type string for logging
        const cookieType = getCookieType(persona.cookie);
        logDebug(`[Session] Persona: cookie=${cookieType} ` +
                 `frust=${persona.isFrustrated} scroll=${persona.scroll.name} ` +
                 `attention=${persona.attentionMul.toFixed(2)} ` +
                 `λ_eff=${persona.effectiveWeibullLambda.toFixed(1)}`);
    }

    // ─── Step 3: Plan session (bounce/pages/dwell) ───
    const plan = planSession(config, persona);

    // P2-7 FIX: Apply time-of-day modifier to dwell times
    // Real user behavior varies by time of day (fatigue, alertness)
    const todModifier = getTimeOfDayModifier();
    if (todModifier !== 1.0 && plan.pages) {
        for (let pi = 0; pi < plan.pages.length; pi++) {
            plan.pages[pi].dwellMs = Math.round(plan.pages[pi].dwellMs * todModifier);
        }
        if (plan.totalDwellMs) {
            plan.totalDwellMs = Math.round(plan.totalDwellMs * todModifier);
        }
        if (logDebug) {
            logDebug(`[Session] Time-of-day modifier: ${todModifier.toFixed(2)}x (hour=${new Date().getHours()})`);
        }
    }

    if (logDebug) {
        logDebug(planSummary(plan));
    }

    // ─── Step 4: Initialize session state ───
    const state = createSessionState(persona, plan, config);
    logEvent(state, 'session-start', {
        mode: surfingMode,
        modeName: config.name,
        isBounce: plan.isBounce,
        pageCount: plan.pageCount,
        totalDwellMs: plan.totalDwellMs,
        chanceClickAd: config.chanceClickAd,
        scrollTransitions: config.scrollTransitions,
        scrollUpChance: config.scrollUpChance,
        popupDelaySec: config.popupDelaySec
    });

    const updateStatus = (s) => {
        state.status = s;
        if (onStatus) onStatus(s);
    };

    try {
        // ─── Step 5A: Bounce session ───
        if (plan.isBounce) {
            await executeBounceSession(page, context, state, opts);
            state.sessionEnded = true;
            updateStatus('done-bounce');
        }
        // ─── Step 5B: Engaged session ───
        else {
            let currentPage = page;

            for (let i = 0; i < plan.pages.length; i++) {
                state.currentPageIdx = i;
                const pagePlan = plan.pages[i];

                if (logDebug) {
                    logDebug(`[Session] Page ${i}/${plan.pageCount-1}: ` +
                             `dwell=${(pagePlan.dwellMs/1000).toFixed(1)}s ` +
                             `(${pagePlan.dwellCategory})`);
                }

                logEvent(state, 'page-start', {
                    pageIdx: i,
                    dwellMs: pagePlan.dwellMs,
                    category: pagePlan.dwellCategory
                });

                // ─── Execute the pageview ───
                const result = await executePageview(
                    currentPage, context, state,
                    pagePlan.dwellMs,
                    i === 0,
                    opts
                );

                currentPage = result.page || currentPage;

                logEvent(state, 'page-end', {
                    pageIdx: i,
                    navigated: result.navigated,
                    externalClicked: result.externalClicked
                });

                // ─── External click lock ───
                if (result.externalClicked) {
                    await postConversionIdle(currentPage, state, logDebug);
                    state.sessionEnded = true;
                    updateStatus('done-converted');
                    break;
                }

                // ─── Internal navigation: wait for page load ───
                if (result.navigated) {
                    updateStatus('navigating');
                    try {
                        await currentPage.waitForLoadState('domcontentloaded', {
                            timeout: 15000
                        }).catch(() => {});
                    } catch (e) { /* timeout ok */ }
                    await sleep(getRandomInt(500, 1500));
                }

                // ─── Inter-page transition ───
                if (i < plan.pages.length - 1 && !result.navigated) {
                    updateStatus('finding-next-page');

                    // [SE-9] Fix: pass state.config + state.persona to clickInternalLink
                    const clicked = await clickInternalLink(
                        currentPage, blacklist, targetDbUrls, state.config, state.persona
                    );

                    if (clicked) {
                        logEvent(state, 'click', 'internal-transition');
                        await networkJitter(currentPage);
                        try {
                            await currentPage.waitForLoadState('domcontentloaded', {
                                timeout: 15000
                            }).catch(() => {});
                        } catch (e) { /* ok */ }
                        await sleep(getRandomInt(500, 1500));
                    } else {
                        if (logDebug) {
                            logDebug(`[Session] No internal link → ending at page ${i}`);
                        }
                        logEvent(state, 'early-exit', 'no-links');
                        break;
                    }
                }
            }

            if (!state.sessionEnded) {
                state.sessionEnded = true;
                updateStatus('done-natural');
            }
        }

    } catch (e) {
        logEvent(state, 'error', e.message);
        if (logDebug) logDebug(`[Session] Error: ${e.message}`);
        state.sessionEnded = true;
        updateStatus('done-error');
    }

    // ─── Step 6: Generate session report ───
    const report = generateReport(state);

    if (logDebug) {
        logDebug(`[Session] Complete: ${report.summary}`);
    }

    return report;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: SESSION REPORT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SessionReport
 * @property {string}  status           - Final status
 * @property {string}  summary          - One-line summary
 * @property {boolean} isBounce         - Whether session was a bounce
 * @property {number}  pagesVisited     - Actual pages visited
 * @property {number}  plannedPages     - Planned pages from session plan
 * @property {number}  totalDwellMs     - Total session duration
 * @property {boolean} externalClicked  - Whether conversion happened
 * @property {Object}  persona          - Persona snapshot
 * @property {Object}  entropy          - Entropy report from Math module
 * @property {Array}   eventLog         - Complete structured event log
 * @property {Object}  eventCounts      - Count of events by type
 */

/**
 * Generate a structured session report from state.
 *
 * @param {Object} state - SessionState
 * @returns {SessionReport}
 */
function generateReport(state) {
    const totalDwellMs = Date.now() - state.sessionStartMs;
    const pagesVisited = state.currentPageIdx + 1;

    // Count events by type
    const eventCounts = {};
    for (const evt of state.eventLog) {
        eventCounts[evt.type] = (eventCounts[evt.type] || 0) + 1;
    }

    // [SE-8] Fix: Extract cookie type string (not [object Object])
    const cookieType = getCookieType(state.persona.cookie);

    // Summary line
    const adImprCount = eventCounts['ad-impression'] || 0;
    const adClickCount = eventCounts['ad-click'] || 0;
    const parts = [
        `${state.status}`,
        `${pagesVisited}/${state.plan.pageCount} pages`,
        `${(totalDwellMs / 1000).toFixed(0)}s`,
        state.plan.isBounce ? 'BOUNCE' : 'ENGAGED',
        state.externalLocked ? 'CONVERTED' : '',
        adImprCount > 0 ? `adImpr=${adImprCount}` : '',
        adClickCount > 0 ? `adClick=${adClickCount}` : '',
        `frust=${state.persona.isFrustrated}`,
        `cookie=${cookieType}`
    ].filter(Boolean).join(' | ');

    // [SE-1][SE-3] Fix: endSessionEntropy() finalizes SHA-256 tracking
    // Returns { fingerprint, callCount, entropyBits, collisionBoundAt1B }
    // [BUG-15] Fix: Cache entropy result to prevent null on double-call.
    // endSessionEntropy() sets _entropy.active = false after first call;
    // subsequent calls return null. By caching, generateReport() is safe
    // to call multiple times (error recovery, external callers).
    if (!state._entropyCache) {
        state._entropyCache = endSessionEntropy();
    }
    const entropyReport = state._entropyCache;

    return {
        status: state.status,
        summary: parts,
        isBounce: state.plan.isBounce,
        pagesVisited: pagesVisited,
        plannedPages: state.plan.pageCount,
        totalDwellMs: totalDwellMs,
        externalClicked: state.externalLocked,
        persona: {
            cookie: cookieType,
            isFrustrated: state.persona.isFrustrated,
            scrollStyle: state.persona.scroll.name,
            attentionMul: state.persona.attentionMul,
            effectiveLambda: state.persona.effectiveWeibullLambda,
            bounceRate: state.persona.effectiveBounceRate
        },
        entropy: entropyReport,
        eventLog: state.eventLog,
        eventCounts: eventCounts
    };
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: CONVENIENCE WRAPPER — runAutoSurf()
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * High-level auto-surf wrapper.
 *
 * @param {Object} page    - Playwright Page (already on target URL)
 * @param {Object} context - Playwright BrowserContext
 * @param {Object} envConfig - Parsed .env configuration
 * @returns {Promise<SessionReport>}
 */
async function runAutoSurf(page, context, envConfig) {
    return await runSession(page, context, envConfig.SURFING_MODE || 6, {
        blacklist: envConfig.BLACKLIST_DOMAINS || [],
        targetDbUrls: envConfig.TARGET_DB_URLS || [],
        logDebug: envConfig.DEBUG ? console.log : null,
        onStatus: envConfig.onStatus || null
    });
}


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    // Primary entry points
    runSession,
    runAutoSurf,
    // P2-7: Time-of-day behavioral variance
    getTimeOfDayModifier,
    // Lower-level (for testing / advanced usage)
    executePageview,
    executeBounceSession,
    postConversionIdle,
    // State / reporting
    createSessionState,
    generateReport,
    logEvent,
    // Config helpers (for testing / debugging)
    normalizeConfig,
    getCookieType
};

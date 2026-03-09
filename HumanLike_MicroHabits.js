// ═══════════════════════════════════════════════════════════════════════════════
// HumanLike_MicroHabits.js v1.3.0 — Micro Behavior Library (Layer 2)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ CHANGELOG                                                                │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ v1.3.0 (2026-03-05 04:42 WIB)                                           │
// │   - FEATURE: tabSwitch() now uses __qteBypassVisibilityGuard flag        │
// │     → opsi3.js v16.1.0 injects Page Visibility Guard via addInitScript   │
// │     → Guard makes document.hidden=false, visibilityState='visible'       │
// │       permanently to protect from OS-level focus loss (cross-worker)      │
// │     → tabSwitch() needs to BYPASS this guard to simulate real tab switch │
// │     → Sets window.__qteVGBypass && window.__qteVGBypass(true) before dispatch      │
// │     → Uses Object.defineProperty to write override values directly       │
// │     → Restores guard after returning from simulated tab switch           │
// │     → Website JS sees the simulated hidden→visible cycle correctly       │
// │     → Without this flag, tabSwitch events would be silently suppressed   │
// │                                                                          │
// │ v1.2.0 (2026-03-03 05:49 WIB)                                           │
// │   - BUGFIX [BUG-02] CRITICAL: handleCookie() missing persona in         │
// │     humanMove() calls — 2 locations                                      │
// │     → humanMove(page, box) → persona=undefined → persona.mouse crash    │
// │     → TypeError: Cannot read properties of undefined (reading 'mouse')  │
// │     → ALL cookie consent handling silently crashed every session         │
// │     → Fix: humanMove(page, box, persona) at both locations              │
// │     → Location 1: Step 3 selector loop (accept/reject button)           │
// │     → Location 2: Step 4 AR forced-accept fallback                      │
// │                                                                          │
// │   - BUGFIX [BUG-03] CRITICAL: dismissOverlay() missing persona in       │
// │     humanMove() call — 1 location                                        │
// │     → close button path (75% of dismiss attempts) always crashed        │
// │     → Only Escape (15%) and backdrop click (10%) paths worked           │
// │     → Fix: humanMove(page, box, persona) in close-button path           │
// │     → Auto-fixes BUG-05: handlePopupModal() → dismissOverlay() chain   │
// │                                                                          │
// │   - BUGFIX [BUG-04] CRITICAL: hoverExplore() missing persona in         │
// │     humanMove() call — 1 location                                        │
// │     → ALL hover exploration behavior crashed silently                    │
// │     → 20-50% of micro-habits were dying (hover is most common habit)    │
// │     → Fix: humanMove(page, box, persona)                                │
// │                                                                          │
// │   - BUGFIX [BUG-05] HIGH (auto-fixed by BUG-03):                        │
// │     handlePopupModal() → dismissOverlay() crash chain                    │
// │     → 75% of popup modal encounters failed to close                     │
// │     → Plus: humanMove(page, box, persona) in email input convert path   │
// │                                                                          │
// │   - BUGFIX [BUG-16] LOW: Rage→Fidget reallocation inflates fidget       │
// │     → Non-frustrated persona landing on 'rage' was always redirected    │
// │       to 'fidget', inflating fidget rate (+10-15% effective weight)      │
// │     → Fix: Proportional re-roll among non-rage habits using             │
// │       trackedRandom() to maintain correct entropy tracking              │
// │     → Effective weights preserved: hover/fidget/selectText/tabSwitch/   │
// │       keyboard maintain original ratios sans rage component             │
// │                                                                          │
// │ v1.1.0 (2026-03-03 02:37 WIB)                                           │
// │   - PATCH [MH-1] handleCookie() — Fix persona.cookie type access        │
// │     → Was: const cookieType = persona.cookie                            │
// │     → persona.cookie is an OBJECT { type: 'AA'|'AR'|'CTX',             │
// │       willAccept: boolean } (from Profiles.js)                          │
// │     → switch(cookieType) compared object to string 'AA','AR','CTX'      │
// │     → Object NEVER matches string → always fell into default (CTX)      │
// │     → Fix: const cookieType = persona.cookie.type                       │
// │     → Impact: CHB 2025 2/3 stable model was completely broken:          │
// │       AA users (always-accept) were going through CTX (contextual)      │
// │       AR users (always-reject) were going through CTX too               │
// │   - PATCH [MH-1b] handleCookie() — Use persona.cookie.willAccept       │
// │     for CTX path instead of hardcoded 0.36 probability                  │
// │     → Profiles.js already computes willAccept per persona               │
// │     → Hardcoded 0.36 was correct on average but ignored persona         │
// │       variance. Now respects the per-session precomputed decision.      │
// │   - PATCH [MH-2] handleCookie() — Defensive guard for persona.cookie   │
// │     → If persona.cookie is undefined/null/string (legacy callers),      │
// │       gracefully degrade: treat string as type, default willAccept      │
// │     → Prevents crash from .type access on undefined                     │
// │   - PATCH [MH-3] handleCookie() — Add fallback for AR when no reject   │
// │     button found but persona.cookie.willAccept === false                │
// │     → AR forced-accept now logs 'forced-accept-ar' (not just           │
// │       'forced-accept') for clearer analytics differentiation            │
// │                                                                          │
// │ v1.0.0 (2026-02-20 11:51 WIB)                                           │
// │   - Cookie consent persona-driven AA/AR/CTX, CHB 2025 stable 2/3       │
// │   - Text selection highlight-and-release reading behavior               │
// │   - Overlay/modal dismiss multi-strategy with frustration escalation    │
// │   - Tab switch realistic visibilitychange varied away duration          │
// │   - Hover exploration interest-weighted element targeting               │
// │   - Idle fidgeting cursor drift, micro-scroll, brief highlight          │
// │   - Popup response convert/close/ignore per Omnisend delay benchmarks   │
// │   - Rage click frustration-only, 3+ clicks in <2s Contentsquare def    │
// │   - Keyboard shortcut simulation Ctrl+A cancel, Ctrl+F cancel          │
// │   - All randomness via trackedRandom() for entropy tracking             │
// │                                                                          │
// │ LAST HISTORY LOG:                                                        │
// │   v1.1.0 (2026-03-03 02:37 WIB) — MH-1 thru MH-3 cookie fixes         │
// │   human_like.js v14.0 →                                                 │
// │     handleCookies → DELETED → replaced by handleCookie()                │
// │     performTextSelection → DELETED → replaced by selectText()           │
// │     dismissOverlays → DELETED → replaced by dismissOverlay()            │
// │     handleRealPopups → DELETED → replaced by handlePopupTab()           │
// │     simulateTabSwitch → DELETED → replaced by tabSwitch()               │
// │     hoverRandomElement → DELETED → replaced by hoverExplore()           │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ MATHEMATICAL FOUNDATIONS                                                  │
// ├───────────────────────────────────────────────────────────────────────────┤
// │                                                                          │
// │ 1. COOKIE CONSENT MODEL (etracker 2025 + CHB 2025, Bab 1-3)             │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    Persona types C ∈ {AA, AR, CTX}                                       │
// │      P(stable AA or AR) = 2/3                                            │
// │      P(contextual CTX) = 1/3                                             │
// │    Consent outcome calibrated to P(accept) = 0.40 overall               │
// │      P(accept | AA) = 1.00                                               │
// │      P(accept | AR) = 0.00                                               │
// │      P(accept | CTX) = variable (banner-design dependent)               │
// │    Decomposition:                                                         │
// │      P(AA) = α, P(AR) = 2/3 - α, P(CTX) = 1/3                          │
// │      P(accept) = α + 1/3×P(accept|CTX) = 0.40                          │
// │      Example: α=0.28, P(AR)=0.39, P(accept|CTX)=0.36                   │
// │    Timing (react time 1.5-8s read banner, decide):                       │
// │      AA: fast (1.5-3s, no reading)                                       │
// │      AR: medium (2-5s, scans for reject/settings)                        │
// │      CTX: slow (4-8s, actually reads options)                            │
// │                                                                          │
// │ 2. POPUP RESPONSE MODEL (Omnisend 2025)                                  │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    R ∈ {convert, close, ignore}                                          │
// │    P(convert | popup shown, delay=d) from Omnisend benchmark:           │
// │      d=0-1s → 1.9%                                                      │
// │      d=6-10s → 2.4% (sweet spot)                                        │
// │      d=1-5s → 2.3%                                                      │
// │      d=11-15s → 2.1%                                                    │
// │    P(close | popup shown) ≈ 0.75                                         │
// │    P(ignore | popup shown) ≈ 0.23-0.24 (1 - close - convert)            │
// │                                                                          │
// │ 3. TAB SWITCH MODEL                                                      │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    P(tab switch per minute) ≈ 0.03 (rare during focused reading)        │
// │    Away duration ~ Log-Normal(8s, 4s), range [3s, 30s]                  │
// │    Triggers visibilitychange events (hidden→visible)                     │
// │                                                                          │
// │ 4. IDLE FIDGET TAXONOMY                                                  │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    Sub-conscious micro-behaviors during reading:                          │
// │      cursorDrift (40%): small aimless mouse movement (10-80px)           │
// │      microScroll (25%): tiny scroll (20-80px)                            │
// │      briefSelect (15%): highlight 1-3 words, then deselect              │
// │      cursorPark  (10%): move cursor to edge/corner                       │
// │      nothing     (10%): truly idle                                       │
// │                                                                          │
// │ 5. FRUSTRATION SIGNALS (Contentsquare 2024)                              │
// │    ─────────────────────────────────────────────────────────────────────  │
// │    If persona.isFrustrated = true:                                       │
// │      - rageClick: 3+ rapid clicks in <2s (Contentsquare definition)     │
// │      - erraticMove: fast jerky mouse movements                           │
// │      - quickDismiss: dismiss overlays faster (impatient)                 │
// │    These create realistic frustration fingerprints in analytics.          │
// │                                                                          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ COOKIE OBJECT SCHEMA (from Profiles.js)                                  │
// ├───────────────────────────────────────────────────────────────────────────┤
// │                                                                          │
// │ persona.cookie = {                                                        │
// │   type: 'AA' | 'AR' | 'CTX',  // Cookie consent persona type           │
// │   willAccept: boolean           // Pre-computed accept decision          │
// │ }                                                                         │
// │                                                                          │
// │ AA (Always Accept): willAccept = true   (100% accept)                   │
// │ AR (Always Reject): willAccept = false  (0% accept)                     │
// │ CTX (Contextual):   willAccept = true/false (36% accept probability)    │
// │                                                                          │
// │ IMPORTANT: persona.cookie is an OBJECT, not a string!                   │
// │ v1.0.0 bug: `const cookieType = persona.cookie` → object comparison     │
// │ v1.1.0 fix: `const cookieType = persona.cookie.type` → string match    │
// └───────────────────────────────────────────────────────────────────────────┘
//
// DEPENDENCIES:
//   HumanLike_Math.js:     trackedRandom, gaussianRandom, clamp, getRandomInt,
//                           sleep, getHumanDelay
//   HumanLike_MousePhysics.js: humanMove (Bézier + overshoot)
//   HumanLike_Profiles.js: persona.cookie, persona.isFrustrated
//
// CONSUMERS:
//   HumanLike_SessionEngine.js (calls habits per NNg phase time-slice)
//
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const {
    trackedRandom,
    gaussianRandom,
    clamp,
    getRandomInt,
    sleep,
    getHumanDelay
} = require('./HumanLike_Math.js');

const { humanMove } = require('./HumanLike_MousePhysics.js');


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 0: KEY TIMING UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a log-normally distributed delay for keyboard event timing.
 *
 * P2-5 FIX: Log-normal distribution prevents KS-test detection.
 * Real keystroke inter-arrival times follow a log-normal distribution,
 * not uniform. Uniform distribution is trivially detected by KS-test.
 *
 * @param {number} median - Median delay in milliseconds
 * @param {number} sigma  - Log-normal sigma (spread factor, ~0.3-0.5 typical)
 * @returns {number} Delay in milliseconds (always positive integer)
 */
function logNormalDelay(median, sigma) {
    return Math.max(1, Math.round(Math.exp(Math.log(median) + sigma * gaussianRandom(0, 1))));
}

/**
 * Clamp a log-normal delay to a safe range.
 * Convenience wrapper for logNormalDelay() with bounds.
 *
 * @param {number} median  - Median delay in ms
 * @param {number} sigma   - Log-normal sigma
 * @param {number} minMs   - Minimum allowed value
 * @param {number} maxMs   - Maximum allowed value
 * @returns {number} Clamped delay in milliseconds
 */
function logNormalDelayBounded(median, sigma, minMs, maxMs) {
    return clamp(logNormalDelay(median, sigma), minMs, maxMs);
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: VIEWPORT VISIBILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if an element is visible and within the current viewport.
 *
 * @param {Object} page    - Playwright Page object
 * @param {Object} element - Playwright ElementHandle
 * @returns {Promise<boolean>}
 */
async function isVisibleInViewport(page, element) {
    try {
        if (!await element.isVisible()) return false;

        const box = await element.boundingBox();
        if (!box) return false;

        const vp = page.viewportSize();
        if (!vp) return true;

        return (
            box.y > -box.height &&
            box.y < vp.height + box.height &&
            box.x > -box.width &&
            box.x < vp.width + box.width
        );
    } catch (e) {
        return false;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: COOKIE CONSENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Common cookie banner selectors: accept buttons.
 */
const COOKIE_ACCEPT_SELECTORS = [
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("Accept Cookies")',
    'button:has-text("I Agree")',
    'button:has-text("OK")',
    'button:has-text("Got it")',
    'button:has-text("Allow")',
    'button:has-text("Allow All")',
    'button:has-text("Agree")',
    'a.class*="cookie"',
    'button#accept',
    'button.class*="accept"',
    'div[aria-label="Cookie"] button:first-of-type',
    '#onetrust-accept-btn-handler',
    '.cc-accept',
    '.cookie-consent-accept',
];

/**
 * Common cookie banner selectors: reject/settings buttons.
 */
const COOKIE_REJECT_SELECTORS = [
    'button:has-text("Reject")',
    'button:has-text("Reject All")',
    'button:has-text("Decline")',
    'button:has-text("No Thanks")',
    'button:has-text("Necessary Only")',
    'button:has-text("Manage")',
    'button:has-text("Settings")',
    'button:has-text("Preferences")',
    'a:has-text("Manage")',
    '#onetrust-reject-all-handler',
    '.cc-deny',
    '.cookie-consent-reject',
];

/**
 * Handle cookie consent banner based on persona cookie type.
 *
 * Cookie types from CHB 2025:
 *   AA (Always Accept) — clicks accept immediately, fast
 *   AR (Always Reject) — looks for reject/settings, slower
 *   CTX (Contextual) — reads banner, P(accept) depends on design
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ PATCH v1.1.0 [MH-1] — Fix persona.cookie type access              │
 * │                                                                      │
 * │ persona.cookie is an OBJECT from Profiles.js:                       │
 * │   { type: 'AA'|'AR'|'CTX', willAccept: boolean }                  │
 * │                                                                      │
 * │ v1.0.0 bug:                                                          │
 * │   const cookieType = persona.cookie  // ← OBJECT, not string      │
 * │   switch(cookieType)                  // ← object vs string 'AA'  │
 * │   → NEVER matches 'AA','AR','CTX' → always falls to default (CTX) │
 * │   → CHB 2025 2/3 stable model COMPLETELY BROKEN                   │
 * │                                                                      │
 * │ v1.1.0 fix:                                                          │
 * │   const cookieType = persona.cookie?.type || 'CTX'                 │
 * │   const willAccept = persona.cookie?.willAccept                    │
 * │   → Correctly extracts type string for switch comparison            │
 * │   → Uses precomputed willAccept for CTX path (not hardcoded 0.36) │
 * │                                                                      │
 * │ [MH-2] Defensive guard:                                             │
 * │   If persona.cookie is a string (legacy), use it directly          │
 * │   If persona.cookie is undefined, default to 'CTX'                 │
 * │                                                                      │
 * │ PATCH v1.2.0 [BUG-02] — Add persona to humanMove() calls          │
 * │   humanMove(page, box) → humanMove(page, box, persona)             │
 * │   Without persona, humanMove reads persona.mouse → undefined →     │
 * │   TypeError crash. ALL cookie handling was silently failing.        │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} page     - Playwright Page object
 * @param {Object} persona  - Session persona (contains persona.cookie)
 * @param {Function} logDebug - Optional debug logger
 * @returns {Promise<{handled: boolean, action: string, timeMs: number}>}
 */
async function handleCookie(page, persona, logDebug) {
    const startTime = Date.now();

    // ─── [MH-1] + [MH-2] Extract cookie type and willAccept safely ───
    let cookieType;
    let willAccept;

    if (persona.cookie && typeof persona.cookie === 'object') {
        cookieType = persona.cookie.type || 'CTX';
        willAccept = persona.cookie.willAccept;
    } else if (typeof persona.cookie === 'string') {
        cookieType = persona.cookie;
        willAccept = (cookieType === 'AA');
    } else {
        cookieType = 'CTX';
        willAccept = trackedRandom() < 0.36;
    }

    try {
        let action;
        let selectors;
        let reactionDelay;

        switch (cookieType) {
            case 'AA':
                action = 'accept';
                selectors = COOKIE_ACCEPT_SELECTORS;
                reactionDelay = getRandomInt(1500, 3000);
                break;

            case 'AR':
                action = 'reject';
                selectors = COOKIE_REJECT_SELECTORS;
                reactionDelay = getRandomInt(2000, 5000);
                break;

            case 'CTX':
            default:
                reactionDelay = getRandomInt(4000, 8000);
                if (willAccept !== undefined ? willAccept : trackedRandom() < 0.36) {
                    action = 'accept';
                    selectors = COOKIE_ACCEPT_SELECTORS;
                } else {
                    action = 'reject';
                    selectors = COOKIE_REJECT_SELECTORS;
                }
                break;
        }

        // Step 2: Wait (reading the banner)
        await sleep(reactionDelay);

        // Step 3: Find and click the button
        for (const sel of selectors) {
            try {
                const btn = await page.$(sel);
                if (btn && await btn.isVisible()) {
                    const box = await btn.boundingBox();
                    if (box) {
                        // [BUG-02] FIX: Added persona parameter to humanMove
                        // OLD: await humanMove(page, box);
                        // humanMove() signature: humanMove(page, box, persona)
                        // persona.mouse contains Bézier parameters (fittsA, fittsB, etc.)
                        // Without persona → persona.mouse → TypeError: undefined.mouse
                        await humanMove(page, box, persona);
                        await sleep(getRandomInt(100, 300));
                        await btn.click();
                        if (logDebug) logDebug(`Cookie [${cookieType}] ${action} ${sel} ${Date.now() - startTime}ms`);
                        await sleep(getRandomInt(300, 800));
                        return { handled: true, action: action, timeMs: Date.now() - startTime };
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // Step 4: Fallback — if reject not found, AR may force-accept
        if (action === 'reject') {
            for (const sel of COOKIE_ACCEPT_SELECTORS) {
                try {
                    const btn = await page.$(sel);
                    if (btn && await btn.isVisible()) {
                        const box = await btn.boundingBox();
                        if (box) {
                            // [BUG-02] FIX: Added persona parameter to humanMove
                            // [MH-3] Frustrated AR forced to accept (no reject button)
                            await humanMove(page, box, persona);
                            await sleep(getRandomInt(200, 500));
                            await btn.click();
                            if (logDebug) logDebug(`Cookie [${cookieType}] forced-accept-ar (no reject btn)`);
                            return { handled: true, action: 'forced-accept-ar', timeMs: Date.now() - startTime };
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        }

        // No banner found
        return { handled: false, action: 'none', timeMs: Date.now() - startTime };

    } catch (e) {
        return { handled: false, action: 'error', timeMs: Date.now() - startTime };
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: TEXT SELECTION (Reading Highlight Behavior)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulate text selection: highlight a portion, pause to "read", then deselect.
 * This mimics the common reading habit of dragging over text while reading.
 *
 * @param {Object} page    - Playwright Page object
 * @param {Object} persona - Session persona
 * @returns {Promise<boolean>} true if selection was performed
 */
async function selectText(page, persona) {
    try {
        const paragraphs = await page.$$('p, span.content, article p, .post-content p');
        if (paragraphs.length === 0) return false;

        let target = null;
        const shuffled = [...paragraphs].sort(() => trackedRandom() - 0.5);
        for (const p of shuffled) {
            if (await isVisibleInViewport(page, p)) {
                target = p;
                break;
            }
        }

        if (!target) return false;

        const box = await target.boundingBox();
        if (!box) return false;

        const startX = box.x + trackedRandom() * (box.width * 0.4);
        const startY = box.y + box.height * 0.3 + trackedRandom() * 0.4;
        const dragX = getRandomInt(30, 180);

        await page.mouse.move(startX, startY, { steps: getRandomInt(5, 10) });
        await sleep(getRandomInt(100, 300));

        await page.mouse.down();
        await page.mouse.move(
            startX + dragX,
            startY + getRandomInt(-3, 3),
            { steps: getRandomInt(8, 15) }
        );

        const holdTime = getRandomInt(400, 1500);
        await sleep(holdTime);

        await page.mouse.up();
        await sleep(getRandomInt(200, 600));

        await page.mouse.click(
            startX - getRandomInt(10, 30),
            startY + getRandomInt(10, 30)
        );

        return true;
    } catch (e) {
        return false;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: OVERLAY / MODAL DISMISS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Common overlay close button selectors.
 */
const OVERLAY_CLOSE_SELECTORS = [
    'button[aria-label="Close"]',
    'button[aria-label="close"]',
    '.close-button',
    '.modal-close',
    '.popup-close',
    'button:has-text("Close")',
    'button:has-text("✕")',
    'button:has-text("×")',
    'svg[data-icon="times"]',
    'button:has-text("No thanks")',
    'button:has-text("No, thanks")',
    'button:has-text("Maybe later")',
    'button:has-text("Not now")',
    '.overlay-close',
    '[data-dismiss="modal"]',
    '.fancybox-close',
];

/**
 * Dismiss overlay/modal popups with human-like timing.
 *
 * Strategy order:
 *   1. Look for close button (75% of humans)
 *   2. Press Escape key (15% of humans)
 *   3. Click backdrop/outside (10% of humans)
 *
 * Frustrated users dismiss faster (shorter reaction time).
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ PATCH v1.2.0 [BUG-03] — Add persona to humanMove() call           │
 * │   humanMove(page, box) → humanMove(page, box, persona)             │
 * │   The 75% close-button path was crashing every time.               │
 * │   This also auto-fixes BUG-05: handlePopupModal() calls this       │
 * │   function for the "close" path (75% of popup encounters).         │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} page    - Playwright Page object
 * @param {Object} persona - Session persona
 * @param {Function} logDebug - Optional debug logger
 * @returns {Promise<{dismissed: boolean, method: string}>}
 */
async function dismissOverlay(page, persona, logDebug) {
    try {
        const baseDelay = persona.isFrustrated
            ? getRandomInt(500, 1500)
            : getRandomInt(1000, 3000);
        await sleep(baseDelay);

        const r = trackedRandom();

        // Strategy 1: Close button (75%)
        if (r < 0.75) {
            for (const sel of OVERLAY_CLOSE_SELECTORS) {
                try {
                    const btn = await page.$(sel);
                    if (btn && await btn.isVisible()) {
                        const box = await btn.boundingBox();
                        if (box) {
                            // [BUG-03] FIX: Added persona parameter to humanMove
                            // OLD: await humanMove(page, box);
                            // Without persona → persona.mouse → TypeError
                            // This was crashing the entire 75% close-button path
                            // Also auto-fixes BUG-05 (handlePopupModal crash chain)
                            await humanMove(page, box, persona);
                            await sleep(getRandomInt(80, 250));
                            await btn.click();
                            if (logDebug) logDebug(`Overlay: Dismissed via ${sel}`);
                            await sleep(getRandomInt(200, 500));
                            return { dismissed: true, method: 'close-button' };
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        }

        // Strategy 2: Escape key (15%)
        if (r < 0.90) {
            await page.keyboard.press('Escape');
            if (logDebug) logDebug('Overlay: Dismissed via Escape');
            await sleep(getRandomInt(200, 500));
            return { dismissed: true, method: 'escape' };
        }

        // Strategy 3: Click backdrop (10%)
        const vp = page.viewportSize();
        if (vp) {
            const clickX = getRandomInt(5, 30);
            const clickY = getRandomInt(
                Math.round(vp.height * 0.1),
                Math.round(vp.height * 0.3)
            );
            await page.mouse.click(clickX, clickY);
            if (logDebug) logDebug('Overlay: Dismissed via backdrop click');
            await sleep(getRandomInt(200, 500));
            return { dismissed: true, method: 'backdrop' };
        }

        return { dismissed: false, method: 'none' };
    } catch (e) {
        return { dismissed: false, method: 'error' };
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: TAB SWITCH (Visibility Change Simulation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulate user switching to another tab and coming back.
 * Fires visibilitychange events (hidden→visible) which are tracked
 * by many analytics platforms.
 *
 * Away duration sampled from Log-Normal for realistic variance:
 *   Quick check (60%): 3-8s (glanced at another tab)
 *   Read something (30%): 8-20s (reading another tab)
 *   Extended (10%): 20-60s (got distracted)
 *
 * @param {Object} page    - Playwright Page object
 * @param {Object} persona - Session persona
 * @param {Function} logDebug - Optional debug logger
 * @returns {Promise<number>} Away duration in ms
 */
async function tabSwitch(page, persona, logDebug) {
    try {
        // ─── Simulate "leaving" the tab ───
        // v1.3.0: Set bypass flag so Page Visibility Guard (opsi3.js v16.1.0)
        // allows this simulated event through to website listeners.
        // Without bypass, the guard would suppress our dispatchEvent because
        // it blocks all visibilitychange events to keep page "always visible".
        await page.evaluate(() => {
            // Activate bypass — tell Visibility Guard to let events through
            window.__qteVGBypass && window.__qteVGBypass(true);

            // Set hidden state (guard's getter will read __qteOverrideHidden)
            document.__qteOverrideHidden = true;
            document.__qteOverrideVisState = 'hidden';

            // Re-define properties so any direct reads also work
            Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });

            // Dispatch — website listeners will receive this
            document.dispatchEvent(new Event('visibilitychange'));
        });

        let awayMs;
        const r = trackedRandom();
        if (r < 0.60) {
            awayMs = getRandomInt(3000, 8000);
        } else if (r < 0.90) {
            awayMs = getRandomInt(8000, 20000);
        } else {
            awayMs = getRandomInt(20000, 60000);
        }

        if (logDebug) logDebug(`Tab Switch: away for ${(awayMs / 1000).toFixed(1)}s`);
        await sleep(awayMs);

        // ─── Simulate "returning" to the tab ───
        await page.evaluate(() => {
            // Set visible state
            document.__qteOverrideHidden = false;
            document.__qteOverrideVisState = 'visible';

            Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
            Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });

            // Dispatch return event
            document.dispatchEvent(new Event('visibilitychange'));

            // Deactivate bypass — guard resumes blocking OS-level events
            window.__qteVGBypass && window.__qteVGBypass(false);
        });

        await sleep(getRandomInt(500, 1500));

        return awayMs;
    } catch (e) {
        // Safety: always try to restore guard on error
        try {
            await page.evaluate(() => {
                window.__qteVGBypass && window.__qteVGBypass(false);
            });
        } catch (_) {}
        return 0;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: HOVER EXPLORATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Element interest weights for hover targeting.
 * Higher weight = more likely to attract mouse hover.
 */
const HOVER_WEIGHTS = [
    { selector: 'a',             weight: 0.30 },
    { selector: 'button',        weight: 0.15 },
    { selector: 'img',           weight: 0.20 },
    { selector: 'h1, h2, h3',   weight: 0.15 },
    { selector: 'p',             weight: 0.10 },
    { selector: 'input',         weight: 0.05 },
    { selector: 'video',         weight: 0.05 },
];

/**
 * Hover over a visible page element with interest-weighted targeting.
 * Elements with higher visual salience (links, images, buttons) attract
 * more hover attention than plain text.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ PATCH v1.2.0 [BUG-04] — Add persona to humanMove() call           │
 * │   humanMove(page, box) → humanMove(page, box, persona)             │
 * │   ALL hover exploration was crashing silently (20-50% of           │
 * │   micro-habits are hover, making this the most impactful fix).     │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} page    - Playwright Page object
 * @param {Object} persona - Session persona
 * @returns {Promise<{hovered: boolean, element: string, dwellMs: number}>}
 */
async function hoverExplore(page, persona) {
    try {
        const totalWeight = HOVER_WEIGHTS.reduce((s, h) => s + h.weight, 0);
        let r = trackedRandom() * totalWeight;
        let chosenSelector = 'p';

        for (const hw of HOVER_WEIGHTS) {
            r -= hw.weight;
            if (r <= 0) {
                chosenSelector = hw.selector;
                break;
            }
        }

        const elements = await page.$$(chosenSelector);
        const visible = [];
        for (const el of elements) {
            if (visible.length >= 20) break;
            if (await isVisibleInViewport(page, el)) {
                visible.push(el);
            }
        }

        if (visible.length === 0) {
            return { hovered: false, element: 'none', dwellMs: 0 };
        }

        const target = visible[Math.floor(trackedRandom() * visible.length)];
        const box = await target.boundingBox();
        if (!box) return { hovered: false, element: 'none', dwellMs: 0 };

        // [BUG-04] FIX: Added persona parameter to humanMove
        // OLD: await humanMove(page, box);
        // Hover is the MOST COMMON micro-habit (20-50% of all micro-habits
        // depending on NNg phase). This was silently crashing every hover.
        await humanMove(page, box, persona);

        let hoverDwell;
        if (['a', 'button'].includes(chosenSelector)) {
            hoverDwell = getRandomInt(800, 2500);
        } else if (['img', 'video'].includes(chosenSelector)) {
            hoverDwell = getRandomInt(1000, 3000);
        } else {
            hoverDwell = getRandomInt(500, 1500);
        }

        await sleep(hoverDwell);

        return { hovered: true, element: chosenSelector, dwellMs: hoverDwell };
    } catch (e) {
        return { hovered: false, element: 'error', dwellMs: 0 };
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: IDLE FIDGET BEHAVIORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a random idle fidget behavior.
 *
 * These are sub-conscious micro-movements that occur during reading:
 *   - cursorDrift (40%): small aimless mouse movement
 *   - microScroll (25%): tiny scroll up or down
 *   - briefSelect (15%): highlight 1-3 words briefly
 *   - cursorPark  (10%): move cursor to edge/corner
 *   - nothing     (10%): truly idle (no action)
 *
 * @param {Object} page    - Playwright Page object
 * @param {Object} persona - Session persona
 * @returns {Promise<string>} The fidget type performed
 */
async function idleFidget(page, persona) {
    const r = trackedRandom();

    try {
        // cursorDrift (40%)
        if (r < 0.40) {
            const vp = page.viewportSize();
            if (vp) {
                const driftX = getRandomInt(
                    Math.round(vp.width * 0.2),
                    Math.round(vp.width * 0.8)
                );
                const driftY = getRandomInt(
                    Math.round(vp.height * 0.2),
                    Math.round(vp.height * 0.8)
                );
                await page.mouse.move(driftX, driftY, { steps: getRandomInt(10, 25) });
                await sleep(getRandomInt(200, 600));
            }
            return 'cursorDrift';
        }

        // microScroll (25%)
        if (r < 0.65) {
            const direction = trackedRandom() < 0.7 ? 1 : -1;
            const distance = getRandomInt(20, 80);
            await page.mouse.wheel(0, distance * direction);
            await sleep(getRandomInt(100, 300));
            return 'microScroll';
        }

        // briefSelect (15%)
        if (r < 0.80) {
            await selectText(page, persona);
            return 'briefSelect';
        }

        // cursorPark (10%)
        if (r < 0.90) {
            const vp = page.viewportSize();
            if (vp) {
                const corners = [
                    { x: 5, y: 5 },
                    { x: vp.width - 5, y: 5 },
                    { x: 5, y: vp.height - 5 },
                    { x: vp.width / 2, y: 5 },
                ];
                const corner = corners[Math.floor(trackedRandom() * corners.length)];
                await page.mouse.move(corner.x, corner.y, { steps: getRandomInt(15, 30) });
            }
            return 'cursorPark';
        }

        // nothing (10%)
        await sleep(getRandomInt(500, 2000));
        return 'nothing';
    } catch (e) {
        return 'error';
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: POPUP RESPONSE (In-Page Modal)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Omnisend popup conversion rates by delay.
 */
const OMNISEND_CONVERSION = {
    0:  0.019,
    1:  0.019,
    5:  0.023,
    10: 0.024,
    15: 0.021,
    30: 0.019,
    60: 0.018,
};

/**
 * Get conversion rate for a given popup delay.
 *
 * @param {number} delaySec - Popup delay in seconds
 * @returns {number} Conversion probability
 */
function getPopupConversionRate(delaySec) {
    if (delaySec <= 1) return 0.019;
    if (delaySec <= 5) return 0.023;
    if (delaySec <= 10) return 0.024;
    if (delaySec <= 15) return 0.021;
    if (delaySec <= 30) return 0.019;
    if (delaySec <= 60) return 0.018;
    return 0.019;
}

/**
 * Respond to an in-page popup/modal.
 *
 * Decision tree:
 *   1. Sample R ∈ {convert, close, ignore} from Omnisend benchmark
 *   2. convert: fill form if present (rare)
 *   3. close: find and click close button
 *   4. ignore: scroll past, let popup auto-dismiss
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ PATCH v1.2.0 [BUG-05] — Auto-fixed by BUG-03 (dismissOverlay)     │
 * │   handlePopupModal() → dismissOverlay() → humanMove crash chain    │
 * │   Now that dismissOverlay passes persona to humanMove, the 75%     │
 * │   close path works correctly.                                       │
 * │   Plus: humanMove in convert path also gets persona (BUG-02 ext)   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} page     - Playwright Page object
 * @param {Object} persona  - Session persona
 * @param {number} delaySec - Popup trigger delay
 * @param {Function} logDebug - Optional debug logger
 * @returns {Promise<{action: string, timeMs: number}>}
 */
async function handlePopupModal(page, persona, delaySec, logDebug) {
    const startTime = Date.now();
    const convRate = getPopupConversionRate(delaySec);

    await sleep(getRandomInt(1000, 3000));

    const r = trackedRandom();

    // Convert (rare, per Omnisend)
    if (r < convRate) {
        if (logDebug) logDebug(`Popup: Convert (delay=${delaySec}s, rate=${convRate})`);
        try {
            const emailInput = await page.$('input[type="email"], input[name="email"]');
            if (emailInput && await emailInput.isVisible()) {
                const box = await emailInput.boundingBox();
                if (box) {
                    // [BUG-02 ext] FIX: Added persona parameter to humanMove
                    // This convert path also uses humanMove to approach the email input.
                    // Without persona, this would also crash with TypeError.
                    await humanMove(page, box, persona);
                    await sleep(getRandomInt(300, 700));
                    await emailInput.click();
                    await sleep(getRandomInt(2000, 5000));
                }
            }
        } catch (e) { /* non-critical */ }
        return { action: 'convert', timeMs: Date.now() - startTime };
    }

    // Close (~75%)
    // [BUG-05] This path calls dismissOverlay() which now correctly passes
    // persona to humanMove() (fixed by BUG-03)
    if (r < convRate + 0.75) {
        const result = await dismissOverlay(page, persona, logDebug);
        return { action: 'close', timeMs: Date.now() - startTime };
    }

    // Ignore (~23-24%)
    if (logDebug) logDebug('Popup: Ignored');
    await sleep(getRandomInt(500, 1500));
    return { action: 'ignore', timeMs: Date.now() - startTime };
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: BROWSER POPUP TAB HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle new browser tabs/windows opened by the page (pop-ups).
 *
 * Modern browsers block most pop-ups by default (Chrome Help).
 * When they do appear, most users close them (intrusive).
 * Follow chance increases with engagement time:
 *   <30s elapsed: 5% follow (probably unwanted)
 *   ≥30s elapsed: 20% follow (may be intentional)
 *
 * @param {Object} page      - Current Playwright Page
 * @param {Object} context   - Browser context (contains pages)
 * @param {number} elapsedMs - Time elapsed in session
 * @param {Object} persona   - Session persona
 * @param {Function} logDebug - Optional debug logger
 * @returns {Promise<{currentPage: Object, action: string}>}
 */
async function handlePopupTab(page, context, elapsedMs, persona, logDebug) {
    try {
        const pages = context.pages();
        if (pages.length <= 1) {
            return { currentPage: page, action: 'none' };
        }

        await sleep(getRandomInt(1000, 2000));

        const followChance = elapsedMs > 30000 ? 0.20 : 0.05;
        const r = trackedRandom();

        if (r < followChance) {
            const newPage = pages[pages.length - 1];
            if (newPage !== page) {
                if (logDebug) logDebug('PopupTab: Following new tab');
                try {
                    await newPage.bringToFront();
                    await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
                    await sleep(getRandomInt(2000, 5000));
                    return { currentPage: newPage, action: 'follow' };
                } catch (e) {
                    return { currentPage: page, action: 'follow-failed' };
                }
            }
        }

        if (logDebug) logDebug(`PopupTab: Closing ${pages.length - 1} popup tab(s)`);
        for (let i = 1; i < pages.length; i++) {
            try { await pages[i].close(); } catch (e) { /* ok */ }
        }
        await pages[0].bringToFront();
        return { currentPage: pages[0], action: 'closed' };

    } catch (e) {
        return { currentPage: page, action: 'error' };
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: RAGE CLICK (Frustration Signal)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a rage click sequence: 3+ rapid clicks in <2s.
 *
 * Contentsquare defines rage clicks as 3+ clicks within 2 seconds
 * on the same area. This is a frustration signal that appears in
 * 39.6% of sessions when persona.isFrustrated = true.
 *
 * Only executed for frustrated personas. Non-frustrated personas
 * never rage click (by definition).
 *
 * @param {Object} page    - Playwright Page object
 * @param {Object} persona - Session persona
 * @param {Function} logDebug - Optional debug logger
 * @returns {Promise<boolean>} true if rage click was performed
 */
async function rageClick(page, persona, logDebug) {
    if (!persona.isFrustrated) return false;

    try {
        const vp = page.viewportSize();
        if (!vp) return false;

        const targetX = getRandomInt(
            Math.round(vp.width * 0.2),
            Math.round(vp.width * 0.8)
        );
        const targetY = getRandomInt(
            Math.round(vp.height * 0.3),
            Math.round(vp.height * 0.7)
        );

        const clicks = getRandomInt(3, 6);
        if (logDebug) logDebug(`Rage: ${clicks} clicks at (${targetX}, ${targetY})`);

        for (let i = 0; i < clicks; i++) {
            const jitterX = targetX + getRandomInt(-5, 5);
            const jitterY = targetY + getRandomInt(-5, 5);
            await page.mouse.click(jitterX, jitterY);
            await sleep(getRandomInt(80, 250));
        }

        await sleep(getRandomInt(500, 1500));
        return true;
    } catch (e) {
        return false;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: KEYBOARD SHORTCUT SIMULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulate accidental or habitual keyboard shortcut usage.
 * Real users occasionally press Ctrl+A (select all) then immediately cancel,
 * or Ctrl+F (find) then cancel. These are subconscious habits.
 *
 * @param {Object} page - Playwright Page object
 * @returns {Promise<string>} The shortcut type simulated
 */
async function keyboardHabit(page) {
    const r = trackedRandom();

    try {
        if (r < 0.50) {
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await sleep(getRandomInt(200, 600));

            const vp = page.viewportSize();
            if (vp) {
                await page.mouse.click(
                    getRandomInt(100, vp.width - 100),
                    getRandomInt(100, vp.height - 100)
                );
            }
            return 'ctrl-a-cancel';
        }

        if (r < 0.80) {
            await page.keyboard.down('Control');
            await page.keyboard.press('f');
            await page.keyboard.up('Control');
            await sleep(getRandomInt(800, 2000));
            await page.keyboard.press('Escape');
            return 'ctrl-f-cancel';
        }

        // W9 FIX: Accidental right-click (context menu) — 5% chance
        // Real users occasionally right-click then immediately dismiss
        if (r < 0.85) {
            try {
                var vp2 = page.viewportSize();
                if (vp2) {
                    await page.mouse.click(
                        getRandomInt(50, vp2.width - 50),
                        getRandomInt(50, vp2.height - 50),
                        { button: 'right' }
                    );
                    await sleep(getRandomInt(300, 1200));
                    // Dismiss context menu by clicking elsewhere or pressing Escape
                    await page.keyboard.press('Escape');
                }
            } catch(e) {}
            return 'right-click-cancel';
        }

        // W10 FIX: Additional keyboard behaviors (remaining 15%)
        // Arrow keys, Tab, Home/End — normal reading/browsing keyboard usage
        var kbType = trackedRandom();
        if (kbType < 0.40) {
            // Arrow down scroll (2-5 presses)
            var presses = getRandomInt(2, 5);
            for (var ki = 0; ki < presses; ki++) {
                await page.keyboard.press('ArrowDown');
                // P2-5 FIX: Log-normal key timing (prevents KS-test detection on uniform distribution)
                await sleep(logNormalDelayBounded(150, 0.4, 60, 500));
            }
            return 'arrow-scroll';
        }
        if (kbType < 0.65) {
            // Tab key navigation (focus shift)
            await page.keyboard.press('Tab');
            // P2-5 FIX: Log-normal dwell after Tab key
            await sleep(logNormalDelayBounded(800, 0.35, 300, 2500));
            // Sometimes press Tab again, sometimes Shift+Tab to go back
            if (trackedRandom() < 0.4) {
                await page.keyboard.down('Shift');
                await page.keyboard.press('Tab');
                await page.keyboard.up('Shift');
            }
            return 'tab-navigate';
        }
        if (kbType < 0.80) {
            // Home or End key
            await page.keyboard.press(trackedRandom() < 0.5 ? 'Home' : 'End');
            await sleep(getRandomInt(800, 2000));
            return 'home-end';
        }
        // Remaining: true no-op
        return 'none';
    } catch (e) {
        return 'error';
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12: COMPOSITE MICRO-HABIT EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a weighted-random micro-habit appropriate for the current
 * NNg phase and persona characteristics.
 *
 * Phase modulates which habits are likely:
 *   critical (0-10s):  mostly hover + fidget (orientation)
 *   decision (10-30s): hover + text select + fidget
 *   committed (30s+):  full range including tab switch, keyboard
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ PATCH v1.2.0 [BUG-16] — Rage→non-rage proportional re-roll        │
 * │                                                                      │
 * │ v1.1.0 behavior:                                                     │
 * │   if (chosen === 'rage' && !persona.isFrustrated)                   │
 * │       chosen = 'fidget';  // ← ALL rage weight → fidget            │
 * │   This inflated fidget rate for non-frustrated personas:            │
 * │     critical: fidget effective 0.35 → 0.45 (+28%)                  │
 * │     decision: fidget effective 0.30 → 0.45 (+50%)                  │
 * │     committed: fidget effective 0.25 → 0.40 (+60%)                 │
 * │                                                                      │
 * │ v1.2.0 fix:                                                          │
 * │   Re-roll among non-rage habits proportionally using the same       │
 * │   weight table minus rage. This preserves the original ratio        │
 * │   between hover:fidget:selectText:tabSwitch:keyboard.               │
 * │   Uses trackedRandom() for consistent entropy tracking.             │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} page    - Playwright Page object
 * @param {Object} persona - Session persona
 * @param {string} phase   - NNg phase ('critical'|'decision'|'committed')
 * @param {Function} logDebug - Optional debug logger
 * @returns {Promise<{habit: string, result: any}>}
 */
async function executeMicroHabit(page, persona, phase, logDebug) {
    const r = trackedRandom();

    // Phase-specific weight tables
    const weights = {
        critical:  { hover: 0.50, fidget: 0.35, selectText: 0.05, tabSwitch: 0.00, keyboard: 0.00, rage: 0.10 },
        decision:  { hover: 0.30, fidget: 0.30, selectText: 0.15, tabSwitch: 0.05, keyboard: 0.05, rage: 0.15 },
        committed: { hover: 0.20, fidget: 0.25, selectText: 0.20, tabSwitch: 0.10, keyboard: 0.10, rage: 0.15 },
    };

    const w = weights[phase] || weights.committed;

    let cum = 0;
    let chosen = 'fidget';
    for (const [habit, weight] of Object.entries(w)) {
        cum += weight;
        if (r <= cum) {
            chosen = habit;
            break;
        }
    }

    // [BUG-16] FIX: Proportional re-roll for non-frustrated personas
    // OLD: if (chosen === 'rage' && !persona.isFrustrated) chosen = 'fidget';
    //
    // The old code dumped ALL rage weight into fidget, inflating it by 28-60%.
    // New code: re-roll among non-rage habits proportionally.
    // This preserves hover:fidget:selectText:tabSwitch:keyboard ratios.
    if (chosen === 'rage' && !persona.isFrustrated) {
        // Build non-rage weight table and re-roll
        const nonRageEntries = Object.entries(w).filter(([h]) => h !== 'rage');
        const nonRageTotal = nonRageEntries.reduce((s, [, wt]) => s + wt, 0);

        // Re-roll with trackedRandom() for entropy consistency
        let reroll = trackedRandom() * nonRageTotal;
        chosen = 'fidget'; // safe fallback
        for (const [habit, weight] of nonRageEntries) {
            reroll -= weight;
            if (reroll <= 0) {
                chosen = habit;
                break;
            }
        }
    }

    let result;
    switch (chosen) {
        case 'hover':
            result = await hoverExplore(page, persona);
            break;
        case 'fidget':
            result = await idleFidget(page, persona);
            break;
        case 'selectText':
            result = await selectText(page, persona);
            break;
        case 'tabSwitch':
            result = await tabSwitch(page, persona, logDebug);
            break;
        case 'keyboard':
            result = await keyboardHabit(page);
            break;
        case 'rage':
            result = await rageClick(page, persona, logDebug);
            break;
        default:
            result = null;
    }

    if (logDebug) logDebug(`MicroHabit: ${phase}→${chosen}`);

    return { habit: chosen, result };
}


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    // Helpers
    isVisibleInViewport,

    // P2-5: Key timing helpers (log-normal distribution)
    logNormalDelay,
    logNormalDelayBounded,

    // Core habits
    handleCookie,
    selectText,
    dismissOverlay,
    tabSwitch,
    hoverExplore,
    idleFidget,
    handlePopupModal,
    handlePopupTab,
    rageClick,
    keyboardHabit,

    // Composite
    executeMicroHabit,

    // Constants (for testing/override)
    COOKIE_ACCEPT_SELECTORS,
    COOKIE_REJECT_SELECTORS,
    OVERLAY_CLOSE_SELECTORS,
    HOVER_WEIGHTS,
    OMNISEND_CONVERSION,
    getPopupConversionRate,
};

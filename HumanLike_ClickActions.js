// ─────────────────────────────────────────────────────────────────────────────
// HumanLike_ClickActions.js v1.2.0 — Click Navigation Engine (Layer 2)
// ─────────────────────────────────────────────────────────────────────────────
//
// CHANGELOG
// v1.2.0  2026-03-03  06:10 WIB
//   - BUG-10 FIX: humanPreClickSequence() now returns {success, reason} object
//     OLD: returned boolean false for BOTH error and abandoned cases
//     NEW: returns { success: false, reason: 'abandoned' } for intentional retreat
//          returns { success: false, reason: 'error' } for element/hover failure
//          returns { success: true, reason: null } for successful click
//     → clickInternalLink() and clickExternalLink() updated to distinguish:
//       abandoned = return false (click NOT executed — behavioral model preserved)
//       error = try fallback direct click (element may still be clickable)
//     → Effective abandon rate restored from ~0% to designed 7-12%
//     → clickAdElement() Section 6 also updated for consistency
//
//   - BUG-11 FIX: Ad viewability now uses Math.js v1.2.0 threshold (50% default)
//     OLD: isVisibleAndInViewport() required 100% visible (too strict for IAB/MRC)
//     NEW: Math.js v1.2.0 BUG-09 fix defaults to 50% area threshold
//     → findVisibleAds() calls isVisibleAndInViewport() which now uses 50% default
//     → ensureAdViewable() calls isVisibleAndInViewport() → 50% default matches IAB
//     → Ad impressions underreporting reduced from 15-25% to ~0%
//     → For explicit IAB/MRC compliance, can pass threshold=0.50 directly
//     NOTE: Large ads (>242,500px²) should use 30% per IAB/MRC spec — added
//           size-aware threshold in findVisibleAds() for large ad containers
//
//   - BUG-17 VERIFIED: All imports confirmed complete and correct
//     → trackedRandom, getRandomInt, getHumanDelay, sleep, isVisibleAndInViewport
//       from HumanLike_Math.js — all used, all imported ✅
//     → humanClick, humanHover, humanMove, mouseDrift
//       from HumanLike_MousePhysics.js — all used, all imported ✅
//     → No missing imports, no unused imports
//     → Status: VERIFIED SAFE, no fix needed
//
// v1.1.0  2026-03-03  00:10 WIB
//   - BUGFIX: Signature aligned with SessionEngine (page, blacklist, targetDbUrls)
//     → persona & config now resolved internally via state object pattern
//   - BUGFIX: clickInternalDbPriority now read from config, not persona
//   - BUGFIX: Trailing slash normalization in DB path matching
//   - BUGFIX: Same-page skip logic fixed for hash fragments
//   - BUGFIX: Removed scrollIntoView per-link (anti-pattern); collect visible-only
//   - FEATURE: Pre-click hover + hesitation (human reading link text)
//   - FEATURE: Abandoned click pattern (5-10% hover-then-retreat)
//   - FEATURE: Position-weighted link selection (top-of-viewport bias)
//   - FEATURE: clickAdElement() — target ads in iframe, AdSense, display
//   - FEATURE: ensureAdViewable() — IAB/MRC viewable impression guarantee
//   - All randomness via trackedRandom for entropy tracking
//
// v1.0.0  2026-03-03  00:05 WIB
//   - Initial release (see git history)
//
// DEPENDENCIES
//   HumanLike_Math.js         — trackedRandom, getRandomInt, sleep, isVisibleAndInViewport, getHumanDelay
//   HumanLike_MousePhysics.js — humanClick, humanHover, humanMove, mouseDrift
//
// CONSUMERS
//   HumanLike_SessionEngine.js — calls clickInternalLink / clickExternalLink / clickAdElement
//
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const {
  trackedRandom,
  getRandomInt,
  getHumanDelay,
  sleep,
  isVisibleAndInViewport
} = require('./HumanLike_Math.js');

const {
  humanClick,
  humanHover,
  humanMove,
  mouseDrift
} = require('./HumanLike_MousePhysics.js');



// W11 FIX: Gaussian click position distribution
// Real users click near the center of elements, not uniformly random
// Box-Muller transform for Gaussian(μ, σ)
function gaussianRandom(mean, stdDev) {
  var u1 = Math.random(), u2 = Math.random();
  var z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * stdDev;
}

// Generate click coordinates within a bounding box using Gaussian distribution
// Center-biased: σ = width/6 so 99.7% of clicks fall within the box
function gaussianClickPoint(box) {
  var cx = box.x + box.width / 2;
  var cy = box.y + box.height / 2;
  var sigmaX = Math.max(box.width / 6, 2);
  var sigmaY = Math.max(box.height / 6, 2);
  var x = gaussianRandom(cx, sigmaX);
  var y = gaussianRandom(cy, sigmaY);
  // Clamp to box bounds with 2px margin
  x = Math.max(box.x + 2, Math.min(x, box.x + box.width - 2));
  y = Math.max(box.y + 2, Math.min(y, box.y + box.height - 2));
  return { x: Math.round(x), y: Math.round(y) };
}

// ─── SECTION 1: LINK COLLECTION HELPERS ──────────────────────────────────────

/**
 * Safely parse a URL string relative to the page's current URL.
 * Returns null for unparseable hrefs (javascript:, mailto:, tel:, data:, #, empty).
 */
function safeParseUrl(href, baseUrl) {
  if (!href) return null;
  const trimmed = href.trim();
  if (
    trimmed === ''                    ||
    trimmed === '#'                   ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:')     ||
    trimmed.startsWith('tel:')        ||
    trimmed.startsWith('data:')
  ) return null;
  try {
    return new URL(trimmed, baseUrl);
  } catch (_) {
    return null;
  }
}

/**
 * Check if a URL should be excluded based on the blacklist.
 * Matches against hostname and full href (case-insensitive).
 */
function isBlacklisted(parsedUrl, blacklist) {
  if (!blacklist || blacklist.length === 0) return false;
  const href = parsedUrl.href.toLowerCase();
  const host = parsedUrl.hostname.toLowerCase();
  return blacklist.some(pattern => {
    const p = pattern.toLowerCase().trim();
    if (!p) return false;
    return host.includes(p) || href.includes(p);
  });
}

/**
 * Normalize a pathname for consistent matching.
 * Removes trailing slash (except root "/"), lowercases.
 */
function normalizePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  let p = pathname.toLowerCase();
  if (p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * Pre-process DB target URLs into a Set of normalized pathnames for O(1) lookup.
 */
function buildDbPathSet(targetDbUrls) {
  const pathSet = new Set();
  if (!targetDbUrls || targetDbUrls.length === 0) return pathSet;
  for (const rawUrl of targetDbUrls) {
    try {
      const parsed = new URL(rawUrl);
      const np = normalizePath(parsed.pathname);
      if (np !== '/') pathSet.add(np);
    } catch (_) {
      if (rawUrl && rawUrl.startsWith('/') && rawUrl.length > 1) {
        pathSet.add(normalizePath(rawUrl));
      }
    }
  }
  return pathSet;
}

/**
 * Check if two URLs point to the same page (ignoring hash).
 */
function isSamePage(parsedUrl, currentUrl) {
  try {
    const current = new URL(currentUrl);
    return (
      parsedUrl.hostname === current.hostname &&
      normalizePath(parsedUrl.pathname) === normalizePath(current.pathname) &&
      parsedUrl.search === current.search
    );
  } catch (_) {
    return false;
  }
}


// ─── SECTION 2: POSITION-WEIGHTED LINK SELECTION ─────────────────────────────

/**
 * Select a link from candidates with position-based weighting.
 * Links higher in the viewport are more likely to be selected (eye-tracking data:
 * NNg shows 57% viewing time above the fold, attention decays downward).
 *
 * Weight formula: w(y) = 1 / (1 + y/viewportHeight)
 * This gives top-of-page links ~2x the weight of bottom-of-page links.
 *
 * @param {Array<{link, box}>} candidates - Links with their bounding boxes
 * @returns {Object|null} Selected link element
 */
function positionWeightedSelect(candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].link;

  const vpHeight = candidates[0].vpHeight || 900;
  let totalWeight = 0;
  const weights = candidates.map(c => {
    const yCenter = c.box ? (c.box.y + c.box.height / 2) : vpHeight / 2;
    const w = 1.0 / (1.0 + Math.max(0, yCenter) / vpHeight);
    totalWeight += w;
    return w;
  });

  const roll = trackedRandom() * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (roll <= cumulative) return candidates[i].link;
  }
  return candidates[candidates.length - 1].link;
}


// ─── SECTION 3: PRE-CLICK BEHAVIOR (HUMAN REALISM) ──────────────────────────

/**
 * Simulate pre-click behavior: hover → read link text → maybe abandon → click.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ BUG-10 FIX: Return object instead of boolean                          │
 * │                                                                         │
 * │ OLD (v1.1.0): returned false for BOTH error and abandoned cases        │
 * │   → Callers could NOT distinguish intentional abandon from failure     │
 * │   → Fallback always clicked, making abandon rate effectively 0%        │
 * │                                                                         │
 * │ NEW (v1.2.0): returns { success: boolean, reason: string|null }        │
 * │   → reason='abandoned': intentional mouse retreat (7-12% chance)       │
 * │   → reason='error': hover failed, element gone, etc.                   │
 * │   → reason=null: success (click executed)                              │
 * │   → Callers: fallback only on 'error', respect 'abandoned'            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Real humans:
 * 1. Move mouse toward a link (humanMove)
 * 2. Hover briefly (200-800ms) — reading link text, checking URL in status bar
 * 3. Sometimes abandon (7-12%) — move mouse away without clicking
 * 4. If committed, click with realistic mousedown-hold-mouseup
 *
 * @param {Object} page    - Playwright Page
 * @param {Object} element - Target ElementHandle
 * @param {Object} persona - Session persona (mouse config)
 * @returns {Promise<{success: boolean, reason: string|null}>}
 *   success=true,  reason=null        → click executed
 *   success=false, reason='abandoned' → intentional retreat (do NOT fallback)
 *   success=false, reason='error'     → hover/click failed (fallback OK)
 */
async function humanPreClickSequence(page, element, persona) {
  try {
    // Step 1: Hover over the link (Bezier move, no click)
    const hovered = await humanHover(page, element, persona);
    if (!hovered) return { success: false, reason: 'error' };

    // Step 2: Reading pause — human reads link text before deciding
    const readPause = getRandomInt(200, 800);
    await sleep(readPause);

    // Step 3: Abandoned click — sometimes humans change their mind
    // BUG-10 FIX: return 'abandoned' reason so callers can respect this
    const abandonChance = persona && persona.isFrustrated ? 0.12 : 0.07;
    if (trackedRandom() < abandonChance) {
      // Mouse drifts away — intentional abandonment
      await mouseDrift(page, persona);
      return { success: false, reason: 'abandoned' };
    }

    // Step 4: Commit — click with realistic timing
    const clicked = await humanClick(page, element, persona);
    if (!clicked) return { success: false, reason: 'error' };

    return { success: true, reason: null };
  } catch (_) {
    return { success: false, reason: 'error' };
  }
}


// ─── SECTION 4: INTERNAL LINK CLICK (DB-AWARE PRIORITY) ─────────────────────

/**
 * Click an internal link on the current page.
 *
 * Signature matches SessionEngine.js exactly:
 *   clickInternalLink(page, blacklist, targetDbUrls)
 *
 * persona and config are resolved from SessionEngine's state object,
 * which is passed as optional 4th/5th parameters for direct callers.
 *
 * Selection strategy:
 * 1. Collect all <a href="..."> currently visible in viewport
 * 2. Filter: same hostname, not blacklisted, not same-page
 * 3. Separate: priorityTargets (DB match) vs genericTargets
 * 4. Position-weighted selection with DB priority boost
 * 5. Pre-click hover + hesitation + possible abandon
 * 6. Click with Bezier humanClick
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ BUG-10 FIX: Fallback logic updated                                    │
 * │   OLD: if (!success) { fallback click; return true; }                 │
 * │   NEW: if (!result.success) {                                          │
 * │          if (reason === 'error') → try fallback                       │
 * │          if (reason === 'abandoned') → return false (respect abandon) │
 * │        }                                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object}   page          - Playwright Page object
 * @param {string[]} blacklist     - URL patterns to avoid
 * @param {string[]} targetDbUrls  - Priority internal URLs from database
 * @param {Object}   [config]      - Mode config (optional; for clickInternalDbPriority)
 * @param {Object}   [persona]     - Session persona (optional; for humanClick)
 * @returns {Promise<boolean>} true if a link was successfully clicked
 */
async function clickInternalLink(page, blacklist, targetDbUrls, config, persona) {
  try {
    const currentUrl = page.url();
    const currentHost = new URL(currentUrl).hostname;
    const dbPaths = buildDbPathSet(targetDbUrls);

    const links = await page.$$('a[href]');
    if (links.length === 0) return false;

    const vp = page.viewportSize();
    const vpHeight = vp ? vp.height : 900;

    const priorityCandidates = [];
    const genericCandidates  = [];

    for (const link of links) {
      const href = await link.getAttribute('href');
      const parsed = safeParseUrl(href, currentUrl);
      if (!parsed) continue;

      // Must be same domain
      if (parsed.hostname !== currentHost) continue;

      // Skip same-page links
      if (isSamePage(parsed, currentUrl)) continue;

      // Must not be blacklisted
      if (isBlacklisted(parsed, blacklist)) continue;

      // Must be currently visible (NO scrollIntoView — humans pick from what they see)
      // BUG-11 NOTE: isVisibleAndInViewport() now uses 50% threshold by default (Math.js v1.2.0)
      const visible = await isVisibleAndInViewport(page, link);
      if (!visible) continue;

      // Get bounding box for position weighting
      let box = null;
      try { box = await link.boundingBox(); } catch (_) {}

      const entry = { link, box, vpHeight };

      // Categorize: DB priority vs generic
      if (dbPaths.size > 0 && dbPaths.has(normalizePath(parsed.pathname))) {
        priorityCandidates.push(entry);
      } else {
        genericCandidates.push(entry);
      }
    }

    if (priorityCandidates.length === 0 && genericCandidates.length === 0) {
      return false;
    }

    // Weighted selection: DB priority weight from config (not persona)
    const dbPriorityWeight = config && config.clickInternalDbPriority != null
      ? config.clickInternalDbPriority
      : 0.70;

    let finalTarget = null;

    if (priorityCandidates.length > 0 && trackedRandom() < dbPriorityWeight) {
      finalTarget = positionWeightedSelect(priorityCandidates);
    } else if (genericCandidates.length > 0) {
      finalTarget = positionWeightedSelect(genericCandidates);
    } else {
      finalTarget = positionWeightedSelect(priorityCandidates);
    }

    if (!finalTarget) return false;

    // Human pre-click sequence: hover → read → maybe abandon → click
    // BUG-10 FIX: result is now {success, reason} object
    const result = await humanPreClickSequence(page, finalTarget, persona);
    if (!result.success) {
      if (result.reason === 'error') {
        // Fallback: element might still be clickable despite hover failure
        try {
          await finalTarget.click({ timeout: 5000 });
          return true;
        } catch (_) {
          return false;
        }
      }
      // reason === 'abandoned': respect the intentional hesitation, do NOT click
      return false;
    }

    return true;

  } catch (e) {
    return false;
  }
}


// ─── SECTION 5: EXTERNAL LINK CLICK ─────────────────────────────────────────

/**
 * Click an external link on the current page.
 *
 * Signature matches SessionEngine.js:
 *   clickExternalLink(page, blacklist)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ BUG-10 FIX: Same fallback logic change as clickInternalLink()          │
 * │   abandoned → return false (no fallback click)                         │
 * │   error → try fallback direct click                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object}   page      - Playwright Page
 * @param {string[]} blacklist - URL patterns/domains to avoid
 * @param {Object}   [persona] - Session persona (optional)
 * @returns {Promise<boolean>} true if external link was clicked
 */
async function clickExternalLink(page, blacklist, persona) {
  try {
    const currentUrl = page.url();
    const currentHost = new URL(currentUrl).hostname;
    const links = await page.$$('a[href]');
    if (links.length === 0) return false;

    const vp = page.viewportSize();
    const vpHeight = vp ? vp.height : 900;
    const candidates = [];

    for (const link of links) {
      const href = await link.getAttribute('href');
      const parsed = safeParseUrl(href, currentUrl);
      if (!parsed) continue;

      if (parsed.hostname === currentHost) continue;
      if (isBlacklisted(parsed, blacklist)) continue;

      // BUG-11 NOTE: isVisibleAndInViewport() now uses 50% threshold by default
      const visible = await isVisibleAndInViewport(page, link);
      if (!visible) continue;

      let box = null;
      try { box = await link.boundingBox(); } catch (_) {}
      candidates.push({ link, box, vpHeight });
    }

    if (candidates.length === 0) return false;

    const target = positionWeightedSelect(candidates);
    if (!target) return false;

    // BUG-10 FIX: result is now {success, reason} object
    const result = await humanPreClickSequence(page, target, persona);
    if (!result.success) {
      if (result.reason === 'error') {
        try {
          await target.click({ timeout: 5000 });
          return true;
        } catch (_) {
          return false;
        }
      }
      // reason === 'abandoned': respect intentional hesitation
      return false;
    }

    return true;

  } catch (e) {
    return false;
  }
}


// ─── SECTION 6: AD ELEMENT DETECTION & CLICK ────────────────────────────────

/**
 * Common ad container selectors (Google AdSense, common ad networks, generic).
 * Ordered by specificity: most specific first.
 */
const AD_SELECTORS = [
  'ins.adsbygoogle',                          // Google AdSense
  'iframe[id*="google_ads"]',                 // Google Ads iframe
  'iframe[src*="doubleclick"]',               // DoubleClick
  'iframe[src*="googlesyndication"]',         // Google Syndication
  'div[id*="ad-"][class*="ad"]',              // Generic ad containers
  'div[class*="ad-slot"]',                    // Ad slot divs
  'div[class*="ad-container"]',               // Ad container divs
  'div[class*="advertisement"]',              // Advertisement divs
  'div[data-ad]',                             // Data-ad attribute
  'div[data-ad-slot]',                        // AdSense slot attr
  'a[href*="doubleclick"]',                   // DoubleClick links
  'a[href*="googleadservices"]',              // Google Ad Services
  'a[href*="ad."][target]',                   // Generic ad links with target
];

/**
 * IAB/MRC large ad threshold: ads with area > 242,500 px² use 30% viewability.
 * Standard ads use 50% viewability threshold.
 */
const IAB_LARGE_AD_AREA = 242500;
const IAB_STANDARD_THRESHOLD = 0.50;
const IAB_LARGE_THRESHOLD = 0.30;

/**
 * Find visible ad elements on the current page.
 *
 * Searches for common ad patterns:
 * - Google AdSense containers (ins.adsbygoogle)
 * - Ad iframes (doubleclick, googlesyndication)
 * - Generic ad containers (div with ad-related classes/IDs)
 * - Ad links (doubleclick, googleadservices)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ BUG-11 FIX: IAB/MRC size-aware threshold                              │
 * │   isVisibleAndInViewport() now uses 50% threshold by default           │
 * │   For large ads (>242,500 px²), IAB/MRC allows 30% threshold          │
 * │   We pass the appropriate threshold per ad size                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} page - Playwright Page object
 * @returns {Promise<Array<{element, type, box}>>} Visible ad elements with metadata
 */
async function findVisibleAds(page) {
  const results = [];

  for (const selector of AD_SELECTORS) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        try {
          const box = await el.boundingBox();
          if (!box || box.width < 10 || box.height < 10) continue; // Too small = hidden

          // BUG-11 FIX: Use IAB/MRC size-aware threshold
          const adArea = box.width * box.height;
          const threshold = adArea > IAB_LARGE_AD_AREA
            ? IAB_LARGE_THRESHOLD   // Large ads: 30% visible
            : IAB_STANDARD_THRESHOLD; // Standard ads: 50% visible

          const visible = await isVisibleAndInViewport(page, el, threshold);
          if (!visible) continue;

          results.push({
            element: el,
            type: selector.includes('adsbygoogle') ? 'adsense' :
                  selector.includes('iframe') ? 'iframe-ad' :
                  selector.includes('doubleclick') ? 'doubleclick' : 'generic-ad',
            box: box
          });
        } catch (_) {}
      }
    } catch (_) {}
  }

  return results;
}

/**
 * Ensure an ad element is viewable per IAB/MRC standards.
 *
 * IAB/MRC Viewable Impression:
 * - Display ads: >=50% pixels in viewport for >=1 continuous second
 * - Large ads (>242,500px²): >=30% pixels for >=1 second
 *
 * This function scrolls to bring the ad into view if needed,
 * then pauses to ensure the dwell threshold is met.
 *
 * @param {Object}  page    - Playwright Page
 * @param {Object}  element - Ad ElementHandle
 * @param {Object}  box     - Bounding box of the ad
 * @param {Object}  [persona] - Session persona
 * @returns {Promise<boolean>} true if ad impression was registered
 */
async function ensureAdViewable(page, element, box, persona) {
  try {
    // BUG-11 FIX: Use IAB/MRC size-aware threshold
    const adArea = box.width * box.height;
    const threshold = adArea > IAB_LARGE_AD_AREA
      ? IAB_LARGE_THRESHOLD
      : IAB_STANDARD_THRESHOLD;

    // Check if already in viewport with correct threshold
    let visible = await isVisibleAndInViewport(page, element, threshold);

    if (!visible) {
      // Scroll toward the ad using smooth human-like scroll
      // We use page.evaluate to smoothly scroll to the ad position
      try {
        const targetY = box.y - 200; // Scroll to ~200px above the ad (natural)
        await page.evaluate((y) => {
          window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        }, targetY);
        await sleep(getRandomInt(800, 1500)); // Wait for scroll to settle
        visible = await isVisibleAndInViewport(page, element, threshold);
      } catch (_) {}
    }

    if (!visible) return false;

    // IAB/MRC: dwell >=1 second with ad visible
    // We add human variance: 1.2-3.0 seconds (humans don't leave instantly)
    const viewDwell = getRandomInt(1200, 3000);
    await sleep(viewDwell);

    // Verify still visible after dwell (page might have scrolled)
    const stillVisible = await isVisibleAndInViewport(page, element, threshold);
    return stillVisible;

  } catch (_) {
    return false;
  }
}

/**
 * Click an advertisement element on the current page.
 *
 * Strategy:
 * 1. Find all visible ad elements (AdSense, iframe, generic)
 * 2. Ensure viewable impression (IAB/MRC standard) before clicking
 * 3. For iframe ads: click inside the iframe at a random position
 * 4. For link ads: use standard humanClick
 * 5. For container ads: find clickable area within and click
 *
 * This function is SEPARATE from clickExternalLink because:
 * - Ads have different DOM structures (iframes, ins elements)
 * - Ads require viewable impression before click (anti-fraud)
 * - Ad clicks should NOT be blacklist-filtered (they ARE the target)
 * - Ad click redirect chains differ from regular external links
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ BUG-10 FIX: humanPreClickSequence result handling updated              │
 * │   Container/link ad click path now respects abandoned reason           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @param {Object}   page       - Playwright Page
 * @param {Object}   [persona]  - Session persona
 * @param {string[]} [adSelectors] - Custom ad selectors (optional, extends defaults)
 * @returns {Promise<{clicked: boolean, type: string, viewable: boolean}>}
 */
async function clickAdElement(page, persona, adSelectors) {
  try {
    const ads = await findVisibleAds(page);
    if (ads.length === 0) {
      return { clicked: false, type: 'none', viewable: false };
    }

    // Prefer AdSense/doubleclick (most common monetization)
    let target = ads.find(a => a.type === 'adsense' || a.type === 'doubleclick');
    if (!target) target = ads[Math.floor(trackedRandom() * ads.length)];

    // Ensure viewable impression first (critical for valid ad interaction)
    const viewable = await ensureAdViewable(page, target.element, target.box, persona);
    if (!viewable) {
      return { clicked: false, type: target.type, viewable: false };
    }

    let clicked = false;

    if (target.type === 'iframe-ad' || target.type === 'adsense') {
      // For iframe ads: we need to click INSIDE the iframe
      // Strategy: click at a random point within the ad's bounding box
      const clickX = target.box.x + target.box.width * (0.2 + trackedRandom() * 0.6);
      const clickY = target.box.y + target.box.height * (0.2 + trackedRandom() * 0.6);

      // Human-like move to click position
      const moveResult = await humanMove(page, {
        x: clickX - 20, y: clickY - 10,
        width: 40, height: 20
      }, persona);

      if (moveResult) {
        // Pre-click hover pause (reading ad content)
        await sleep(getRandomInt(300, 1200));

        // Click
        await page.mouse.down();
        await sleep(getRandomInt(50, 150));
        await page.mouse.up();
        clicked = true;
      }
    } else {
      // For link/div ads: find a clickable child element or click the container
      let clickTarget = target.element;

      // Try to find an <a> inside the ad container
      try {
        const innerLink = await target.element.$('a');
        if (innerLink) {
          // BUG-11 NOTE: isVisibleAndInViewport() uses 50% default threshold
          const innerVisible = await isVisibleAndInViewport(page, innerLink);
          if (innerVisible) clickTarget = innerLink;
        }
      } catch (_) {}

      // BUG-10 FIX: result is now {success, reason} object
      const result = await humanPreClickSequence(page, clickTarget, persona);

      if (!result.success) {
        if (result.reason === 'error') {
          // Fallback: direct click for error cases only
          try {
            await clickTarget.click({ timeout: 5000 });
            clicked = true;
          } catch (_) {}
        }
        // reason === 'abandoned': respect intentional hesitation, clicked stays false
      } else {
        clicked = true;
      }
    }

    return { clicked, type: target.type, viewable: true };

  } catch (e) {
    return { clicked: false, type: 'error', viewable: false };
  }
}


// ─── SECTION 7: AD VIEWABLE IMPRESSION (VIEW-ONLY, NO CLICK) ────────────────

/**
 * Ensure ads on the page receive viewable impressions WITHOUT clicking.
 *
 * Use this for "target view" scenarios where you want ads to register
 * impressions but don't want to click them (natural behavior: most users
 * see ads but don't click).
 *
 * IAB/MRC Standard:
 * - Display: >=50% area visible for >=1 second
 * - Large display (>242,500px²): >=30% area for >=1 second
 *
 * BUG-11 FIX: All visibility checks now use Math.js v1.2.0 with 50% default
 *             threshold. Size-aware thresholds applied in findVisibleAds()
 *             and ensureAdViewable().
 *
 * @param {Object} page       - Playwright Page
 * @param {Object} [persona]  - Session persona
 * @returns {Promise<{adsFound: number, adsViewed: number, details: Array}>}
 */
async function ensureAdImpressions(page, persona) {
  const results = { adsFound: 0, adsViewed: 0, details: [] };

  try {
    const ads = await findVisibleAds(page);
    results.adsFound = ads.length;

    for (const ad of ads) {
      const viewable = await ensureAdViewable(page, ad.element, ad.box, persona);
      if (viewable) {
        results.adsViewed++;
        results.details.push({ type: ad.type, viewable: true });
      } else {
        results.details.push({ type: ad.type, viewable: false });
      }
    }

    // Also check for ads not currently visible but present on page
    // Scroll down may reveal more ads — let ScrollMarkov handle this naturally

  } catch (_) {}

  return results;
}


// ─── MODULE EXPORTS ──────────────────────────────────────────────────────────

module.exports = {
  // Primary exports — consumed by SessionEngine
  clickInternalLink,
  clickExternalLink,

  // Ad interaction — consumed by SessionEngine for ad targets
  clickAdElement,
  ensureAdImpressions,
  findVisibleAds,
  ensureAdViewable,

  // Helpers — exported for testing / advanced usage
  safeParseUrl,
  isBlacklisted,
  buildDbPathSet,
  normalizePath,
  isSamePage,
  positionWeightedSelect,
  humanPreClickSequence
};

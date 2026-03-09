// ═══════════════════════════════════════════════════════════════════════════════
// HumanLike_MousePhysics.js v1.0.0 — Realistic Mouse Movement Engine (Layer 2)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ CHANGELOG                                                                │
// ├───────────────────────────────────────────────────────────────────────────┤
// │ v1.0.0 (2026-02-20 11:01 WIB)                                           │
// │   - Full rewrite of humanMove() from human_like.js v14.0                │
// │   - Fitts's Law movement time with ±46.4% Gaussian variance (Zheng)     │
// │   - Cubic Bezier path with persona-modified control points              │
// │   - 4-phase movement: approach → overshoot → correction → settle        │
// │   - Per-step hand tremor (Gaussian jitter σ from persona.mouse)         │
// │   - Velocity-adaptive step timing (faster mid-path, slower at ends)     │
// │   - Overshoot with Fitts-proportional distance + angular scatter        │
// │   - Micro-correction saccades after overshoot (1-3 sub-moves)           │
// │   - Mouse drift (idle wandering during reading pauses)                  │
// │   - Target zone randomization with 70% inner box preference             │
// │   - All randomness via trackedRandom() for entropy tracking             │
// │                                                                          │
// │ LAST HISTORY LOG:                                                        │
// │   human_like.js v14.0 humanMove() → DELETED → replaced by this file    │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ MATHEMATICAL FOUNDATIONS                                                  │
// ├───────────────────────────────────────────────────────────────────────────┤
// │                                                                          │
// │ 1. FITTS'S LAW (Zheng et al., UDel/ACM)                                  │
// │    MT = a + b × log₂(D/W + 1)                                           │
// │    With noise: MT_actual = MT × N(1.0, 0.464²)                          │
// │    Where:                                                                │
// │      a = persona.mouse.fittsA (default 100ms, modified by archetype)    │
// │      b = persona.mouse.fittsB (default 150ms, modified by archetype)    │
// │      D = Euclidean distance from current position to target center      │
// │      W = min(targetWidth, targetHeight) — effective target width         │
// │                                                                          │
// │ 2. BEZIER CURVE PATH (Cubic, 4 control points)                           │
// │    B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃                  │
// │    Where:                                                                │
// │      P₀ = current mouse position                                        │
// │      P₁ = randomized control (biased toward start, perpendicular)       │
// │      P₂ = randomized control (biased toward end, perpendicular)         │
// │      P₃ = target position (with inner-box randomization)                │
// │                                                                          │
// │ 3. VELOCITY PROFILE (Sine ease-in-out)                                   │
// │    v(t) = sin(π × t)  →  fast in middle, slow at endpoints              │
// │    step_delay(i) = baseDelay / max(0.3, v(t_i))                         │
// │    This produces the natural "accelerate then decelerate" pattern.       │
// │                                                                          │
// │ 4. HAND TREMOR (Gaussian noise per step)                                 │
// │    offset_x = N(0, σ²), offset_y = N(0, σ²)                            │
// │    σ = persona.mouse.jitterStd (default 1.5px, modified by archetype)   │
// │    Applied to each intermediate step, NOT to final position.             │
// │                                                                          │
// │ 5. OVERSHOOT MODEL                                                       │
// │    P(overshoot) = persona.mouse.overshootChance                         │
// │    overshoot_distance = Uniform(persona.mouse.overshootPxMin/Max)       │
// │    overshoot_angle = movement_angle + N(0, 15°) — mostly along path     │
// │    Correction: 1-3 sub-saccades back to true target                     │
// │                                                                          │
// │ 6. MOUSE DRIFT (idle wandering)                                          │
// │    When persona triggers mouseDrift:                                     │
// │      drift_x = N(0, 30²), drift_y = N(0, 20²) — horizontal bias       │
// │      drift_steps = Uniform(8, 20) — slow lazy movement                  │
// │      No target — just random wander near current position               │
// │                                                                          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// DEPENDENCIES:
//   HumanLike_Math.js: trackedRandom, gaussianRandom, clamp,
//                      cubicBezierPoint, fittsMovementTime,
//                      getRandomInt, sleep, getHumanDelay
//
// CONSUMERS:
//   HumanLike_MicroHabits.js (clickElement, hoverElement)
//   HumanLike_ScrollMarkov.js (mouse position before scroll)
//   HumanLike_SessionEngine.js (orchestrates all mouse actions)
//
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const {
    trackedRandom,
    gaussianRandom,
    clamp,
    cubicBezierPoint,
    fittsMovementTime,
    getRandomInt,
    sleep,
    getHumanDelay
} = require('./HumanLike_Math.js');


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: INTERNAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Module-level mouse position tracker.
 * Updated after every move operation.
 * Initialized to viewport center on first use.
 *
 * NOTE: This is per-process state. Each Node.js worker has its own copy.
 */
let _mousePos = { x: -1, y: -1 };

/**
 * Get current tracked mouse position.
 * If not initialized, returns viewport center estimate.
 *
 * @param {Object} page - Playwright Page object (for viewport size fallback)
 * @returns {{x: number, y: number}} Current mouse position
 */
function getMousePos(page) {
    if (_mousePos.x < 0) {
        const vp = page.viewportSize();
        if (vp) {
            _mousePos = { x: Math.round(vp.width * 0.4), y: Math.round(vp.height * 0.3) };
        } else {
            _mousePos = { x: 500, y: 300 };
        }
    }
    return { x: _mousePos.x, y: _mousePos.y };
}

/**
 * Reset mouse position tracker (call at session start).
 */
function resetMousePos() {
    _mousePos = { x: -1, y: -1 };
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: TARGET POINT CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate a random target point within an element's bounding box.
 * Uses 70/30 inner-zone preference: 70% of clicks land in the inner 70%
 * of the element, 30% in the outer margin. This matches real heatmap data
 * showing clicks cluster toward center of interactive elements.
 *
 * @param {Object} box - Bounding box {x, y, width, height}
 * @returns {{x: number, y: number}} Target point
 */
function calculateTargetPoint(box) {
    const useInner = trackedRandom() < 0.70;

    if (useInner) {
        // Inner 70% zone: margins = 15% on each side
        const mx = box.width * 0.15;
        const my = box.height * 0.15;
        return {
            x: box.x + mx + trackedRandom() * (box.width - 2 * mx),
            y: box.y + my + trackedRandom() * (box.height - 2 * my)
        };
    } else {
        // Full box (including edges)
        return {
            x: box.x + trackedRandom() * box.width,
            y: box.y + trackedRandom() * box.height
        };
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: BEZIER CONTROL POINT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate two Bezier control points for natural-looking mouse path.
 *
 * The control points are placed perpendicular to the start→end line,
 * creating a gentle curve. The perpendicular offset is proportional
 * to the movement distance (longer moves = bigger curves).
 *
 * Control point placement:
 *   P₁ at ~30% along the path, offset perpendicular by ±(D×0.1 to D×0.4)
 *   P₂ at ~70% along the path, offset perpendicular by ±(D×0.05 to D×0.2)
 *
 * This creates asymmetric curves that look more natural than symmetric ones.
 *
 * @param {{x:number,y:number}} start  - Start point (current mouse pos)
 * @param {{x:number,y:number}} end    - End point (target)
 * @param {Object}              persona - Session persona (optional, for directional bias)
 * @returns {{p1: {x,y}, p2: {x,y}}} Two control points
 */
function generateControlPoints(start, end, persona) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Perpendicular unit vector (rotated 90°)
    const perpX = dist > 0 ? -dy / dist : 0;
    const perpY = dist > 0 ? dx / dist : 0;

    // Control point 1: ~30% along path
    const t1 = 0.2 + trackedRandom() * 0.2; // 0.2 to 0.4
    const offset1 = dist * (0.1 + trackedRandom() * 0.3); // 10-40% of distance
    // P1-1 FIX: Persona-driven directional bias (right-hand tendency)
    // Real humans have directional preference based on handedness + target position
    const rightBias = persona ? (persona.mouse && persona.mouse.rightHandBias !== undefined ? persona.mouse.rightHandBias : 0.6) : 0.6;
    const sign1 = trackedRandom() < rightBias ? 1 : -1;

    const p1 = {
        x: start.x + dx * t1 + perpX * offset1 * sign1,
        y: start.y + dy * t1 + perpY * offset1 * sign1
    };

    // Control point 2: ~70% along path, smaller offset
    const t2 = 0.6 + trackedRandom() * 0.2; // 0.6 to 0.8
    const offset2 = dist * (0.05 + trackedRandom() * 0.15); // 5-20% of distance
    // P1-1 FIX: Slightly different bias for P2 — secondary control point tracks less strongly
    const sign2 = trackedRandom() < (rightBias * 0.8 + 0.1) ? 1 : -1;

    const p2 = {
        x: start.x + dx * t2 + perpX * offset2 * sign2,
        y: start.y + dy * t2 + perpY * offset2 * sign2
    };

    return { p1, p2 };
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: CORE MOUSE MOVEMENT (humanMove)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Move mouse to target bounding box with full human-like physics.
 *
 * 4-phase movement:
 *   Phase 1: Bezier curve approach (main path, ~80% of time)
 *   Phase 2: Overshoot past target (30% chance, persona-modified)
 *   Phase 3: Correction saccade(s) back to target (1-3 sub-moves)
 *   Phase 4: Settle with micro-tremor at final position
 *
 * Movement time derived from Fitts's Law with ±46.4% Gaussian variance.
 * Step timing follows sine velocity profile (fast middle, slow endpoints).
 * Per-step Gaussian hand tremor applied to intermediate positions.
 *
 * @param {Object} page     - Playwright Page object
 * @param {Object} box      - Target bounding box {x, y, width, height}
 * @param {Object} persona  - Session persona from generatePersona()
 * @returns {Promise<{x: number, y: number}|null>} Final mouse position, or null on error
 */
async function humanMove(page, box, persona) {
    try {
        if (!box || !box.width || !box.height) return null;

        const mouseParams = persona.mouse;
        const start = getMousePos(page);
        const target = calculateTargetPoint(box);

        // ─── Fitts's Law: calculate movement time ───
        const dx = target.x - start.x;
        const dy = target.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const effectiveWidth = Math.min(box.width, box.height);

        let idealTime = fittsMovementTime(
            distance, effectiveWidth,
            mouseParams.fittsA, mouseParams.fittsB
        );

        // Apply ±46.4% Gaussian variance (Zheng et al.)
        const varianceMul = clamp(gaussianRandom(1.0, 0.464), 0.3, 2.5);
        const totalTime = Math.round(idealTime * varianceMul);

        // ─── Step count from persona ───
        // P2-4 FIX: Scale step count with distance (Fitts's Law corollary)
        // Short moves (5px) should have fewer steps than long moves (500px)
        const distScale = Math.pow(Math.max(distance, 1) / 200, 0.5);
        const scaledMin = Math.max(3, Math.round(mouseParams.stepsMin * distScale));
        const scaledMax = Math.max(scaledMin + 2, Math.round(mouseParams.stepsMax * distScale));
        const steps = getRandomInt(scaledMin, scaledMax);

        // ─── Generate Bezier control points ───
        const { p1, p2 } = generateControlPoints(start, target, persona);

        // ─── Phase 1: Bezier approach ───
        const baseDelay = totalTime / steps;

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;

            // Bezier curve position
            const pos = cubicBezierPoint(start, p1, p2, target, t);

            // Sine velocity profile: delay = baseDelay / velocity(t)
            // P1-2 FIX: Stochastic velocity noise prevents ML clustering on sine profile
            const jitterScale = persona && persona.mouse ? (persona.mouse.jitterStd || 1.0) : 1.0;
            const velocity = Math.sin(Math.PI * t) * (1 + gaussianRandom(0, 0.08 * jitterScale));
            const stepDelay = Math.round(baseDelay / Math.max(0.3, velocity));

            // Hand tremor (Gaussian jitter, not on final step)
            let finalX = pos.x;
            let finalY = pos.y;
            if (i < steps) {
                finalX += gaussianRandom(0, mouseParams.jitterStd);
                finalY += gaussianRandom(0, mouseParams.jitterStd);
            }

            await page.mouse.move(
                Math.round(finalX),
                Math.round(finalY)
            );
            await sleep(clamp(stepDelay, mouseParams.stepDelayMin, mouseParams.stepDelayMax));
        }

        _mousePos = { x: Math.round(target.x), y: Math.round(target.y) };

        // ─── Phase 2: Overshoot (persona-controlled probability) ───
        if (trackedRandom() < mouseParams.overshootChance) {
            const overshootDist = getRandomInt(
                mouseParams.overshootPxMin || 5,
                mouseParams.overshootPxMax || 20
            );

            // Overshoot direction: mostly along movement vector + angular scatter
            const moveAngle = Math.atan2(dy, dx);
            const scatter = gaussianRandom(0, 15 * Math.PI / 180); // ±15° scatter
            const overshootAngle = moveAngle + scatter;

            const overshootX = Math.round(target.x + Math.cos(overshootAngle) * overshootDist);
            const overshootY = Math.round(target.y + Math.sin(overshootAngle) * overshootDist);

            // Move to overshoot point (fast, few steps)
            const overshootSteps = getRandomInt(3, 6);
            await page.mouse.move(overshootX, overshootY, { steps: overshootSteps });
            await sleep(getRandomInt(30, 80));

            // ─── Phase 3: Correction saccade(s) ───
            const corrections = getRandomInt(1, 3);
            for (let c = 0; c < corrections; c++) {
                const correctionNoise = c < corrections - 1 ? 2 : 0;
                const cx = Math.round(target.x + gaussianRandom(0, correctionNoise));
                const cy = Math.round(target.y + gaussianRandom(0, correctionNoise));
                await page.mouse.move(cx, cy, { steps: getRandomInt(2, 4) });
                if (c < corrections - 1) {
                    await sleep(getRandomInt(20, 50));
                }
            }

            _mousePos = { x: Math.round(target.x), y: Math.round(target.y) };
        }

        // ─── Phase 4: Settle (micro-tremor at rest) ───
        if (trackedRandom() < 0.40) {
            await sleep(getRandomInt(30, 80));
            const settleX = Math.round(target.x + gaussianRandom(0, 0.5));
            const settleY = Math.round(target.y + gaussianRandom(0, 0.5));
            await page.mouse.move(settleX, settleY);
            _mousePos = { x: settleX, y: settleY };
        }

        return _mousePos;

    } catch (e) {
        return null;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: MOUSE CLICK (with pre-move + click timing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Move to element then click with human-like timing.
 *
 * Sequence:
 *   1. humanMove() to target bounding box
 *   2. Pre-click dwell: 50-200ms (finger positioning on mouse button)
 *   3. Mouse down
 *   4. Hold duration: 50-150ms (realistic click hold, not instant)
 *   5. Mouse up
 *
 * @param {Object} page     - Playwright Page object
 * @param {Object} element  - Playwright ElementHandle
 * @param {Object} persona  - Session persona
 * @returns {Promise<boolean>} true if click succeeded
 */
async function humanClick(page, element, persona) {
    try {
        const box = await element.boundingBox();
        if (!box) return false;

        const result = await humanMove(page, box, persona);
        if (!result) return false;

        // Pre-click dwell (finger positioning)
        await sleep(getRandomInt(50, 200));

        // Realistic click: mousedown → hold → mouseup
        await page.mouse.down();
        await sleep(getRandomInt(50, 150));
        await page.mouse.up();

        return true;
    } catch (e) {
        return false;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: MOUSE HOVER (move without click)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Move to element and hover (no click).
 * Adds a brief pause after arriving to simulate visual inspection.
 *
 * @param {Object} page     - Playwright Page object
 * @param {Object} element  - Playwright ElementHandle
 * @param {Object} persona  - Session persona
 * @returns {Promise<boolean>} true if hover succeeded
 */
async function humanHover(page, element, persona) {
    try {
        const box = await element.boundingBox();
        if (!box) return false;

        const result = await humanMove(page, box, persona);
        if (!result) return false;

        // Hover dwell: visual inspection time
        await sleep(getRandomInt(300, 1200));

        return true;
    } catch (e) {
        return false;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: MOUSE DRIFT (idle wandering)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulate idle mouse drift during reading/thinking pauses.
 * The mouse wanders lazily near its current position.
 *
 * Drift pattern:
 *   - Horizontal bias (σx=30 > σy=20) — hand rests on mouse pad
 *   - Slow movement (8-20 steps)
 *   - No specific target
 *
 * @param {Object} page     - Playwright Page object
 * @param {Object} persona  - Session persona (unused but kept for API consistency)
 * @returns {Promise<void>}
 */
async function mouseDrift(page, persona) {
    try {
        const current = getMousePos(page);
        const vp = page.viewportSize() || { width: 1920, height: 1080 };

        // Gaussian drift with horizontal bias
        const driftX = clamp(
            Math.round(current.x + gaussianRandom(0, 30)),
            10, vp.width - 10
        );
        const driftY = clamp(
            Math.round(current.y + gaussianRandom(0, 20)),
            10, vp.height - 10
        );

        const steps = getRandomInt(8, 20);
        await page.mouse.move(driftX, driftY, { steps });

        _mousePos = { x: driftX, y: driftY };
    } catch (e) {
        // Drift is non-critical, silently ignore
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: RAGE CLICK (frustrated user rapid clicking)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulate rage clicking — rapid repeated clicks on or near same spot.
 * Only triggered when persona.isFrustrated is true.
 *
 * Pattern (Contentsquare definition): ≥3 clicks within ≤2 seconds.
 * We simulate 3-6 fast clicks with decreasing accuracy (frustration scatter).
 *
 * @param {Object} page     - Playwright Page object
 * @param {Object} persona  - Session persona
 * @returns {Promise<void>}
 */
async function rageClick(page, persona) {
    try {
        const current = getMousePos(page);
        const clickCount = getRandomInt(3, 6);

        for (let i = 0; i < clickCount; i++) {
            // Increasing scatter with each rage click
            const scatter = (i + 1) * 3;
            const cx = Math.round(current.x + gaussianRandom(0, scatter));
            const cy = Math.round(current.y + gaussianRandom(0, scatter));

            await page.mouse.click(cx, cy);
            await sleep(getRandomInt(80, 300)); // Fast but not instant
        }

        _mousePos = { x: current.x, y: current.y };
    } catch (e) {
        // Rage click is non-critical
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    humanMove,
    humanClick,
    humanHover,
    mouseDrift,
    rageClick,
    getMousePos,
    resetMousePos,
    calculateTargetPoint,
    generateControlPoints
};

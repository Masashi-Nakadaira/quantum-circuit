// ============================================================
// sim/gates_extra.js — Extended Gate Logic (CP, CRZ, CSWAP)
// ============================================================

import { cAdd, cMul, cAbs2 } from './complex.js';

/**
 * Apply extra gates that are not in the core simulator.
 * @param {[number, number][]} state State (mutable or copy? Core logic clones before calling apply)
 * @param {import('../model/circuit.js').Gate} gate
 * @param {number} numQubits
 * @returns {[number, number][]} New state
 */
export function applyExtraGate(state, gate, numQubits) {
    // Core simulator calls this if it doesn't recognize the gate type?
    // Or we explicitly call this for known extra types.

    // Check gate type
    if (gate.type === 'CP') {
        const phi = (gate.params && gate.params.phi !== undefined) ? gate.params.phi : 0;
        return applyControlledPhase(state, gate.controls[0], gate.targets[0], phi, numQubits);
    }
    if (gate.type === 'CRZ') {
        const theta = (gate.params && gate.params.theta !== undefined) ? gate.params.theta : 0;
        return applyControlledRz(state, gate.controls[0], gate.targets[0], theta, numQubits);
    }
    if (gate.type === 'CSWAP') {
        // CSWAP: Control is controls[0], Targets are targets[0], targets[1]
        // Spec: "CSWAP: Control — SWAP — SWAP"
        return applyControlledSwap(state, gate.controls[0], gate.targets[0], gate.targets[1], numQubits);
    }

    // Fallback: return state as is (should not happen if routed correctly)
    return state;
}

// ─── Implementations ──────────────────────────────────────

/**
 * Controlled-Phase (CP)
 * Apply Phase(phi) to target if control is 1.
 * Phase(phi) matrix: [[1, 0], [0, e^{i phi}]]
 * Effect: |11> -> e^{i phi} |11>, others unchanged.
 */
function applyControlledPhase(state, control, target, phi, numQubits) {
    const dim = 1 << numQubits;
    const newState = [...state];

    const ctrlBit = 1 << control;
    const targetBit = 1 << target;
    const checkMask = ctrlBit | targetBit;

    // Precompute e^{i phi}
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);

    for (let i = 0; i < dim; i++) {
        // Only affects state where BOTH control and target are 1
        if ((i & checkMask) === checkMask) {
            const [re, im] = state[i];
            // Multiply by (cos + i sin)
            // (a + bi)(c + di) = (ac - bd) + i(ad + bc)
            const newRe = re * cos - im * sin;
            const newIm = re * sin + im * cos;
            newState[i] = [newRe, newIm];
        }
    }
    return newState;
}

/**
 * Controlled-Rz (CRZ)
 * Apply Rz(theta) to target if control is 1.
 * Rz(theta) = [[e^{-i theta/2}, 0], [0, e^{i theta/2}]]
 */
function applyControlledRz(state, control, target, theta, numQubits) {
    const dim = 1 << numQubits;
    const newState = [...state];

    const ctrlBit = 1 << control;
    const targetBit = 1 << target;

    const half = theta / 2;
    const cos = Math.cos(half);
    const sin = Math.sin(half);

    // e^{-i half} = cos - i sin
    // e^{i half}  = cos + i sin

    for (let i = 0; i < dim; i++) {
        // Only if control is 1
        if ((i & ctrlBit) !== 0) {
            const [re, im] = state[i];

            if ((i & targetBit) === 0) {
                // Target is 0 -> multiply by e^{-i theta/2}
                // (re + i im)(cos - i sin) = (re cos + im sin) + i(im cos - re sin)
                newState[i] = [
                    re * cos + im * sin,
                    im * cos - re * sin
                ];
            } else {
                // Target is 1 -> multiply by e^{i theta/2}
                // (re + i im)(cos + i sin) = (re cos - im sin) + i(im cos + re sin)
                newState[i] = [
                    re * cos - im * sin,
                    im * cos + re * sin
                ];
            }
        }
    }
    return newState;
}

/**
 * CSWAP (Fredkin)
 * Swap target1 and target2 if control is 1.
 */
function applyControlledSwap(state, control, t1, t2, numQubits) {
    const dim = 1 << numQubits;
    const newState = [...state];

    const ctrlBit = 1 << control;
    const b1 = 1 << t1;
    const b2 = 1 << t2;

    for (let i = 0; i < dim; i++) {
        // Check control is 1
        if ((i & ctrlBit) !== 0) {
            // Check if t1 and t2 bits differ (01 vs 10)
            if ((i & b1) === 0 && (i & b2) !== 0) {
                // i has t1=0, t2=1. We need to swap with j having t1=1, t2=0
                const j = (i | b1) & ~b2;

                // Swap amplitudes
                const temp = newState[i];
                newState[i] = newState[j];
                newState[j] = temp;
            }
            // If bits are same (00 or 11), loop will hit them but no swap needed,
            // or we already swapped the pair when we hit the lower index.
            // Wait, we iterate 0..dim.
            // When we hit i (01), we swap with j (10).
            // Later we hit j (10), we see it's (10), so we look for (01) aka i.
            // If we swap again, we undo!!
            // FIX: Only swap if i < j.
        }
    }

    // Correct loop for swap:
    // Iterate 0 to dim. If (i & ctrl) && (t1 != t2) && (i < swap_target)...
    // Or just re-implement cleaner loop.

    // Reset newState to correct logic
    // Actually, simply iterating and swapping IN PLACE is dangerous if we don't track visited.
    // But we are writing to `newState`? No, `newState` is initialized with copy of `state`.
    // If we swap `newState[i]` and `newState[j]`, later when loop reaches `j`, it will swap back `newState[j]` with `newState[i]`.
    // Result: No change.

    // We must process pairs.
    const processed = new Uint8Array(dim); // 0 or 1

    for (let i = 0; i < dim; i++) {
        if (processed[i]) continue;

        if ((i & ctrlBit) !== 0) {
            const val1 = (i & b1) !== 0;
            const val2 = (i & b2) !== 0;

            if (val1 !== val2) {
                // Find pair j
                // Flip bits b1 and b2
                const j = i ^ b1 ^ b2;

                // Swap execution
                const temp = newState[i];
                newState[i] = newState[j];
                newState[j] = temp;

                processed[i] = 1;
                processed[j] = 1;
            }
        }
    }
    return newState;
}

/**
 * Register extra gates helper
 */
export const EXTRA_GATES = ['CP', 'CRZ', 'CSWAP'];

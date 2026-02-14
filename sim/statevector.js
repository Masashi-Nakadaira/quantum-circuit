// ============================================================
// sim/statevector.js — Statevector Simulation Engine
// ============================================================

import { cAdd, cMul, cAbs2, SeededRNG } from './complex.js';
import { SimulationStep } from '../model/circuit.js';
import { applyExtraGate } from './gates_extra.js';

// ─── Constants ─────────────────────────────────────────────

const INV_SQRT2 = Math.SQRT1_2;

/** @type {{[key: string]: [number, number][][]}} 1-qubit gate matrices (2x2) */
const GATE_MATRICES = {
    I: [[[1, 0], [0, 0]], [[0, 0], [1, 0]]],
    X: [[[0, 0], [1, 0]], [[1, 0], [0, 0]]],
    Y: [[[0, 0], [0, -1]], [[0, 1], [0, 0]]],
    Z: [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]],
    H: [
        [[INV_SQRT2, 0], [INV_SQRT2, 0]],
        [[INV_SQRT2, 0], [-INV_SQRT2, 0]]
    ],
    S: [[[1, 0], [0, 0]], [[0, 0], [0, 1]]],
    T: [[[1, 0], [0, 0]], [[0, 0], [INV_SQRT2, INV_SQRT2]]],
};

// ─── Simulation Engine ─────────────────────────────────────

export class QuantumEngine {
    constructor() {
        this.seed = 42; // default seed
    }

    /**
     * Run full simulation of the circuit.
     * @param {import('../model/circuit.js').Circuit} circuit
     * @param {import('../model/circuit.js').InputState} inputState
     * @param {'probability'|'shot'} measureMode
     * @returns {SimulationStep[]} history of steps
     */
    simulate(circuit, inputState, measureMode = 'probability') {
        const numQubits = circuit.numQubits;
        let state = inputState.toStateVector(); // Initial state
        const history = [];

        // RNG for this run
        const rng = new SeededRNG(Math.floor(Math.random() * 100000));

        // Initial state step (-1)
        history.push(new SimulationStep(-1, this._cloneState(state), []));

        for (let col = 0; col < circuit.numCols; col++) {
            const gates = circuit.getGatesAtCol(col);

            // 1. Apply unitary gates
            const unitaries = gates.filter(g => g.type !== 'Measure');
            if (unitaries.length > 0) {
                state = this._applyColumnGates(state, unitaries, numQubits);
            }

            // 2. Process measurements
            const measures = gates.filter(g => g.type === 'Measure');
            let measurementResult = null;

            if (measures.length > 0) {
                measurementResult = this._processMeasurements(state, measures, numQubits, measureMode, rng);
                // In 'shot' mode, the state collapses
                if (measureMode === 'shot' && measurementResult.nextState) {
                    state = measurementResult.nextState;
                }
            }

            history.push(new SimulationStep(
                col,
                this._cloneState(state),
                gates,
                measurementResult ? {
                    probabilities: measurementResult.probabilities,
                    outcomes: measurementResult.outcomes,
                    measuredIndices: measurementResult.measuredIndices
                } : null
            ));
        }

        return history;
    }

    /**
     * Run multiple shots for histogram.
     * Based on the FINAL state of the circuit (in probability mode logic).
     * @param {import('../model/circuit.js').Circuit} circuit
     * @param {import('../model/circuit.js').InputState} inputState
     * @param {number} shots
     * @returns {{[basis: string]: number}} counts
     */
    runShots(circuit, inputState, shots) {
        // 1. Simulate to get final state vector (ignoring collapse, using probability mode is easiest to get final wavefunction)
        const steps = this.simulate(circuit, inputState, 'probability');
        const finalStep = steps[steps.length - 1];
        const finalState = finalStep.stateVector;
        const numQubits = circuit.numQubits;

        // 2. Determine measured qubits (mask)
        // Actually, usually "Run Shots" implies measuring ALL qubits at the end, 
        // OR respecting the Measure gates placed in the circuit.
        // Specification says: "Measurement gate M を置いた位置で測定を実行... 現在の測定対象（Mゲートがある最終到達状態 or 全体状態の終端）に対して..."
        // If no Measure gates, we measure everything at the end (standard simulator behavior).
        // If Measure gates exist, we strictly respect them? 
        // A simplified approach for MVP: "Run Shots" samples from the final state vector of the simulation.
        // Ideally we should care about which qubits were measured, but for a simple view, measuring the final wavefunction is standard.

        const counts = {};
        const rng = new SeededRNG(this.seed); // Reproducible for "Run Shots" if seed is fixed in UI

        // Calculate probabilities of all basis states
        const dim = 1 << numQubits;
        const probs = new Float64Array(dim);
        for (let i = 0; i < dim; i++) {
            probs[i] = cAbs2(finalState[i][0], finalState[i][1]);
        }

        // Sampling
        for (let s = 0; s < shots; s++) {
            let r = rng.next();
            let cumulative = 0;
            let outcome = dim - 1;
            for (let i = 0; i < dim; i++) {
                cumulative += probs[i];
                if (r < cumulative) {
                    outcome = i;
                    break;
                }
            }
            const bin = outcome.toString(2).padStart(numQubits, '0');
            counts[bin] = (counts[bin] || 0) + 1;
        }

        return counts;
    }

    // ─── Internal Helpers ──────────────────────────────────────

    _cloneState(state) {
        return state.map(c => [c[0], c[1]]);
    }

    /**
     * Apply all unitary gates in a column.
     * Since they touch disjoint wires (validated), order doesn't matter.
     * @param {[number,number][]} state
     * @param {import('../model/circuit.js').Gate[]} gates
     * @param {number} numQubits
     */
    _applyColumnGates(state, gates, numQubits) {
        let nextState = this._cloneState(state);

        for (const gate of gates) {
            if (gate.type === 'SWAP') {
                nextState = this._applySWAP(nextState, gate.targets[0], gate.targets[1], numQubits);
            } else if (['CX', 'CNOT', 'CZ'].includes(gate.type)) {
                nextState = this._applyControlledGate(nextState, gate, numQubits);
            } else if (['Rx', 'Ry', 'Rz'].includes(gate.type)) {
                nextState = this._applyRotationGate(nextState, gate, numQubits);
            } else {
                // Standard single qubit gate
                const mat = GATE_MATRICES[gate.type];
                if (mat) {
                    nextState = this._applySingleGate(nextState, mat, gate.targets[0], numQubits);
                } else {
                    // Try extra gates
                    nextState = applyExtraGate(nextState, gate, numQubits);
                }
            }
        }
        return nextState;
    }

    // --- Single Qubit Gate ---
    _applySingleGate(state, matrix, targetQubit, numQubits) {
        const dim = 1 << numQubits;
        const newState = new Array(dim);
        // Optimization: iterate over pairs of indices where bit targetQubit is 0 and 1
        const bit = 1 << targetQubit;

        for (let i = 0; i < dim; i++) {
            if ((i & bit) === 0) {
                const i0 = i;
                const i1 = i | bit;

                const [a0r, a0i] = state[i0];
                const [a1r, a1i] = state[i1];

                // M * [a0, a1]^T
                // Res0 = M00*a0 + M01*a1
                // Res0 = M00*a0 + M01*a1
                const m00 = cMul(matrix[0][0][0], matrix[0][0][1], a0r, a0i);
                const m01 = cMul(matrix[0][1][0], matrix[0][1][1], a1r, a1i);
                const r0 = cAdd(m00[0], m00[1], m01[0], m01[1]);

                // Res1 = M10*a0 + M11*a1
                const m10 = cMul(matrix[1][0][0], matrix[1][0][1], a0r, a0i);
                const m11 = cMul(matrix[1][1][0], matrix[1][1][1], a1r, a1i);
                const r1 = cAdd(m10[0], m10[1], m11[0], m11[1]);

                newState[i0] = r0;
                newState[i1] = r1;
            }
        }
        return newState;
    }

    // --- Rotation Gates ---
    _applyRotationGate(state, gate, numQubits) {
        const theta = gate.params.theta || 0;
        const half = theta / 2;
        const cos = Math.cos(half);
        const sin = Math.sin(half);

        let matrix;
        if (gate.type === 'Rx') {
            // [[cos, -i*sin], [-i*sin, cos]]
            matrix = [
                [[cos, 0], [0, -sin]],
                [[0, -sin], [cos, 0]]
            ];
        } else if (gate.type === 'Ry') {
            // [[cos, -sin], [sin, cos]]
            matrix = [
                [[cos, 0], [-sin, 0]],
                [[sin, 0], [cos, 0]]
            ];
        } else if (gate.type === 'Rz') {
            // [[e^-i(t/2), 0], [0, e^i(t/2)]]
            // e^-ix = cos(x) - i sin(x)
            matrix = [
                [[Math.cos(-half), Math.sin(-half)], [0, 0]],
                [[0, 0], [Math.cos(half), Math.sin(half)]]
            ];
        }
        return this._applySingleGate(state, matrix, gate.targets[0], numQubits);
    }

    // --- Controlled Gate (CNOT, CZ) ---
    // --- Controlled Gate (CX, CZ, etc.) ---
    _applyControlledGate(state, gate, numQubits) {
        // Generic multi-control support
        // gate.controls is array of qubit indices
        const controls = gate.controls || [];
        const target = gate.targets[0];
        const dim = 1 << numQubits;
        const newState = [...state];

        // Precompute mask for controls
        let controlMask = 0;
        for (const c of controls) controlMask |= (1 << c);

        const targetBit = 1 << target;

        // Apply operation only where ALL control bits are 1
        for (let i = 0; i < dim; i++) {
            if ((i & controlMask) === controlMask) {
                // If target bit is 0, we might swap with target=1 (CX) or apply phase (CZ)
                if ((i & targetBit) === 0) {
                    const i0 = i;
                    const i1 = i | targetBit;

                    if (gate.type === 'CX' || gate.type === 'CNOT') {
                        // Swap amplitudes of |...0...> and |...1...>
                        const temp = newState[i0];
                        newState[i0] = newState[i1];
                        newState[i1] = temp;
                    } else if (gate.type === 'CZ') {
                        // CZ applies Z to target if target is 1
                        // Z|1> = -|1>
                        newState[i1] = [-newState[i1][0], -newState[i1][1]];
                    }
                }
            }
        }
        return newState;
    }

    // --- SWAP ---
    _applySWAP(state, q1, q2, numQubits) {
        const dim = 1 << numQubits;
        const newState = [...state];
        const b1 = 1 << q1;
        const b2 = 1 << q2;

        for (let i = 0; i < dim; i++) {
            // We only need to swap states where bit q1 != bit q2
            // e.g. |01> swaps with |10>
            // Check if q1 is 0 and q2 is 1
            if ((i & b1) === 0 && (i & b2) !== 0) {
                const j = (i | b1) & ~b2; // The corresponding state (q1=1, q2=0)
                const temp = newState[i];
                newState[i] = newState[j];
                newState[j] = temp;
            }
        }
        return newState;
    }

    // --- Measurements ---
    _processMeasurements(state, measures, numQubits, measureMode, rng) {
        const measuredIndices = measures.map(g => g.targets[0]);
        // For now, assume measurement in computational basis Z.
        // Calculate probabilities for each basis state to collapse or just display.

        // Calculate marginal probabilities for the measured qubits could be complex.
        // Instead, we calculate the probability of each basis state.
        const dim = 1 << numQubits;
        const probs = {}; // key: string "00", value: probability

        // We want the probability of observing outcome 'x' on the MEASURED qubits.
        // Map outcome (e.g. 0 or 1 for single qubit) to probability.
        // If measuring multiple, e.g. q0 and q1. Outcomes "00", "01", "10", "11".

        // But first, let's just return the full state probabilities for display in "probability" mode
        // because that's what the UI usually shows (probabilities of the full basis).
        // The "Probability" Mode in specification says:
        // "State vector is kept, probability distribution calculated".

        const fullStateProbs = {};
        for (let i = 0; i < dim; i++) {
            const label = i.toString(2).padStart(numQubits, '0');
            fullStateProbs[label] = cAbs2(state[i][0], state[i][1]);
        }

        if (measureMode === 'probability') {
            return {
                probabilities: fullStateProbs,
                measuredIndices: measuredIndices, // Return indices for marginal calculation
                nextState: null // state doesn't collapse
            };
        }

        // Single Shot Mode
        // 1. Pick an outcome based on global probability distribution
        let r = rng.next();
        let cumulative = 0;
        let outcome = dim - 1;

        for (let i = 0; i < dim; i++) {
            cumulative += (fullStateProbs[i.toString(2).padStart(numQubits, '0')] || 0);
            if (r < cumulative) {
                outcome = i;
                break;
            }
        }

        const label = outcome.toString(2).padStart(numQubits, '0');

        // 2. Collapse state
        // In strict Quantum Mechanics, if we measure subset of qubits, the others remain in superposition.
        // If we assume "Single Shot" means "Sampling the whole system final state", then the state becomes |outcome>.
        // However, if we measure only q0, then q0 collapses, q1 might stay superpositioned.
        // The spec says: "1回測定して射影（収縮）し、その後の状態は射影後を引き継ぐ"
        // AND "Measurement gate M located at...".
        // So we should collapse ONLY the measured qubits.

        // Let's implement partial collapse.
        // Determine the bit values of the "outcome" state for the measured qubits.
        // outcome integer `outcome` has the bits for ALL qubits.
        // We can use this `outcome` to enforce the values on the measured qubits.

        const newState = new Array(dim).fill([0, 0]);
        let norm = 0;

        // We keep only basis states that match the measured bits of `outcome`.
        // Actually, `outcome` was picked from the full joint distribution, so it is a specific basis state |x>.
        // If we only measure q0, and outcome was |01> (q1=0, q0=1), does q1 collapse to 0?
        // No.
        // We need to sample only the measured qubits' marginal distribution?
        // OR, we can just pick a global outcome |x> and collapse to the subspace compatible with measured bits of |x>.

        // Correct approach for partial collapse:
        // 1. Calculate P(outcome_subspace) for all possible outcomes of measured qubits.
        // 2. Sample one outcome for the measured subset.
        // 3. Project state to that subspace and normalize.

        // Let's deduce the Measured Outcome from the globally sampled `outcome`.
        // This is statistically valid. `outcome` index `i` was picked with Prob(i).
        // The implied value for measured qubits is consistent with their marginals.

        let nextState = new Array(dim).fill([0, 0]);
        let keptNormSq = 0;

        // Filter condition: basis `j` must match `outcome` on all measured bits.
        const checkMask = measuredIndices.reduce((acc, q) => acc | (1 << q), 0);
        const targetBits = outcome & checkMask;

        for (let i = 0; i < dim; i++) {
            if ((i & checkMask) === targetBits) {
                nextState[i] = state[i];
                keptNormSq += cAbs2(state[i][0], state[i][1]);
            } else {
                nextState[i] = [0, 0];
            }
        }

        // Normalize
        const scale = 1 / Math.sqrt(keptNormSq || 1);
        nextState = nextState.map(c => [c[0] * scale, c[1] * scale]);

        return {
            probabilities: fullStateProbs, // Or strictly should be the distribution of the result?
            // UI expects probabilities to display. Usually "Probability of measured result".
            // But the previous implementation showed the full distribution. Let's stick to full distribution for info.
            measuredIndices: measuredIndices,
            nextState: nextState
        };
    }
}

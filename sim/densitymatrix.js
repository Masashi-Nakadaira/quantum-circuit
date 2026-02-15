// ============================================================
// sim/densitymatrix.js — Density Matrix Simulation Engine
// ============================================================

import { cAdd, cMul, cConj, cAbs2 } from './complex.js';

/**
 * Density Matrix (rho) is represented as a 2D array: dim x dim.
 * Each element is [re, im].
 */

export class DensityMatrixEngine {
    /**
     * @param {number} numQubits
     * @param {[number, number][]} initialVector - pure state vector
     */
    static fromPureState(numQubits, vec) {
        const dim = 1 << numQubits;
        const rho = Array.from({ length: dim }, () => Array.from({ length: dim }, () => [0, 0]));

        for (let i = 0; i < dim; i++) {
            for (let j = 0; j < dim; j++) {
                // rho_ij = state[i] * conj(state[j])
                rho[i][j] = cMul(vec[i][0], vec[i][1], vec[j][0], -vec[j][1]);
            }
        }
        return rho;
    }

    /**
     * Create a mixed state from ensembles: sum p_k |psi_k><psi_k|
     * @param {number} numQubits
     * @param {Array<{prob: number, vector: [number, number][]}>} ensemble
     */
    static fromEnsemble(numQubits, ensemble) {
        const dim = 1 << numQubits;
        const rho = Array.from({ length: dim }, () => Array.from({ length: dim }, () => [0, 0]));

        for (const item of ensemble) {
            const pure = this.fromPureState(numQubits, item.vector);
            for (let i = 0; i < dim; i++) {
                for (let j = 0; j < dim; j++) {
                    rho[i][j] = [
                        rho[i][j][0] + pure[i][j][0] * item.prob,
                        rho[i][j][1] + pure[i][j][1] * item.prob
                    ];
                }
            }
        }
        return rho;
    }

    /**
     * Apply a single-qubit gate U: rho' = U rho U†
     */
    static applySingleGate(rho, matrix, target, numQubits) {
        const dim = 1 << numQubits;
        const nextRho = Array.from({ length: dim }, () => Array.from({ length: dim }, () => [0, 0]));
        const bit = 1 << target;

        // rho' = U * rho * U_dag
        // Temporary: compute U * rho first
        const uRho = Array.from({ length: dim }, () => Array.from({ length: dim }, () => [0, 0]));

        for (let j = 0; j < dim; j++) {
            for (let i = 0; i < dim; i++) {
                if ((i & bit) === 0) {
                    const i0 = i;
                    const i1 = i | bit;

                    const a0 = rho[i0][j];
                    const a1 = rho[i1][j];

                    // uRho[i0][j] = m00*a0 + m01*a1
                    const m00 = cMul(matrix[0][0][0], matrix[0][0][1], a0[0], a0[1]);
                    const m01 = cMul(matrix[0][1][0], matrix[0][1][1], a1[0], a1[1]);
                    uRho[i0][j] = [m00[0] + m01[0], m00[1] + m01[1]];

                    // uRho[i1][j] = m10*a0 + m11*a1
                    const m10 = cMul(matrix[1][0][0], matrix[1][0][1], a0[0], a0[1]);
                    const m11 = cMul(matrix[1][1][0], matrix[1][1][1], a1[0], a1[1]);
                    uRho[i1][j] = [m10[0] + m11[0], m10[1] + m11[1]];
                }
            }
        }

        // nextRho = uRho * U_dag
        for (let i = 0; i < dim; i++) {
            for (let j = 0; j < dim; j++) {
                if ((j & bit) === 0) {
                    const j0 = j;
                    const j1 = j | bit;

                    const a0 = uRho[i][j0];
                    const a1 = uRho[i][j1];

                    // U_dag elements: m00*, m10*, m01*, m11*
                    const m00c = [matrix[0][0][0], -matrix[0][0][1]];
                    const m01c = [matrix[0][1][0], -matrix[0][1][1]];
                    const m10c = [matrix[1][0][0], -matrix[1][0][1]];
                    const m11c = [matrix[1][1][0], -matrix[1][1][1]];

                    // nextRho[i][j0] = a0 * m00c + a1 * m01c
                    const r00 = cMul(a0[0], a0[1], m00c[0], m00c[1]);
                    const r01 = cMul(a1[0], a1[1], m01c[0], m01c[1]);
                    nextRho[i][j0] = [r00[0] + r01[0], r00[1] + r01[1]];

                    // nextRho[i][j1] = a0 * m10c + a1 * m11c
                    const r10 = cMul(a0[0], a0[1], m10c[0], m10c[1]);
                    const r11 = cMul(a1[0], a1[1], m11c[0], m11c[1]);
                    nextRho[i][j1] = [r10[0] + r11[0], r10[1] + r11[1]];
                }
            }
        }
        return nextRho;
    }

    /**
     * Get probabilities of |1> for a qubit: Trace(P1 * rho)
     */
    static getQubitProbabilities(rho, target, numQubits) {
        const dim = 1 << numQubits;
        const bit = 1 << target;
        let prob1 = 0;
        for (let i = 0; i < dim; i++) {
            if ((i & bit) !== 0) {
                // rho[i][i] is the probability of basis state i
                prob1 += rho[i][i][0];
            }
        }
        return prob1;
    }
}

// ============================================================
// sim/fraction.js — Symbolic Fraction Representation
// ============================================================
//
// Provides exact symbolic display for quantum-relevant values
// (e.g. 1/sqrt(2), sqrt(3)/2).  The simulation engine continues
// to use IEEE 754 floats internally; this module is display-only.

/**
 * Represents a real value symbolically as:
 *   sign * numerator * sqrt(sqrtArg) / denominator   (invSqrt = false)
 * or
 *   sign * numerator / (denominator * sqrt(sqrtArg))  (invSqrt = true)
 */
export class SymbolicValue {
    /**
     * @param {1|-1} sign
     * @param {number} numerator   positive integer
     * @param {number} denominator positive integer
     * @param {number} sqrtArg    integer under sqrt (1 = no sqrt)
     * @param {boolean} invSqrt   true ⇒ sqrt is in denominator
     */
    constructor(sign, numerator, denominator, sqrtArg = 1, invSqrt = false) {
        this.sign = sign;
        this.num = numerator;
        this.den = denominator;
        this.sqrtArg = sqrtArg;
        this.invSqrt = invSqrt;
    }

    /** Convert to IEEE 754 float. */
    toFloat() {
        let val = this.sign * this.num / this.den;
        if (this.invSqrt) {
            val /= Math.sqrt(this.sqrtArg);
        } else if (this.sqrtArg > 1) {
            val *= Math.sqrt(this.sqrtArg);
        }
        return val;
    }

    /** Return a LaTeX string for this value. */
    toTeX() {
        if (this.num === 0) return '0';

        const s = this.sign < 0 ? '-' : '';

        // Build numerator / denominator strings
        let numStr, denStr;

        if (this.invSqrt) {
            // sign * num / (den * sqrt(sqrtArg))
            numStr = this.num === 1 ? '1' : String(this.num);
            if (this.den === 1) {
                denStr = `\\sqrt{${this.sqrtArg}}`;
            } else {
                denStr = `${this.den}\\sqrt{${this.sqrtArg}}`;
            }
        } else if (this.sqrtArg > 1) {
            // sign * num * sqrt(sqrtArg) / den
            numStr = this.num === 1
                ? `\\sqrt{${this.sqrtArg}}`
                : `${this.num}\\sqrt{${this.sqrtArg}}`;
            denStr = this.den === 1 ? null : String(this.den);
        } else {
            // sign * num / den  (no sqrt)
            numStr = String(this.num);
            denStr = this.den === 1 ? null : String(this.den);
        }

        if (denStr) {
            return `${s}\\frac{${numStr}}{${denStr}}`;
        }
        return `${s}${numStr}`;
    }

    // ─── Pattern-match float → symbolic ───────────────────

    /**
     * Attempt to recognise a floating-point value as a known
     * quantum-relevant exact fraction.
     *
     * @param {number} value
     * @param {number} tol  tolerance for matching
     * @returns {SymbolicValue|null}  null if no pattern matched
     */
    static fromFloat(value, tol = 1e-6) {
        const av = Math.abs(value);
        const sign = value < -tol ? -1 : 1;
        if (av < tol) return new SymbolicValue(1, 0, 1);

        // Table of known values: [absFloat, num, den, sqrtArg, invSqrt]
        const table = [
            [1,                  1, 1, 1, false],       // 1
            [0.5,                1, 2, 1, false],       // 1/2
            [Math.SQRT1_2,       1, 1, 2, true],        // 1/sqrt(2)
            [Math.sqrt(3) / 2,   1, 2, 3, false],       // sqrt(3)/2  ≈ 0.866
            [1 / Math.sqrt(3),   1, 1, 3, true],        // 1/sqrt(3)  ≈ 0.577
            [1 / (2 * Math.SQRT2), 1, 2, 2, true],     // 1/(2*sqrt(2)) ≈ 0.354
            [Math.SQRT2,         1, 1, 2, false],       // sqrt(2) ≈ 1.414
            [Math.sqrt(3),       1, 1, 3, false],       // sqrt(3) ≈ 1.732
            [0.25,               1, 4, 1, false],       // 1/4
            [0.75,               3, 4, 1, false],       // 3/4
            [1 / 3,              1, 3, 1, false],       // 1/3
            [2 / 3,              2, 3, 1, false],       // 2/3
            [Math.sqrt(2) / 4,   1, 4, 2, false],      // sqrt(2)/4  ≈ 0.354  (same as 1/(2sqrt2))
            [Math.sqrt(3) / 3,   1, 1, 3, true],       // sqrt(3)/3 = 1/sqrt(3)
            [Math.sqrt(6) / 4,   1, 4, 6, false],      // sqrt(6)/4  ≈ 0.612
            [Math.sqrt(6) / 6,   1, 6, 6, false],      // sqrt(6)/6  ≈ 0.408  = 1/sqrt(6)
            [1 / Math.sqrt(6),   1, 1, 6, true],       // 1/sqrt(6)
            [1 / Math.sqrt(8),   1, 2, 2, true],       // 1/sqrt(8) = 1/(2sqrt2)
        ];

        for (const [target, n, d, sq, inv] of table) {
            if (Math.abs(av - target) < tol) {
                return new SymbolicValue(sign, n, d, sq, inv);
            }
        }

        // Try simple fractions n/d for small n, d
        for (let d = 1; d <= 8; d++) {
            for (let n = 1; n < d; n++) {
                if (Math.abs(av - n / d) < tol) {
                    return new SymbolicValue(sign, n, d, 1, false);
                }
            }
        }

        // No match — return null (caller should format as decimal)
        return null;
    }
}

// ─── Complex TeX formatting helpers ────────────────────────

/**
 * Format a complex number [re, im] as a LaTeX string.
 * Uses SymbolicValue for exact representation where possible,
 * falls back to decimal.
 *
 * @param {number} re
 * @param {number} im
 * @returns {string}  LaTeX string (without surrounding delimiters)
 */
export function formatComplexTeX(re, im) {
    const tol = 1e-6;
    const absRe = Math.abs(re);
    const absIm = Math.abs(im);

    const fmtReal = (v) => {
        const sym = SymbolicValue.fromFloat(v);
        return sym ? sym.toTeX() : _decimalTeX(v);
    };

    const fmtImag = (v) => {
        // Return the coefficient part only (caller appends 'i')
        const av = Math.abs(v);
        const s = v < -tol ? '-' : '';
        if (Math.abs(av - 1) < tol) return s;  // just sign
        const sym = SymbolicValue.fromFloat(av);
        return sym ? s + sym.toTeX() : _decimalTeX(v);
    };

    if (absRe < tol && absIm < tol) return '0';
    if (absIm < tol) return fmtReal(re);
    if (absRe < tol) return fmtImag(im) + 'i';

    // Both parts nonzero
    const rPart = fmtReal(re);
    const iPart = fmtImag(im);
    const sep = im > 0 ? '+' : '';
    return `${rPart}${sep}${iPart}i`;
}

/**
 * Format a real value as a short decimal LaTeX string.
 * @param {number} v
 * @returns {string}
 */
function _decimalTeX(v) {
    // Avoid trailing zeros: 0.500 → 0.5
    const s = v.toFixed(4);
    return parseFloat(s).toString();
}

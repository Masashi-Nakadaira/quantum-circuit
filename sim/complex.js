// ============================================================
// sim/complex.js — Complex Number Arithmetic & Seeded RNG
// ============================================================

/**
 * Multiply two complex numbers: (a+bi)(c+di)
 * @param {number} ar - real part of first
 * @param {number} ai - imag part of first
 * @param {number} br - real part of second
 * @param {number} bi - imag part of second
 * @returns {[number, number]} [real, imag]
 */
export function cMul(ar, ai, br, bi) {
    return [ar * br - ai * bi, ar * bi + ai * br];
}

/**
 * Add two complex numbers
 * @param {number} ar @param {number} ai
 * @param {number} br @param {number} bi
 * @returns {[number, number]}
 */
export function cAdd(ar, ai, br, bi) {
    return [ar + br, ai + bi];
}

/**
 * Subtract: (a) - (b)
 * @returns {[number, number]}
 */
export function cSub(ar, ai, br, bi) {
    return [ar - br, ai - bi];
}

/**
 * Squared magnitude |z|^2 = re^2 + im^2
 * @param {number} re @param {number} im
 * @returns {number}
 */
export function cAbs2(re, im) {
    return re * re + im * im;
}

/**
 * Magnitude |z|
 * @param {number} re @param {number} im
 * @returns {number}
 */
export function cAbs(re, im) {
    return Math.sqrt(re * re + im * im);
}

/**
 * Scale complex number by a real scalar
 * @param {number} re @param {number} im @param {number} s
 * @returns {[number, number]}
 */
export function cScale(re, im, s) {
    return [re * s, im * s];
}

/**
 * Complex conjugate
 * @param {number} re @param {number} im
 * @returns {[number, number]}
 */
export function cConj(re, im) {
    return [re, -im];
}

// ─── Seeded PRNG (xoshiro128**) ────────────────────────────

/**
 * Seeded pseudo-random number generator (xoshiro128**).
 * Produces reproducible sequences for measurement sampling.
 *
 * Usage:
 *   const rng = new SeededRNG(42);
 *   const r = rng.next(); // 0 <= r < 1
 */
export class SeededRNG {
    /**
     * @param {number} seed - integer seed value
     */
    constructor(seed = 42) {
        // splitmix32 to initialise 4 state words from single seed
        let s = seed >>> 0;
        const sm = () => {
            s = (s + 0x9e3779b9) >>> 0;
            let z = s;
            z = (z ^ (z >>> 16)) >>> 0;
            z = Math.imul(z, 0x85ebca6b);
            z = (z ^ (z >>> 13)) >>> 0;
            z = Math.imul(z, 0xc2b2ae35);
            z = (z ^ (z >>> 16)) >>> 0;
            return z;
        };
        this.s = [sm(), sm(), sm(), sm()];
    }

    /** @returns {number} uniform in [0, 1) */
    next() {
        const s = this.s;
        const result = Math.imul(s[1] * 5, 7);
        const t = s[1] << 9;

        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];

        s[2] ^= t;
        s[3] = (s[3] << 11) | (s[3] >>> 21);

        // Convert to [0, 1)
        return ((result >>> 0) / 0x100000000);
    }
}

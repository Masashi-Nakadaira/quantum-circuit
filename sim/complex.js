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

/**
 * Parses a mathematical string into a complex number [re, im].
 * Supports: "1/sqrt(2)", "i/2", "-1", "sqrt(3)/2 + i/2"
 * @param {string} str
 * @returns {[number, number]}
 */
// Re-export symbolic formatting from fraction.js for convenience
export { formatComplexTeX } from './fraction.js';

/**
 * Parses a mathematical string into a complex number [re, im].
 * Supports: "1/sqrt(2)", "i/2", "-1", "sqrt(3)/2 + i/2"
 * @param {string} str
 * @returns {[number, number]}
 */
export function parseComplexExpr(str) {
    str = str.replace(/\s+/g, '').toLowerCase();
    if (!str) return [0, 0];

    // Handle full expressions with + or - between parts
    // Regex to split re and im parts (very basic, improvements possible)
    // Looking for [part] [+|-] [part with i]
    // Or just a single part

    // Simple heuristic: if contains 'i', it's imaginary part or part of it.
    // Let's use a simpler evaluator for common patterns.

    const evaluate = (s) => {
        if (!s || s === '0') return 0;
        try {
            // Replace sqrt(x) with Math.sqrt(x) and evaluate
            let expr = s.replace(/sqrt\((\d+)\)/g, 'Math.sqrt($1)');
            expr = expr.replace(/sqrtk/g, 'Math.sqrt'); // failsafe
            // Security: extremely restricted eval or use Function
            return new Function(`return ${expr}`)();
        } catch (e) {
            console.error('Failed to parse math expr:', s);
            return 0;
        }
    };

    // Split at + or - (but not inside sqrt)
    // This is complex. Let's handle simple cases first.
    if (str.includes('i')) {
        if (str === 'i') return [0, 1];
        if (str === '-i') return [0, -1];

        // check if it's like "A + Bi"
        const iIdx = str.indexOf('i');
        let imPart = str.substring(0, iIdx);
        if (imPart === '' || imPart === '+') imPart = '1';
        if (imPart === '-') imPart = '-1';

        // If it was just "i/2", iIdx is 0? No, str="i/2", iIdx=0. 
        // We search for a coefficient.
        // Actually, let's treat 'i' as a variable in the evaluator?
        // Better: Replace 'i' with '1' and evaluate for im, or 0 for re.

        // This is a bit hacky but works for standard quantum notation strings
        const reExpr = str.replace(/[+-]?[\w\/\(\).]*i[\w\/\(\).]*/g, (match) => '');
        const imExpr = str.match(/[+-]?[\w\/\(\).]*i[\w\/\(\).]*/g)?.[0]?.replace('i', '') || '0';

        const r = evaluate(reExpr || '0');
        const im = evaluate((imExpr === '' || imExpr === '+') ? '1' : (imExpr === '-' ? '-1' : imExpr));
        return [r, im];
    } else {
        return [evaluate(str), 0];
    }
}


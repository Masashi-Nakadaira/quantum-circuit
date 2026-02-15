// ============================================================
// ui/texRenderer.js — KaTeX Output Utilities
// ============================================================
//
// Wraps KaTeX for safe rendering with graceful fallback when the
// CDN is not available.  Also provides helpers that convert the
// simulator's internal [re, im][] vectors into LaTeX strings,
// using SymbolicValue for exact fraction display.

import { SymbolicValue, formatComplexTeX } from '../sim/fraction.js';

// ─── Core renderer ────────────────────────────────────────

/**
 * Render a TeX string into a DOM element via KaTeX.
 * Falls back to plain-text when KaTeX is not loaded.
 *
 * @param {string} texString
 * @param {HTMLElement} element
 * @param {Object} [options]
 */
export function renderTeX(texString, element, options = {}) {
    if (typeof katex !== 'undefined') {
        try {
            katex.render(texString, element, {
                throwOnError: false,
                displayMode: options.displayMode || false,
                ...options,
            });
            return;
        } catch { /* fall through */ }
    }
    // Fallback: plain text
    element.textContent = texString;
}

/**
 * Return a KaTeX-rendered HTML string (inline).
 * Falls back to escaped plain text.
 */
export function texToHTML(texString, options = {}) {
    if (typeof katex !== 'undefined') {
        try {
            return katex.renderToString(texString, {
                throwOnError: false,
                displayMode: false,
                ...options,
            });
        } catch { /* fall through */ }
    }
    const el = document.createElement('span');
    el.textContent = texString;
    return el.outerHTML;
}

// ─── State vector → TeX ────────────────────────────────────

/**
 * Format a state vector as a Dirac-notation TeX string.
 *
 * Example output:
 *   |\psi\rangle = \frac{1}{\sqrt{2}}|00\rangle + \frac{1}{\sqrt{2}}|11\rangle
 *
 * @param {[number,number][]} stateVector
 * @param {number} numQubits
 * @param {number} [maxTerms]  limit shown terms (for large vectors)
 * @returns {string}  LaTeX string
 */
export function stateVectorToTeX(stateVector, numQubits, maxTerms = 0) {
    const dim = 1 << numQubits;
    const tol = 1e-6;

    // Collect non-zero terms
    const terms = [];
    for (let i = 0; i < dim; i++) {
        const [re, im] = stateVector[i];
        const mag = Math.sqrt(re * re + im * im);
        if (mag > tol) {
            terms.push({ idx: i, re, im, mag });
        }
    }
    terms.sort((a, b) => b.mag - a.mag);

    if (terms.length === 0) return '|\\psi\\rangle = 0';

    const limit = maxTerms > 0 ? maxTerms : (numQubits >= 4 ? 8 : dim);
    const show = terms.slice(0, limit);
    const hidden = terms.length - show.length;

    let tex = '|\\psi\\rangle = ';
    tex += show.map((t, idx) => {
        const bin = t.idx.toString(2).padStart(numQubits, '0');
        const ket = `|${bin}\\rangle`;
        const coeff = _coeffTeX(t.re, t.im);

        if (idx === 0) {
            // First term: no leading '+'
            if (coeff === '1') return ket;
            if (coeff === '-1') return `-${ket}`;
            if (coeff === '-') return `-${ket}`;
            return `${coeff}${ket}`;
        }

        // Subsequent terms
        if (coeff.startsWith('-')) {
            const inner = coeff.slice(1);
            if (inner === '1' || inner === '') return ` - ${ket}`;
            return ` - ${inner}${ket}`;
        }
        if (coeff === '1') return ` + ${ket}`;
        return ` + ${coeff}${ket}`;
    }).join('');

    if (hidden > 0) {
        tex += ` + \\cdots\\text{(${hidden} more)}`;
    }

    return tex;
}

/**
 * Format a coefficient (complex number) for use before a ket.
 * Returns a TeX string that should be prepended to |...⟩.
 */
function _coeffTeX(re, im) {
    const tol = 1e-6;
    const absRe = Math.abs(re);
    const absIm = Math.abs(im);

    if (absIm < tol) {
        // Pure real
        if (Math.abs(re - 1) < tol) return '1';
        if (Math.abs(re + 1) < tol) return '-1';
        const sym = SymbolicValue.fromFloat(re);
        return sym ? sym.toTeX() : _dec(re);
    }

    if (absRe < tol) {
        // Pure imaginary
        if (Math.abs(im - 1) < tol) return 'i';
        if (Math.abs(im + 1) < tol) return '-i';
        const sym = SymbolicValue.fromFloat(im);
        if (sym) return sym.toTeX() + 'i';
        return _dec(im) + 'i';
    }

    // General complex — wrap in parentheses
    return `\\left(${formatComplexTeX(re, im)}\\right)`;
}

function _dec(v) {
    return parseFloat(v.toFixed(4)).toString();
}

// ─── Density matrix → TeX ─────────────────────────────────

/**
 * Format a density matrix as a LaTeX bmatrix string.
 *
 * @param {[number,number][][]} rho
 * @param {number} numQubits
 * @returns {string}
 */
export function densityMatrixToTeX(rho, numQubits) {
    const dim = 1 << numQubits;
    if (dim > 8) return '\\rho\\;(\\text{too large to display})';

    let tex = '\\rho = \\begin{pmatrix}';
    for (let i = 0; i < dim; i++) {
        const row = [];
        for (let j = 0; j < dim; j++) {
            const [re, im] = rho[i][j];
            row.push(formatComplexTeX(re, im));
        }
        tex += row.join(' & ');
        if (i < dim - 1) tex += ' \\\\ ';
    }
    tex += '\\end{pmatrix}';
    return tex;
}

// Re-export for convenience
export { formatComplexTeX };

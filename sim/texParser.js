// ============================================================
// sim/texParser.js — LaTeX Quantum State Parser
// ============================================================
//
// Parses a subset of LaTeX quantum state notation into a
// numerical state vector.
//
// Supported notation:
//   Kets:   |0\rangle  |01\rangle  |+\rangle  |-\rangle
//           \ket{0}   \ket{01}
//   Coeff:  \frac{1}{\sqrt{2}}  \sqrt{3}  0.5  -1  i  -i
//           e^{i\pi/4}  (Euler phase)
//   Ops:    +  -  (between terms), parentheses for distribution

// ─── Token types ──────────────────────────────────────────

const T = {
    NUMBER: 'NUMBER',
    I: 'I',           // imaginary unit
    FRAC: 'FRAC',
    SQRT: 'SQRT',
    KET: 'KET',
    PLUS: 'PLUS',
    MINUS: 'MINUS',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    EXP: 'EXP',       // e^{...}
    PI: 'PI',
    SLASH: 'SLASH',
    EOF: 'EOF',
};

// ─── Tokenizer ────────────────────────────────────────────

function tokenize(tex) {
    const tokens = [];
    // Normalize: remove spaces, replace \left( \right) with ()
    let s = tex.replace(/\\left\s*\(/g, '(')
               .replace(/\\right\s*\)/g, ')')
               .replace(/\\,/g, '')
               .replace(/\\;/g, '')
               .replace(/\\!/g, '')
               .replace(/\s+/g, '');
    let i = 0;

    const peek = () => s[i] || '';
    const advance = (n = 1) => { i += n; };
    const remaining = () => s.slice(i);

    while (i < s.length) {
        const ch = s[i];

        // Ket: |...\rangle or \ket{...}
        if (ch === '|') {
            advance();
            let label = '';
            while (i < s.length) {
                if (remaining().startsWith('\\rangle')) {
                    advance(7);
                    break;
                }
                if (s[i] === '⟩') { advance(); break; }
                label += s[i];
                advance();
            }
            tokens.push({ type: T.KET, value: label });
            continue;
        }

        if (remaining().startsWith('\\ket{')) {
            advance(5);
            let label = '';
            let depth = 1;
            while (i < s.length && depth > 0) {
                if (s[i] === '{') depth++;
                else if (s[i] === '}') { depth--; if (depth === 0) { advance(); break; } }
                label += s[i];
                advance();
            }
            tokens.push({ type: T.KET, value: label });
            continue;
        }

        // \frac{...}{...}
        if (remaining().startsWith('\\frac{') || remaining().startsWith('\\frac ')) {
            advance(5);
            const num = _readBraced(s, i);
            i = num.end;
            const den = _readBraced(s, i);
            i = den.end;
            tokens.push({ type: T.FRAC, num: num.content, den: den.content });
            continue;
        }

        // \sqrt{...} or \sqrt followed by a single char
        if (remaining().startsWith('\\sqrt{')) {
            advance(5);
            const inner = _readBraced(s, i);
            i = inner.end;
            tokens.push({ type: T.SQRT, value: inner.content });
            continue;
        }
        if (remaining().startsWith('\\sqrt')) {
            advance(5);
            if (i < s.length && /\d/.test(s[i])) {
                let num = '';
                while (i < s.length && /\d/.test(s[i])) { num += s[i]; advance(); }
                tokens.push({ type: T.SQRT, value: num });
            }
            continue;
        }

        // \pi
        if (remaining().startsWith('\\pi')) {
            advance(3);
            tokens.push({ type: T.PI });
            continue;
        }

        // e^{...}  (Euler phase)
        if (remaining().startsWith('e^{')) {
            advance(2);
            const inner = _readBraced(s, i);
            i = inner.end;
            tokens.push({ type: T.EXP, value: inner.content });
            continue;
        }
        if (remaining().startsWith('e^')) {
            advance(2);
            // single token after ^
            let val = '';
            if (s[i] === '{') {
                const inner = _readBraced(s, i);
                i = inner.end;
                val = inner.content;
            } else {
                val = s[i] || '';
                advance();
            }
            tokens.push({ type: T.EXP, value: val });
            continue;
        }

        // Imaginary unit
        if (ch === 'i' && (i + 1 >= s.length || !/[a-zA-Z0-9]/.test(s[i + 1]))) {
            advance();
            tokens.push({ type: T.I });
            continue;
        }

        // Number (integer or decimal)
        if (/[0-9.]/.test(ch)) {
            let num = '';
            while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; advance(); }
            tokens.push({ type: T.NUMBER, value: parseFloat(num) });
            continue;
        }

        // Operators
        if (ch === '+') { advance(); tokens.push({ type: T.PLUS }); continue; }
        if (ch === '-') { advance(); tokens.push({ type: T.MINUS }); continue; }
        if (ch === '(') { advance(); tokens.push({ type: T.LPAREN }); continue; }
        if (ch === ')') { advance(); tokens.push({ type: T.RPAREN }); continue; }
        if (ch === '/') { advance(); tokens.push({ type: T.SLASH }); continue; }

        // Skip unknown LaTeX commands (e.g. \, \quad)
        if (ch === '\\') {
            advance();
            while (i < s.length && /[a-zA-Z]/.test(s[i])) advance();
            continue;
        }

        // Skip anything else
        advance();
    }

    tokens.push({ type: T.EOF });
    return tokens;
}

/** Read a brace-delimited group: {content} */
function _readBraced(s, pos) {
    if (s[pos] !== '{') return { content: '', end: pos };
    let depth = 0;
    let start = pos + 1;
    let i = pos;
    while (i < s.length) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') { depth--; if (depth === 0) return { content: s.slice(start, i), end: i + 1 }; }
        i++;
    }
    return { content: s.slice(start), end: s.length };
}

// ─── Parser ───────────────────────────────────────────────

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    peek() { return this.tokens[this.pos] || { type: T.EOF }; }
    advance() { return this.tokens[this.pos++]; }
    expect(type) {
        const t = this.advance();
        if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type}`);
        return t;
    }

    /**
     * Parse the full state expression.
     * StateExpr := Term (('+' | '-') Term)*
     * Returns an array of { coeff: [re, im], ketLabel: string }
     */
    parseStateExpr() {
        const terms = [];
        this._parseTermsInto(terms, 1);
        return terms;
    }

    _parseTermsInto(terms, outerSign) {
        let sign = outerSign;

        // Handle leading sign
        if (this.peek().type === T.MINUS) { this.advance(); sign *= -1; }
        else if (this.peek().type === T.PLUS) { this.advance(); }

        this._parseSingleTerm(terms, sign);

        while (this.peek().type === T.PLUS || this.peek().type === T.MINUS) {
            const op = this.advance();
            const s = op.type === T.MINUS ? -1 * outerSign : outerSign;

            // Handle double sign like + -
            let nextSign = s;
            while (this.peek().type === T.PLUS || this.peek().type === T.MINUS) {
                if (this.advance().type === T.MINUS) nextSign *= -1;
            }

            this._parseSingleTerm(terms, nextSign);
        }
    }

    _parseSingleTerm(terms, sign) {
        // A term is: [coefficient] [ket | '(' stateExpr ')']
        let coeff = this._tryParseCoefficient();

        if (this.peek().type === T.LPAREN) {
            // Distribution: coeff * (term1 + term2 + ...)
            this.advance(); // consume '('
            const innerTerms = [];
            this._parseTermsInto(innerTerms, 1);
            if (this.peek().type === T.RPAREN) this.advance();

            // Multiply each inner term by the outer coefficient and sign
            for (const t of innerTerms) {
                const [cr, ci] = t.coeff;
                const [ar, ai] = coeff || [1, 0];
                // (a+bi)(c+di) = (ac-bd) + (ad+bc)i
                const rr = ar * cr - ai * ci;
                const ri = ar * ci + ai * cr;
                terms.push({
                    coeff: [sign * rr - 0 * ri, sign * ri + 0 * rr],
                    ketLabel: t.ketLabel,
                });
                // Apply sign correctly
                terms[terms.length - 1].coeff = [sign >= 0 ? rr : -rr, sign >= 0 ? ri : -ri];
            }
            return;
        }

        if (this.peek().type === T.KET) {
            const ket = this.advance();
            const c = coeff || [1, 0];
            terms.push({
                coeff: [sign * c[0], sign * c[1]],
                ketLabel: ket.value,
            });
            return;
        }

        // If we have a coefficient but no ket or paren, it might be an error
        // or it could be the end. Just ignore gracefully.
        if (coeff && this.peek().type !== T.EOF) {
            // Maybe the coefficient IS the term (standalone number)
            // Try to see if next is ket
        }
    }

    /**
     * Try to parse a numeric coefficient (may be absent).
     * Returns [re, im] or null.
     */
    _tryParseCoefficient() {
        const p = this.peek();

        // \frac{...}{...}
        if (p.type === T.FRAC) {
            this.advance();
            const num = this._evalSimpleExpr(p.num);
            const den = this._evalSimpleExpr(p.den);
            let result = [num[0] / den[0], num[1]]; // simple real/real division
            // Handle complex numerator / real denominator
            if (den[1] !== 0) {
                // Complex division: (a+bi)/(c+di)
                const d2 = den[0] * den[0] + den[1] * den[1];
                result = [
                    (num[0] * den[0] + num[1] * den[1]) / d2,
                    (num[1] * den[0] - num[0] * den[1]) / d2,
                ];
            } else {
                result = [num[0] / den[0], num[1] / den[0]];
            }

            // Check for trailing * or implicit multiplication
            return result;
        }

        // \sqrt{...}
        if (p.type === T.SQRT) {
            this.advance();
            const inner = parseFloat(p.value);
            let val = Math.sqrt(isNaN(inner) ? 2 : inner);

            // Check for /denominator after sqrt
            if (this.peek().type === T.SLASH) {
                this.advance();
                const denom = this._parseAtomicNumber();
                val /= denom;
            }
            return [val, 0];
        }

        // e^{...} — Euler phase
        if (p.type === T.EXP) {
            this.advance();
            const phase = this._evalPhaseExpr(p.value);
            return [Math.cos(phase), Math.sin(phase)];
        }

        // Plain number
        if (p.type === T.NUMBER) {
            this.advance();
            let val = p.value;
            // Check for /denominator
            if (this.peek().type === T.SLASH) {
                this.advance();
                if (this.peek().type === T.SQRT) {
                    const sq = this.advance();
                    const inner = parseFloat(sq.value);
                    val /= Math.sqrt(isNaN(inner) ? 2 : inner);
                } else {
                    const denom = this._parseAtomicNumber();
                    val /= denom;
                }
            }
            // Check for trailing i
            if (this.peek().type === T.I) {
                this.advance();
                return [0, val];
            }
            return [val, 0];
        }

        // Imaginary unit 'i' alone
        if (p.type === T.I) {
            this.advance();
            // Check for /denominator
            let val = 1;
            if (this.peek().type === T.SLASH) {
                this.advance();
                if (this.peek().type === T.SQRT) {
                    const sq = this.advance();
                    const inner = parseFloat(sq.value);
                    val /= Math.sqrt(isNaN(inner) ? 2 : inner);
                } else {
                    const denom = this._parseAtomicNumber();
                    val /= denom;
                }
            }
            return [0, val];
        }

        return null; // No coefficient present
    }

    _parseAtomicNumber() {
        if (this.peek().type === T.NUMBER) {
            return this.advance().value;
        }
        return 1;
    }

    /**
     * Evaluate a simple expression that appears inside \frac{}{} or \sqrt{}.
     * Supports: numbers, \sqrt{n}, \pi, i, and basic arithmetic.
     */
    _evalSimpleExpr(str) {
        if (!str) return [1, 0];
        // Tokenize the inner string and evaluate
        const s = str.trim();

        // Pure 'i'
        if (s === 'i') return [0, 1];
        if (s === '-i') return [0, -1];

        // \sqrt{N}
        const sqrtMatch = s.match(/^\\sqrt\{(\d+)\}$/);
        if (sqrtMatch) return [Math.sqrt(parseInt(sqrtMatch[1])), 0];
        const sqrtMatch2 = s.match(/^\\sqrt(\d+)$/);
        if (sqrtMatch2) return [Math.sqrt(parseInt(sqrtMatch2[1])), 0];

        // \pi
        if (s === '\\pi') return [Math.PI, 0];

        // Number * \sqrt{N}
        const numSqrt = s.match(/^(\d+)\\sqrt\{(\d+)\}$/);
        if (numSqrt) return [parseInt(numSqrt[1]) * Math.sqrt(parseInt(numSqrt[2])), 0];

        // Plain number
        const num = parseFloat(s);
        if (!isNaN(num)) return [num, 0];

        return [1, 0]; // fallback
    }

    /**
     * Evaluate a phase expression (inside e^{...}).
     * Supports: i\pi, i\pi/N, iN\pi/M, i*number
     */
    _evalPhaseExpr(str) {
        if (!str) return 0;
        let s = str.replace(/\s+/g, '').replace(/\\cdot/g, '*');

        // Remove leading 'i' (e^{iφ})
        if (s.startsWith('i')) s = s.slice(1);
        else if (s.startsWith('-i')) { s = '-' + s.slice(2); }

        if (!s || s === '' || s === '+') return Math.PI; // e^{i} interpreted as e^{i*1}

        // Replace \pi with Math.PI placeholder
        s = s.replace(/\\pi/g, String(Math.PI));

        // Evaluate simple arithmetic
        try {
            return new Function(`return ${s}`)();
        } catch {
            return 0;
        }
    }
}

// ─── Ket label → basis index ──────────────────────────────

/**
 * Convert a ket label string to a basis state index (or indices
 * for special labels like '+', '-').
 *
 * @param {string} label  e.g. "01", "110", "+", "-"
 * @param {number} numQubits
 * @returns {{ indices: number[], coeffs: [number,number][] } | null}
 */
function ketLabelToStates(label, numQubits) {
    // Computational basis: "01", "110", etc.
    if (/^[01]+$/.test(label)) {
        if (label.length !== numQubits) return null;
        return { indices: [parseInt(label, 2)], coeffs: [[1, 0]] };
    }

    // Single-qubit symbolic kets
    if (numQubits === 1) {
        switch (label) {
            case '+': return { indices: [0, 1], coeffs: [[Math.SQRT1_2, 0], [Math.SQRT1_2, 0]] };
            case '-': return { indices: [0, 1], coeffs: [[Math.SQRT1_2, 0], [-Math.SQRT1_2, 0]] };
            case 'i': return { indices: [0, 1], coeffs: [[Math.SQRT1_2, 0], [0, Math.SQRT1_2]] };
            case '-i': return { indices: [0, 1], coeffs: [[Math.SQRT1_2, 0], [0, -Math.SQRT1_2]] };
        }
    }

    return null;
}

// ─── Public API ───────────────────────────────────────────

/**
 * Parse a LaTeX quantum state string into a state vector.
 *
 * @param {string} texString  LaTeX notation
 * @param {number} numQubits  expected number of qubits
 * @returns {{ vector: [number,number][]|null, error: string|null }}
 */
export function parseTexState(texString, numQubits) {
    if (!texString || !texString.trim()) {
        return { vector: null, error: 'Empty input' };
    }

    try {
        const tokens = tokenize(texString);
        const parser = new Parser(tokens);
        const terms = parser.parseStateExpr();

        if (terms.length === 0) {
            return { vector: null, error: 'No valid terms found' };
        }

        // Determine qubit count from ket labels if numQubits not clear
        const dim = 1 << numQubits;
        const vec = new Array(dim).fill(null).map(() => [0, 0]);

        for (const term of terms) {
            const states = ketLabelToStates(term.ketLabel, numQubits);
            if (!states) {
                return { vector: null, error: `Invalid ket label: |${term.ketLabel}\u27E9 (expected ${numQubits}-qubit label)` };
            }

            const [cr, ci] = term.coeff;
            for (let k = 0; k < states.indices.length; k++) {
                const idx = states.indices[k];
                const [sr, si] = states.coeffs[k];
                // Multiply term coefficient by ket coefficient
                const rr = cr * sr - ci * si;
                const ri = cr * si + ci * sr;
                vec[idx][0] += rr;
                vec[idx][1] += ri;
            }
        }

        return { vector: vec, error: null };
    } catch (e) {
        return { vector: null, error: e.message || 'Parse error' };
    }
}

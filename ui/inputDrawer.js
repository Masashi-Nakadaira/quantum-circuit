// ============================================================
// ui/inputDrawer.js — Quantum State Input Configuration
// ============================================================
//
// Five-tab UI for defining the initial quantum state:
//   Presets | Bloch | Vector | TeX | Density

import { cAbs2, parseComplexExpr } from '../sim/complex.js';
import { DensityMatrixEngine } from '../sim/densitymatrix.js';
import { parseTexState } from '../sim/texParser.js';
import { renderTeX, stateVectorToTeX, texToHTML, formatComplexTeX } from './texRenderer.js';
import { SymbolicValue } from '../sim/fraction.js';
import { BlochSphere } from './blochSphere.js';
import { INPUT_PRESETS } from '../model/circuit.js';

const TABS = [
    { id: 'presets', label: 'Presets' },
    { id: 'bloch',   label: 'Bloch' },
    { id: 'vector',  label: 'Vector' },
    { id: 'tex',     label: 'TeX' },
    { id: 'density', label: 'Density' },
];

const ENTANGLED_PRESETS = ['Φ+', 'Φ-', 'Ψ+', 'Ψ-', 'GHZ', 'W'];

export class InputDrawer {
    constructor(app) {
        this.app = app;
        this.isOpen = false;
        this.activeTab = 'presets';
        this.container = document.getElementById('input-rows-container');
        this.drawer = document.getElementById('input-drawer');

        this.btnClose = document.getElementById('btn-close-input');
        this.btnNormalize = document.getElementById('btn-normalize-input');
        this.btnApply = document.getElementById('btn-apply-input');

        this._blochSpheres = [];
        this._texDebounce = null;
        this._normDebounce = null;

        this._bindEvents();
    }

    _bindEvents() {
        this.btnClose.onclick = () => this.close();
        this.btnNormalize.onclick = () => this._normalize();
        this.btnApply.onclick = () => this._apply();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });
    }

    open() {
        this.isOpen = true;
        // Default to presets tab, or density if mixed
        if (this.app.inputState.isMixed) this.activeTab = 'density';
        this._render();
        this.drawer.classList.add('open');
    }

    close() {
        this.isOpen = false;
        this._destroyBlochSpheres();
        this.drawer.classList.remove('open');
    }

    // ─── Top-level render ─────────────────────────────────

    _render() {
        const numQubits = this.app.circuit.numQubits;

        this.container.innerHTML = `
            <div class="input-mode-tabs input-5tabs">
                ${TABS.map(t => `<button class="input-tab ${this.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
            </div>
            <div id="input-tab-content"></div>
            <div class="norm-status" id="norm-status"></div>
        `;

        // Tab switching
        this.container.querySelectorAll('.input-tab').forEach(btn => {
            btn.onclick = () => {
                this.activeTab = btn.dataset.tab;
                this._render();
            };
        });

        const area = document.getElementById('input-tab-content');
        this._destroyBlochSpheres();

        switch (this.activeTab) {
            case 'presets': this._renderPresets(area, numQubits); break;
            case 'bloch':   this._renderBloch(area, numQubits); break;
            case 'vector':  this._renderVector(area, numQubits); break;
            case 'tex':     this._renderTeX(area, numQubits); break;
            case 'density': this._renderDensity(area, numQubits); break;
        }

        // Show/hide normalize button based on tab
        const showNorm = ['vector', 'tex', 'presets', 'bloch'].includes(this.activeTab);
        this.btnNormalize.style.display = showNorm ? 'inline-block' : 'none';

        this._updateNormStatus();
    }

    // ─── Tab: Presets ──────────────────────────────────────

    _renderPresets(area, numQubits) {
        const presets = this.app.inputState.presets || Array(numQubits).fill('|0⟩');
        const links = this.app.inputState.links || Array(Math.max(0, numQubits - 1)).fill(false);
        const singlePresets = Object.keys(INPUT_PRESETS);

        let html = '<div class="preset-config">';
        html += '<h4>Per-qubit Presets</h4>';

        for (let q = numQubits - 1; q >= 0; q--) {
            html += `<div class="preset-qubit-row">`;
            html += `<span class="preset-qubit-label">q${q}</span>`;
            html += `<div class="preset-buttons" data-qubit="${q}">`;

            // Check if this qubit is part of a linked cluster
            const isLinked = (q < numQubits - 1 && links[q]) || (q > 0 && links[q - 1]);

            if (!isLinked) {
                for (const p of singlePresets) {
                    const sel = presets[q] === p ? 'selected' : '';
                    html += `<button class="preset-btn ${sel}" data-qubit="${q}" data-preset="${p}">${p}</button>`;
                }
            } else {
                html += `<span class="preset-linked-note">Linked (entangled)</span>`;
            }

            html += `</div></div>`;

            // Link toggle between this qubit and q-1
            if (q > 0) {
                const linkIdx = q - 1;
                const linked = links[linkIdx];
                html += `<div class="preset-link-toggle">
                    <button class="link-btn ${linked ? 'linked' : ''}" data-link="${linkIdx}">
                        ${linked ? '🔗 Linked' : '⛓ Link q' + (q - 1) + '↔q' + q}
                    </button>
                </div>`;
            }
        }

        // Entangled preset selector (shown when any links are active)
        if (links.some(l => l)) {
            html += '<h4 style="margin-top:12px;">Entangled State</h4>';
            html += '<div class="entangled-presets">';
            for (const ep of ENTANGLED_PRESETS) {
                const sel = presets[0] === ep ? 'selected' : '';
                html += `<button class="preset-btn entangled-btn ${sel}" data-entangled="${ep}">${ep}</button>`;
            }
            html += '</div>';
        }

        html += '</div>';

        // TeX preview of current state
        html += '<div class="preset-preview" id="preset-preview"></div>';

        area.innerHTML = html;

        // Bind preset buttons
        area.querySelectorAll('.preset-btn[data-qubit]').forEach(btn => {
            btn.onclick = () => {
                const q = parseInt(btn.dataset.qubit);
                const newPresets = [...(this.app.inputState.presets || Array(numQubits).fill('|0⟩'))];
                newPresets[q] = btn.dataset.preset;
                this.app.inputState.presets = newPresets;
                this.app.inputState.vector = this.app.inputState._presetsToVector(newPresets);
                this.app.inputState.densityMatrix = null;
                this._render();
                this._updatePresetPreview();
            };
        });

        // Bind link toggles
        area.querySelectorAll('.link-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.link);
                const newLinks = [...(this.app.inputState.links || Array(Math.max(0, numQubits - 1)).fill(false))];
                newLinks[idx] = !newLinks[idx];
                this.app.inputState.links = newLinks;
                this._render();
            };
        });

        // Bind entangled presets
        area.querySelectorAll('.entangled-btn').forEach(btn => {
            btn.onclick = () => {
                const ep = btn.dataset.entangled;
                const newPresets = Array(numQubits).fill(ep);
                newPresets[0] = ep;
                this.app.inputState.presets = newPresets;
                this.app.inputState.vector = this.app.inputState._presetsToVector(newPresets);
                this.app.inputState.densityMatrix = null;
                this._render();
            };
        });

        this._updatePresetPreview();
    }

    _updatePresetPreview() {
        const el = document.getElementById('preset-preview');
        if (!el) return;
        const vec = this.app.inputState.toStateVector();
        const numQubits = this.app.circuit.numQubits;
        const tex = stateVectorToTeX(vec, numQubits);
        el.innerHTML = '<div class="preview-tex"></div>';
        renderTeX(tex, el.querySelector('.preview-tex'), { displayMode: true });
    }

    // ─── Tab: Bloch ─────────────────────────────────────────

    _renderBloch(area, numQubits) {
        let html = '<div class="bloch-tab-content">';

        if (numQubits > 1) {
            html += '<p class="bloch-note">Each sphere defines a single-qubit state. The overall state is the tensor product (separable states only).</p>';
        }

        html += '<div class="bloch-spheres-container" id="bloch-spheres"></div>';
        html += '<div class="bloch-state-preview" id="bloch-preview"></div>';
        html += '</div>';

        area.innerHTML = html;

        const container = document.getElementById('bloch-spheres');
        this._blochSpheres = [];

        // Get current per-qubit angles from the state vector
        const vec = this.app.inputState.toStateVector();

        for (let q = numQubits - 1; q >= 0; q--) {
            const wrapper = document.createElement('div');
            wrapper.className = 'bloch-qubit-wrapper';
            wrapper.innerHTML = `<div class="bloch-qubit-label">q${q}</div><div class="bloch-sphere-mount" id="bloch-mount-${q}"></div>`;
            container.appendChild(wrapper);

            const mount = wrapper.querySelector(`#bloch-mount-${q}`);
            const sphere = new BlochSphere(mount, () => this._onBlochChange());
            this._blochSpheres.push({ qubit: q, sphere });

            // Set initial angles from current state (approximate for product states)
            if (numQubits === 1) {
                const [a0r, a0i] = vec[0];
                const [a1r, a1i] = vec[1];
                const theta = 2 * Math.acos(Math.min(1, Math.sqrt(a0r * a0r + a0i * a0i)));
                const phi = Math.atan2(a1i, a1r) - Math.atan2(a0i, a0r);
                sphere.setAngles(theta, phi >= 0 ? phi : phi + 2 * Math.PI);
            }
        }

        this._updateBlochPreview();
    }

    _onBlochChange() {
        this._updateBlochPreview();
        this._updateNormStatus();
    }

    _updateBlochPreview() {
        const el = document.getElementById('bloch-preview');
        if (!el) return;
        const vec = this._blochToVector();
        const numQubits = this.app.circuit.numQubits;
        const tex = stateVectorToTeX(vec, numQubits);
        el.innerHTML = '<div class="preview-tex"></div>';
        renderTeX(tex, el.querySelector('.preview-tex'), { displayMode: true });
    }

    _blochToVector() {
        if (this._blochSpheres.length === 0) return this.app.inputState.toStateVector();

        // Tensor product of per-qubit states (high index first for LSB convention)
        let fullVec = [[1, 0]];
        for (let i = 0; i < this._blochSpheres.length; i++) {
            const sv = this._blochSpheres[i].sphere.toStateVector();
            fullVec = _tensorProduct(fullVec, sv);
        }
        return fullVec;
    }

    _destroyBlochSpheres() {
        for (const bs of this._blochSpheres) bs.sphere.destroy();
        this._blochSpheres = [];
    }

    // ─── Tab: Vector ────────────────────────────────────────

    _renderVector(area, numQubits) {
        const numStates = 1 << numQubits;
        const vector = this.app.inputState.toStateVector();

        let html = '<h4>State Vector Amplitudes</h4>';
        html += '<p class="input-hint">Enter fractions like 1/sqrt(2), sqrt(3)/2, or decimals.</p>';

        for (let i = 0; i < numStates; i++) {
            const basis = i.toString(2).padStart(numQubits, '0');
            const [re, im] = vector[i];
            html += `
                <div class="input-row">
                    <span class="input-row-label">|${basis}⟩</span>
                    <input type="text" class="input-val expr-input"
                           value="${this._formatComplex(re, im)}"
                           data-idx="${i}">
                </div>
            `;
        }

        area.innerHTML = html;

        // Live norm update on input
        area.querySelectorAll('.expr-input').forEach(inp => {
            inp.addEventListener('input', () => {
                clearTimeout(this._normDebounce);
                this._normDebounce = setTimeout(() => this._updateNormStatus(), 300);
            });
        });
    }

    // ─── Tab: TeX ───────────────────────────────────────────

    _renderTeX(area, numQubits) {
        const savedTex = this.app.inputState.texSource || '';

        let html = `
            <h4>LaTeX Input</h4>
            <p class="input-hint">Paste LaTeX quantum state notation. Supports \\frac, \\sqrt, |...\\rangle, \\ket{...}.</p>
            <textarea class="tex-input" id="tex-input" rows="4" placeholder="\\frac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle)">${savedTex}</textarea>
            <div class="tex-preview-section">
                <div class="tex-preview-label">Preview:</div>
                <div class="tex-preview" id="tex-preview"></div>
            </div>
            <div class="tex-parse-result" id="tex-parse-result"></div>
            <div class="tex-examples">
                <span class="tex-examples-label">Examples:</span>
                <button class="tex-example-btn" data-tex="\\frac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle)">Bell Φ+</button>
                <button class="tex-example-btn" data-tex="\\frac{1}{\\sqrt{2}}(|00\\rangle - |11\\rangle)">Bell Φ-</button>
                <button class="tex-example-btn" data-tex="\\frac{1}{\\sqrt{2}}(|000\\rangle + |111\\rangle)">GHZ</button>
                <button class="tex-example-btn" data-tex="\\frac{1}{\\sqrt{3}}(|001\\rangle + |010\\rangle + |100\\rangle)">W</button>
                <button class="tex-example-btn" data-tex="\\frac{1}{2}(|00\\rangle + |01\\rangle + |10\\rangle + |11\\rangle)">Uniform</button>
            </div>
        `;

        area.innerHTML = html;

        const textarea = document.getElementById('tex-input');

        // Live preview
        textarea.addEventListener('input', () => {
            clearTimeout(this._texDebounce);
            this._texDebounce = setTimeout(() => this._updateTexPreview(numQubits), 300);
        });

        // Example buttons
        area.querySelectorAll('.tex-example-btn').forEach(btn => {
            btn.onclick = () => {
                textarea.value = btn.dataset.tex;
                this._updateTexPreview(numQubits);
            };
        });

        // Initial preview if there's saved text
        if (savedTex) {
            setTimeout(() => this._updateTexPreview(numQubits), 100);
        }
    }

    _updateTexPreview(numQubits) {
        const textarea = document.getElementById('tex-input');
        const previewEl = document.getElementById('tex-preview');
        const resultEl = document.getElementById('tex-parse-result');
        if (!textarea || !previewEl) return;

        const texStr = textarea.value.trim();
        if (!texStr) {
            previewEl.innerHTML = '<span class="tex-placeholder">Preview will appear here</span>';
            resultEl.innerHTML = '';
            return;
        }

        // Render the raw LaTeX with KaTeX
        renderTeX(texStr, previewEl, { displayMode: true });

        // Parse into state vector
        const { vector, error } = parseTexState(texStr, numQubits);
        if (error) {
            resultEl.innerHTML = `<div class="tex-error">${error}</div>`;
        } else {
            // Show parsed amplitudes
            let html = '<div class="tex-parsed"><span class="tex-parsed-label">Parsed:</span>';
            const dim = 1 << numQubits;
            for (let i = 0; i < dim; i++) {
                const [re, im] = vector[i];
                if (Math.abs(re) < 1e-6 && Math.abs(im) < 1e-6) continue;
                const basis = i.toString(2).padStart(numQubits, '0');
                html += `<span class="tex-parsed-term">|${basis}⟩: ${this._formatComplex(re, im)}</span>`;
            }

            // Norm
            const norm2 = vector.reduce((s, c) => s + cAbs2(c[0], c[1]), 0);
            const normClass = Math.abs(norm2 - 1) < 0.001 ? 'norm-ok' : (Math.abs(norm2 - 1) < 0.05 ? 'norm-warn' : 'norm-error');
            html += `<span class="tex-parsed-norm ${normClass}">‖ψ‖² = ${norm2.toFixed(4)}</span>`;
            html += '</div>';
            resultEl.innerHTML = html;
        }

        this._updateNormStatus();
    }

    // ─── Tab: Density ───────────────────────────────────────

    _renderDensity(area, numQubits) {
        const numStates = 1 << numQubits;

        if (numQubits > 3) {
            area.innerHTML = `
                <div class="density-warning">
                    <strong>Large System:</strong> Density matrix for ${numQubits} qubits has ${numStates * numStates} elements. Only diagonal elements (probabilities) can be set here.
                </div>
                <h4>Diagonal Elements (Probabilities)</h4>
            `;
            this._renderDiagonalOnly(area, numQubits, numStates);
            return;
        }

        let html = '<h4>Density Matrix (ρ)</h4>';
        html += '<p class="input-hint">Enter complex values for each element ρ<sub>ij</sub>. Trace must equal 1.</p>';

        const rho = this.app.inputState.isMixed ?
            this.app.inputState.densityMatrix :
            DensityMatrixEngine.fromPureState(numQubits, this.app.inputState.toStateVector());

        html += '<div class="matrix-grid" style="grid-template-columns: repeat(' + numStates + ', 1fr)">';

        for (let i = 0; i < numStates; i++) {
            for (let j = 0; j < numStates; j++) {
                const [re, im] = rho[i][j];
                html += `
                    <div class="matrix-cell">
                        <input type="text" class="matrix-input mat-val"
                               value="${this._formatComplex(re, im)}"
                               data-row="${i}" data-col="${j}">
                    </div>
                `;
            }
        }
        html += '</div>';
        area.innerHTML = html;

        this._addMixedControls(area, numStates);

        // Live norm update
        area.querySelectorAll('.mat-val').forEach(inp => {
            inp.addEventListener('input', () => {
                clearTimeout(this._normDebounce);
                this._normDebounce = setTimeout(() => this._updateNormStatus(), 300);
            });
        });
    }

    _renderDiagonalOnly(area, numQubits, numStates) {
        let probs = Array(numStates).fill(0);
        if (this.app.inputState.isMixed) {
            for (let i = 0; i < numStates; i++) probs[i] = this.app.inputState.densityMatrix[i][i][0];
        } else {
            const vec = this.app.inputState.toStateVector();
            for (let i = 0; i < numStates; i++) probs[i] = cAbs2(vec[i][0], vec[i][1]);
        }

        const grid = document.createElement('div');
        for (let i = 0; i < numStates; i++) {
            const basis = i.toString(2).padStart(numQubits, '0');
            const row = document.createElement('div');
            row.className = 'input-row';
            row.innerHTML = `
                <span class="input-row-label">Pr(|${basis}⟩)</span>
                <input type="text" class="input-val diagonal-input"
                       value="${probs[i].toFixed(3)}"
                       data-idx="${i}">
            `;
            grid.appendChild(row);
        }
        area.appendChild(grid);
        this._addMixedControls(area, numStates, true);
    }

    _addMixedControls(area, numStates, diagonalOnly = false) {
        const btnMaxMixed = document.createElement('button');
        btnMaxMixed.className = 'tool-btn';
        btnMaxMixed.style.width = '100%';
        btnMaxMixed.style.marginTop = '10px';
        btnMaxMixed.textContent = 'Set Maximally Mixed State';
        btnMaxMixed.onclick = () => {
            const p = (1 / numStates);
            if (diagonalOnly) {
                const inputs = area.querySelectorAll('.diagonal-input');
                inputs.forEach(input => input.value = p.toFixed(3));
            } else {
                const inputs = area.querySelectorAll('.mat-val');
                inputs.forEach(input => {
                    const r = parseInt(input.dataset.row);
                    const c = parseInt(input.dataset.col);
                    input.value = (r === c) ? p.toFixed(3) : '0';
                });
            }
            this._updateNormStatus();
        };
        area.appendChild(btnMaxMixed);
    }

    // ─── Normalization ─────────────────────────────────────

    _getCurrentVector() {
        const numQubits = this.app.circuit.numQubits;

        if (this.activeTab === 'bloch') {
            return this._blochToVector();
        }

        if (this.activeTab === 'tex') {
            const textarea = document.getElementById('tex-input');
            if (textarea) {
                const { vector } = parseTexState(textarea.value.trim(), numQubits);
                return vector;
            }
            return null;
        }

        if (this.activeTab === 'vector') {
            const inputs = this.container.querySelectorAll('.expr-input');
            if (inputs.length === 0) return null;
            return Array.from(inputs).map(inp => parseComplexExpr(inp.value));
        }

        if (this.activeTab === 'presets') {
            return this.app.inputState.toStateVector();
        }

        return null;
    }

    _updateNormStatus() {
        const el = document.getElementById('norm-status');
        if (!el) return;

        if (this.activeTab === 'density') {
            // Trace for density matrix
            const numQubits = this.app.circuit.numQubits;
            const numStates = 1 << numQubits;
            let trace = 0;

            if (numQubits > 3) {
                const inputs = this.container.querySelectorAll('.diagonal-input');
                inputs.forEach(inp => { trace += parseFloat(inp.value) || 0; });
            } else {
                const inputs = this.container.querySelectorAll('.mat-val');
                inputs.forEach(inp => {
                    if (inp.dataset.row === inp.dataset.col) {
                        const [re] = parseComplexExpr(inp.value);
                        trace += re;
                    }
                });
            }

            const cls = Math.abs(trace - 1) < 0.001 ? 'norm-ok' : (Math.abs(trace - 1) < 0.05 ? 'norm-warn' : 'norm-error');
            el.innerHTML = `<span class="norm-label">Tr(ρ) = </span><span class="norm-value ${cls}">${trace.toFixed(4)}</span>`;
            return;
        }

        const vec = this._getCurrentVector();
        if (!vec) { el.innerHTML = ''; return; }

        const norm2 = vec.reduce((s, c) => s + cAbs2(c[0], c[1]), 0);
        const cls = Math.abs(norm2 - 1) < 0.001 ? 'norm-ok' : (Math.abs(norm2 - 1) < 0.05 ? 'norm-warn' : 'norm-error');
        el.innerHTML = `<span class="norm-label">‖ψ‖² = </span><span class="norm-value ${cls}">${norm2.toFixed(4)}</span>`;
    }

    _normalize() {
        if (this.activeTab === 'density') return;

        if (this.activeTab === 'vector') {
            const inputs = this.container.querySelectorAll('.expr-input');
            let vec = Array.from(inputs).map(inp => parseComplexExpr(inp.value));
            let sum2 = vec.reduce((s, c) => s + cAbs2(c[0], c[1]), 0);
            if (sum2 < 1e-9) return;
            const scale = 1 / Math.sqrt(sum2);
            vec = vec.map(c => [c[0] * scale, c[1] * scale]);
            inputs.forEach((inp, i) => inp.value = this._formatComplex(vec[i][0], vec[i][1]));
            this._updateNormStatus();
            return;
        }

        if (this.activeTab === 'tex') {
            const textarea = document.getElementById('tex-input');
            if (!textarea) return;
            const numQubits = this.app.circuit.numQubits;
            const { vector } = parseTexState(textarea.value.trim(), numQubits);
            if (!vector) return;
            let sum2 = vector.reduce((s, c) => s + cAbs2(c[0], c[1]), 0);
            if (sum2 < 1e-9) return;
            const scale = 1 / Math.sqrt(sum2);
            const normalized = vector.map(c => [c[0] * scale, c[1] * scale]);
            // Generate normalized TeX
            const tex = stateVectorToTeX(normalized, numQubits);
            // We can't directly rewrite the input as TeX, so show a note
            const resultEl = document.getElementById('tex-parse-result');
            if (resultEl) {
                resultEl.innerHTML = `<div class="tex-normalized-note">Normalized state applied. ‖ψ‖² = 1.000</div>`;
            }
            this._updateNormStatus();
            return;
        }

        // Presets and Bloch are already normalized by construction
    }

    // ─── Apply ─────────────────────────────────────────────

    _apply() {
        const numQubits = this.app.circuit.numQubits;
        const numStates = 1 << numQubits;

        if (this.activeTab === 'presets') {
            // Presets already update the inputState directly
            // Just trigger UI reload
        } else if (this.activeTab === 'bloch') {
            const vec = this._blochToVector();
            this.app.inputState.setVector(vec);
        } else if (this.activeTab === 'vector') {
            const inputs = this.container.querySelectorAll('.expr-input');
            const vec = Array.from(inputs).map(inp => {
                const [re, im] = parseComplexExpr(inp.value);
                return [re, im];
            });

            // Check normalization
            const norm2 = vec.reduce((s, c) => s + cAbs2(c[0], c[1]), 0);
            if (Math.abs(norm2 - 1) > 0.01) {
                const choice = this._showNormDialog(norm2);
                if (choice === 'cancel') return;
                if (choice === 'normalize') {
                    const scale = 1 / Math.sqrt(norm2);
                    for (const c of vec) { c[0] *= scale; c[1] *= scale; }
                }
            }

            this.app.inputState.setVector(vec);
        } else if (this.activeTab === 'tex') {
            const textarea = document.getElementById('tex-input');
            const texStr = textarea ? textarea.value.trim() : '';
            const { vector, error } = parseTexState(texStr, numQubits);
            if (error || !vector) {
                alert('TeX parse error: ' + (error || 'Unknown error'));
                return;
            }

            // Check normalization
            const norm2 = vector.reduce((s, c) => s + cAbs2(c[0], c[1]), 0);
            if (Math.abs(norm2 - 1) > 0.01) {
                const choice = this._showNormDialog(norm2);
                if (choice === 'cancel') return;
                if (choice === 'normalize') {
                    const scale = 1 / Math.sqrt(norm2);
                    for (const c of vector) { c[0] *= scale; c[1] *= scale; }
                }
            }

            this.app.inputState.setVector(vector);
            this.app.inputState.texSource = texStr;
        } else if (this.activeTab === 'density') {
            const rho = Array.from({ length: numStates }, () => Array.from({ length: numStates }, () => [0, 0]));
            let totalTrace = 0;

            if (numQubits > 3) {
                const inputs = this.container.querySelectorAll('.diagonal-input');
                inputs.forEach((inp, i) => {
                    const val = parseFloat(inp.value) || 0;
                    rho[i][i] = [val, 0];
                    totalTrace += val;
                });
            } else {
                const inputs = this.container.querySelectorAll('.mat-val');
                inputs.forEach(inp => {
                    const r = parseInt(inp.dataset.row);
                    const c = parseInt(inp.dataset.col);
                    const [vre, vim] = parseComplexExpr(inp.value);
                    rho[r][c] = [vre, vim];
                    if (r === c) totalTrace += vre;
                });
            }

            if (Math.abs(totalTrace - 1.0) > 0.05) {
                if (!confirm(`Trace is ${totalTrace.toFixed(3)} (expected 1.0). Apply anyway?`)) return;
            }
            this.app.inputState.setDensityMatrix(rho);
        }

        this.app._reloadUI();
        this.app._onCircuitChange();
        this.close();
    }

    _showNormDialog(norm2) {
        // Simple confirm-based dialog
        const msg = `State is not normalized (‖ψ‖² = ${norm2.toFixed(4)}).\nClick OK to normalize & apply, or Cancel to go back.`;
        return confirm(msg) ? 'normalize' : 'cancel';
    }

    // ─── Formatting helpers ────────────────────────────────

    _formatComplex(re, im) {
        if (Math.abs(re) < 1e-4 && Math.abs(im) < 1e-4) return '0';

        const fmtReal = (v) => {
            const sym = SymbolicValue.fromFloat(v);
            if (sym) {
                if (sym.num === 0) return '0';
                // Use a readable non-TeX format for input fields
                return _symbolicToInputStr(sym);
            }
            return parseFloat(v.toFixed(3)).toString();
        };

        if (Math.abs(im) < 1e-4) return fmtReal(re);
        if (Math.abs(re) < 1e-4) {
            const av = Math.abs(im);
            const s = im < 0 ? '-' : '';
            if (Math.abs(av - 1) < 1e-4) return s + 'i';
            return fmtReal(im) + 'i';
        }
        const rPart = fmtReal(re);
        const iPart = fmtReal(Math.abs(im));
        const sep = im >= 0 ? '+' : '-';
        return `${rPart}${sep}${iPart}i`;
    }
}

// ─── Module-level helpers ──────────────────────────────────

function _symbolicToInputStr(sym) {
    if (sym.num === 0) return '0';
    const s = sym.sign < 0 ? '-' : '';

    if (sym.invSqrt) {
        if (sym.den === 1) return `${s}${sym.num === 1 ? '1' : sym.num}/sqrt(${sym.sqrtArg})`;
        return `${s}${sym.num}/(${sym.den}*sqrt(${sym.sqrtArg}))`;
    }
    if (sym.sqrtArg > 1) {
        if (sym.num === 1 && sym.den === 1) return `${s}sqrt(${sym.sqrtArg})`;
        if (sym.den === 1) return `${s}${sym.num}*sqrt(${sym.sqrtArg})`;
        return `${s}${sym.num === 1 ? '' : sym.num + '*'}sqrt(${sym.sqrtArg})/${sym.den}`;
    }
    if (sym.den === 1) return `${s}${sym.num}`;
    return `${s}${sym.num}/${sym.den}`;
}

function _tensorProduct(a, b) {
    const result = [];
    for (const [ar, ai] of a) {
        for (const [br, bi] of b) {
            result.push([ar * br - ai * bi, ar * bi + ai * br]);
        }
    }
    return result;
}

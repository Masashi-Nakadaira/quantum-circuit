import { cAbs2, parseComplexExpr } from '../sim/complex.js';
import { DensityMatrixEngine } from '../sim/densitymatrix.js';

export class InputDrawer {
    constructor(app) {
        this.app = app;
        this.isOpen = false;
        this.mode = 'pure'; // 'pure' or 'mixed'
        this.container = document.getElementById('input-rows-container');
        this.drawer = document.getElementById('input-drawer');

        this.btnClose = document.getElementById('btn-close-input');
        this.btnNormalize = document.getElementById('btn-normalize-input');
        this.btnApply = document.getElementById('btn-apply-input');

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
        this.mode = this.app.inputState.isMixed ? 'mixed' : 'pure';
        this._render();
        this.drawer.classList.add('open');
    }

    close() {
        this.isOpen = false;
        this.drawer.classList.remove('open');
    }

    _render() {
        const numQubits = this.app.circuit.numQubits;
        const numStates = 1 << numQubits;

        this.container.innerHTML = `
            <div class="input-mode-tabs">
                <button class="input-tab ${this.mode === 'pure' ? 'active' : ''}" id="tab-pure">Pure State</button>
                <button class="input-tab ${this.mode === 'mixed' ? 'active' : ''}" id="tab-mixed">Mixed State</button>
            </div>
            <div id="input-fields-area"></div>
        `;

        document.getElementById('tab-pure').onclick = () => { this.mode = 'pure'; this._render(); };
        document.getElementById('tab-mixed').onclick = () => { this.mode = 'mixed'; this._render(); };

        const area = document.getElementById('input-fields-area');
        if (this.mode === 'pure') {
            this._renderPureRows(area, numQubits, numStates);
            this.btnNormalize.style.display = 'block';
        } else {
            this._renderMixedRows(area, numQubits, numStates);
            this.btnNormalize.style.display = 'none';
        }
    }

    _renderPureRows(area, numQubits, numStates) {
        area.innerHTML = '<h4>State Vector Amplitudes</h4><p style="font-size:10px;color:var(--text-muted);margin-bottom:10px;">Enter values like 1/sqrt(2), 0.5, or 1.</p>';
        const vector = this.app.inputState.toStateVector();
        for (let i = 0; i < numStates; i++) {
            const basis = i.toString(2).padStart(numQubits, '0');
            const [re, im] = vector[i];
            const row = document.createElement('div');
            row.className = 'input-row';
            row.innerHTML = `
                <span class="input-row-label">|${basis}⟩</span>
                <input type="text" class="input-val expr-input" 
                       style="width:100%;background:rgba(0,0,0,0.2);padding:8px;border:1px solid var(--border);border-radius:4px;"
                       value="${this._formatComplex(re, im)}" 
                       data-idx="${i}">
            `;
            area.appendChild(row);
        }
    }

    _renderMixedRows(area, numQubits, numStates) {
        if (numQubits > 3) {
            area.innerHTML = `
                <div style="background:rgba(217,119,6,0.1);border:1px solid #d97706;padding:10px;border-radius:8px;margin-bottom:15px;">
                    <p style="font-size:11px;color:#f59e0b;">⚠️ <strong>Large System:</strong> Density matrix for ${numQubits} qubits (1024 elements) is too large for grid input. Only diagonal elements (probabilities) can be set here.</p>
                </div>
                <h4>Diagonal Elements (Probabilities)</h4>
            `;
            this._renderDiagonalOnly(area, numQubits, numStates);
            return;
        }

        area.innerHTML = '<h4>Density Matrix (ρ)</h4><p style="font-size:10px;color:var(--text-muted);margin-bottom:15px;">Enter complex values for each element ρ<sub>ij</sub>. Diagonal must sum to 1.0.</p>';

        const rho = this.app.inputState.isMixed ?
            this.app.inputState.densityMatrix :
            DensityMatrixEngine.fromPureState(numQubits, this.app.inputState.toStateVector());

        const grid = document.createElement('div');
        grid.className = 'matrix-grid';
        grid.style.gridTemplateColumns = `repeat(${numStates}, 60px)`;

        for (let i = 0; i < numStates; i++) {
            for (let j = 0; j < numStates; j++) {
                const [re, im] = rho[i][j];
                const cell = document.createElement('div');
                cell.className = 'matrix-cell';
                cell.innerHTML = `
                    <input type="text" class="matrix-input mat-val" 
                           value="${this._formatComplex(re, im)}" 
                           data-row="${i}" data-col="${j}">
                    <span class="matrix-label">[${i},${j}]</span>
                `;
                grid.appendChild(cell);
            }
        }
        area.appendChild(grid);

        this._addMixedControls(area, numStates);
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
                       style="width:100%;background:rgba(0,0,0,0.2);padding:8px;border:1px solid var(--border);border-radius:4px;"
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
                    input.value = (r === c) ? p.toFixed(3) : "0";
                });
            }
        };
        area.appendChild(btnMaxMixed);
    }

    _formatComplex(re, im) {
        if (Math.abs(re) < 1e-4 && Math.abs(im) < 1e-4) return "0";
        if (Math.abs(im) < 1e-4) return parseFloat(re.toFixed(3)).toString();
        if (Math.abs(re) < 1e-4) return parseFloat(im.toFixed(3)).toString() + "i";
        const res = re.toFixed(3) + (im >= 0 ? "+" : "") + im.toFixed(3) + "i";
        return res.replace(/\+0\.000i/g, '').replace(/-0\.000i/g, '');
    }

    _normalize() {
        if (this.mode !== 'pure') return;
        const inputs = this.container.querySelectorAll('.expr-input');
        let vec = Array.from(inputs).map(inp => parseComplexExpr(inp.value));
        let sum2 = vec.reduce((s, c) => s + cAbs2(c[0], c[1]), 0);
        if (sum2 < 1e-9) return;
        const scale = 1 / Math.sqrt(sum2);
        vec = vec.map(c => [c[0] * scale, c[1] * scale]);
        inputs.forEach((inp, i) => inp.value = this._formatComplex(vec[i][0], vec[i][1]));
    }

    _apply() {
        const numQubits = this.app.circuit.numQubits;
        const numStates = 1 << numQubits;

        if (this.mode === 'pure') {
            const inputs = this.container.querySelectorAll('.expr-input');
            const vec = Array.from(inputs).map(inp => {
                const [re, im] = parseComplexExpr(inp.value);
                return [re, im];
            });
            this.app.inputState.setVector(vec);
        } else {
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
}

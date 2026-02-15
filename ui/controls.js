// ============================================================
// ui/controls.js — Main Application Controller
// ============================================================

import { Circuit, InputState, createDemoCircuit, INPUT_PRESETS } from '../model/circuit.js';
import { QuantumEngine } from '../sim/statevector.js';
import { CircuitCanvas } from './svgCanvas.js';
import { StateViewer } from './stateViewer.js';
import { DragDropHandler } from './dragDrop.js';
import { AnimationController } from './animation.js';
import { saveCircuit, loadCircuit } from '../storage/localStorage.js';

import { LearnDrawer } from './learnDrawer.js';
import { InputDrawer } from './inputDrawer.js';

class App {
    constructor() {
        // 1. Core Models
        this.circuit = new Circuit(2, 6);
        this.inputState = new InputState(2);
        this.engine = new QuantumEngine();

        // 2. UI Components
        this.canvas = new CircuitCanvas(document.getElementById('circuit-svg'), this.circuit);
        this.viewer = new StateViewer(document.getElementById('state-viewer'));
        this.animator = new AnimationController(this.canvas, this.viewer);
        this.inputDrawer = new InputDrawer(this);

        // 3. Interaction
        this.dnd = new DragDropHandler(
            this.circuit,
            this.canvas,
            document.querySelector('.circuit-container'),
            () => this._onCircuitChange()
        );

        // 4. State
        this.measureMode = 'probability';
        this.shots = 1024;

        this._bindEvents();

        // Learn Drawer
        this.learnDrawer = new LearnDrawer(this);

        this._loadDemo('bell');
    }

    _bindEvents() {
        // --- Header ---
        const btnLearn = document.getElementById('btn-learn');
        if (btnLearn) btnLearn.onclick = () => this.learnDrawer.open();

        const btnInputConfig = document.getElementById('btn-input-config');
        if (btnInputConfig) {
            btnInputConfig.onclick = () => this.inputDrawer.open();
        }

        this._initSidebarPresets();
        this._initResizer();

        document.getElementById('demo-h').onclick = () => this._loadDemo('h-measure');
        document.getElementById('demo-bell').onclick = () => this._loadDemo('bell');
        document.getElementById('demo-ghz').onclick = () => this._loadDemo('ghz');

        document.getElementById('btn-save').onclick = () => {
            saveCircuit(this.circuit, this.inputState);
            this._toast('Circuit saved!');
        };

        document.getElementById('btn-load').onclick = () => {
            const data = loadCircuit();
            if (data) {
                this.circuit = data.circuit;
                this.inputState = data.inputState;
                this._reloadUI();
                this._toast('Circuit loaded!');
            } else {
                this._toast('No saved circuit found');
            }
        };

        // --- Toolbar ---
        document.getElementById('btn-add-wire').onclick = () => {
            if (this.circuit.numQubits < 5) {
                this.circuit.addQubit();
                // Re-init input state vector size, trying to preserve if possible 
                // but usually enlarging requires a reset or specific padding.
                // For simplicity, reset to |0...0> when numQubits changes.
                this.inputState = new InputState(this.circuit.numQubits);
                this._reloadUI();
            }
        };
        document.getElementById('btn-remove-wire').onclick = () => {
            if (this.circuit.numQubits > 1) {
                this.circuit.removeQubit();
                this.inputState = new InputState(this.circuit.numQubits);
                this._reloadUI();
            }
        };

        // Playback
        const btnPlay = document.getElementById('btn-play');
        btnPlay.onclick = () => {
            console.log('[Controls] Play clicked. Simulator state:', this.animator.isPlaying);
            if (this.animator.isPlaying) {
                this.animator.pause();
            } else {
                // Re-run simulation if needed (dirty flag?)
                // Always re-run on play for simplicity
                console.log('[Controls] Starting simulation...');
                this._runSimulation();
                this.animator.play();
            }
        };

        this.animator.onStateChange = (playing) => {
            btnPlay.textContent = playing ? '⏸' : '▶';
        };

        document.getElementById('btn-step').onclick = () => {
            if (this.animator.steps.length === 0) this._runSimulation();
            this.animator.stepForward();
        };

        document.getElementById('btn-reset').onclick = () => {
            this.animator.reset();
            this.viewer.updateState(this.inputState.toStateVector(), this.circuit.numQubits);
            this.viewer.updateHistogram({}, this.shots);
        };

        document.getElementById('speed-slider').oninput = (e) => {
            const val = parseFloat(e.target.value);
            this.animator.setSpeed(val);
            document.getElementById('speed-label').textContent = val + 'x';
        };

        // Measurement
        document.getElementById('measure-mode').onchange = (e) => {
            this.measureMode = e.target.value;
            this._runSimulation(); // immediate update?
            this.animator.reset();
        };

        document.getElementById('shots-input').onchange = (e) => {
            this.shots = parseInt(e.target.value) || 1024;
        };

        this.runShots = (shots) => {
            const counts = this.engine.runShots(this.circuit, this.inputState, shots);
            this.viewer.updateHistogram(counts, shots);
            document.querySelector('button[data-tab="histogram"]').click();
            return counts;
        };

        document.getElementById('btn-run-shots').onclick = () => {
            this.runShots(this.shots);
        };
    }

    _loadDemo(name) {
        this.circuit = createDemoCircuit(name);
        this.inputState = new InputState(this.circuit.numQubits);
        this._reloadUI();
        this.animator.reset();
    }

    _reloadUI() {
        this.canvas.circuit = this.circuit;
        this.canvas.pulseCol = -1;
        this.canvas.glowingGates.clear();
        this.canvas.render();

        this.dnd.circuit = this.circuit; // update ref

        // Reset viewer
        this.viewer.updateState(this.inputState.toStateVector(), this.circuit.numQubits, []);
        this.viewer.updateHistogram({}, this.shots);

        // Update sidebar presets to match qubit count
        this._initSidebarPresets();
    }

    _onCircuitChange() {
        this.animator.pause();
        this.animator.reset();
        this.viewer.updateState(this.inputState.toStateVector(), this.circuit.numQubits, []);
        this.canvas.render();
    }

    // ─── API for Learn Drawer (and others) ───────────────────

    loadCircuit(circuitData) {
        // Adapt to Circuit.fromJSON
        const c = Circuit.fromJSON(circuitData);
        this.circuit = c;
        this.circuit.numCols = Math.max(circuitData.numCols || 5, 5); // Ensure min width
        this.canvas.circuit = c;
        // Re-init inputs to match numQubits
        if (this.inputState.numQubits !== c.numQubits) {
            this.inputState = new InputState(c.numQubits);
        }
        this._reloadUI();
    }

    setInputs(presets) {
        // presets: ["|0>", "|+>", ...]
        // Deprecated or converted to full vector
        if (!presets || presets.length !== this.circuit.numQubits) {
            console.warn("Input preset count mismatch");
            return;
        }
        // Temporary support via migration helper in InputState if needed
        // For now, let's just use the InputState's existing _presetsToVector logic if we wanted to
        // But InputState doesn't expose it easily.
        // Let's just create a new state and pretend it was presets.
        const newState = new InputState(this.circuit.numQubits);
        newState.vector = newState._presetsToVector(presets);
        this.inputState = newState;

        this._reloadUI();
    }

    _runSimulation() {
        const steps = this.engine.simulate(this.circuit, this.inputState, this.measureMode);
        this.animator.loadSimulation(steps);
    }

    _initSidebarPresets() {
        const container = document.getElementById('sidebar-input-presets');
        if (!container) return;

        container.innerHTML = '';

        const numQubits = this.circuit.numQubits;
        const links = this.inputState.links;

        // Group into clusters based on links
        const clusters = [];
        let currentCluster = [0];
        for (let i = 0; i < numQubits - 1; i++) {
            if (links[i]) {
                currentCluster.push(i + 1);
            } else {
                clusters.push(currentCluster);
                currentCluster = [i + 1];
            }
        }
        clusters.push(currentCluster);

        clusters.forEach((cluster, clusterIdx) => {
            const groupWrap = document.createElement('div');
            groupWrap.className = 'input-cluster ' + (cluster.length > 1 ? 'linked' : '');

            const isMulti = cluster.length > 1;
            const presets = isMulti ?
                (cluster.length === 2 ? ['Φ+', 'Φ−', 'Ψ+', 'Ψ−'] : ['GHZ', 'W']) :
                ['|0⟩', '|1⟩', '|+⟩', '|−⟩'];

            cluster.forEach((q, idxInCluster) => {
                const row = document.createElement('div');
                row.className = 'input-row-s';
                row.innerHTML = `<span class="input-q-label">q${q}</span>`;

                if (idxInCluster === 0) {
                    // Render preset buttons only for the first row of the cluster if linked, 
                    // or for every row if single.
                    presets.forEach(p => {
                        const btn = document.createElement('button');
                        btn.className = 'preset-btn-s';
                        if (this.inputState.presets && this.inputState.presets[cluster[0]] === p) btn.classList.add('active');
                        btn.textContent = p;
                        btn.onclick = () => {
                            this._setClusterPreset(cluster, p);
                            this._updatePresetButtons();
                        };
                        row.appendChild(btn);
                    });
                } else if (!isMulti) {
                    // This case shouldn't happen with current logic but for safety
                }

                groupWrap.appendChild(row);

                // Add link button between qubits within the cluster (handled by loop below)
                // Actually, link buttons are between rows.
                if (q < numQubits - 1) {
                    const linkBtn = document.createElement('button');
                    linkBtn.className = 'link-toggle ' + (links[q] ? 'active' : '');
                    linkBtn.innerHTML = links[q] ? '🔗' : '⛓️';
                    linkBtn.onclick = () => this._toggleLink(q);
                    groupWrap.appendChild(linkBtn);
                }
            });

            container.appendChild(groupWrap);
        });
    }

    _toggleLink(idx) {
        this.inputState.links[idx] = !this.inputState.links[idx];

        // When linking, reset presets for those qubits to stay consistent
        // We'll just re-init everything to match current presets or defaults.
        this.inputState.vector = this.inputState._presetsToVector(this.inputState.presets);

        this._reloadUI();
        this._onCircuitChange();
    }

    _setClusterPreset(cluster, preset) {
        if (!this.inputState.presets) {
            this.inputState.presets = Array(this.circuit.numQubits).fill('|0⟩');
        }
        // Set same preset for all qubits in cluster (the vector logic will use cluster[0]'s preset)
        cluster.forEach(q => {
            this.inputState.presets[q] = preset;
        });

        this.inputState.vector = this.inputState._presetsToVector(this.inputState.presets);
        this.inputState.densityMatrix = null;

        this._reloadUI();
        this._onCircuitChange();
    }

    _initResizer() {
        const resizer = document.getElementById('panel-resizer');
        if (!resizer) return;

        const topPanel = document.querySelector('.top-panel');
        const bottomPanel = document.querySelector('.bottom-panel');
        const main = document.querySelector('.app-main');

        let isDragging = false;

        resizer.onmousedown = (e) => {
            isDragging = true;
            resizer.classList.add('active');
            document.body.style.cursor = 'row-resize';
            e.preventDefault();
        };

        window.onmousemove = (e) => {
            if (!isDragging) return;

            const mainRect = main.getBoundingClientRect();
            // Calculate relative Y position within app-main
            const relativeY = e.clientY - mainRect.top;

            // Convert to flex ratios or absolute heights.
            // Absolute heights are more stable for "pinning" one side.
            // Let's adjust flex-grow of both.
            const totalHeight = mainRect.height;
            const topFlex = relativeY / totalHeight;
            const bottomFlex = 1 - topFlex;

            // Constrain
            if (topFlex > 0.1 && topFlex < 0.9) {
                topPanel.style.flex = topFlex;
                bottomPanel.style.flex = bottomFlex;
            }
        };

        window.onmouseup = () => {
            if (isDragging) {
                isDragging = false;
                resizer.classList.remove('active');
                document.body.style.cursor = 'default';
            }
        };
    }

    _toast(msg) {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2000);
    }
}

// Start
window.app = new App();

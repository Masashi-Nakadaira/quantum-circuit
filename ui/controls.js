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
            console.log('[Controls] Binding input config button');
            btnInputConfig.onclick = () => {
                console.log('[Controls] Input button clicked');
                this.inputDrawer.open();
            };
        } else {
            console.warn('[Controls] Input config button not found');
        }

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
    }

    _onCircuitChange() {
        // Re-simulate automatically or just reset?
        // Reset animation to start
        this.animator.pause();
        this.animator.reset(); // shows initial state
        // Actually initial state might change if input changed
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

    _toast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2000);
    }
}

// Start
window.app = new App();

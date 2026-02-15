// ============================================================
// model/circuit.js — Gate / Circuit / InputState Data Models
// ============================================================

// ─── Gate Metadata ─────────────────────────────────────────

/** Gate display colours (CSS) */
export const GATE_COLORS = {
    I: '#94a3b8', X: '#ff4444', Y: '#ff6b6b', Z: '#ef4444',
    H: '#ffd700', S: '#a855f7', T: '#c084fc',
    Rx: '#22d3ee', Ry: '#06b6d4', Rz: '#0891b2',
    CNOT: '#3b82f6', CX: '#3b82f6', CZ: '#60a5fa', SWAP: '#22c55e',
    Measure: '#f97316',
};

/** Short labels shown on gate blocks */
export const GATE_LABELS = {
    I: 'I', X: 'X', Y: 'Y', Z: 'Z',
    H: 'H', S: 'S', T: 'T',
    Rx: 'Rx', Ry: 'Ry', Rz: 'Rz',
    CNOT: 'CX', CX: 'CX', CZ: 'CZ', SWAP: 'SW',
    Measure: 'M',
};

/** Whether a gate type requires parameter input */
export const GATE_HAS_PARAM = {
    Rx: true, Ry: true, Rz: true,
};

/** Number of qubits required by each gate type */
export const GATE_QUBIT_COUNT = {
    CNOT: 2, CX: 2, CZ: 2, SWAP: 2,
};

/** Category grouping for the sidebar palette */
export const GATE_CATEGORIES = {
    Single: ['I', 'X', 'Y', 'Z', 'H', 'S', 'T'],
    Rotation: ['Rx', 'Ry', 'Rz'],
    Multi: ['CX', 'CZ', 'SWAP'],
    Measure: ['Measure'],
};

/**
 * Preset single-qubit initial states.
 * Each value is [α_re, α_im, β_re, β_im] for state α|0⟩ + β|1⟩.
 */
export const INPUT_PRESETS = {
    '|0⟩': [1, 0, 0, 0],
    '|1⟩': [0, 0, 1, 0],
    '|+⟩': [Math.SQRT1_2, 0, Math.SQRT1_2, 0],
    '|−⟩': [Math.SQRT1_2, 0, -Math.SQRT1_2, 0],
    '|i⟩': [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
    '|−i⟩': [Math.SQRT1_2, 0, 0, -Math.SQRT1_2],
};

// ─── Gate Class ────────────────────────────────────────────

let _gateIdCounter = 0;

/**
 * Represents a single gate placed on the circuit.
 */
export class Gate {
    /**
     * @param {string} type - Gate type (e.g. 'H', 'CNOT')
     * @param {number[]} targets - Target qubit indices
     * @param {number[]} controls - Control qubit indices
     * @param {Object} params - Parameters (e.g. { theta: Math.PI/2 })
     * @param {number} col - Column (time step) index
     */
    constructor(type, targets, controls = [], params = {}, col = 0) {
        this.id = _gateIdCounter++;
        this.type = type;
        this.targets = targets;
        this.controls = controls;
        this.params = params;
        this.col = col;
    }

    /** All qubits involved (controls + targets) */
    get allQubits() {
        return [...this.controls, ...this.targets];
    }

    /** Display colour */
    get color() {
        return GATE_COLORS[this.type] || '#ffffff';
    }

    /** Display label */
    get label() {
        return GATE_LABELS[this.type] || this.type;
    }

    toJSON() {
        return {
            type: this.type,
            targets: this.targets,
            controls: this.controls,
            params: { ...this.params },
            col: this.col,
        };
    }

    static fromJSON(obj) {
        return new Gate(obj.type, obj.targets, obj.controls, obj.params, obj.col);
    }
}

// ─── Circuit Class ─────────────────────────────────────────

/**
 * Represents a quantum circuit: a grid of qubits × time-steps.
 */
export class Circuit {
    /**
     * @param {number} numQubits - Number of qubit wires (1–5)
     * @param {number} numCols - Number of time-step columns
     */
    constructor(numQubits = 2, numCols = 6) {
        this.numQubits = numQubits;
        this.numCols = numCols;
        /** @type {Gate[]} */
        this.gates = [];
    }

    /**
     * Add a gate after validation.
     * @param {Gate} gate
     * @throws {Error} if validation fails
     */
    addGate(gate) {
        this._validate(gate);
        this.gates.push(gate);
        // Auto-extend: if gate is in the last column, add one more
        if (gate.col >= this.numCols - 1) {
            this.numCols = gate.col + 2;
        }
    }

    /**
     * Remove a gate by its id.
     * @param {number} gateId
     */
    removeGate(gateId) {
        this.gates = this.gates.filter(g => g.id !== gateId);
    }

    /**
     * Get all gates placed in a given column.
     * @param {number} col
     * @returns {Gate[]}
     */
    getGatesAtCol(col) {
        return this.gates.filter(g => g.col === col);
    }

    /** Add a qubit wire (max 5). */
    addQubit() {
        if (this.numQubits < 5) this.numQubits++;
    }

    /** Remove the last qubit wire and all gates on it. */
    removeQubit() {
        if (this.numQubits <= 1) return;
        this.numQubits--;
        this.gates = this.gates.filter(g =>
            g.allQubits.every(q => q < this.numQubits)
        );
    }

    /**
     * Validate gate placement.
     * @param {Gate} gate
     * @throws {Error} on invalid placement
     */
    _validate(gate) {
        // All qubits must be within range
        for (const q of gate.allQubits) {
            if (q < 0 || q >= this.numQubits) {
                throw new Error(`Qubit ${q} out of range (0–${this.numQubits - 1})`);
            }
        }
        // No cell collision: same wire + same column
        const existing = this.getGatesAtCol(gate.col);
        for (const eg of existing) {
            for (const q of gate.allQubits) {
                if (eg.allQubits.includes(q)) {
                    throw new Error(`Cell collision at col ${gate.col}, qubit ${q}`);
                }
            }
        }
        // Rotation gates require theta parameter
        if (GATE_HAS_PARAM[gate.type] && (gate.params.theta == null || isNaN(gate.params.theta))) {
            throw new Error(`Gate ${gate.type} requires theta parameter`);
        }
    }

    toJSON() {
        return {
            numQubits: this.numQubits,
            numCols: this.numCols,
            gates: this.gates.map(g => g.toJSON()),
        };
    }

    static fromJSON(obj) {
        const c = new Circuit(obj.numQubits, obj.numCols);
        c.gates = (obj.gates || []).map(g => Gate.fromJSON(g));
        return c;
    }
}

// ─── InputState ────────────────────────────────────────────

// ─── InputState ────────────────────────────────────────────

/**
 * Tracks the initial state of the quantum system.
 * Can be defined by presets (per qubit) or a full custom state vector.
 */
export class InputState {
    /**
     * @param {number} numQubits
     */
    constructor(numQubits) {
        this.numQubits = numQubits;
        this.presets = Array(numQubits).fill('|0⟩');
        /** @type {boolean[]} Between qubit i and i+1 */
        this.links = Array(Math.max(0, numQubits - 1)).fill(false);
        // Default to |0...0>
        this.vector = this._createZeroState(numQubits);
        /** @type {[number, number][][]|null} */
        this.densityMatrix = null;
    }

    get isMixed() {
        return this.densityMatrix !== null;
    }

    setDensityMatrix(rho) {
        this.densityMatrix = rho;
        this.presets = null; // Clear presets if mixed
    }

    /**
     * Set the state vector directly.
     * @param {[number,number][]} vec - Array of complex numbers [re, im]
     */
    setVector(vec) {
        if (vec.length !== (1 << this.numQubits)) {
            throw new Error(`Vector length ${vec.length} does not match 2^${this.numQubits}`);
        }
        this.vector = vec;
        this.densityMatrix = null; // Pure state overrides mixed
    }

    /**
     * Get the current state vector.
     * @returns {[number,number][]}
     */
    toStateVector() {
        return this.vector;
    }

    /**
     * Create the |0...0> state vector.
     */
    _createZeroState(n) {
        const dim = 1 << n;
        const vec = new Array(dim).fill(null).map(() => [0, 0]);
        vec[0] = [1, 0];
        return vec;
    }

    toJSON() {
        return {
            numQubits: this.numQubits,
            vector: this.vector,
            presets: this.presets,
            links: this.links
        };
    }

    static fromJSON(obj) {
        const s = new InputState(obj.numQubits);
        if (obj.links) s.links = obj.links;
        if (obj.presets) s.presets = obj.presets;

        if (obj.vector) {
            s.vector = obj.vector;
        } else if (obj.presets) {
            s.vector = s._presetsToVector(s.presets);
        }
        return s;
    }

    // Helper to generate vector from presets (handling links)
    _presetsToVector(presets) {
        // 1. Identify clusters (from low to high index)
        const clusters = [];
        let currentCluster = [0];
        for (let i = 0; i < this.numQubits - 1; i++) {
            if (this.links[i]) {
                currentCluster.push(i + 1);
            } else {
                clusters.push(currentCluster);
                currentCluster = [i + 1];
            }
        }
        clusters.push(currentCluster);

        // 2. Tensor product each cluster's state
        // To make q0 the LSB (rightmost), we must tensor from high index to low index:
        // State = |q_high> ⊗ ... ⊗ |q_low>
        let fullVec = [[1, 0]];
        for (let i = clusters.length - 1; i >= 0; i--) {
            const cluster = clusters[i];
            const clusterVec = this._getClusterVector(cluster, presets[cluster[0]]);
            fullVec = this._tensorProduct(fullVec, clusterVec);
        }
        return fullVec;
    }

    _getClusterVector(qubits, type) {
        const size = qubits.length;
        const dim = 1 << size;
        const vec = Array.from({ length: dim }, () => [0, 0]);
        const s2 = Math.SQRT1_2;

        if (size === 1) {
            const p = INPUT_PRESETS[type] || INPUT_PRESETS['|0⟩'];
            return [[p[0], p[1]], [p[2], p[3]]];
        }

        // Entangled states (N-qubit)
        switch (type) {
            case 'Φ+': // (|00...0> + |11...1>) / sqrt(2)
                vec[0] = [s2, 0];
                vec[dim - 1] = [s2, 0];
                break;
            case 'Φ-': // (|00...0> - |11...1>) / sqrt(2)
                vec[0] = [s2, 0];
                vec[dim - 1] = [-s2, 0];
                break;
            case 'Ψ+': // (|0...01> + |1...10>) / sqrt(2)
                vec[1] = [s2, 0];
                vec[dim - 2] = [s2, 0];
                break;
            case 'Ψ-': // (|0...01> - |1...10>) / sqrt(2)
                vec[1] = [s2, 0];
                vec[dim - 2] = [-s2, 0];
                break;
            case 'GHZ': // Standard GHZ
                vec[0] = [s2, 0];
                vec[dim - 1] = [s2, 0];
                break;
            case 'W': // (|100> + |010> + |001>) / sqrt(N)
                const val = 1 / Math.sqrt(size);
                for (let i = 0; i < size; i++) {
                    vec[1 << (size - 1 - i)] = [val, 0];
                }
                break;
            default:
                // Default to all |0>
                vec[0] = [1, 0];
                break;
        }
        return vec;
    }

    _tensorProduct(a, b) {
        const result = [];
        for (const [ar, ai] of a) {
            for (const [br, bi] of b) {
                result.push([ar * br - ai * bi, ar * bi + ai * br]);
            }
        }
        return result;
    }
}

// ─── SimulationStep ────────────────────────────────────────

/**
 * Snapshot of the quantum state after processing one column.
 */
export class SimulationStep {
    /**
     * @param {number} col - column index (-1 for initial state)
     * @param {[number,number][]} stateVector
     * @param {Gate[]} appliedGates
     * @param {Object|null} measurement - { probabilities, outcome }
     */
    constructor(col, stateVector, appliedGates, measurement = null) {
        this.col = col;
        this.stateVector = stateVector;
        this.appliedGates = appliedGates;
        this.measurement = measurement;
    }
}

// ─── Demo Circuit Templates ───────────────────────────────

/**
 * Create a pre-built demo circuit.
 * @param {'h-measure'|'bell'|'ghz'} name
 * @returns {Circuit}
 */
export function createDemoCircuit(name) {
    switch (name) {
        case 'h-measure': {
            const c = new Circuit(1, 4);
            c.addGate(new Gate('H', [0], [], {}, 0));
            c.addGate(new Gate('Measure', [0], [], {}, 1));
            return c;
        }
        case 'bell': {
            const c = new Circuit(2, 6);
            c.addGate(new Gate('H', [0], [], {}, 0));
            c.addGate(new Gate('CX', [1], [0], {}, 1));
            c.addGate(new Gate('Measure', [0], [], {}, 2));
            c.addGate(new Gate('Measure', [1], [], {}, 2));
            return c;
        }
        case 'ghz': {
            const c = new Circuit(3, 8);
            c.addGate(new Gate('H', [0], [], {}, 0));
            c.addGate(new Gate('CX', [1], [0], {}, 1));
            c.addGate(new Gate('CX', [2], [1], {}, 2));
            c.addGate(new Gate('Measure', [0], [], {}, 3));
            c.addGate(new Gate('Measure', [1], [], {}, 3));
            c.addGate(new Gate('Measure', [2], [], {}, 3));
            return c;
        }
        default:
            return new Circuit(2, 6);
    }
}

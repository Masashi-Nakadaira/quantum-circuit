// ============================================================
// storage/localStorage.js — Persistence
// ============================================================

import { Circuit, InputState } from '../model/circuit.js';

const STORAGE_KEY = 'quantum-circuit-save';

export function saveCircuit(circuit, inputState) {
    const data = {
        version: 1,
        savedAt: new Date().toISOString(),
        circuit: circuit.toJSON(),
        inputState: inputState.toJSON()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadCircuit() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        const circuit = Circuit.fromJSON(data.circuit);
        const inputState = InputState.fromJSON(data.inputState);
        return { circuit, inputState };
    } catch (e) {
        console.error('Failed to load circuit', e);
        return null;
    }
}

export function hasSavedCircuit() {
    return !!localStorage.getItem(STORAGE_KEY);
}

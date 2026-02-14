import { Circuit, Gate, InputState } from './model/circuit.js';
import { QuantumEngine } from './sim/statevector.js';

const engine = new QuantumEngine();
const numQubits = 3;
const circuit = new Circuit(numQubits, 5);
const input = new InputState(numQubits);

// Apply X to wire 0 (Top wire in UI)
console.log("Applying X to wire 0...");
circuit.addGate(new Gate('X', [0], [], {}, 0));

const history = engine.simulate(circuit, input, 'probability');
const finalState = history[history.length - 1].stateVector;

console.log("Vector Indices set to non-zero:");
finalState.forEach((c, i) => {
    if (Math.abs(c[0]) > 0.5) {
        console.log(`Index ${i} (Binary: ${i.toString(2).padStart(numQubits, '0')})`);
    }
});

console.log("\nConclusion:");
console.log("If Index is 1 (001), then wire 0 is LSB.");
console.log("If Index is 4 (100), then wire 0 is MSB.");

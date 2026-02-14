import { Circuit, Gate, InputState } from './model/circuit.js';
import { QuantumEngine } from './sim/statevector.js';

const engine = new QuantumEngine();
const circuit = new Circuit(3, 10);
const input = new InputState(3);

// Circuit from image
// Col 0: CX(0, 1)
circuit.addGate(new Gate('CX', [1], [0], {}, 0));
// Col 1: H(0)
circuit.addGate(new Gate('H', [0], [], {}, 1));
// Col 2: CX(1, 2)
circuit.addGate(new Gate('CX', [2], [1], {}, 2));
// Col 3: CZ(0, 2)
circuit.addGate(new Gate('CZ', [2], [0], {}, 3));
// Col 4: Measure(0), Measure(1)
circuit.addGate(new Gate('Measure', [0], [], {}, 4));
circuit.addGate(new Gate('Measure', [1], [], {}, 4));

// Simulate in Probability Mode
console.log("--- Probability Mode ---");
const historyProb = engine.simulate(circuit, input, 'probability');
const finalStateProb = historyProb[historyProb.length - 1].stateVector;
console.log("Final State (Prob Mode):");
finalStateProb.forEach((c, i) => {
    if (Math.abs(c[0]) > 0.01 || Math.abs(c[1]) > 0.01) {
        console.log(`|${i.toString(2).padStart(3, '0')}⟩: ${c[0].toFixed(3)} + ${c[1].toFixed(3)}i`);
    }
});

// Simulate in Single Shot Mode
console.log("\n--- Single Shot Mode ---");
const historyShot = engine.simulate(circuit, input, 'shot');
const finalStateShot = historyShot[historyShot.length - 1].stateVector;
console.log("Final State (Shot Mode):");
finalStateShot.forEach((c, i) => {
    if (Math.abs(c[0]) > 0.01 || Math.abs(c[1]) > 0.01) {
        console.log(`|${i.toString(2).padStart(3, '0')}⟩: ${c[0].toFixed(3)} + ${c[1].toFixed(3)}i`);
    }
});

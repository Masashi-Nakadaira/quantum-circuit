
import { QuantumEngine } from './sim/statevector.js';
import { Circuit, Gate, InputState } from './model/circuit.js';

const engine = new QuantumEngine();

// Setup circuit like in the image
const circuit = new Circuit(3, 10);
circuit.addGate(new Gate('CX', [1], [0], {}, 0));
circuit.addGate(new Gate('H', [0], [], {}, 1));
circuit.addGate(new Gate('CX', [2], [1], {}, 2));
circuit.addGate(new Gate('CZ', [2], [0], {}, 3));
circuit.addGate(new Gate('Measure', [0], [], {}, 4));
circuit.addGate(new Gate('Measure', [1], [], {}, 4));

// Setup input state: 0.832|0> + 0.554|1> on q0
const input = new InputState(3);
input.setVector([
    [0.832, 0], // |000>
    [0, 0],
    [0, 0],
    [0, 0],
    [0.554, 0], // |100> (q0 is bit 2? or bit 0?)
    [0, 0],
    [0, 0],
    [0, 0]
]);

console.log("Simulating in 'probability' mode...");
const stepsProb = engine.simulate(circuit, input, 'probability');
const finalStateProb = stepsProb[stepsProb.length - 1].stateVector;
console.log("Final state (prob):", finalStateProb.map((c, i) => {
    const mag = Math.sqrt(c[0] * c[0] + c[1] * c[1]);
    return mag > 0.01 ? `${i.toString(2).padStart(3, '0')}: ${mag.toFixed(3)}` : null;
}).filter(x => x).join(", "));

console.log("\nSimulating in 'shot' mode...");
const stepsShot = engine.simulate(circuit, input, 'shot');
const finalStateShot = stepsShot[stepsShot.length - 1].stateVector;
console.log("Final state (shot):", finalStateShot.map((c, i) => {
    const mag = Math.sqrt(c[0] * c[0] + c[1] * c[1]);
    return mag > 0.01 ? `${i.toString(2).padStart(3, '0')}: ${mag.toFixed(3)}` : null;
}).filter(x => x).join(", "));

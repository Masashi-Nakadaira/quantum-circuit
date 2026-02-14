// ============================================================
// ui/animation.js — Playback Controller
// ============================================================

export class AnimationController {
    /**
     * @param {import('./svgCanvas.js').CircuitCanvas} canvas
     * @param {import('./stateViewer.js').StateViewer} viewer
     */
    constructor(canvas, viewer) {
        this.canvas = canvas;
        this.viewer = viewer;

        this.steps = [];
        this.currentStepIndex = -1;

        this.isPlaying = false;
        this.speed = 1; // 1x
        this.baseStepDuration = 800; // ms

        this._timer = null;
        this.onStateChange = null; // callback for UI buttons
    }

    loadSimulation(steps) {
        this.steps = steps;
        this.reset();
    }

    reset() {
        this.pause();
        this.currentStepIndex = -1; // Initial state (-1) is "before first col"

        // Show initial state (step 0 in list is usually init state logic? 
        // In sim/statevector.js, step -1 is pushed first. Array index 0 is step -1.
        // Let's align: index 0 -> step -1 (init). index 1 -> step 0 (after col 0).

        if (this.steps.length > 0) {
            this._applyStep(0); // Show initial state
        } else {
            this.canvas.clearPulse();
        }

        if (this.onStateChange) this.onStateChange(this.isPlaying, false);
    }

    play() {
        console.log('[Anim] play() called. isPlaying:', this.isPlaying, 'steps:', this.steps.length);
        if (this.isPlaying) return;

        // If finished, restart?
        if (this.currentStepIndex >= this.steps.length - 1) {
            this.reset();
        }

        this.isPlaying = true;
        if (this.onStateChange) this.onStateChange(this.isPlaying, false);

        this._scheduleNext();
        this._scheduleNext();
    }

    pause() {
        this.isPlaying = false;
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
        if (this.onStateChange) this.onStateChange(this.isPlaying, false);
    }

    stepForward() {
        this.pause();
        if (this.currentStepIndex < this.steps.length - 1) {
            this._applyStep(this.currentStepIndex + 1);
        }
    }

    setSpeed(val) {
        this.speed = val;
    }

    _scheduleNext() {
        if (!this.isPlaying) return;

        const duration = this.baseStepDuration / this.speed;
        console.log('[Anim] Scheduling next step in', duration, 'ms');

        this._timer = setTimeout(() => {
            if (this.currentStepIndex < this.steps.length - 1) {
                this._applyStep(this.currentStepIndex + 1);
                this._scheduleNext();
            } else {
                console.log('[Anim] Finished');
                this.pause();
                if (this.onStateChange) this.onStateChange(this.isPlaying, true); // finished
            }
        }, duration);
    }

    _applyStep(idx) {
        console.log('[Anim] Applying step', idx);
        this.currentStepIndex = idx;
        const step = this.steps[idx];

        if (!step) return;

        // Update Canvas Pulse
        if (step.col >= 0) {
            console.log('[Anim] Pulse col', step.col);
            this.canvas.setPulseColumn(step.col);

            // Trigger Glow for gates in this column
            const gateIds = step.appliedGates.map(g => g.id);
            if (gateIds.length > 0) {
                this.canvas.setGlowing(gateIds);
                // Remove glow after half step?
                setTimeout(() => this.canvas.setGlowing([]), (this.baseStepDuration / this.speed) * 0.5);
            }
        } else {
            this.canvas.clearPulse();
        }

        // Update Viewer
        // Note: step.stateVector is the state AFTER the column.
        this.viewer.updateState(
            step.stateVector,
            Math.round(Math.log2(step.stateVector.length)),
            this.steps.slice(0, idx + 1)
        );

        if (step.measurement && step.measurement.outcomes) {
            const outcomes = step.measurement.outcomes;
            // Find Measure gates in this step
            step.appliedGates.forEach(g => {
                if (g.type === 'Measure' && outcomes[g.targets[0]] !== undefined) {
                    this.canvas.drawMeasurementResult(g.id, outcomes[g.targets[0]]);
                }
            });
        }
    }
}

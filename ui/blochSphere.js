// ============================================================
// ui/blochSphere.js — Interactive SVG Bloch Sphere
// ============================================================
//
// Oblique-projection Bloch sphere for visual single-qubit state
// selection.  The user can drag on the sphere surface or use
// θ/φ sliders to select |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 240;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 100; // sphere radius in SVG units
const TILT = Math.PI / 6; // oblique projection tilt (30°)

// Preset states on the Bloch sphere: { label, theta, phi }
const PRESET_DOTS = [
    { label: '|0⟩', theta: 0, phi: 0 },
    { label: '|1⟩', theta: Math.PI, phi: 0 },
    { label: '|+⟩', theta: Math.PI / 2, phi: 0 },
    { label: '|−⟩', theta: Math.PI / 2, phi: Math.PI },
    { label: '|i⟩', theta: Math.PI / 2, phi: Math.PI / 2 },
    { label: '|−i⟩', theta: Math.PI / 2, phi: 3 * Math.PI / 2 },
];

export class BlochSphere {
    /**
     * @param {HTMLElement} containerEl
     * @param {(theta: number, phi: number) => void} onChange
     */
    constructor(containerEl, onChange) {
        this.container = containerEl;
        this.onChange = onChange || (() => {});
        this.theta = 0;
        this.phi = 0;
        this._dragging = false;
        this._build();
    }

    // ─── Public API ───────────────────────────────────────

    setAngles(theta, phi) {
        this.theta = theta;
        this.phi = phi;
        this._update();
    }

    getAngles() {
        return { theta: this.theta, phi: this.phi };
    }

    /**
     * Convert current (theta, phi) to a single-qubit state vector.
     * |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩
     * @returns {[number,number][]}  [[re0, im0], [re1, im1]]
     */
    toStateVector() {
        const ct = Math.cos(this.theta / 2);
        const st = Math.sin(this.theta / 2);
        return [
            [ct, 0],
            [st * Math.cos(this.phi), st * Math.sin(this.phi)],
        ];
    }

    destroy() {
        this.container.innerHTML = '';
    }

    // ─── SVG construction ──────────────────────────────────

    _build() {
        this.container.innerHTML = '';

        // SVG element
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
        svg.setAttribute('class', 'bloch-svg');
        svg.style.width = '240px';
        svg.style.height = '240px';
        this.svg = svg;

        // Defs for arrowhead
        const defs = this._el('defs');
        const marker = this._el('marker', { id: 'bloch-arrow', markerWidth: 6, markerHeight: 6, refX: 5, refY: 3, orient: 'auto' });
        const arrowPath = this._el('path', { d: 'M0,0 L6,3 L0,6 Z', fill: '#22d3ee' });
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        svg.appendChild(defs);

        // Back ellipses (dashed)
        this.equatorBack = this._el('ellipse', { cx: CX, cy: CY, class: 'equator-back' });
        this.meridianBack = this._el('ellipse', { cx: CX, cy: CY, class: 'meridian-back' });
        svg.appendChild(this.equatorBack);
        svg.appendChild(this.meridianBack);

        // Sphere outline
        svg.appendChild(this._el('circle', { cx: CX, cy: CY, r: R, class: 'sphere-outline' }));

        // Axes
        this._buildAxes(svg);

        // Front ellipses (solid)
        this.equatorFront = this._el('ellipse', { cx: CX, cy: CY, class: 'equator-front' });
        this.meridianFront = this._el('ellipse', { cx: CX, cy: CY, class: 'meridian-front' });
        svg.appendChild(this.equatorFront);
        svg.appendChild(this.meridianFront);

        // Shadow projection on equatorial plane
        this.shadowLine = this._el('line', { class: 'shadow-line' });
        this.shadowDot = this._el('circle', { r: 3, class: 'shadow-dot' });
        svg.appendChild(this.shadowLine);
        svg.appendChild(this.shadowDot);

        // State vector arrow
        this.stateArrow = this._el('line', { x1: CX, y1: CY, class: 'state-arrow', 'marker-end': 'url(#bloch-arrow)' });
        svg.appendChild(this.stateArrow);

        // Draggable state point
        this.statePoint = this._el('circle', { r: 7, class: 'state-point' });
        svg.appendChild(this.statePoint);

        // Preset dots
        for (const p of PRESET_DOTS) {
            const [px, py] = _project(
                Math.sin(p.theta) * Math.cos(p.phi),
                Math.sin(p.theta) * Math.sin(p.phi),
                Math.cos(p.theta),
            );
            const dot = this._el('circle', { cx: px, cy: py, r: 4, class: 'preset-dot' });
            dot.addEventListener('click', (e) => { e.stopPropagation(); this.theta = p.theta; this.phi = p.phi; this._update(); this.onChange(this.theta, this.phi); });

            const label = this._el('text', { x: px, y: py - 9, class: 'preset-label', 'text-anchor': 'middle' });
            label.textContent = p.label;
            svg.appendChild(dot);
            svg.appendChild(label);
        }

        this.container.appendChild(svg);

        // Sliders below the sphere
        const controls = document.createElement('div');
        controls.className = 'bloch-angles';
        controls.innerHTML = `
            <label><span class="bloch-angle-label">\u03B8</span>
                <input type="range" class="bloch-slider" id="bloch-theta" min="0" max="${Math.PI.toFixed(6)}" step="0.01" value="${this.theta}">
                <span class="bloch-angle-val" id="bloch-theta-val">0</span>
            </label>
            <label><span class="bloch-angle-label">\u03C6</span>
                <input type="range" class="bloch-slider" id="bloch-phi" min="0" max="${(2 * Math.PI).toFixed(6)}" step="0.01" value="${this.phi}">
                <span class="bloch-angle-val" id="bloch-phi-val">0</span>
            </label>
        `;
        this.container.appendChild(controls);

        this.thetaSlider = controls.querySelector('#bloch-theta');
        this.phiSlider = controls.querySelector('#bloch-phi');
        this.thetaVal = controls.querySelector('#bloch-theta-val');
        this.phiVal = controls.querySelector('#bloch-phi-val');

        this.thetaSlider.addEventListener('input', () => {
            this.theta = parseFloat(this.thetaSlider.value);
            this._update();
            this.onChange(this.theta, this.phi);
        });
        this.phiSlider.addEventListener('input', () => {
            this.phi = parseFloat(this.phiSlider.value);
            this._update();
            this.onChange(this.theta, this.phi);
        });

        // Drag interaction on sphere
        this._initDrag(svg);
        this._update();
    }

    _buildAxes(svg) {
        // Z axis (vertical): |0⟩ at top, |1⟩ at bottom
        const [ztx, zty] = _project(0, 0, 1.15);
        const [zbx, zby] = _project(0, 0, -1.15);
        svg.appendChild(this._el('line', { x1: zbx, y1: zby, x2: ztx, y2: zty, class: 'axis-line' }));

        // X axis: |+⟩ to |−⟩
        const [xpx, xpy] = _project(1.15, 0, 0);
        const [xnx, xny] = _project(-1.15, 0, 0);
        svg.appendChild(this._el('line', { x1: xnx, y1: xny, x2: xpx, y2: xpy, class: 'axis-line' }));

        // Y axis: |i⟩ to |−i⟩
        const [ypx, ypy] = _project(0, 1.15, 0);
        const [ynx, yny] = _project(0, -1.15, 0);
        svg.appendChild(this._el('line', { x1: ynx, y1: yny, x2: ypx, y2: ypy, class: 'axis-line' }));
    }

    // ─── Drag interaction ──────────────────────────────────

    _initDrag(svg) {
        const onStart = (e) => {
            this._dragging = true;
            this.statePoint.style.cursor = 'grabbing';
            svg.setPointerCapture(e.pointerId);
            this._onDragMove(e);
        };
        const onMove = (e) => {
            if (!this._dragging) return;
            this._onDragMove(e);
        };
        const onEnd = () => {
            this._dragging = false;
            this.statePoint.style.cursor = 'grab';
        };

        svg.addEventListener('pointerdown', onStart);
        svg.addEventListener('pointermove', onMove);
        svg.addEventListener('pointerup', onEnd);
        svg.addEventListener('pointercancel', onEnd);
    }

    _onDragMove(e) {
        const rect = this.svg.getBoundingClientRect();
        const scaleX = SIZE / rect.width;
        const scaleY = SIZE / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;

        // Convert screen coords to approximate 3D angles via inverse projection
        const angles = _inverseProject(mx, my);
        if (angles) {
            this.theta = angles.theta;
            this.phi = angles.phi;
            this._update();
            this.onChange(this.theta, this.phi);
        }
    }

    // ─── Update SVG elements ───────────────────────────────

    _update() {
        const st = Math.sin(this.theta);
        const ct = Math.cos(this.theta);
        const sp = Math.sin(this.phi);
        const cp = Math.cos(this.phi);

        const bx = st * cp;
        const by = st * sp;
        const bz = ct;

        const [px, py] = _project(bx, by, bz);

        // State arrow
        this.stateArrow.setAttribute('x2', px);
        this.stateArrow.setAttribute('y2', py);

        // State point
        this.statePoint.setAttribute('cx', px);
        this.statePoint.setAttribute('cy', py);

        // Shadow on equatorial plane
        const [sx, sy] = _project(bx, by, 0);
        this.shadowLine.setAttribute('x1', CX);
        this.shadowLine.setAttribute('y1', CY);
        this.shadowLine.setAttribute('x2', sx);
        this.shadowLine.setAttribute('y2', sy);
        this.shadowDot.setAttribute('cx', sx);
        this.shadowDot.setAttribute('cy', sy);

        // Equator ellipse (projected circle in z=0 plane)
        this._updateEllipse(this.equatorBack, this.equatorFront, 'equator');
        // Meridian (phi=const plane)
        this._updateEllipse(this.meridianBack, this.meridianFront, 'meridian');

        // Sliders sync
        if (this.thetaSlider) {
            this.thetaSlider.value = this.theta;
            this.phiSlider.value = this.phi;
            this.thetaVal.textContent = (this.theta / Math.PI).toFixed(2) + '\u03C0';
            this.phiVal.textContent = (this.phi / Math.PI).toFixed(2) + '\u03C0';
        }
    }

    _updateEllipse(backEl, frontEl, type) {
        // For simplicity, render equator and meridian as thin ellipses
        // using the oblique projection.
        if (type === 'equator') {
            // Equator: circle in z=0 plane
            // Under our projection, the equator projects to an ellipse
            const sinTilt = Math.sin(TILT);
            const cosTilt = Math.cos(TILT);
            // Semi-axes in SVG coords
            const rx = R;
            const ry = R * sinTilt;
            backEl.setAttribute('rx', rx);
            backEl.setAttribute('ry', ry);
            frontEl.setAttribute('rx', rx);
            frontEl.setAttribute('ry', ry);
        } else {
            // Meridian in current phi plane — simplified as a rotated ellipse
            // We just hide it for cleanliness
            backEl.setAttribute('rx', 0);
            backEl.setAttribute('ry', 0);
            frontEl.setAttribute('rx', 0);
            frontEl.setAttribute('ry', 0);
        }
    }

    // ─── SVG helpers ──────────────────────────────────────

    _el(tag, attrs = {}) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        return el;
    }
}

// ─── Projection helpers (module-level) ─────────────────────

/**
 * Oblique projection: 3D Bloch vector → 2D SVG coords.
 * z-axis → up, x-axis → right, y-axis → into screen at tilt angle.
 */
function _project(x, y, z) {
    const px = CX + R * (x - y * Math.cos(TILT) * 0.5);
    const py = CY + R * (-z + y * Math.sin(TILT) * 0.5);
    return [px, py];
}

/**
 * Approximate inverse projection from 2D SVG coords to Bloch angles.
 * Because the projection is lossy (3D→2D), we assume the point is
 * on the sphere surface and prefer the front hemisphere.
 */
function _inverseProject(sx, sy) {
    // Normalise to unit sphere coords
    const nx = (sx - CX) / R;
    const nz = -(sy - CY) / R;

    // Under our projection: px = x - y*cos(tilt)*0.5, py = -z + y*sin(tilt)*0.5
    // We don't have a unique solution for (x,y,z) from (px,py).
    // Approximation: assume y ≈ 0 (front view), so x ≈ nx, z ≈ nz.
    let x = nx;
    let z = nz;

    // Clamp to unit sphere
    const r2 = x * x + z * z;
    if (r2 > 1) {
        const s = 1 / Math.sqrt(r2);
        x *= s;
        z *= s;
    }

    // Recover y from sphere constraint: x²+y²+z² = 1
    const y2 = 1 - x * x - z * z;
    const y = y2 > 0 ? Math.sqrt(y2) : 0; // front hemisphere

    const theta = Math.acos(Math.max(-1, Math.min(1, z)));
    let phi = Math.atan2(y, x);
    if (phi < 0) phi += 2 * Math.PI;

    return { theta, phi };
}

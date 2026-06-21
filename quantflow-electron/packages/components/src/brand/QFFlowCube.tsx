/**
 * QFFlowCube — QuantFlow brand insignia (Pulse Swarm)
 *
 * TARGET: packages/components/src/brand/QFFlowCube.tsx
 *
 * REPLACES: QFMark (Q-ring + serif F + signal dot).
 *
 * A corner-on wireframe cube — spun about its body diagonal so the hexagon
 * silhouette holds while the inner star pinwheels — with live nodes routing
 * its edge loop. This is the square MARK only (no wordmark). For the full
 * lockup, stack <QFWordmark/> beneath it (see QFLockup).
 *
 * Drop-in API compatible with the old QFMark:
 *   size        — width = height (square)
 *   color       — wireframe color (default ivory #f2f0ec)
 *   accent      — primary live-node color (default Live Green #b7ff00)
 *   glow        — stronger node bloom (hero / loading)
 *   opacity     — for watermark / low-opacity uses
 *   pulse       — true: nodes circulate + cube rotates (live / loading / canvas);
 *                 false: STATIC single-frame mark (titlebar, app icon, chrome)
 *   strokeScale — scales wireframe stroke widths
 *   nodes       — how many live nodes circulate when pulse (default 3)
 *
 * Square viewBox 0 0 120 120. For a square app icon, pad with #0a0d12 before export.
 *
 * DESIGN AUTHORITY: DESIGN.md §4 (brand mark). Live Green = live-flow identity.
 */

import React from 'react';

const IVORY = '#f2f0ec';
const LIVE_GREEN = '#b7ff00';
// Live Green is primary; the secondary node hues read as multiple in-flight
// packets. To stay strictly monochrome-green, pass nodes={1} or override below.
const SPECTRUM = ['#b7ff00', '#2fe6cf', '#c79bff'];

// ── cube geometry ──
const CUBE_V: [number, number, number][] = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
const CUBE_E: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
const FLOOP = [0, 1, 2, 3, 7, 6, 5, 4]; // closed edge loop nodes route around

type M = number[][];
const rotX = (a: number): M => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const rotY = (a: number): M => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rotZ = (a: number): M => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const mul = (m: M, n: M): M => {
  const r: M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += m[i][k] * n[k][j]; r[i][j] = s; }
  return r;
};
const ap = (m: M, v: number[]) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const axisAngle = (ax: number[], ang: number): M => {
  const L = Math.hypot(ax[0], ax[1], ax[2]) || 1;
  const x = ax[0] / L, y = ax[1] / L, z = ax[2] / L;
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
};
const VIEW = mul(rotY(-Math.PI / 2), mul(rotZ(-Math.atan(1 / Math.SQRT2)), rotY(Math.PI / 4)));
const DIAG = [1, 1, 1];
const transform = (spin: number, tilt: number, tiltZ: number) => {
  let view = mul(rotX(tilt), VIEW);
  if (tiltZ) view = mul(rotZ(tiltZ), view);
  return mul(view, axisAngle(DIAG, spin));
};
const depthOf = (z: number) => (z + 1.6) / 3.2;

export interface QFFlowCubeProps {
  size?: number;
  color?: string;
  accent?: string;
  glow?: boolean;
  opacity?: number;
  pulse?: boolean;
  strokeScale?: number;
  nodes?: number;
}

export const QFFlowCube: React.FC<QFFlowCubeProps> = ({
  size = 120,
  color = IVORY,
  accent = LIVE_GREEN,
  glow = false,
  opacity = 1,
  pulse = false,
  strokeScale = 1,
  nodes = 3,
}) => {
  const gRef = React.useRef<SVGGElement>(null);
  // viewBox 120 → model centered at 60,60; scale ~26 fills the square nicely
  const CX = 60, CY = 58;

  React.useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    const NS = 'http://www.w3.org/2000/svg';
    g.innerHTML = '';
    const edges = CUBE_E.map(() => { const l = document.createElementNS(NS, 'line'); l.setAttribute('stroke-linecap', 'round'); g.appendChild(l); return l; });
    const n = Math.max(1, nodes);
    const palette = Array.from({ length: n }, (_, i) => (i === 0 ? accent : SPECTRUM[i % SPECTRUM.length]));
    const cores = palette.map(() => { const c = document.createElementNS(NS, 'circle'); g.appendChild(c); return c; });

    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = (t: number) => {
      const m = transform(pulse ? t * 0.46 : 0.4, 0.17 + (pulse ? Math.sin(t * 0.3) * 0.04 : 0), pulse ? Math.cos(t * 0.22) * 0.04 : 0);
      const pts = CUBE_V.map((v) => { const r = ap(m, v); return { x: CX + r[0] * 25, y: CY - r[1] * 25, z: r[2] }; });
      let bi = 0; for (let i = 1; i < 8; i++) if (pts[i].z < pts[bi].z) bi = i;
      CUBE_E.forEach((ev, i) => {
        const A = pts[ev[0]], B = pts[ev[1]], mz = (A.z + B.z) / 2, d = depthOf(mz);
        const hidden = ev[0] === bi || ev[1] === bi;
        const l = edges[i];
        l.setAttribute('x1', A.x.toFixed(2)); l.setAttribute('y1', A.y.toFixed(2));
        l.setAttribute('x2', B.x.toFixed(2)); l.setAttribute('y2', B.y.toFixed(2));
        l.setAttribute('stroke', color);
        l.setAttribute('stroke-width', ((0.7 + d * 0.8) * strokeScale).toFixed(2));
        l.setAttribute('stroke-dasharray', '3.5 4.5');
        l.setAttribute('stroke-dashoffset', (-t * 11).toFixed(1));
        l.setAttribute('opacity', (0.5 * (hidden ? 0.55 : 1) * (0.5 + d * 0.5)).toFixed(2));
      });
      const p = pulse ? t * 1.15 : 1.2;
      cores.forEach((core, k) => {
        const pn = p + k * (8 / n);
        const f = ((pn / 8) % 1 + 1) % 1 * FLOOP.length;
        const ii = Math.floor(f), frac = f - ii;
        const A = pts[FLOOP[ii % FLOOP.length]], B = pts[FLOOP[(ii + 1) % FLOOP.length]];
        const x = A.x + (B.x - A.x) * frac, y = A.y + (B.y - A.y) * frac, z = A.z + (B.z - A.z) * frac;
        const d = depthOf(z), r = (1.6 + d * 1.8) * strokeScale;
        core.setAttribute('cx', x.toFixed(2)); core.setAttribute('cy', y.toFixed(2));
        core.setAttribute('r', r.toFixed(2)); core.setAttribute('fill', palette[k]);
        core.style.filter = `drop-shadow(0 0 ${((glow ? 4 : 2.4) + d * 3) * strokeScale}px ${palette[k]})`;
      });
    };

    draw(0.0001);
    if (!pulse || reduce) return;
    let raf = 0; const t0 = performance.now();
    const loop = (now: number) => { draw((now - t0) / 1000); raf = requestAnimationFrame(loop); };
    let running = true;
    const start = () => {
      if (running || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVis = () => { if (document.hidden) stop(); else start(); };
    const onBlur = () => stop();
    const onFocus = () => start();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    raf = requestAnimationFrame(loop);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [size, color, accent, glow, pulse, strokeScale, nodes]);

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: 'block', opacity, overflow: 'visible' }}>
      <g ref={gRef} />
    </svg>
  );
};

export default QFFlowCube;

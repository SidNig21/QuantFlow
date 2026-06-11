const IVORY = "#f2f0ec";
const LIVE_GREEN = "#b7ff00";

import { getQfMarkTailPolyline } from "./qf-mark-geometry";

export interface QFMarkProps {
  size?: number;
  color?: string;
  accent?: string;
  glow?: boolean;
  opacity?: number;
  pulse?: boolean;
  mono?: boolean;
  strokeScale?: number;
}

export function QFMark({
  size = 120,
  color = IVORY,
  accent = LIVE_GREEN,
  glow = false,
  opacity = 1,
  pulse = false,
  strokeScale = 1,
}: QFMarkProps) {
  const ringR = 38;
  const sw = 2.4 * strokeScale;
  const fSw = 3.6 * strokeScale;
  const serif = 5.5 * strokeScale;
  const dotR = 4.2 * strokeScale;
  const dotFilter = `drop-shadow(0 0 ${glow ? 7 : 4}px ${accent}) drop-shadow(0 0 2px ${accent})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{ display: "block", opacity, overflow: "visible" }}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="60" cy="60" r={ringR} fill="none" stroke={color} strokeWidth={sw} />
      <polyline
        points={getQfMarkTailPolyline(ringR)}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <g stroke={color} strokeWidth={fSw} strokeLinecap="square">
        <line x1="53" y1="40" x2="53" y2="82" />
        <line x1="53" y1="40" x2="74" y2="40" />
        <line x1="53" y1="60" x2="68" y2="60" />
        <line x1={53 - serif * 0.55} y1="40" x2={53 + serif * 0.4} y2="40" strokeWidth={fSw * 0.9} />
        <line x1={53 - serif * 0.7} y1="82" x2={53 + serif * 0.7} y2="82" strokeWidth={fSw * 0.95} />
      </g>
      {pulse ? (
        <g style={{ transformOrigin: "60px 60px", animation: "qfSpin 2.6s linear infinite" }}>
          <circle cx="60" cy={60 - ringR} r={dotR} fill={accent} style={{ filter: dotFilter }} />
        </g>
      ) : (
        <circle cx="87" cy="33" r={dotR} fill={accent} style={{ filter: dotFilter }} />
      )}
    </svg>
  );
}

export default QFMark;

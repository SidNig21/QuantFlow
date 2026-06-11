/** Shared QF dial geometry (viewBox 0 0 120 120). */

export const QF_MARK_CENTER = 60;
export const QF_MARK_RING_R = 38;

/** Q tail attach at 4:30 on the ring, sharp tip at the SE bbox corner. */
export function getQfMarkTailPolyline(ringR = QF_MARK_RING_R, cx = QF_MARK_CENTER, cy = QF_MARK_CENTER): string {
  const rad = (135 * Math.PI) / 180;
  const x1 = cx + ringR * Math.sin(rad);
  const y1 = cy - ringR * Math.cos(rad);
  const x2 = cx + ringR;
  const y2 = cy + ringR;
  return `${round(x1)},${round(y1)} ${round(x2)},${round(y2)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

import { QFMark, type QFMarkProps } from "./QFMark";

export interface QFOrbitProps {
  size?: number;
  color?: string;
  accent?: string;
  spin?: boolean;
  opacity?: number;
  glow?: boolean;
  strokeScale?: number;
}

export function QFOrbit({
  size = 64,
  color,
  accent,
  spin = false,
  opacity = 1,
  glow = false,
  strokeScale = 1,
}: QFOrbitProps) {
  const markProps: QFMarkProps = {
    size,
    pulse: spin,
    opacity,
    glow,
    strokeScale,
  };
  if (color !== undefined) markProps.color = color;
  if (accent !== undefined) markProps.accent = accent;

  return (
    <QFMark {...markProps} />
  );
}

export default QFOrbit;

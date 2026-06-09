const FONT_DISPLAY = "'Space Grotesk', 'Geist', system-ui, sans-serif";
const IVORY = "#f2f0ec";
const LIVE_GREEN = "#b7ff00";
const FLOW_GLOW = "oklch(0.78 0.16 145 / 0.18)";

export interface QFWordmarkProps {
  size?: number;
  color?: string;
  underline?: boolean;
  soft?: boolean;
  align?: "flex-start" | "center" | "flex-end";
}

export function QFWordmark({
  size = 28,
  color = IVORY,
  underline = true,
  soft = true,
  align = "flex-start",
}: QFWordmarkProps) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: align, gap: size * 0.34 }}>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          color,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          paddingLeft: "0.28em",
        }}
      >
        QuantFlow
      </div>
      {underline && (
        <div
          style={{
            width: "100%",
            height: Math.max(2, size * 0.07),
            borderRadius: 2,
            background: LIVE_GREEN,
            boxShadow: soft
              ? `0 0 ${size * 0.55}px ${FLOW_GLOW}, 0 0 ${size * 0.2}px rgba(183,255,0,0.45)`
              : "none",
            opacity: soft ? 0.9 : 1,
          }}
        />
      )}
    </div>
  );
}

export default QFWordmark;

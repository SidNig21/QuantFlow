import { QFMark } from "./QFMark";
import { QFWordmark } from "./QFWordmark";

const FONT_MONO = "'IBM Plex Mono', 'Geist Mono', ui-monospace, Consolas, monospace";
const MUTED = "#6b7686";
const MUTED_2 = "#4a5466";

export interface QFLockupProps {
  markSize?: number;
  glow?: boolean;
  descriptor?: string;
  tagline?: string;
  orientation?: "horizontal" | "vertical";
}

export function QFLockup({
  markSize = 64,
  glow = true,
  descriptor,
  tagline,
  orientation = "horizontal",
}: QFLockupProps) {
  const horizontal = orientation === "horizontal";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: horizontal ? "row" : "column",
        alignItems: "center",
        gap: horizontal ? 22 : 18,
      }}
    >
      <QFMark size={markSize} glow={glow} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: horizontal ? "flex-start" : "center",
          gap: 8,
        }}
      >
        <QFWordmark size={markSize * 0.32} align={horizontal ? "flex-start" : "center"} />
        {descriptor && (
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: markSize * 0.155,
              color: MUTED,
              textTransform: "uppercase",
              letterSpacing: "0.24em",
              paddingLeft: "0.24em",
              marginTop: -2,
            }}
          >
            {descriptor}
          </div>
        )}
        {tagline && (
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: markSize * 0.13,
              color: MUTED_2,
              textTransform: "uppercase",
              letterSpacing: "0.28em",
              paddingLeft: "0.28em",
            }}
          >
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
}

export default QFLockup;

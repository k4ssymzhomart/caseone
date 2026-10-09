import React from "react";
import { AbsoluteFill } from "remotion";
import { SAFE } from "../theme";

/** Captions on the left, the device or window on the right: every readable element has its own slot. */
export const Split: React.FC<{
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth?: number;
  gap?: number;
  align?: "center" | "flex-start";
}> = ({ left, right, leftWidth = 700, gap = 80, align = "center" }) => (
  <AbsoluteFill
    style={{
      padding: `${SAFE.y}px ${SAFE.x}px`,
      display: "flex",
      flexDirection: "row",
      alignItems: align,
      gap,
    }}
  >
    <div style={{ width: leftWidth, flex: "none", display: "flex", flexDirection: "column", gap: 28 }}>{left}</div>
    <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 56 }}>{right}</div>
  </AbsoluteFill>
);

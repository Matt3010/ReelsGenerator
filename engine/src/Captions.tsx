// Word-by-word captions: chunks of up to 3 words, the spoken word highlighted.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { Word } from "./types";

const chunk = (words: Word[]) => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    // never run a caption across a pause (scene change)
    if (cur.length && w.start - cur[cur.length - 1].end > 8) { out.push(cur); cur = []; }
    cur.push(w);
    if (cur.length === 3 || cur.map((x) => x.text).join(" ").length > 16 || /[.,!?;:]$/.test(w.text)) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
};

export const Captions: React.FC<{ words: Word[] }> = ({ words }) => {
  const f = useCurrentFrame();
  const groups = chunk(words);
  const g = groups.find((c, i) => f >= c[0].start && f < (groups[i + 1]?.[0].start ?? c[c.length - 1].end + 8));
  if (!g) return null;
  const pop = Math.min(1, (f - g[0].start + 1) / 4);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", top: "24%" }}>
      <div style={{
        fontFamily: "'Arial Black', 'Segoe UI Black', Impact, sans-serif", fontSize: 74, lineHeight: 1.12,
        textAlign: "center", maxWidth: 900, display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: 20, transform: `scale(${0.85 + 0.15 * pop})`,
        textTransform: "uppercase", letterSpacing: 1,
      }}>
        {g.map((w, i) => {
          const on = f >= w.start && f < w.end + 2;
          return (
            <span key={i} style={{
              color: on ? "#ffe14d" : "#ffffff", WebkitTextStroke: "14px #120c1a", paintOrder: "stroke fill",
              textShadow: "0 8px 0 rgba(0,0,0,0.35)", whiteSpace: "nowrap",
            }}>{w.text.replace(/[.,!?;:]+$/, "")}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

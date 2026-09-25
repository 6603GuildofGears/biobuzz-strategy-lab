"use client";

import {
  CELL_HALF_WIDTH,
  CELL_OPENING_OFFSET,
  CENTER,
  FIELD,
  FLOWER_RADIUS,
  FLOWERS,
  GARDEN,
  HIVE_FOOTPRINT,
  HIVE_FRAME,
  HIVE_X,
  LOADING_ZONE,
  type Rect,
} from "@/lib/sim/field";
import { BALL_RADIUS } from "@/lib/sim/rules";
import type { Alliance, Frame, Kind } from "@/lib/sim/types";

const COLORS = {
  red: "#ef4444",
  blue: "#3b82f6",
  pollen: "#facc15",
};

const kindColor = (k: Kind) => (k === "P" ? COLORS.pollen : k === "R" ? COLORS.red : COLORS.blue);
/** SVG y grows downward, FIELD y grows toward the rear wall, so flip it. */
const Y = (y: number) => FIELD - y;

function Zone({ r, color, dash }: { r: Rect; color: string; dash?: boolean }) {
  return (
    <rect
      x={r.x0}
      y={Y(r.y1)}
      width={r.x1 - r.x0}
      height={r.y1 - r.y0}
      fill={color}
      fillOpacity={0.18}
      stroke={color}
      strokeWidth={0.06}
      strokeDasharray={dash ? "0.15 0.1" : undefined}
    />
  );
}

/** One alliance's HIVE: a CELL at each end. The upward CELL is filled and shows how many elements it holds. */
function Hive({ a, frame }: { a: Alliance; frame: Frame | undefined }) {
  const up = frame?.hiveUp[a] ?? (a === "red" ? "south" : "north");
  const count = frame?.cells[a].length ?? 3;
  const x = HIVE_X[a];
  const cellDepth = 1;
  return (
    <g>
      <line x1={x} y1={Y(CENTER - CELL_OPENING_OFFSET + 0.3)} x2={x} y2={Y(CENTER + CELL_OPENING_OFFSET - 0.3)} stroke={COLORS[a]} strokeWidth={0.08} />
      {(["north", "south"] as const).map((end) => {
        const s = end === "north" ? 1 : -1;
        const isUp = end === up;
        const outer = CENTER + s * CELL_OPENING_OFFSET;
        const inner = outer - s * cellDepth;
        const y0 = Math.min(inner, outer);
        return (
          <g key={end}>
            <rect
              x={x - CELL_HALF_WIDTH}
              y={Y(y0 + cellDepth)}
              width={CELL_HALF_WIDTH * 2}
              height={cellDepth}
              rx={0.08}
              fill={isUp ? COLORS[a] : "#111827"}
              fillOpacity={isUp ? 0.85 : 1}
              stroke={COLORS[a]}
              strokeWidth={0.06}
            />
            {/* The open side of the upward CELL, where shots go in. */}
            {isUp && <line x1={x - CELL_HALF_WIDTH} y1={Y(outer)} x2={x + CELL_HALF_WIDTH} y2={Y(outer)} stroke="white" strokeWidth={0.1} />}
            {isUp && (
              <text x={x} y={Y(y0 + cellDepth / 2) + 0.15} textAnchor="middle" fontSize={0.42} fontWeight={700} fill="white">
                {count}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function FieldView({ frame, robotLabels }: { frame: Frame | undefined; robotLabels: string[] }) {
  return (
    <svg viewBox={`-0.6 -0.6 ${FIELD + 1.2} ${FIELD + 1.2}`} className="h-auto w-full select-none" role="img" aria-label="BIOBUZZ field">
      <rect x={-0.6} y={-0.6} width={FIELD + 1.2} height={FIELD + 1.2} fill="#0b0f19" rx={0.3} />
      <rect x={-0.55} y={0} width={0.4} height={FIELD} fill={COLORS.red} opacity={0.5} />
      <rect x={FIELD + 0.15} y={0} width={0.4} height={FIELD} fill={COLORS.blue} opacity={0.5} />
      <rect x={0} y={0} width={FIELD} height={FIELD} fill="#1f2937" />
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i}>
          <line x1={i * 2} y1={0} x2={i * 2} y2={FIELD} stroke="#374151" strokeWidth={0.03} />
          <line x1={0} y1={i * 2} x2={FIELD} y2={i * 2} stroke="#374151" strokeWidth={0.03} />
        </g>
      ))}
      <rect x={0} y={0} width={FIELD} height={FIELD} fill="none" stroke="#9ca3af" strokeWidth={0.08} />
      <text x={FIELD / 2} y={FIELD + 0.45} textAnchor="middle" fontSize={0.32} fill="#6b7280">
        audience
      </text>

      {(["red", "blue"] as Alliance[]).map((a) => (
        <g key={a}>
          <Zone r={LOADING_ZONE[a]} color={COLORS[a]} />
          <Zone r={GARDEN[a]} color={COLORS[a]} dash />
        </g>
      ))}

      {/* HIVE frame: robots can drive under it, but not through the two A-frame ends. */}
      <rect
        x={HIVE_FOOTPRINT.x0}
        y={Y(HIVE_FOOTPRINT.y1)}
        width={HIVE_FOOTPRINT.x1 - HIVE_FOOTPRINT.x0}
        height={HIVE_FOOTPRINT.y1 - HIVE_FOOTPRINT.y0}
        fill="#4b5563"
        fillOpacity={0.12}
        stroke="#6b7280"
        strokeWidth={0.03}
        strokeDasharray="0.12 0.08"
      />
      {HIVE_FRAME.map((r, i) => (
        <rect key={i} x={r.x0} y={Y(r.y1)} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="#9ca3af" />
      ))}
      <Hive a="red" frame={frame} />
      <Hive a="blue" frame={frame} />

      {FLOWERS.map((f, i) => {
        const st = frame?.flowers[i];
        const top = st ? [...st.volume].reverse().find((k) => k !== "P") : undefined;
        const ring = top === "R" ? COLORS.red : top === "B" ? COLORS.blue : "#d1d5db";
        const lx = f.x + f.out.x * 1.05;
        const ly = f.y + f.out.y * 0.95;
        return (
          <g key={i}>
            <circle cx={f.x} cy={Y(f.y)} r={FLOWER_RADIUS} fill="#0f172a" stroke={ring} strokeWidth={0.1} />
            {st?.volume.map((k, j) => (
              <circle key={j} cx={f.x - 0.2 + (j % 3) * 0.2} cy={Y(f.y) - 0.15 + Math.floor(j / 3) * 0.17} r={0.075} fill={kindColor(k)} />
            ))}
            <text x={lx} y={Y(ly) + 0.1} textAnchor="middle" fontSize={0.26} fill="#9ca3af">
              F{i + 1} · {st?.volume.length ?? 0}
              {st && st.below > 0 ? ` (+${st.below}↓)` : ""}
            </text>
          </g>
        );
      })}

      {frame?.floor
        .filter((e) => e.z <= 0.05)
        .map((e, i) => (
          <circle key={i} cx={e.x} cy={Y(e.y)} r={BALL_RADIUS[e.k]} fill={kindColor(e.k)} stroke="#00000055" strokeWidth={0.02} />
        ))}

      {frame?.robots.map((r, i) => {
        const a: Alliance = i < 2 ? "red" : "blue";
        const scale = Math.min(1, Math.min(r.hw, r.hl) / 0.75);
        return (
          <g key={i} transform={`translate(${r.x} ${Y(r.y)}) rotate(${((-r.heading * 180) / Math.PI).toFixed(1)})`}>
            <rect
              x={-r.hl}
              y={-r.hw}
              width={r.hl * 2}
              height={r.hw * 2}
              rx={0.12}
              fill={COLORS[a]}
              fillOpacity={r.mode === "wait" && frame.t < 30 ? 0.3 : 0.9}
              stroke={r.mode === "parked" ? "#fde047" : "white"}
              strokeWidth={r.mode === "parked" ? 0.1 : 0.05}
            />
            <polygon points={`${r.hl},0 ${r.hl - 0.22},${0.16 * scale} ${r.hl - 0.22},${-0.16 * scale}`} fill="white" />
            <text y={-0.1 * scale} textAnchor="middle" fontSize={0.42 * scale} fontWeight={700} fill="white">
              {robotLabels[i]}
            </text>
            {r.held.map((k, j) => (
              <circle key={j} cx={(-0.45 + j * 0.3) * scale} cy={0.38 * scale} r={0.12 * scale} fill={kindColor(k)} stroke="#000" strokeWidth={0.02} />
            ))}
          </g>
        );
      })}

      {frame?.floor
        .filter((e) => e.z > 0.05)
        .map((e, i) => {
          const lift = Math.min(1.8, e.z);
          const r = BALL_RADIUS[e.k];
          return (
            <g key={i}>
              <ellipse cx={e.x} cy={Y(e.y)} rx={r} ry={r * 0.6} fill="#000" opacity={0.35} />
              <circle cx={e.x} cy={Y(e.y) - lift * 0.25} r={r * (1 + lift * 0.2)} fill={kindColor(e.k)} stroke="#ffffffaa" strokeWidth={0.025} />
            </g>
          );
        })}
    </svg>
  );
}

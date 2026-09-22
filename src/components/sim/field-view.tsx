"use client";

import {
  FIELD,
  FLOWERS,
  GARDEN,
  HIVE_CELL_OFFSET,
  HIVE_POS,
  LOADING_ZONE,
  ROBOT_HALF,
  type Rect,
} from "@/lib/sim/field";
import type { Alliance, Frame, Kind } from "@/lib/sim/types";

const COLORS = {
  red: "#ef4444",
  blue: "#3b82f6",
  pollen: "#facc15",
};

const kindColor = (k: Kind) => (k === "P" ? COLORS.pollen : k === "R" ? COLORS.red : COLORS.blue);
const kindR = (k: Kind) => (k === "P" ? 0.117 : 0.15);
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

      <rect x={6 - 2.06} y={Y(6) - 1.62} width={4.12} height={3.24} fill="none" stroke="#4b5563" strokeWidth={0.05} strokeDasharray="0.2 0.12" />
      {(["red", "blue"] as Alliance[]).map((a) => {
        const h = HIVE_POS[a];
        const flip = frame ? frame.hiveFlip[a] % 2 : 0;
        const cells = [h.y + HIVE_CELL_OFFSET, h.y - HIVE_CELL_OFFSET];
        const count = frame?.cells[a].length ?? 0;
        return (
          <g key={a}>
            <line x1={h.x} y1={Y(cells[0])} x2={h.x} y2={Y(cells[1])} stroke={COLORS[a]} strokeWidth={0.08} />
            {cells.map((cy, i) => {
              const up = i === flip;
              return (
                <g key={i}>
                  <rect
                    x={h.x - 0.55}
                    y={Y(cy) - 0.4}
                    width={1.1}
                    height={0.8}
                    rx={0.08}
                    fill={up ? COLORS[a] : "#111827"}
                    fillOpacity={up ? 0.85 : 1}
                    stroke={COLORS[a]}
                    strokeWidth={0.06}
                  />
                  {up && (
                    <text x={h.x} y={Y(cy) + 0.14} textAnchor="middle" fontSize={0.4} fontWeight={700} fill="white">
                      {count}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {FLOWERS.map((f, i) => {
        const st = frame?.flowers[i];
        const top = st ? [...st.stack].reverse().find((k) => k !== "P") : undefined;
        const ring = top === "R" ? COLORS.red : top === "B" ? COLORS.blue : "#d1d5db";
        const labelY = f.y < 6 ? Y(f.y) - 0.62 : Y(f.y) + 0.85;
        return (
          <g key={i}>
            <circle cx={f.x} cy={Y(f.y)} r={0.36} fill="#0f172a" stroke={ring} strokeWidth={0.1} />
            {st?.stack.map((k, j) => (
              <circle key={j} cx={f.x - 0.2 + (j % 3) * 0.2} cy={Y(f.y) - 0.1 + Math.floor(j / 3) * 0.2} r={0.08} fill={kindColor(k)} />
            ))}
            <text x={f.x} y={labelY} textAnchor="middle" fontSize={0.28} fill="#9ca3af">
              F{i + 1} · {st?.stack.length ?? 0}
              {st && st.bottom > 0 ? ` (+${st.bottom}↓)` : ""}
            </text>
          </g>
        );
      })}

      {frame?.floor.map((e, i) => (
        <circle key={i} cx={e.x} cy={Y(e.y)} r={kindR(e.k)} fill={kindColor(e.k)} stroke="#00000055" strokeWidth={0.02} />
      ))}

      {frame?.robots.map((r, i) => {
        const a: Alliance = i < 2 ? "red" : "blue";
        return (
          <g key={i} transform={`translate(${r.x} ${Y(r.y)})`}>
            <rect
              x={-ROBOT_HALF}
              y={-ROBOT_HALF}
              width={ROBOT_HALF * 2}
              height={ROBOT_HALF * 2}
              rx={0.15}
              fill={COLORS[a]}
              fillOpacity={r.mode === "dead" ? 0.3 : 0.9}
              stroke={r.mode === "parked" ? "#fde047" : "white"}
              strokeWidth={r.mode === "parked" ? 0.1 : 0.05}
            />
            <text y={-0.1} textAnchor="middle" fontSize={0.42} fontWeight={700} fill="white">
              {robotLabels[i]}
            </text>
            {r.held.map((k, j) => (
              <circle key={j} cx={-0.45 + j * 0.3} cy={0.38} r={0.12} fill={kindColor(k)} stroke="#000" strokeWidth={0.02} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

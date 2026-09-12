"use client";

import { useMemo, useState } from "react";

type Point = { key: string; label: string; value: number };
type Props = { data: Point[] };

function smoothPath(values: number[]) {
  const width = 800;
  const height = 210;
  const top = 24;
  const bottom = 176;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width,
    y: bottom - (value / max) * (bottom - top),
    value,
  }));

  if (!points.length) return { line: "", area: "", points };
  if (points.length === 1) {
    const p = points[0];
    return { line: `M ${p.x} ${p.y}`, area: `M ${p.x} ${p.y} L ${p.x} ${height} Z`, points };
  }

  let line = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return {
    line,
    area: `${line} L ${points.at(-1)!.x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`,
    points,
  };
}

export default function LiveOverviewChart({ data }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const chart = useMemo(() => smoothPath(data.map((d) => d.value)), [data]);
  const activeIndex = hovered;
  const activePoint = activeIndex !== null ? chart.points[activeIndex] : null;
  const activeData = activeIndex !== null ? data[activeIndex] : null;

  return (
    <div className="uai-overview-chart">
      <div className="uai-chart-caption">
        <span className="uai-chart-caption-dot" />
        <span>Envios nos últimos 7 dias</span>
      </div>

      <div className="uai-chart-stage">
        <svg viewBox="0 0 800 210" preserveAspectRatio="none" aria-label="Envios reais dos últimos sete dias">
          <defs>
            <linearGradient id="uaiOverviewArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E7B34E" stopOpacity=".18" />
              <stop offset="100%" stopColor="#E7B34E" stopOpacity="0" />
            </linearGradient>
            <filter id="uaiOverviewGlow" x="-20%" y="-30%" width="140%" height="160%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {[52, 104, 156].map((y) => (
            <line key={y} x1="0" x2="800" y1={y} y2={y} className="uai-chart-grid-line" />
          ))}
          <path d={chart.area} className="uai-chart-area" />
          <path d={chart.line} className="uai-chart-line" />

          {chart.points.map((point, index) => (
            <g key={data[index]?.key ?? index}>
              <rect
                x={Math.max(0, point.x - 58)}
                y="0"
                width="116"
                height="210"
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              />
              {hovered === index ? <circle cx={point.x} cy={point.y} r="4.5" className="uai-chart-hover-dot" /> : null}
            </g>
          ))}

          {activePoint ? <line x1={activePoint.x} x2={activePoint.x} y1="16" y2="184" className="uai-chart-cursor" /> : null}
        </svg>

        {activePoint && activeData ? (
          <div className="uai-chart-tooltip" style={{ left: `clamp(10px, calc(${(activePoint.x / 800) * 100}% - 52px), calc(100% - 112px))`, top: `${Math.max(8, activePoint.y - 52)}px` }}>
            <strong>{activeData.value.toLocaleString("pt-BR")}</strong>
            <span>{activeData.label}</span>
          </div>
        ) : null}
      </div>

      <div className="uai-chart-days">
        {data.map((item) => <span key={item.key}>{item.label}</span>)}
      </div>
    </div>
  );
}

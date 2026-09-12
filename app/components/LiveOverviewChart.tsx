"use client";

import { useMemo, useState } from "react";

type Point = { key: string; label: string; value: number };

type Props = {
  data: Point[];
  latestValue: number;
};

function buildSmoothPath(values: number[]) {
  const width = 760;
  const top = 28;
  const bottom = 178;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(1, max - min);

  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const normalized = (value - min) / span;
    const y = bottom - normalized * (bottom - top);
    return { x, y, value };
  });

  if (!points.length) return { line: "", area: "", points };
  if (points.length === 1) {
    const p = points[0];
    return {
      line: `M ${p.x} ${p.y}`,
      area: `M ${p.x} ${p.y} L ${p.x} 205 Z`,
      points,
    };
  }

  let line = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
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

  const area = `${line} L ${points.at(-1)!.x.toFixed(1)} 205 L ${points[0].x.toFixed(1)} 205 Z`;
  return { line, area, points };
}

export default function LiveOverviewChart({ data, latestValue }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const chart = useMemo(() => buildSmoothPath(data.map((item) => item.value)), [data]);
  const max = Math.max(1, ...data.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const activeIndex = hovered ?? Math.max(0, data.length - 1);
  const active = data[activeIndex];
  const activePoint = chart.points[activeIndex];

  return (
    <div className="live-chart-card">
      <div className="live-chart-header">
        <div>
          <div className="live-chart-kicker"><span className="overview-live-dot"/>Envios em tempo real</div>
          <div className="live-chart-title">Performance dos últimos 7 dias</div>
        </div>
        <div className="live-chart-meta">
          <div><span>Total</span><strong>{total.toLocaleString("pt-BR")}</strong></div>
          <div><span>Hoje</span><strong>{latestValue.toLocaleString("pt-BR")}</strong></div>
        </div>
      </div>

      <div className="live-chart-wrap">
        <div className="live-chart-y-axis">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>

        <svg viewBox="0 0 760 205" preserveAspectRatio="none" aria-label="Envios reais dos últimos sete dias">
          <defs>
            <linearGradient id="liveAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E7B34E" stopOpacity=".34" />
              <stop offset="55%" stopColor="#E7B34E" stopOpacity=".11" />
              <stop offset="100%" stopColor="#E7B34E" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="liveStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#C97B37" />
              <stop offset="45%" stopColor="#E7B34E" />
              <stop offset="100%" stopColor="#F6D17E" />
            </linearGradient>
            <filter id="liveGlow" x="-20%" y="-30%" width="140%" height="160%">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {[42, 92, 142, 192].map((y) => <line key={y} x1="0" x2="760" y1={y} y2={y} className="live-chart-grid" />)}
          <path d={chart.area} className="live-chart-area" />
          <path d={chart.line} className="live-chart-line" />

          {chart.points.map((point, index) => (
            <g key={data[index]?.key ?? index}>
              <rect
                x={Math.max(0, point.x - 54)}
                y="0"
                width="108"
                height="205"
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "crosshair" }}
              />
              <circle cx={point.x} cy={point.y} r={hovered === index ? 5.5 : 3.3} className="live-chart-dot" />
            </g>
          ))}

          {activePoint ? (
            <g pointerEvents="none">
              <line x1={activePoint.x} x2={activePoint.x} y1="20" y2="192" className="live-chart-cursor" />
              <circle cx={activePoint.x} cy={activePoint.y} r="10" className="live-chart-ring" />
              <circle cx={activePoint.x} cy={activePoint.y} r="4.5" className="live-chart-active-dot" />
            </g>
          ) : null}
        </svg>

        {active && activePoint ? (
          <div
            className="live-chart-tooltip"
            style={{ left: `clamp(62px, calc(${(activePoint.x / 760) * 100}% + 10px), calc(100% - 150px))` }}
          >
            <span>{active.label}</span>
            <strong>{active.value.toLocaleString("pt-BR")}</strong>
            <small>mensagens enviadas</small>
          </div>
        ) : null}
      </div>

      <div className="live-chart-labels">
        {data.map((item) => <span key={item.key}>{item.label}<small>{item.value}</small></span>)}
      </div>
    </div>
  );
}

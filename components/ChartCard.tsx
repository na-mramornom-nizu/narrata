'use client';
import { motion } from 'framer-motion';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart,
} from 'recharts';
import type { ChartSpec, Row } from '@/lib/types';
import { buildChartData } from '@/lib/chart';
import { CHART_PALETTE, fmtNum } from '@/lib/utils';
import { Card } from './ui';

export function ChartCard({ spec, rows, index = 0 }: { spec: ChartSpec; rows: Row[]; index?: number }) {
  const data = buildChartData(rows, spec).slice(0, spec.limit ?? 12);
  const axisProps = {
    stroke: 'rgba(255,255,255,.25)',
    tick: { fill: 'rgba(255,255,255,.45)', fontSize: 11 },
    tickLine: false,
    axisLine: false,
  } as const;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + index * 0.08, duration: 0.5 }}>
      <Card className="p-6">
        <div className="mb-5">
          <h3 className="text-[15px] font-medium text-white/90">{spec.title}</h3>
          {spec.subtitle && <p className="mt-0.5 text-xs text-white/40">{spec.subtitle}</p>}
        </div>
        <div className="w-full" style={{ height: spec.type === 'bar' ? Math.max(256, data.length * 34 + 32) : 256 }}>
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(spec, data, axisProps)}
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}

function renderChart(
  spec: ChartSpec,
  data: { name: string; value: number }[],
  axis: Record<string, unknown>,
) {
  const common = (
    <>
      <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
      <XAxis dataKey="name" {...axis} interval={0} angle={0} />
      <YAxis {...axis} width={40} />
      <Tooltip content={<GlassTooltip suffix={spec.valueSuffix} />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
    </>
  );

  if (spec.type === 'line') {
    return (
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {common}
        <Line type="monotone" dataKey="value" stroke={CHART_PALETTE[0]} strokeWidth={2.5}
          dot={{ r: 0 }} activeDot={{ r: 5, strokeWidth: 0, fill: CHART_PALETTE[0] }} />
      </LineChart>
    );
  }

  if (spec.type === 'area') {
    return (
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_PALETTE[0]} stopOpacity={0.55} />
            <stop offset="100%" stopColor={CHART_PALETTE[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        {common}
        <Area type="monotone" dataKey="value" stroke={CHART_PALETTE[0]} strokeWidth={2} fill="url(#areaFill)" />
      </AreaChart>
    );
  }

  if (spec.type === 'pie') {
    return (
      <PieChart>
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,.65)" }} />
        <Tooltip content={<GlassTooltip suffix={spec.valueSuffix} />} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={92}
          paddingAngle={3} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
      </PieChart>
    );
  }

  return (
    <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
      <defs>
        <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CHART_PALETTE[0]} stopOpacity={0.95} />
          <stop offset="100%" stopColor={CHART_PALETTE[1]} stopOpacity={0.55} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke="rgba(255,255,255,.05)" horizontal={false} />
      <XAxis type="number" {...axis} tickFormatter={(value) => `${Number(value).toLocaleString('ru-RU')}${spec.valueSuffix ?? ''}`} />
      <YAxis type="category" dataKey="name" {...axis} width={126} interval={0}
        tick={({ x, y, payload }: any) => (
          <g transform={`translate(${x},${y})`}>
            <title>{payload.value}</title>
            <text x={-4} y={0} dy={4} textAnchor="end" fill="rgba(255,255,255,.65)" fontSize={11}>
              {String(payload.value).length > 19 ? `${String(payload.value).slice(0, 18)}…` : payload.value}
            </text>
          </g>
        )} />
      <Tooltip content={<GlassTooltip suffix={spec.valueSuffix} />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
      <Bar dataKey="value" fill="url(#barFill)" radius={[0, 6, 6, 0]} maxBarSize={24} />
    </BarChart>
  );
}

function GlassTooltip({ active, payload, label, suffix = '' }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-xs backdrop-blur-xl shadow-2xl">
      <div className="text-white/50">{label ?? payload[0].name}</div>
      <div className="mt-0.5 font-medium text-white">{fmtNum(payload[0].value)}{suffix}</div>
    </div>
  );
}

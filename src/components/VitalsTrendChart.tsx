import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Activity, Plus } from 'lucide-react';

export interface VitalRecord {
  id: number;
  patient_id?: number;
  encounter_type?: string;
  blood_pressure: string;
  pulse: number;
  temperature: number;
  respiratory_rate: number;
  oxygen_saturation: number;
  weight_kg?: number | null;
  recorded_by_name?: string | null;
  created_at: string;
}

interface Props {
  vitals: VitalRecord[];
  patientName?: string;
  compact?: boolean;
  canRecordVitals?: boolean;
  onRequestRecordVitals?: () => void;
}

type MetricGroup = 'cardio' | 'respiratory' | 'temperature' | 'all';

function parseTimestamp(raw: string): Date {
  if (!raw) return new Date(NaN);
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(raw);
}

function parseBloodPressure(bp: string): { systolic: number | null; diastolic: number | null } {
  const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(String(bp || ''));
  if (!m) return { systolic: null, diastolic: null };
  return { systolic: Number(m[1]), diastolic: Number(m[2]) };
}

export const VitalsTrendChart: React.FC<Props> = ({
  vitals,
  patientName,
  compact = false,
  canRecordVitals = false,
  onRequestRecordVitals,
}) => {
  const [metricGroup, setMetricGroup] = useState<MetricGroup>('cardio');

  const chartData = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return (vitals || [])
      .map((v) => {
        const dt = parseTimestamp(v.created_at);
        const ts = dt.getTime();
        const { systolic, diastolic } = parseBloodPressure(v.blood_pressure);
        return {
          ...v,
          ts,
          dateLabel: Number.isNaN(ts)
            ? String(v.created_at).slice(0, 10)
            : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullDateLabel: Number.isNaN(ts)
            ? String(v.created_at)
            : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          systolic,
          diastolic,
          pulse: Number(v.pulse),
          oxygen_saturation: Number(v.oxygen_saturation),
          respiratory_rate: Number(v.respiratory_rate),
          temperature: Number(v.temperature),
        };
      })
      .filter((row) => !Number.isNaN(row.ts) && row.ts >= cutoff)
      .sort((a, b) => a.ts - b.ts);
  }, [vitals]);

  const summary = useMemo(() => {
    if (chartData.length === 0) return null;
    const first = chartData[0];
    const latest = chartData[chartData.length - 1];
    const avgPulse = Math.round(chartData.reduce((acc, r) => acc + (r.pulse || 0), 0) / chartData.length);
    const avgSpo2 = Math.round(chartData.reduce((acc, r) => acc + (r.oxygen_saturation || 0), 0) / chartData.length);
    const sysDelta =
      first.systolic != null && latest.systolic != null ? latest.systolic - first.systolic : null;
    return {
      latest,
      avgPulse,
      avgSpo2,
      sysDelta,
      count: chartData.length,
    };
  }, [chartData]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              30-Day Vitals &amp; Recovery Trend{patientName ? ` · ${patientName}` : ''}
            </h3>
            {summary ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                <span>{summary.count} readings (30d)</span>
                <span aria-hidden="true">·</span>
                <span>Latest BP {summary.latest.blood_pressure} mmHg</span>
                {summary.sysDelta !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className={summary.sysDelta <= 0 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                      Systolic {summary.sysDelta > 0 ? `+${summary.sysDelta}` : summary.sysDelta} mmHg vs 30d start
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>Avg Pulse {summary.avgPulse} bpm</span>
                <span aria-hidden="true">·</span>
                <span>Avg SpO2 {summary.avgSpo2}%</span>
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5">
                Track systolic/diastolic blood pressure, pulse, oxygen saturation, respiratory rate, and temperature over the last 30 days.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'cardio', label: 'BP & Pulse' },
              { id: 'respiratory', label: 'SpO2 & Resp' },
              { id: 'temperature', label: 'Temp (°C)' },
              { id: 'all', label: 'All Vitals' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMetricGroup(opt.id as MetricGroup)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  metricGroup === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {canRecordVitals && onRequestRecordVitals && (
            <button
              type="button"
              onClick={onRequestRecordVitals}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Vitals</span>
            </button>
          )}
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className={compact ? 'h-56' : 'h-72'}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 11, fill: '#64748B' }}
                stroke="#CBD5E1"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748B' }}
                stroke="#CBD5E1"
                domain={
                  metricGroup === 'temperature'
                    ? [35.5, 40]
                    : metricGroup === 'respiratory'
                    ? [10, 102]
                    : ['auto', 'auto']
                }
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const row = payload[0].payload;
                  return (
                    <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono tabular-nums">
                      <div className="font-sans font-bold text-slate-100">{row.fullDateLabel}</div>
                      <div className="text-blue-300">BP: {row.blood_pressure} mmHg</div>
                      <div className="text-rose-300">Pulse: {row.pulse} bpm</div>
                      <div className="text-emerald-300">SpO2: {row.oxygen_saturation}%</div>
                      <div className="text-amber-300">Resp Rate: {row.respiratory_rate} /min</div>
                      <div className="text-indigo-300">Temp: {row.temperature} °C</div>
                      {row.recorded_by_name && (
                        <div className="font-sans text-[11px] text-slate-400 pt-1 border-t border-slate-700">
                          Recorded by {row.recorded_by_name}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '12px' }} />

              {(metricGroup === 'cardio' || metricGroup === 'all') && (
                <>
                  <ReferenceLine y={120} stroke="#94A3B8" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="systolic"
                    name="Systolic BP (mmHg)"
                    stroke="#1D4ED8"
                    strokeWidth={2.5}
                    dot={{ r: 3.5 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="diastolic"
                    name="Diastolic BP (mmHg)"
                    stroke="#6366F1"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="pulse"
                    name="Pulse (bpm)"
                    stroke="#E11D48"
                    strokeWidth={2.5}
                    dot={{ r: 3.5 }}
                    activeDot={{ r: 5 }}
                  />
                </>
              )}

              {(metricGroup === 'respiratory' || metricGroup === 'all') && (
                <>
                  <Line
                    type="monotone"
                    dataKey="oxygen_saturation"
                    name="SpO2 (%)"
                    stroke="#16A34A"
                    strokeWidth={2.5}
                    dot={{ r: 3.5 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="respiratory_rate"
                    name="Resp Rate (/min)"
                    stroke="#D97706"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </>
              )}

              {(metricGroup === 'temperature' || metricGroup === 'all') && (
                <>
                  {metricGroup === 'temperature' && (
                    <ReferenceLine y={37.0} stroke="#94A3B8" strokeDasharray="4 4" />
                  )}
                  <Line
                    type="monotone"
                    dataKey="temperature"
                    name="Temp (°C)"
                    stroke="#7C3AED"
                    strokeWidth={2.5}
                    dot={{ r: 3.5 }}
                    activeDot={{ r: 5 }}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-44 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-xs text-slate-500">
            No vitals recorded in the last 30 days for this patient.
          </p>
          {canRecordVitals && onRequestRecordVitals && (
            <button
              type="button"
              onClick={onRequestRecordVitals}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Log First Vitals Entry
            </button>
          )}
        </div>
      )}
    </div>
  );
};

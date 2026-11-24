import { esc } from './ui.js';

const PALETTE = ['#1E5EFF', '#16A34A', '#F59E0B', '#6B7280', '#DC2626', '#0EA5E9'];

export function renderBarChart(items = [], title = '') {
  if (!items.length) return `<div class="muted text-sm">No chart data available.</div>`;
  const max = Math.max(1, ...items.map((i) => Number(i.value || 0)));
  const w = 420;
  const h = 190;
  const padL = 32;
  const padB = 38;
  const plotW = w - padL - 12;
  const plotH = h - padB - 14;
  const bw = Math.max(16, Math.floor(plotW / items.length) - 10);

  const bars = items.map((item, idx) => {
    const val = Number(item.value || 0);
    const bh = Math.max(3, (val / max) * plotH);
    const x = padL + idx * (plotW / items.length) + 6;
    const y = 14 + plotH - bh;
    const label = String(item.label || '').slice(0, 10);
    return `
      <g>
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" rx="4" fill="#1E5EFF">
          <title>${esc(item.label)}: ${val}</title>
        </rect>
        <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="#161823" font-weight="600">${val}</text>
        <text x="${(x + bw / 2).toFixed(1)}" y="${h - 14}" text-anchor="middle" font-size="10" fill="#6B7280">${esc(label)}</text>
      </g>
    `;
  }).join('');

  return `
    <div>
      ${title ? `<div style="font-weight:600;margin-bottom:8px">${esc(title)}</div>` : ''}
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block">
        <line x1="${padL}" y1="${14 + plotH}" x2="${w - 8}" y2="${14 + plotH}" stroke="#E5E7EB" stroke-width="1"/>
        ${bars}
      </svg>
    </div>
  `;
}

export function renderLineChart(items = [], title = '') {
  if (!items.length) return `<div class="muted text-sm">No trend data available.</div>`;
  const max = Math.max(1, ...items.map((i) => Number(i.value || 0)));
  const w = 420;
  const h = 180;
  const padL = 32;
  const padB = 34;
  const plotW = w - padL - 20;
  const plotH = h - padB - 16;

  const pts = items.map((item, idx) => {
    const x = items.length === 1 ? padL + plotW / 2 : padL + (idx * plotW) / (items.length - 1);
    const y = 16 + plotH - (Number(item.value || 0) / max) * plotH;
    return { x, y, label: String(item.label || '').slice(5), value: Number(item.value || 0) };
  });

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = pts.map((p) => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#1E5EFF"><title>${esc(p.label)}: ${p.value}</title></circle>
    <text x="${p.x.toFixed(1)}" y="${h - 10}" text-anchor="middle" font-size="10" fill="#6B7280">${esc(p.label)}</text>
  `).join('');

  return `
    <div>
      ${title ? `<div style="font-weight:600;margin-bottom:8px">${esc(title)}</div>` : ''}
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block">
        <line x1="${padL}" y1="${16 + plotH}" x2="${w - 10}" y2="${16 + plotH}" stroke="#E5E7EB" stroke-width="1"/>
        <path d="${pathD}" fill="none" stroke="#1E5EFF" stroke-width="2.5"/>
        ${dots}
      </svg>
    </div>
  `;
}

export function renderDonutChart(items = [], title = '') {
  const total = items.reduce((s, i) => s + Number(i.value || 0), 0);
  if (!total) return `<div class="muted text-sm">No distribution data available.</div>`;
  const r = 46;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  const arcs = items.map((item, idx) => {
    const val = Number(item.value || 0);
    const len = (val / total) * circ;
    const color = PALETTE[idx % PALETTE.length];
    const seg = `<circle cx="64" cy="64" r="${r}" fill="transparent" stroke="${color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${esc(item.label)}: ${val}</title></circle>`;
    offset += len;
    return seg;
  }).join('');

  const legend = items.map((item, idx) => `
    <div class="meta-line" style="justify-content:space-between;width:100%">
      <span style="display:flex;align-items:center;gap:6px">
        <span style="width:9px;height:9px;border-radius:2px;background:${PALETTE[idx % PALETTE.length]};display:inline-block"></span>
        <span>${esc(item.label)}</span>
      </span>
      <strong class="tabular" style="color:var(--text)">${Number(item.value || 0)}</strong>
    </div>
  `).join('');

  return `
    <div>
      ${title ? `<div style="font-weight:600;margin-bottom:8px">${esc(title)}</div>` : ''}
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <svg width="128" height="128" viewBox="0 0 128 128" style="transform:rotate(-90deg);flex-shrink:0">
          ${arcs}
        </svg>
        <div style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:6px">${legend}</div>
      </div>
    </div>
  `;
}

import { api } from '../api.js';
import { renderBarChart, renderDonutChart } from '../charts.js';
import { errorState, esc, fmtDate, skeletonBlock } from '../ui.js';

const REPORT_TYPES = [
  ['appointments', 'Appointments & Doctor Performance'],
  ['revenue', 'Revenue & Collections'],
  ['pharmacy_inventory', 'Pharmacy Inventory & Expiry'],
  ['bed_occupancy', 'Admissions & Bed Occupancy'],
  ['blood_stock', 'Blood Bank Stock'],
  ['laboratory', 'Laboratory Turnaround']
];

export async function renderReportsPage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const meta = await api.get('/api/doctors/meta/filters');
    let filters = { type: 'appointments', days: '30', branchId: '', departmentId: '' };

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div><h1>Operational Reports & Analytics</h1><p class="text-sm muted">Live SQLite database queries with authorized CSV export.</p></div>
          <button class="btn btn-primary btn-sm" id="rep-csv-btn">Download CSV</button>
        </div>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
          <div class="field"><label for="rp-type">Report Dataset</label>
            <select id="rp-type">${REPORT_TYPES.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="rp-days">Date Range</label>
            <select id="rp-days"><option value="7">Last 7 Days</option><option value="30" selected>Last 30 Days</option><option value="90">Last 90 Days</option></select>
          </div>
          <div class="field"><label for="rp-br">Branch</label>
            <select id="rp-br"><option value="">All Branches</option>${meta.branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="rp-dp">Department</label>
            <select id="rp-dp"><option value="">All Departments</option>${meta.departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>
          </div>
        </div>
      </div>

      <div id="rep-output"></div>
    `;

    async function load() {
      const qs = new URLSearchParams(filters).toString();
      const data = await api.get(`/api/reports?${qs}`);
      const cols = data.rows.length ? Object.keys(data.rows[0]) : [];
      container.querySelector('#rep-output').innerHTML = `
        <div class="grid-2" style="margin-bottom:16px">
          <div class="card">${renderBarChart(data.summary, 'Summary Breakdown')}</div>
          <div class="card">${renderDonutChart(data.summary, 'Distribution')}</div>
        </div>
        <div class="card">
          <div class="meta-line" style="margin-bottom:12px">
            <span>Generated: <strong class="tabular">${fmtDate(data.generatedAt)}</strong></span><span>·</span>
            <span>Source: ${esc(data.dataSource)}</span><span>·</span>
            <span>Window: Last ${data.filters.days} days</span>
          </div>
          ${cols.length ? `
            <div class="table-wrap"><table>
              <thead><tr>${cols.map((c) => `<th>${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead>
              <tbody>${data.rows.map((r) => `<tr>${cols.map((c) => `<td class="tabular">${esc(r[c] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>
          ` : '<p class="muted text-sm">No records match the applied filters.</p>'}
        </div>
      `;
    }

    ['#rp-type', '#rp-days', '#rp-br', '#rp-dp'].forEach((id, i) => {
      const keys = ['type', 'days', 'branchId', 'departmentId'];
      container.querySelector(id).onchange = (e) => { filters[keys[i]] = e.target.value; load(); };
    });

    container.querySelector('#rep-csv-btn').onclick = () => {
      const qs = new URLSearchParams(filters).toString();
      window.location.href = `/api/reports/export.csv?${qs}`;
    };

    await load();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

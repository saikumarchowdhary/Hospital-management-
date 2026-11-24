import { api } from '../api.js';
import { errorState, esc, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderBedsPage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const res = await api.get('/api/beds');
    let filterStatus = 'All';

    function draw() {
      const shown = filterStatus === 'All' ? res.beds : res.beds.filter((b) => b.status === filterStatus);
      const counts = ['Available', 'Occupied', 'Cleaning', 'Maintenance'].map((st) => ({
        st, c: res.beds.filter((b) => b.status === st).length
      }));

      container.innerHTML = `
        <div class="kpi-grid">
          ${counts.map((x) => `<div class="kpi-card"><span class="kpi-label">${x.st} Beds</span><span class="kpi-value tabular">${x.c}</span></div>`).join('')}
        </div>
        <div class="card">
          <div class="card-header">
            <div><h1>Ward & Bed Board</h1><p class="text-sm muted">Beds in Cleaning state require passed housekeeping inspection before returning to Available.</p></div>
            <div class="tabs">
              ${['All', 'Available', 'Occupied', 'Cleaning', 'Maintenance'].map((st) => `<button class="tab-btn ${filterStatus === st ? 'active' : ''}" data-st="${st}">${st}</button>`).join('')}
            </div>
          </div>
          <div class="bed-grid">
            ${shown.map((b) => `
              <div class="bed-card">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong class="mono">${esc(b.bed_code)}</strong>
                  ${statusBadge(b.status)}
                </div>
                <div class="text-xs muted">${esc(b.ward_name)} · Room ${esc(b.room_number)}</div>
                <div class="text-sm">${b.patient_name ? esc(b.patient_name) : '<span class="muted">Unoccupied</span>'}</div>
                ${b.status === 'Available' ? `<button class="btn btn-sm bed-maint-btn" data-id="${b.id}" data-st="Maintenance">Set Maintenance</button>` : ''}
                ${b.status === 'Maintenance' ? `<button class="btn btn-sm bed-maint-btn" data-id="${b.id}" data-st="Available">Mark Available</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;

      container.querySelectorAll('[data-st].tab-btn').forEach((btn) => {
        btn.onclick = () => { filterStatus = btn.dataset.st; draw(); };
      });
      container.querySelectorAll('.bed-maint-btn').forEach((btn) => {
        btn.onclick = async () => {
          try {
            await api.patch(`/api/beds/${btn.dataset.id}/status`, { status: btn.dataset.st });
            toast('Bed Status Updated', '', 'success');
            renderBedsPage(container);
          } catch (err) { toast('Blocked', err.message, 'danger'); }
        };
      });
    }
    draw();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

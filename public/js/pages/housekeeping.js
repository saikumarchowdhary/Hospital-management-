import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtDate, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderHousekeepingPage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const res = await api.get('/api/housekeeping/tasks');
    const beds = res.beds || [];
    const maint = res.maintenance || [];

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Available / Ready Beds</span><span class="kpi-value tabular" style="color:var(--success)">${beds.filter((b) => b.status === 'Available').length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Beds Cleaning</span><span class="kpi-value tabular" style="color:var(--warning)">${beds.filter((b) => b.status === 'Cleaning').length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Active Cleaning Tasks</span><span class="kpi-value tabular">${res.tasks.filter((t) => t.status !== 'Completed').length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Open Maintenance Requests</span><span class="kpi-value tabular" style="color:var(--danger)">${maint.filter((m) => m.status === 'Open').length}</span></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div><h1>Housekeeping & Room Inspection</h1><p class="text-sm muted">Beds in Cleaning state only return to Available once a room inspection passes.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm" id="hsk-maint-btn">+ Report Maintenance</button>
            <button class="btn btn-primary btn-sm" id="hsk-new-btn">+ Create Cleaning Task</button>
          </div>
        </div>
        ${res.tasks.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Task Ref</th><th>Location</th><th>Priority</th><th>Notes</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${res.tasks.map((t) => `
                <tr>
                  <td class="mono">${esc(t.task_ref)}</td>
                  <td><strong>${esc(t.bed_code || `Room ${t.room_number || '—'}`)}</strong><div class="text-xs muted">${esc(t.ward_name || '')}</div></td>
                  <td>${esc(t.priority)}</td>
                  <td class="text-sm">${esc(t.notes || 'Standard sanitization')}</td>
                  <td>${statusBadge(t.status)}</td>
                  <td><div style="display:flex;gap:6px">
                    ${t.status === 'Assigned' ? `<button class="btn btn-sm hsk-st-btn" data-id="${t.id}" data-st="In Progress">Start Cleaning</button>` : ''}
                    ${t.status === 'In Progress' ? `<button class="btn btn-primary btn-sm hsk-st-btn" data-id="${t.id}" data-st="Awaiting Inspection">Finish Cleaning</button>` : ''}
                    ${t.status === 'Awaiting Inspection' ? `
                      <button class="btn btn-success btn-sm hsk-insp-btn" data-id="${t.id}" data-pass="true">Pass Inspection</button>
                      <button class="btn btn-danger btn-sm hsk-insp-btn" data-id="${t.id}" data-pass="false">Fail & Reopen</button>
                    ` : ''}
                  </div></td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        ` : emptyState('No housekeeping tasks', 'Room cleaning tasks appear automatically upon patient discharge.')}
      </div>

      <div class="card">
        <div class="card-header"><h2>Maintenance Requests (${maint.length})</h2></div>
        ${maint.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Location</th><th>Issue</th><th>Priority</th><th>Reported By</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${maint.map((m) => `
            <tr>
              <td><strong>${esc(m.bed_code || `Room ${m.room_number || 'General'}`)}</strong><div class="text-xs muted">${esc(m.ward_name || '')}</div></td>
              <td class="text-sm">${esc(m.issue)}</td>
              <td>${esc(m.priority)}</td>
              <td class="text-xs">${esc(m.reporter_name)} · <span class="tabular">${fmtDate(m.created_at)}</span></td>
              <td>${statusBadge(m.status === 'Resolved' ? 'Completed' : 'Pending')}</td>
              <td>${m.status === 'Open' ? `<button class="btn btn-success btn-sm maint-res-btn" data-id="${m.id}">Resolve</button>` : '<span class="text-xs muted">Resolved</span>'}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>` : emptyState('No maintenance requests', 'Equipment or room maintenance issues reported by housekeeping appear here.')}
      </div>
    `;

    container.querySelectorAll('.hsk-st-btn').forEach((b) => {
      b.onclick = async () => {
        await api.patch(`/api/housekeeping/tasks/${b.dataset.id}/status`, { status: b.dataset.st });
        toast('Task Updated', b.dataset.st, 'success');
        renderHousekeepingPage(container);
      };
    });
    container.querySelectorAll('.hsk-insp-btn').forEach((b) => {
      b.onclick = async () => {
        const passed = b.dataset.pass === 'true';
        await api.post(`/api/housekeeping/tasks/${b.dataset.id}/inspect`, {
          passed, checklist_notes: passed ? 'Sanitization and bed prep verified' : 'Recleaning required'
        });
        toast(passed ? 'Inspection Passed' : 'Task Reopened', passed ? 'Bed released to Available.' : 'Sent back to housekeeping.', passed ? 'success' : 'danger');
        renderHousekeepingPage(container);
      };
    });
    container.querySelectorAll('.maint-res-btn').forEach((b) => {
      b.onclick = async () => {
        await api.patch(`/api/housekeeping/maintenance/${b.dataset.id}`, { status: 'Resolved' });
        toast('Maintenance Resolved', '', 'success');
        renderHousekeepingPage(container);
      };
    });
    container.querySelector('#hsk-new-btn').onclick = () => {
      openModal('New Housekeeping Task', `
        <form id="hsk-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label for="hk-rm">Room</label><select id="hk-rm" name="room_id">${res.rooms.map((r) => `<option value="${r.id}">${esc(r.ward_name)} · Room ${esc(r.room_number)}</option>`).join('')}</select></div>
          <div class="field"><label for="hk-pri">Priority</label><select id="hk-pri" name="priority"><option>Normal</option><option>High</option><option>Urgent</option></select></div>
          <div class="field"><label for="hk-nt">Notes</label><input id="hk-nt" name="notes" required /></div>
          <button type="submit" class="btn btn-primary">Assign Task</button>
        </form>
      `, (body) => {
        body.querySelector('#hsk-form').onsubmit = async (e) => {
          e.preventDefault();
          await api.post('/api/housekeeping/tasks', Object.fromEntries(new FormData(e.target).entries()));
          toast('Task Created', '', 'success');
          closeModal();
          renderHousekeepingPage(container);
        };
      });
    };
    container.querySelector('#hsk-maint-btn').onclick = () => {
      openModal('Report Room / Equipment Maintenance', `
        <form id="maint-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label for="mt-rm">Room</label><select id="mt-rm" name="room_id">${res.rooms.map((r) => `<option value="${r.id}">${esc(r.ward_name)} · Room ${esc(r.room_number)}</option>`).join('')}</select></div>
          <div class="field"><label for="mt-pri">Priority</label><select id="mt-pri" name="priority"><option>Normal</option><option>High</option><option>Urgent</option></select></div>
          <div class="field"><label for="mt-iss">Issue Description</label><textarea id="mt-iss" name="issue" required placeholder="e.g. Bed rail latch or HVAC thermostat repair"></textarea></div>
          <button type="submit" class="btn btn-primary">Submit Maintenance Request</button>
        </form>
      `, (body) => {
        body.querySelector('#maint-form').onsubmit = async (e) => {
          e.preventDefault();
          await api.post('/api/housekeeping/maintenance', Object.fromEntries(new FormData(e.target).entries()));
          toast('Maintenance Logged', '', 'success');
          closeModal();
          renderHousekeepingPage(container);
        };
      });
    };
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

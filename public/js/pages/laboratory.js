import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderLaboratoryPage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const res = await api.get('/api/laboratory/orders');
    const orders = res.orders;
    const count = (st) => orders.filter((o) => o.status === st).length;

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Total Orders</span><span class="kpi-value tabular">${orders.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Pending / Scheduled</span><span class="kpi-value tabular">${count('Ordered') + count('Scheduled')}</span></div>
        <div class="kpi-card"><span class="kpi-label">Specimen / Processing</span><span class="kpi-value tabular">${count('Specimen Collected') + count('Processing')}</span></div>
        <div class="kpi-card"><span class="kpi-label">Awaiting Review</span><span class="kpi-value tabular">${count('Awaiting Review')}</span></div>
        <div class="kpi-card"><span class="kpi-label">Released Reports</span><span class="kpi-value tabular">${count('Released')}</span></div>
      </div>

      <div class="card">
        <div class="card-header"><div><h1>Laboratory Workflow Queue</h1><p class="text-sm muted">Order → Specimen Collection → Processing → Result Entry → Review → Release.</p></div></div>
        ${orders.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Order Ref</th><th>Patient</th><th>Test</th><th>Specimen</th><th>Result</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${orders.map((o) => `
                <tr>
                  <td class="mono">${esc(o.order_ref)}</td>
                  <td><strong>${esc(o.patient_name)}</strong><div class="text-xs muted mono">${esc(o.patient_code)}</div></td>
                  <td>${esc(o.test_name)}<div class="text-xs muted">${esc(o.priority)}</div></td>
                  <td class="mono text-xs">${esc(o.specimen_code || 'Pending')}</td>
                  <td class="tabular">${o.result_value ? `<strong>${esc(o.result_value)}</strong> (${esc(o.abnormal_flag)})` : '—'}</td>
                  <td>${statusBadge(o.status)}</td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      ${['Ordered', 'Scheduled'].includes(o.status) ? `<button class="btn btn-sm lab-spec-btn" data-id="${o.id}">Collect Specimen</button>` : ''}
                      ${o.status === 'Specimen Collected' ? `<button class="btn btn-sm lab-proc-btn" data-id="${o.id}">Start Processing</button>` : ''}
                      ${['Specimen Collected', 'Processing'].includes(o.status) ? `<button class="btn btn-primary btn-sm lab-res-btn" data-id="${o.id}" data-test="${esc(o.test_name)}" data-unit="${esc(o.default_unit || '')}" data-range="${esc(o.default_range || '')}">Enter Result</button>` : ''}
                      ${o.status === 'Awaiting Review' ? `<button class="btn btn-success btn-sm lab-rel-btn" data-id="${o.id}">Approve & Release</button>` : ''}
                      ${o.attachment_id ? `<a class="btn btn-sm" href="/api/admin/attachments/${o.attachment_id}" target="_blank" rel="noopener">File</a>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        ` : emptyState('No lab orders', 'New physician or patient lab orders will appear here.')}
      </div>
    `;

    container.querySelectorAll('.lab-spec-btn').forEach((b) => {
      b.onclick = async () => {
        await api.post(`/api/laboratory/orders/${b.dataset.id}/specimen`, { specimen_type: 'Blood' });
        toast('Specimen Collected', '', 'success');
        renderLaboratoryPage(container);
      };
    });
    container.querySelectorAll('.lab-proc-btn').forEach((b) => {
      b.onclick = async () => {
        await api.patch(`/api/laboratory/orders/${b.dataset.id}/processing`, {});
        toast('Processing Started', '', 'info');
        renderLaboratoryPage(container);
      };
    });
    container.querySelectorAll('.lab-res-btn').forEach((b) => {
      b.onclick = () => {
        openModal(`Submit Lab Result — ${b.dataset.test}`, `
          <form id="lab-res-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="lr-val">Measured Value (Sample Demo Entry)</label><input id="lr-val" name="result_value" required placeholder="e.g. 7.4" /></div>
            <div class="form-grid">
              <div class="field"><label for="lr-unit">Unit</label><input id="lr-unit" name="unit" value="${esc(b.dataset.unit)}" /></div>
              <div class="field"><label for="lr-ref">Reference Range</label><input id="lr-ref" name="reference_range" value="${esc(b.dataset.range)}" /></div>
            </div>
            <div class="field"><label for="lr-flag">Interpretation Flag</label>
              <select id="lr-flag" name="abnormal_flag"><option>Normal</option><option>High</option><option>Low</option><option>Critical</option></select>
            </div>
            <div class="field"><label for="lr-notes">Technologist Notes</label><input id="lr-notes" name="notes" value="Sample Demo Result — Verified on analyzer" /></div>
            <div class="field"><label for="lr-file">Attach Lab Document (PDF/PNG/JPG, max 5MB)</label><input id="lr-file" name="reportFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" /></div>
            <button type="submit" class="btn btn-primary">Submit for Review</button>
          </form>
        `, (body) => {
          body.querySelector('#lab-res-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.post(`/api/laboratory/orders/${b.dataset.id}/results`, new FormData(e.target));
              toast('Submitted for Review', '', 'success');
              closeModal();
              renderLaboratoryPage(container);
            } catch (err) { toast('Error', err.message, 'danger'); }
          };
        });
      };
    });
    container.querySelectorAll('.lab-rel-btn').forEach((b) => {
      b.onclick = async () => {
        await api.post(`/api/laboratory/orders/${b.dataset.id}/release`, {});
        toast('Report Released', 'Patient and ordering clinician notified.', 'success');
        renderLaboratoryPage(container);
      };
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

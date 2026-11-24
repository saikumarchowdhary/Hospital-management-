import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtDate, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderRadiologyPage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const [ordRes, catRes, patRes] = await Promise.all([
      api.get('/api/radiology/orders'),
      api.get('/api/radiology/catalogue'),
      api.get('/api/patients')
    ]);
    const orders = ordRes.orders;

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Total Imaging Orders</span><span class="kpi-value tabular">${orders.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Pending Scheduling</span><span class="kpi-value tabular">${orders.filter((o) => o.status === 'Ordered').length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Scheduled Scans</span><span class="kpi-value tabular">${orders.filter((o) => o.status === 'Scheduled').length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Released Reports</span><span class="kpi-value tabular" style="color:var(--success)">${orders.filter((o) => o.status === 'Released').length}</span></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div><h1>Radiology & Diagnostic Imaging</h1><p class="text-sm muted">X-Ray, CT, MRI, and Ultrasound scheduling, reporting, and scan upload (local demo mode).</p></div>
          <button class="btn btn-primary btn-sm" id="rad-new-btn">+ Order Imaging Scan</button>
        </div>
        <div class="grid-4" style="margin-bottom:16px">
          ${catRes.catalogue.map((c) => `
            <div style="border:1px solid var(--border);border-radius:8px;padding:10px">
              <div class="text-xs muted">${esc(c.modality)}</div>
              <strong>${esc(c.study_name)}</strong>
              <div class="text-xs tabular muted">$${c.price}</div>
            </div>
          `).join('')}
        </div>
        ${orders.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Ref</th><th>Patient</th><th>Modality & Study</th><th>Scheduled Time</th><th>Indication</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${orders.map((o) => `
                <tr>
                  <td class="mono">${esc(o.order_ref)}</td>
                  <td><strong>${esc(o.patient_name)}</strong><div class="text-xs muted mono">${esc(o.patient_code)}</div></td>
                  <td>${esc(o.modality)} — ${esc(o.study_name)}</td>
                  <td class="tabular text-xs">${o.scheduled_at ? esc(fmtDate(o.scheduled_at)) : '<span class="muted">Unscheduled</span>'}</td>
                  <td class="text-sm">${esc(o.clinical_indication || '—')}</td>
                  <td>${statusBadge(o.status)}</td>
                  <td><div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${o.status === 'Ordered' ? `<button class="btn btn-sm rad-sch-btn" data-id="${o.id}" data-study="${esc(o.study_name)}">Schedule Scan</button>` : ''}
                    ${o.status !== 'Released' ? `<button class="btn btn-primary btn-sm rad-rep-btn" data-id="${o.id}" data-study="${esc(o.study_name)}">Prepare & Release Report</button>` : `<span class="text-xs muted">${esc(o.impression || 'Released')}</span>`}
                    ${o.attachment_id ? `<a class="btn btn-sm" href="/api/admin/attachments/${o.attachment_id}" target="_blank" rel="noopener">Scan File</a>` : ''}
                  </div></td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        ` : emptyState('No imaging requests', 'Radiology requests ordered by doctors appear here.')}
      </div>
    `;

    container.querySelector('#rad-new-btn').onclick = () => {
      openModal('Order Imaging Study', `
        <form id="rad-ord-form" class="form-grid">
          <div class="field full"><label for="ro-pat">Patient</label><select id="ro-pat" name="patient_id">${patRes.patients.map((p) => `<option value="${p.id}">${esc(p.full_name)} (${esc(p.patient_code)})</option>`).join('')}</select></div>
          <div class="field"><label for="ro-mod">Modality</label><select id="ro-mod" name="modality"><option>X-Ray</option><option>CT</option><option>MRI</option><option>Ultrasound</option></select></div>
          <div class="field"><label for="ro-st">Study Name</label><input id="ro-st" name="study_name" required placeholder="e.g. CT Brain Non-Contrast" /></div>
          <div class="field full"><label for="ro-ind">Clinical Indication</label><input id="ro-ind" name="clinical_indication" placeholder="Reason for imaging..." /></div>
          <div class="field full"><label for="ro-sch">Scheduled Slot (Optional)</label><input id="ro-sch" name="scheduled_at" type="datetime-local" /></div>
          <div class="field full"><button type="submit" class="btn btn-primary">Create Radiology Order</button></div>
        </form>
      `, (body) => {
        body.querySelector('#rad-ord-form').onsubmit = async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.target).entries());
          try {
            await api.post('/api/radiology/orders', { ...d, patient_id: Number(d.patient_id) });
            toast('Radiology Order Created', '', 'success');
            closeModal();
            renderRadiologyPage(container);
          } catch (err) { toast('Error', err.message, 'danger'); }
        };
      });
    };

    container.querySelectorAll('.rad-sch-btn').forEach((b) => {
      b.onclick = () => {
        openModal(`Schedule Scan — ${b.dataset.study}`, `
          <form id="rad-sch-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="rs-dt">Scan Date & Time</label><input id="rs-dt" name="scheduled_at" type="datetime-local" required /></div>
            <button type="submit" class="btn btn-primary">Confirm Scan Schedule</button>
          </form>
        `, (body) => {
          body.querySelector('#rad-sch-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.patch(`/api/radiology/orders/${b.dataset.id}/schedule`, { scheduled_at: body.querySelector('#rs-dt').value });
              toast('Scan Scheduled', '', 'success');
              closeModal();
              renderRadiologyPage(container);
            } catch (err) { toast('Error', err.message, 'danger'); }
          };
        });
      };
    });

    container.querySelectorAll('.rad-rep-btn').forEach((b) => {
      b.onclick = () => {
        openModal(`Radiology Report — ${b.dataset.study}`, `
          <form id="rad-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="rf-find">Findings</label><textarea id="rf-find" name="findings" required placeholder="Clear lung fields, normal cardiomediastinal silhouette..."></textarea></div>
            <div class="field"><label for="rf-imp">Impression</label><input id="rf-imp" name="impression" required placeholder="No acute cardiopulmonary process (Sample Demo)" /></div>
            <div class="field"><label for="rf-file">Attach Image / Scan Report (Optional)</label><input id="rf-file" name="imageFile" type="file" accept=".png,.jpg,.jpeg,.pdf" /></div>
            <button type="submit" class="btn btn-primary">Release Radiology Report</button>
          </form>
        `, (body) => {
          body.querySelector('#rad-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.post(`/api/radiology/orders/${b.dataset.id}/report`, new FormData(e.target));
              toast('Radiology Report Released', '', 'success');
              closeModal();
              renderRadiologyPage(container);
            } catch (err) { toast('Error', err.message, 'danger'); }
          };
        });
      };
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

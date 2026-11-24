import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtDate, fmtMoney, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderPharmacyPage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const [invRes, rxRes] = await Promise.all([api.get('/api/pharmacy/inventory'), api.get('/api/pharmacy/prescriptions')]);
    const lowStock = invRes.medicines.filter((m) => m.total_quantity <= m.reorder_level);
    const pendingRx = rxRes.prescriptions.filter((r) => !['Dispensed', 'Completed'].includes(r.status));

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Total Medicines</span><span class="kpi-value tabular">${invRes.medicines.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Low Stock Alerts</span><span class="kpi-value tabular" style="color:var(--warning)">${lowStock.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Expiring (&le;60d)</span><span class="kpi-value tabular">${invRes.expiringSoon.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Pending Prescriptions</span><span class="kpi-value tabular">${pendingRx.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Refill Requests</span><span class="kpi-value tabular">${rxRes.refills.filter((r) => r.status === 'Requested').length}</span></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div><h2>Prescription Dispensing Queue</h2><p class="text-sm muted">Clinical prescriptions are read-only; dispensing atomically deducts batch stock and generates an invoice.</p></div>
        </div>
        ${rxRes.prescriptions.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Rx Ref</th><th>Patient</th><th>Prescriber</th><th>Items</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              ${rxRes.prescriptions.map((rx) => `
                <tr>
                  <td class="mono">${esc(rx.prescription_ref)}</td>
                  <td><strong>${esc(rx.patient_name)}</strong><div class="text-xs muted">${esc(rx.patient_code)}</div></td>
                  <td>${esc(rx.doctor_name)}</td>
                  <td class="text-sm">${rx.items.map((i) => `${esc(i.medicine_name)} × ${i.quantity}`).join(', ')}</td>
                  <td>${statusBadge(rx.status)}</td>
                  <td>
                    ${!['Dispensed', 'Completed'].includes(rx.status)
                      ? `<button class="btn btn-primary btn-sm dispense-btn" data-id="${rx.id}">Dispense & Bill</button>`
                      : '<span class="text-xs muted">Dispensed</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        ` : emptyState('No prescriptions', 'Prescriptions issued by doctors appear here.')}
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Medicine Inventory & Batches</h2>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" id="add-med-btn">+ Add Medicine</button>
            <button class="btn btn-primary btn-sm" id="rcv-batch-btn">+ Receive Batch</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>SKU</th><th>Medicine</th><th>Category</th><th>Unit Price</th><th>Available Qty</th><th>Reorder Level</th><th>State</th></tr></thead>
          <tbody>
            ${invRes.medicines.map((m) => `
              <tr>
                <td class="mono">${esc(m.sku)}</td>
                <td><strong>${esc(m.name)}</strong><div class="text-xs muted">${esc(m.generic_name || '')}</div></td>
                <td>${esc(m.category_name || 'General')}</td>
                <td class="num">${fmtMoney(m.unit_price)}</td>
                <td class="num"><strong>${m.total_quantity}</strong> ${esc(m.unit)}</td>
                <td class="num">${m.reorder_level}</td>
                <td>${m.total_quantity <= m.reorder_level ? statusBadge('Pending') : statusBadge('Available')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      </div>

      ${rxRes.refills.length ? `
        <div class="card">
          <div class="card-header"><h2>Patient Refill Requests</h2></div>
          ${rxRes.refills.map((rf) => `
            <div class="list-row">
              <div><strong class="mono">${esc(rf.prescription_ref)}</strong> · ${esc(rf.patient_name)}<div class="text-xs muted">${esc(rf.notes || '')} · ${fmtDate(rf.created_at)}</div></div>
              <div style="display:flex;gap:8px;align-items:center">
                ${statusBadge(rf.status)}
                ${rf.status === 'Requested' ? `<button class="btn btn-sm rf-app-btn" data-id="${rf.id}">Approve</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    container.querySelectorAll('.dispense-btn').forEach((b) => {
      b.onclick = async () => {
        try {
          await api.post(`/api/pharmacy/prescriptions/${b.dataset.id}/dispense`, {});
          toast('Dispensed', 'Stock reduced and pharmacy invoice created.', 'success');
          renderPharmacyPage(container);
        } catch (err) { toast('Dispensing Blocked', err.message, 'danger'); }
      };
    });

    container.querySelectorAll('.rf-app-btn').forEach((b) => {
      b.onclick = async () => {
        await api.patch(`/api/pharmacy/refills/${b.dataset.id}`, { status: 'Approved' });
        toast('Refill Approved', '', 'success');
        renderPharmacyPage(container);
      };
    });

    container.querySelector('#add-med-btn').onclick = () => {
      openModal('Add Medicine to Catalogue', `
        <form id="med-form" class="form-grid">
          <div class="field"><label for="md-sku">SKU</label><input id="md-sku" name="sku" required placeholder="MED-099" /></div>
          <div class="field"><label for="md-name">Medicine Name</label><input id="md-name" name="name" required /></div>
          <div class="field"><label for="md-gen">Generic Name</label><input id="md-gen" name="generic_name" /></div>
          <div class="field"><label for="md-cat">Category</label>
            <select id="md-cat" name="category_id">${invRes.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="md-price">Unit Price ($)</label><input id="md-price" name="unit_price" type="number" step="0.1" required value="2.0" /></div>
          <div class="field"><label for="md-re">Reorder Level</label><input id="md-re" name="reorder_level" type="number" value="25" /></div>
          <div class="field full"><button type="submit" class="btn btn-primary">Save Medicine</button></div>
        </form>
      `, (body) => {
        body.querySelector('#med-form').onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api.post('/api/pharmacy/medicines', Object.fromEntries(new FormData(e.target).entries()));
            toast('Medicine Added', '', 'success');
            closeModal();
            renderPharmacyPage(container);
          } catch (err) { toast('Error', err.message, 'danger'); }
        };
      });
    };

    container.querySelector('#rcv-batch-btn').onclick = () => {
      openModal('Receive Medicine Stock Batch', `
        <form id="batch-form" class="form-grid">
          <div class="field full"><label for="bt-med">Medicine</label>
            <select id="bt-med" name="medicine_id">${invRes.medicines.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="bt-num">Batch Number</label><input id="bt-num" name="batch_number" required placeholder="BCH-2026-09" /></div>
          <div class="field"><label for="bt-exp">Expiry Date</label><input id="bt-exp" name="expiry_date" type="date" required value="2028-06-30" /></div>
          <div class="field"><label for="bt-qty">Quantity</label><input id="bt-qty" name="quantity" type="number" min="1" required value="100" /></div>
          <div class="field"><label for="bt-cost">Unit Cost ($)</label><input id="bt-cost" name="cost_price" type="number" step="0.1" value="1.0" /></div>
          <div class="field full"><button type="submit" class="btn btn-primary">Receive Inventory</button></div>
        </form>
      `, (body) => {
        body.querySelector('#batch-form').onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api.post('/api/pharmacy/batches', Object.fromEntries(new FormData(e.target).entries()));
            toast('Batch Received', 'Stock levels updated.', 'success');
            closeModal();
            renderPharmacyPage(container);
          } catch (err) { toast('Error', err.message, 'danger'); }
        };
      });
    };
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

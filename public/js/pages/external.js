import { api } from '../api.js';
import { closeModal, errorState, esc, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderExternalPage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const ext = await api.get('/api/external/overview');

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div><h1>External Coordination & Procurement</h1><p class="text-sm muted">Unverified external provider availability is never shown as confirmed until verified.</p></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" id="ext-po-btn">+ Purchase Order</button>
            <button class="btn btn-primary btn-sm" id="ext-req-btn">+ External Request</button>
          </div>
        </div>

        <h3 style="margin-bottom:8px">External Requests</h3>
        <div class="table-wrap" style="margin-bottom:18px"><table>
          <thead><tr><th>Ref</th><th>Provider</th><th>Type & Description</th><th>Availability</th><th>ETA</th><th>Status</th><th>Workflow</th></tr></thead>
          <tbody>
            ${ext.requests.map((r) => `
              <tr>
                <td class="mono">${esc(r.request_ref)}</td>
                <td><strong>${esc(r.provider_name || 'Unassigned')}</strong><div class="text-xs muted">${esc(r.provider_type || '')}</div></td>
                <td>${esc(r.request_type)} — ${esc(r.description)} (Qty ${r.quantity})</td>
                <td>${r.availability_verified ? statusBadge('Active') : statusBadge('Pending')}</td>
                <td class="tabular">${esc(r.eta || 'TBD')}</td>
                <td>${statusBadge(r.status)}</td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${r.status === 'Submitted' ? `<button class="btn btn-sm ext-st" data-id="${r.id}" data-st="Approval Pending">Submit Approval</button>` : ''}
                    ${r.status === 'Approval Pending' ? `<button class="btn btn-sm ext-st" data-id="${r.id}" data-st="Provider Processing">Send to Provider</button>` : ''}
                    ${r.status === 'Provider Processing' ? `<button class="btn btn-primary btn-sm ext-st" data-id="${r.id}" data-st="Confirmed" data-ver="true">Verify & Confirm</button>` : ''}
                    ${r.status === 'Confirmed' ? `<button class="btn btn-success btn-sm ext-st" data-id="${r.id}" data-st="Fulfilled">Mark Fulfilled</button>` : ''}
                    ${r.status === 'Fulfilled' ? `<button class="btn btn-sm ext-st" data-id="${r.id}" data-st="Closed">Close</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="7" class="muted">No external coordination requests yet.</td></tr>'}
          </tbody>
        </table></div>

        <div class="grid-2">
          <div>
            <h3 style="margin-bottom:8px">External Providers</h3>
            <div class="table-wrap"><table>
              <thead><tr><th>Provider</th><th>Type</th><th>Contact</th><th>Verified</th></tr></thead>
              <tbody>${ext.providers.map((p) => `
                <tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.provider_type)}</td><td class="text-xs">${esc(p.phone)}</td><td>${p.is_verified ? statusBadge('Active') : statusBadge('Pending')}</td></tr>
              `).join('')}</tbody>
            </table></div>
          </div>
          <div>
            <h3 style="margin-bottom:8px">Supplier Purchase Orders</h3>
            <div class="table-wrap"><table>
              <thead><tr><th>PO Ref</th><th>Supplier</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>${ext.purchaseOrders.map((po) => `
                <tr><td class="mono">${esc(po.po_ref)}</td><td>${esc(po.supplier_name)}</td><td class="num">$${Number(po.total_amount).toFixed(2)}</td><td>${statusBadge(po.status)}</td></tr>
              `).join('') || '<tr><td colspan="4" class="muted">No purchase orders yet.</td></tr>'}</tbody>
            </table></div>
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('.ext-st').forEach((b) => {
      b.onclick = async () => {
        try {
          await api.patch(`/api/external/requests/${b.dataset.id}/status`, {
            status: b.dataset.st,
            availability_verified: b.dataset.ver === 'true',
            eta: b.dataset.st === 'Confirmed' ? '2 hours' : null
          });
          toast('Request Updated', b.dataset.st, 'success');
          renderExternalPage(container);
        } catch (err) { toast('Error', err.message, 'danger'); }
      };
    });

    container.querySelector('#ext-req-btn').onclick = () => {
      openModal('New External Request', `
        <form id="exr-form" class="form-grid">
          <div class="field full"><label for="er-p">Provider</label><select id="er-p" name="provider_id">${ext.providers.map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.provider_type)})</option>`).join('')}</select></div>
          <div class="field"><label for="er-t">Request Type</label><select id="er-t" name="request_type"><option>Blood Transfer</option><option>Ambulance Transfer</option><option>Staffing Agency</option><option>Medical Equipment</option></select></div>
          <div class="field"><label for="er-q">Quantity</label><input id="er-q" name="quantity" type="number" value="2" min="1" /></div>
          <div class="field full"><label for="er-d">Description</label><input id="er-d" name="description" required /></div>
          <div class="field full"><button type="submit" class="btn btn-primary">Submit Request</button></div>
        </form>
      `, (body) => {
        body.querySelector('#exr-form').onsubmit = async (e) => {
          e.preventDefault();
          await api.post('/api/external/requests', Object.fromEntries(new FormData(e.target).entries()));
          toast('External Request Submitted', '', 'success');
          closeModal();
          renderExternalPage(container);
        };
      });
    };

    container.querySelector('#ext-po-btn').onclick = () => {
      openModal('Issue Supplier Purchase Order', `
        <form id="po-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label for="po-sup">Supplier</label><select id="po-sup" name="supplier_id">${ext.suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="po-it">Items Summary</label><input id="po-it" name="item_summary" required placeholder="Surgical Gloves & IV Kits" /></div>
          <div class="field"><label for="po-amt">Total Amount ($)</label><input id="po-amt" name="total_amount" type="number" required value="450" /></div>
          <button type="submit" class="btn btn-primary">Issue Purchase Order</button>
        </form>
      `, (body) => {
        body.querySelector('#po-form').onsubmit = async (e) => {
          e.preventDefault();
          await api.post('/api/external/purchase-orders', Object.fromEntries(new FormData(e.target).entries()));
          toast('Purchase Order Issued', '', 'success');
          closeModal();
          renderExternalPage(container);
        };
      });
    };
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

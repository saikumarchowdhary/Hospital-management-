import { api } from '../api.js';
import { closeModal, errorState, esc, fmtDate, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderBloodBankPage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const [bb, patRes] = await Promise.all([api.get('/api/bloodbank/overview'), api.get('/api/patients')]);
    const availBags = bb.inventory.filter((b) => b.status === 'Available');
    let tab = 'requests';

    function draw() {
      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div><h1>Blood Bank Operations</h1><p class="text-sm muted">Blood group stock, donor donations, requests, and cross-match issue traceability.</p></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm" id="bb-donor-btn">+ Register Donor</button>
              <button class="btn btn-sm" id="bb-bag-btn">+ Add Blood Unit</button>
              <button class="btn btn-primary btn-sm" id="bb-req-btn">+ Blood Request</button>
            </div>
          </div>
          <div class="kpi-grid" style="margin-bottom:16px">
            ${bb.groups.map((g) => {
              const cnt = availBags.filter((b) => b.blood_group_id === g.id).length;
              return `<div class="kpi-card"><span class="kpi-label">Group ${esc(g.group_name)}</span><span class="kpi-value tabular">${cnt} units</span></div>`;
            }).join('')}
          </div>

          <div class="tabs" style="margin-bottom:14px">
            <button class="tab-btn ${tab === 'requests' ? 'active' : ''}" data-t="requests">Blood Requests (${bb.requests.length})</button>
            <button class="tab-btn ${tab === 'inventory' ? 'active' : ''}" data-t="inventory">Blood Inventory (${bb.inventory.length})</button>
            <button class="tab-btn ${tab === 'donors' ? 'active' : ''}" data-t="donors">Donor & Donation Log (${bb.donors.length})</button>
            <button class="tab-btn ${tab === 'issues' ? 'active' : ''}" data-t="issues">Blood Issue Records (${(bb.issues || []).length})</button>
          </div>
          <div id="bb-tab-body"></div>
        </div>
      `;

      const body = container.querySelector('#bb-tab-body');
      if (tab === 'requests') {
        body.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Ref</th><th>Patient</th><th>Group / Component</th><th>Units</th><th>Urgency</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${bb.requests.map((r) => `
            <tr>
              <td class="mono">${esc(r.request_ref)}</td><td>${esc(r.patient_name)}</td><td><strong>${esc(r.group_name)}</strong> · ${esc(r.component)}</td>
              <td class="num">${r.units_requested}</td><td>${esc(r.urgency)}</td><td>${statusBadge(r.status)}</td>
              <td>${r.status === 'Requested' ? `<button class="btn btn-primary btn-sm bb-issue-btn" data-id="${r.id}" data-group="${r.blood_group_id}">Verify & Issue</button>` : '<span class="text-xs muted">Issued</span>'}</td>
            </tr>
          `).join('') || '<tr><td colspan="7" class="muted">No blood requests yet.</td></tr>'}</tbody>
        </table></div>`;
      } else if (tab === 'inventory') {
        body.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Bag Code</th><th>Group</th><th>Component</th><th>Collected</th><th>Expiry</th><th>Screening</th><th>Status</th></tr></thead>
          <tbody>${bb.inventory.map((b) => `
            <tr>
              <td class="mono">${esc(b.bag_code)}</td><td><strong>${esc(b.group_name)}</strong></td><td>${esc(b.component)}</td>
              <td class="tabular">${esc(b.collection_date)}</td><td class="tabular">${esc(b.expiry_date)}</td>
              <td>${b.screening_passed ? statusBadge('Passed') : statusBadge('Failed')}</td><td>${statusBadge(b.status)}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>`;
      } else if (tab === 'donors') {
        body.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Donor Code</th><th>Full Name</th><th>Blood Group</th><th>Phone</th><th>Last Donation</th><th>Eligibility</th></tr></thead>
          <tbody>${bb.donors.map((d) => `
            <tr><td class="mono">${esc(d.donor_code)}</td><td><strong>${esc(d.full_name)}</strong></td><td><strong>${esc(d.group_name)}</strong></td><td>${esc(d.phone)}</td><td class="tabular">${esc(d.last_donation_date || '—')}</td><td>${statusBadge(d.eligible ? 'Active' : 'Inactive')}</td></tr>
          `).join('')}</tbody>
        </table></div>`;
      } else {
        body.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Request Ref</th><th>Bag Code</th><th>Group & Component</th><th>Patient</th><th>Issued By</th><th>Issued At</th></tr></thead>
          <tbody>${(bb.issues || []).map((i) => `
            <tr><td class="mono">${esc(i.request_ref)}</td><td class="mono">${esc(i.bag_code)}</td><td><strong>${esc(i.group_name)}</strong> · ${esc(i.component)}</td><td>${esc(i.patient_name)}</td><td>${esc(i.issued_by_name)}</td><td class="tabular text-xs">${fmtDate(i.issued_at)}</td></tr>
          `).join('') || '<tr><td colspan="6" class="muted">No blood units issued yet.</td></tr>'}</tbody>
        </table></div>`;
      }

      container.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { tab = b.dataset.t; draw(); }; });
      container.querySelector('#bb-donor-btn').onclick = () => openDonorModal(bb.groups, () => renderBloodBankPage(container));
      container.querySelector('#bb-bag-btn').onclick = () => openBagModal(bb.groups, () => renderBloodBankPage(container));
      container.querySelector('#bb-req-btn').onclick = () => openReqModal(bb.groups, patRes.patients, () => renderBloodBankPage(container));
      container.querySelectorAll('.bb-issue-btn').forEach((b) => {
        b.onclick = () => openIssueModal(b.dataset.id, Number(b.dataset.group), availBags, () => renderBloodBankPage(container));
      });
    }
    draw();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

function openDonorModal(groups, onDone) {
  openModal('Register Blood Donor', `
    <form id="don-form" class="form-grid">
      <div class="field full"><label for="dn-name">Donor Name</label><input id="dn-name" name="full_name" required /></div>
      <div class="field"><label for="dn-grp">Blood Group</label><select id="dn-grp" name="blood_group_id">${groups.map((g) => `<option value="${g.id}">${esc(g.group_name)}</option>`).join('')}</select></div>
      <div class="field"><label for="dn-ph">Phone</label><input id="dn-ph" name="phone" required /></div>
      <div class="field full"><button type="submit" class="btn btn-primary">Register Donor</button></div>
    </form>
  `, (body) => {
    body.querySelector('#don-form').onsubmit = async (e) => {
      e.preventDefault();
      await api.post('/api/bloodbank/donors', Object.fromEntries(new FormData(e.target).entries()));
      toast('Donor Registered', '', 'success');
      closeModal();
      onDone();
    };
  });
}

function openBagModal(groups, onDone) {
  openModal('Add Screened Blood Unit', `
    <form id="bag-form" class="form-grid">
      <div class="field"><label for="bg-grp">Blood Group</label><select id="bg-grp" name="blood_group_id">${groups.map((g) => `<option value="${g.id}">${esc(g.group_name)}</option>`).join('')}</select></div>
      <div class="field"><label for="bg-comp">Component</label><select id="bg-comp" name="component"><option>Whole Blood</option><option>Packed RBC</option><option>Fresh Frozen Plasma</option></select></div>
      <div class="field full"><label for="bg-exp">Expiry Date</label><input id="bg-exp" name="expiry_date" type="date" required value="2027-02-01" /></div>
      <div class="field full"><button type="submit" class="btn btn-primary">Add to Bank</button></div>
    </form>
  `, (body) => {
    body.querySelector('#bag-form').onsubmit = async (e) => {
      e.preventDefault();
      await api.post('/api/bloodbank/inventory', Object.fromEntries(new FormData(e.target).entries()));
      toast('Blood Bag Added', '', 'success');
      closeModal();
      onDone();
    };
  });
}

function openReqModal(groups, patients, onDone) {
  openModal('Create Blood Request', `
    <form id="breq-form" class="form-grid">
      <div class="field full"><label for="br-pat">Patient</label><select id="br-pat" name="patient_id">${patients.map((p) => `<option value="${p.id}">${esc(p.full_name)} (${esc(p.patient_code)})</option>`).join('')}</select></div>
      <div class="field"><label for="br-grp">Blood Group</label><select id="br-grp" name="blood_group_id">${groups.map((g) => `<option value="${g.id}">${esc(g.group_name)}</option>`).join('')}</select></div>
      <div class="field"><label for="br-urg">Urgency</label><select id="br-urg" name="urgency"><option>Routine</option><option>Urgent</option><option>Emergency</option></select></div>
      <div class="field full"><button type="submit" class="btn btn-primary">Submit Request</button></div>
    </form>
  `, (body) => {
    body.querySelector('#breq-form').onsubmit = async (e) => {
      e.preventDefault();
      await api.post('/api/bloodbank/requests', Object.fromEntries(new FormData(e.target).entries()));
      toast('Request Created', '', 'success');
      closeModal();
      onDone();
    };
  });
}

function openIssueModal(reqId, groupId, availBags, onDone) {
  const compatible = availBags.filter((bag) => bag.blood_group_id === groupId);
  openModal('Verify Compatibility & Issue Blood', `
    <form id="biss-form" style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label for="bi-bag">Available Screened Unit</label>
        <select id="bi-bag" name="inventory_id" required>${compatible.map((c) => `<option value="${c.id}">${esc(c.bag_code)} · ${esc(c.group_name)} ${esc(c.component)}</option>`).join('') || '<option value="">No matching group units available</option>'}</select>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="bi-chk" required /> Cross-match & infectious screening compatibility verified</label>
      <button type="submit" class="btn btn-primary" ${compatible.length ? '' : 'disabled'}>Issue Blood Unit</button>
    </form>
  `, (body) => {
    body.querySelector('#biss-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.post(`/api/bloodbank/requests/${reqId}/issue`, { inventory_id: Number(body.querySelector('#bi-bag').value), compatibility_checked: body.querySelector('#bi-chk').checked });
        toast('Blood Unit Issued', '', 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Issue Blocked', err.message, 'danger'); }
    };
  });
}

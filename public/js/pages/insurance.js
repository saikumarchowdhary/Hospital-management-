import { api } from '../api.js';
import { closeModal, errorState, esc, fmtMoney, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderInsurancePage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const [ins, patRes] = await Promise.all([api.get('/api/insurance/overview'), api.get('/api/patients')]);

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div><h1>Insurance & TPA Coordination</h1><p class="text-sm muted">Local simulated insurer workflow. Statuses below are manually recorded until external TPA APIs are connected.</p></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" id="ins-pol-btn">+ Add Policy</button>
            <button class="btn btn-primary btn-sm" id="ins-case-btn">+ Submit Claim / Pre-Auth</button>
          </div>
        </div>

        <h3 style="margin-bottom:8px">Pre-Authorizations & Claims</h3>
        <div class="table-wrap" style="margin-bottom:18px"><table>
          <thead><tr><th>Case Ref</th><th>Patient</th><th>Provider & Policy</th><th>Estimated</th><th>Settled</th><th>Verification</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${ins.cases.map((c) => `
              <tr>
                <td class="mono">${esc(c.case_ref)}</td>
                <td><strong>${esc(c.patient_name)}</strong></td>
                <td>${esc(c.provider_name)}<div class="text-xs muted mono">${esc(c.policy_number)}</div></td>
                <td class="num">${fmtMoney(c.estimated_amount)}</td>
                <td class="num">${fmtMoney(c.settled_amount || 0)}</td>
                <td class="text-xs muted">${esc(c.source_verification)}</td>
                <td>${statusBadge(c.status)}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    ${c.status === 'Submitted' ? `<button class="btn btn-sm ins-step" data-id="${c.id}" data-st="Under Review">Review</button>` : ''}
                    ${c.status === 'Under Review' ? `<button class="btn btn-success btn-sm ins-step" data-id="${c.id}" data-st="Approved" data-amt="${c.estimated_amount}">Approve</button><button class="btn btn-sm ins-step" data-id="${c.id}" data-st="Query Raised">Query</button>` : ''}
                    ${c.status === 'Approved' ? `<button class="btn btn-primary btn-sm ins-step" data-id="${c.id}" data-st="Settled" data-amt="${c.estimated_amount}">Settle</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="8" class="muted">No insurance cases submitted yet.</td></tr>'}
          </tbody>
        </table></div>

        <h3 style="margin-bottom:8px">Registered Patient Policies</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Policy Number</th><th>Patient</th><th>Insurer / TPA</th><th>Coverage Limit</th><th>Valid Until</th><th>Verification</th></tr></thead>
          <tbody>
            ${ins.policies.map((p) => `
              <tr>
                <td class="mono">${esc(p.policy_number)}</td>
                <td>${esc(p.patient_name)}</td>
                <td>${esc(p.provider_name)}</td>
                <td class="num">${fmtMoney(p.coverage_limit)}</td>
                <td class="tabular">${esc(p.valid_until)}</td>
                <td class="text-xs muted">${esc(p.eligibility_status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      </div>
    `;

    container.querySelectorAll('.ins-step').forEach((b) => {
      b.onclick = async () => {
        await api.patch(`/api/insurance/cases/${b.dataset.id}/status`, {
          status: b.dataset.st,
          settled_amount: Number(b.dataset.amt || 0),
          query_reason: b.dataset.st === 'Query Raised' ? 'Supporting clinical summary requested' : null
        });
        toast('Insurance Case Updated', b.dataset.st, 'success');
        renderInsurancePage(container);
      };
    });

    container.querySelector('#ins-pol-btn').onclick = () => {
      openModal('Add Patient Insurance Policy', `
        <form id="pol-form" class="form-grid">
          <div class="field full"><label for="ip-pat">Patient</label><select id="ip-pat" name="patient_id">${patRes.patients.map((p) => `<option value="${p.id}">${esc(p.full_name)}</option>`).join('')}</select></div>
          <div class="field"><label for="ip-prov">Provider</label><select id="ip-prov" name="provider_id">${ins.providers.map((pr) => `<option value="${pr.id}">${esc(pr.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="ip-num">Policy Number</label><input id="ip-num" name="policy_number" required /></div>
          <div class="field"><label for="ip-lim">Coverage Limit</label><input id="ip-lim" name="coverage_limit" type="number" value="75000" /></div>
          <div class="field"><label for="ip-exp">Valid Until</label><input id="ip-exp" name="valid_until" type="date" value="2028-12-31" required /></div>
          <div class="field full"><button type="submit" class="btn btn-primary">Save Policy</button></div>
        </form>
      `, (body) => {
        body.querySelector('#pol-form').onsubmit = async (e) => {
          e.preventDefault();
          await api.post('/api/insurance/policies', Object.fromEntries(new FormData(e.target).entries()));
          toast('Policy Saved', '', 'success');
          closeModal();
          renderInsurancePage(container);
        };
      });
    };

    container.querySelector('#ins-case-btn').onclick = () => {
      openModal('Submit Insurance Pre-Authorization / Claim', `
        <form id="ic-form" class="form-grid">
          <div class="field full"><label for="ic-pol">Patient Policy</label>
            <select id="ic-pol" name="policy_id">${ins.policies.map((p) => `<option value="${p.id}" data-pat="${p.patient_id}">${esc(p.patient_name)} — ${esc(p.policy_number)}</option>`).join('')}</select>
          </div>
          <div class="field full"><label for="ic-est">Estimated / Claimed Amount ($)</label><input id="ic-est" name="estimated_amount" type="number" required value="1200" /></div>
          <div class="field full"><button type="submit" class="btn btn-primary">Submit Case</button></div>
        </form>
      `, (body) => {
        body.querySelector('#ic-form').onsubmit = async (e) => {
          e.preventDefault();
          const sel = body.querySelector('#ic-pol');
          const patId = sel.options[sel.selectedIndex].dataset.pat;
          await api.post('/api/insurance/cases', {
            policy_id: Number(sel.value),
            patient_id: Number(patId),
            estimated_amount: Number(body.querySelector('#ic-est').value)
          });
          toast('Insurance Case Submitted', '', 'success');
          closeModal();
          renderInsurancePage(container);
        };
      });
    };
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

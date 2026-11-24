import { api } from '../api.js';
import { emptyState, errorState, esc, fmtDate, fmtMoney, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderPatientRecords(container, user, query = {}) {
  container.innerHTML = skeletonBlock(5);
  try {
    const rec = await api.get(`/api/clinical/records/${user.patient_id}`);
    const validTabs = ['consultations', 'labs', 'radiology', 'vitals', 'discharges'];
    let tab = validTabs.includes(query.tab) ? query.tab : 'consultations';

    function draw() {
      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div><h1>Medical Records</h1><p class="text-sm muted">Consultations, diagnoses, vitals, and authorized final reports.</p></div>
          </div>
          <div class="tabs" style="margin-bottom:16px">
            <button class="tab-btn ${tab === 'consultations' ? 'active' : ''}" data-tab="consultations">Consultations (${rec.consultations.length})</button>
            <button class="tab-btn ${tab === 'labs' ? 'active' : ''}" data-tab="labs">Lab Reports (${rec.labReports.length})</button>
            <button class="tab-btn ${tab === 'radiology' ? 'active' : ''}" data-tab="radiology">Radiology (${rec.radiologyReports.length})</button>
            <button class="tab-btn ${tab === 'vitals' ? 'active' : ''}" data-tab="vitals">Vitals & Allergies</button>
            <button class="tab-btn ${tab === 'discharges' ? 'active' : ''}" data-tab="discharges">Discharge (${rec.discharges.length})</button>
          </div>
          <div id="rec-tab-body"></div>
        </div>
      `;

      const body = container.querySelector('#rec-tab-body');
      if (tab === 'consultations') {
        body.innerHTML = rec.consultations.length ? rec.consultations.map((c) => {
          const diags = rec.diagnoses.filter((d) => d.consultation_id === c.id);
          return `
            <div class="list-row" style="align-items:flex-start;flex-direction:column">
              <div style="display:flex;justify-content:space-between;width:100%">
                <strong>${esc(c.doctor_name)} · ${esc(c.department_name)}</strong>
                <span class="text-xs muted tabular">${fmtDate(c.created_at)}</span>
              </div>
              <div class="text-sm"><strong>Complaint:</strong> ${esc(c.chief_complaint)}</div>
              ${diags.length ? `<div class="text-sm"><strong>Diagnosis:</strong> ${diags.map((d) => `${esc(d.diagnosis_text)} ${d.icd_code ? `(${esc(d.icd_code)})` : ''}`).join('; ')}</div>` : ''}
              <div class="text-sm muted">${esc(c.treatment_plan || '')}</div>
            </div>
          `;
        }).join('') : emptyState('No consultations yet', 'Consultation notes appear here once completed by your doctor.');
      } else if (tab === 'labs') {
        body.innerHTML = rec.labReports.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Order Ref</th><th>Test</th><th>Result</th><th>Reference Range</th><th>Status</th><th>Released</th><th>Document</th></tr></thead>
            <tbody>
              ${rec.labReports.map((l) => `
                <tr>
                  <td class="mono">${esc(l.order_ref)}</td>
                  <td><strong>${esc(l.test_name)}</strong>${l.is_sample_demo ? '<div class="text-xs muted">Sample Demo Report</div>' : ''}</td>
                  <td class="tabular"><strong>${esc(l.result_value || '—')} ${esc(l.unit || '')}</strong> · ${esc(l.abnormal_flag || '')}</td>
                  <td class="tabular">${esc(l.reference_range || '—')}</td>
                  <td>${statusBadge(l.status)}</td>
                  <td class="tabular text-xs">${fmtDate(l.released_at)}</td>
                  <td>${l.attachment_id ? `<a class="btn btn-sm" href="/api/admin/attachments/${l.attachment_id}" target="_blank" rel="noopener">View</a>` : '<span class="text-xs muted">Digital Report</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        ` : emptyState('No released lab reports', 'Only verified and released final laboratory reports appear here.');
      } else if (tab === 'radiology') {
        body.innerHTML = rec.radiologyReports.length ? rec.radiologyReports.map((r) => `
          <div class="list-row" style="flex-direction:column;align-items:flex-start">
            <div style="display:flex;justify-content:space-between;width:100%">
              <strong>${esc(r.modality)} — ${esc(r.study_name)} (${esc(r.order_ref)})</strong>
              ${statusBadge(r.status)}
            </div>
            <div class="text-sm"><strong>Findings:</strong> ${esc(r.findings || 'Pending')}</div>
            <div class="text-sm"><strong>Impression:</strong> ${esc(r.impression || 'Pending')}</div>
            ${r.attachment_id ? `<a class="btn btn-sm" href="/api/admin/attachments/${r.attachment_id}" target="_blank" rel="noopener">Download Attachment</a>` : ''}
          </div>
        `).join('') : emptyState('No released radiology reports', 'Imaging reports will appear here after specialist review.');
      } else if (tab === 'vitals') {
        body.innerHTML = `
          <div class="grid-2">
            <div>
              <h3 style="margin-bottom:8px">Known Allergies</h3>
              ${rec.allergies.length ? rec.allergies.map((a) => `<div class="list-row"><span><strong>${esc(a.allergen)}</strong> · ${esc(a.reaction)}</span>${statusBadge(a.severity)}</div>`).join('') : '<p class="text-sm muted">No known allergies recorded.</p>'}
              <h3 style="margin:16px 0 8px">Medical History</h3>
              ${rec.medicalHistory.length ? rec.medicalHistory.map((h) => `<div class="list-row"><span><strong>${esc(h.condition_name)}</strong> (${esc(h.diagnosed_year || '')})</span>${statusBadge(h.status)}</div>`).join('') : '<p class="text-sm muted">No chronic conditions recorded.</p>'}
            </div>
            <div>
              <h3 style="margin-bottom:8px">Recent Vitals</h3>
              ${rec.vitals.length ? rec.vitals.map((v) => `
                <div class="list-row" style="flex-direction:column;align-items:flex-start">
                  <div class="text-xs muted tabular">${fmtDate(v.created_at)} · Recorded by ${esc(v.recorded_by_name)}</div>
                  <div class="text-sm tabular">BP ${esc(v.blood_pressure)} · HR ${v.pulse} bpm · Temp ${v.temperature}°C · SpO2 ${v.oxygen_saturation}%</div>
                </div>
              `).join('') : '<p class="text-sm muted">No vitals recorded yet.</p>'}
            </div>
          </div>
        `;
      } else {
        body.innerHTML = rec.discharges.length ? rec.discharges.map((d) => `
          <div class="list-row" style="flex-direction:column;align-items:flex-start">
            <div style="display:flex;justify-content:space-between;width:100%"><strong class="mono">${esc(d.admission_ref)}</strong><span class="text-xs muted tabular">${fmtDate(d.discharged_at)}</span></div>
            <p class="text-sm">${esc(d.summary)}</p>
            ${d.follow_up_instructions ? `<div class="text-xs muted"><strong>Follow-up:</strong> ${esc(d.follow_up_instructions)}</div>` : ''}
          </div>
        `).join('') : emptyState('No discharge summaries', 'Inpatient discharge summaries appear here once discharged.');
      }

      container.querySelectorAll('[data-tab]').forEach((b) => {
        b.onclick = () => { tab = b.dataset.tab; draw(); };
      });
    }
    draw();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

export async function renderPatientLabBooking(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const [testRes, orderRes, meta] = await Promise.all([
      api.get('/api/laboratory/tests'),
      api.get('/api/laboratory/orders'),
      api.get('/api/doctors/meta/filters')
    ]);
    const today = new Date().toISOString().slice(0, 10);

    container.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h2>Book a Laboratory Test</h2></div>
          <form id="pat-lab-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="pl-test">Diagnostic Test</label>
              <select id="pl-test" name="test_id" required>
                ${testRes.tests.map((t) => `<option value="${t.id}">${esc(t.name)} — ${fmtMoney(t.price)} (${esc(t.category_name || 'Lab')})</option>`).join('')}
              </select>
            </div>
            <div class="field"><label for="pl-branch">Collection Branch</label>
              <select id="pl-branch" name="branch_id">${meta.branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
            </div>
            <div class="field"><label for="pl-date">Collection Date</label>
              <input id="pl-date" name="scheduled_date" type="date" value="${today}" min="${today}" required />
            </div>
            <div class="field"><label for="pl-slot">Collection Slot</label>
              <select id="pl-slot" name="scheduled_slot">
                <option value="08:00">08:00 AM (Fasting)</option>
                <option value="09:30">09:30 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="14:30">02:30 PM</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary">Confirm Lab Booking</button>
          </form>
        </div>

        <div class="card">
          <div class="card-header"><h2>My Lab Bookings & Status</h2></div>
          ${orderRes.orders.length ? orderRes.orders.map((o) => `
            <div class="list-row">
              <div>
                <strong>${esc(o.test_name)}</strong>
                <div class="meta-line"><span class="mono">${esc(o.order_ref)}</span><span>·</span><span class="tabular">${esc(o.scheduled_date || fmtDate(o.created_at))}</span></div>
                ${o.status === 'Released' && o.result_value ? `<div class="text-xs" style="color:var(--success);margin-top:3px">Result: ${esc(o.result_value)} (${esc(o.abnormal_flag)})</div>` : ''}
              </div>
              ${statusBadge(o.status)}
            </div>
          `).join('') : emptyState('No lab orders yet', 'Book a diagnostic test on the left.')}
        </div>
      </div>
    `;

    container.querySelector('#pat-lab-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.post('/api/laboratory/orders', {
          test_id: Number(fd.get('test_id')),
          branch_id: Number(fd.get('branch_id')),
          scheduled_date: fd.get('scheduled_date'),
          scheduled_slot: fd.get('scheduled_slot')
        });
        toast('Lab Test Booked', 'Collection slot reserved and invoice generated.', 'success');
        renderPatientLabBooking(container);
      } catch (err) { toast('Booking Failed', err.message, 'danger'); }
    };
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

export async function renderPatientMedicines(container) {
  container.innerHTML = skeletonBlock(3);
  try {
    const res = await api.get('/api/pharmacy/prescriptions');
    container.innerHTML = `
      <div class="card">
        <div class="card-header"><div><h1>My Prescriptions & Medicines</h1><p class="text-sm muted">Prescriptions are read-only and managed by your prescribing clinician.</p></div></div>
        ${res.prescriptions.length ? res.prescriptions.map((rx) => `
          <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div><strong class="mono">${esc(rx.prescription_ref)}</strong> · ${esc(rx.doctor_name)} <span class="text-xs muted tabular">${fmtDate(rx.created_at)}</span></div>
              <div style="display:flex;gap:8px;align-items:center">
                ${statusBadge(rx.status)}
                <button class="btn btn-sm refill-btn" data-id="${rx.id}">Request Refill</button>
              </div>
            </div>
            ${rx.items.map((it) => `
              <div class="list-row">
                <div><strong>${esc(it.medicine_name)}</strong> · ${esc(it.dosage)} · ${esc(it.frequency)} · ${esc(it.duration)}<div class="text-xs muted">${esc(it.instructions || '')}</div></div>
                <span class="tabular text-sm">Qty ${it.quantity}</span>
              </div>
            `).join('')}
          </div>
        `).join('') : emptyState('No prescriptions yet', 'Your prescribed medications will appear here.')}
      </div>
    `;
    container.querySelectorAll('.refill-btn').forEach((b) => {
      b.onclick = async () => {
        try {
          await api.post('/api/pharmacy/refills', { prescription_id: Number(b.dataset.id) });
          toast('Refill Requested', 'Sent to pharmacy for review.', 'success');
          b.disabled = true;
          b.textContent = 'Requested';
        } catch (err) { toast('Error', err.message, 'danger'); }
      };
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

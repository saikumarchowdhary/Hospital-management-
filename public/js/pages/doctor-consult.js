import { api } from '../api.js';
import { closeModal, esc, fmtDate, fmtMoney, openModal, statusBadge, toast } from '../ui.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function openPatientChartModal(patientId, patientName) {
  try {
    const rec = await api.get(`/api/clinical/records/${patientId}`);
    openModal(`Authorized Clinical Chart — ${patientName}`, `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card" style="background:var(--bg);padding:12px">
          <div><strong>Allergies:</strong> ${rec.allergies.map((a) => `${esc(a.allergen)} (${esc(a.severity)})`).join(', ') || 'None recorded'}</div>
          <div style="margin-top:6px"><strong>Medical History:</strong> ${rec.medicalHistory.map((h) => `${esc(h.condition_name)} (${esc(h.status)})`).join('; ') || 'None recorded'}</div>
          <div style="margin-top:6px"><strong>Recent Vitals:</strong> ${rec.vitals[0] ? `BP ${esc(rec.vitals[0].blood_pressure)}, HR ${rec.vitals[0].pulse}, Temp ${rec.vitals[0].temperature}°C, SpO2 ${rec.vitals[0].oxygen_saturation}%` : 'Pending'}</div>
        </div>
        <div>
          <h3>Diagnoses & Consultations (${rec.consultations.length})</h3>
          ${rec.consultations.slice(0, 4).map((c) => `<div class="list-row"><div><strong>${esc(c.chief_complaint)}</strong><div class="text-xs muted">${esc(c.treatment_plan || '')}</div></div><span class="text-xs muted tabular">${fmtDate(c.created_at)}</span></div>`).join('') || '<p class="text-xs muted">No consultations yet.</p>'}
        </div>
        <div>
          <h3>Clinical Progress Notes (${(rec.clinicalNotes || []).length})</h3>
          ${(rec.clinicalNotes || []).slice(0, 4).map((n) => `<div class="list-row"><div><span class="mono text-xs">${esc(n.note_type)}</span> · ${esc(n.content)}</div><span class="text-xs muted">${esc(n.author_name)}</span></div>`).join('') || '<p class="text-xs muted">No clinical notes yet.</p>'}
          <form id="add-cnote-form" style="display:flex;gap:8px;margin-top:8px">
            <select name="note_type" style="padding:6px;border:1px solid var(--border);border-radius:6px"><option>Progress</option><option>Assessment</option><option>Care Plan</option></select>
            <input name="content" required placeholder="Add clinical progress note..." style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px" />
            <button type="submit" class="btn btn-primary btn-sm">Add Note</button>
          </form>
        </div>
        <div>
          <h3>Lab & Radiology Reports</h3>
          <div class="text-xs">${rec.labReports.map((l) => `${esc(l.test_name)}: <strong>${esc(l.result_value || l.status)}</strong>`).join(' · ') || 'No lab orders'}</div>
          <div class="text-xs" style="margin-top:4px">${rec.radiologyReports.map((r) => `${esc(r.modality)} ${esc(r.study_name)}: <strong>${esc(r.impression || r.status)}</strong>`).join(' · ') || 'No imaging orders'}</div>
        </div>
      </div>
    `, (body) => {
      body.querySelector('#add-cnote-form').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api.post('/api/clinical/notes', { patient_id: patientId, note_type: fd.get('note_type'), content: fd.get('content') });
          toast('Clinical Note Added', '', 'success');
          closeModal();
          openPatientChartModal(patientId, patientName);
        } catch (err) { toast('Error', err.message, 'danger'); }
      };
    });
  } catch (err) { toast('Access Restricted', err.message, 'danger'); }
}

export async function openConsultationModal({ appointmentId, patientId, patientName, medicines, labTests, onSaved }) {
  let rec = { allergies: [], vitals: [] };
  try { rec = await api.get(`/api/clinical/records/${patientId}`); } catch { /* ok */ }

  openModal(`Consultation Workspace — ${patientName}`, `
    <div class="card" style="background:var(--bg);margin-bottom:14px;padding:12px">
      <div class="meta-line">
        <span><strong>Allergies:</strong> ${rec.allergies.map((a) => esc(a.allergen)).join(', ') || 'None recorded'}</span>
        <span>·</span>
        <span><strong>Vitals:</strong> ${rec.vitals[0] ? `BP ${esc(rec.vitals[0].blood_pressure)}, Pulse ${rec.vitals[0].pulse}, Temp ${rec.vitals[0].temperature}°C` : 'Pending'}</span>
      </div>
    </div>
    <form id="consult-form" class="form-grid">
      <div class="field full"><label for="cs-cc">Chief Complaint</label><input id="cs-cc" name="chief_complaint" required placeholder="Primary reason for consultation" /></div>
      <div class="field full"><label for="cs-exam">Clinical & Examination Notes</label><textarea id="cs-exam" name="examination_notes" placeholder="Clinical findings & examination notes..."></textarea></div>
      <div class="field"><label for="cs-diag">Diagnosis</label><input id="cs-diag" name="diagnosis_text" required placeholder="e.g. Acute Bronchitis" /></div>
      <div class="field"><label for="cs-icd">ICD-10 Code</label><input id="cs-icd" name="icd_code" placeholder="e.g. J20.9" /></div>
      <div class="field full"><label for="cs-plan">Treatment Plan & Nurse Instructions</label><textarea id="cs-plan" name="treatment_plan" placeholder="Care instructions, monitoring, and lifestyle advice"></textarea></div>

      <div class="field"><label for="cs-med">Prescribe Medicine (Optional)</label>
        <select id="cs-med" name="medicine_id">
          <option value="">— No medication —</option>
          ${medicines.map((m) => `<option value="${m.id}" data-name="${esc(m.name)}">${esc(m.name)} (Stock: ${m.total_quantity})</option>`).join('')}
        </select>
      </div>
      <div class="field"><label for="cs-dose">Dosage & Frequency</label><input id="cs-dose" name="dosage" value="1 tab twice daily · 7 days" /></div>
      <div class="field"><label for="cs-qty">Dispense Qty</label><input id="cs-qty" name="quantity" type="number" min="1" value="14" /></div>
      <div class="field"><label for="cs-lab">Order Lab Test (Optional)</label>
        <select id="cs-lab" name="lab_test_id"><option value="">— None —</option>${labTests.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="cs-mod">Radiology Modality</label>
        <select id="cs-mod" name="rad_modality"><option value="X-Ray">X-Ray</option><option value="CT">CT</option><option value="MRI">MRI</option><option value="Ultrasound">Ultrasound</option></select>
      </div>
      <div class="field"><label for="cs-rad">Radiology Study (Optional)</label><input id="cs-rad" name="rad_study" placeholder="e.g. Chest X-Ray PA" /></div>
      <div class="field full"><label for="cs-fup">Schedule Follow-Up Date (Optional)</label><input id="cs-fup" name="follow_up_date" type="date" /></div>
      <div class="field full"><button type="submit" class="btn btn-primary">Save & Finalize Consultation</button></div>
    </form>
  `, (body) => {
    body.querySelector('#consult-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const medSel = body.querySelector('#cs-med');
      const medId = medSel.value;
      const rxItems = medId ? [{
        medicine_id: Number(medId),
        medicine_name: medSel.options[medSel.selectedIndex].dataset.name,
        dosage: fd.get('dosage'),
        frequency: 'Per label',
        duration: '7 days',
        quantity: Number(fd.get('quantity') || 10),
        instructions: fd.get('treatment_plan') || 'Take after food'
      }] : [];
      const labId = fd.get('lab_test_id');
      const radStudy = fd.get('rad_study').trim();

      try {
        await api.post('/api/clinical/consultations', {
          appointment_id: appointmentId,
          patient_id: patientId,
          chief_complaint: fd.get('chief_complaint'),
          examination_notes: fd.get('examination_notes'),
          treatment_plan: fd.get('treatment_plan'),
          diagnosis_text: fd.get('diagnosis_text'),
          icd_code: fd.get('icd_code'),
          prescription_items: rxItems,
          lab_test_ids: labId ? [Number(labId)] : [],
          radiology_request: radStudy ? { modality: fd.get('rad_modality'), study_name: radStudy } : null,
          follow_up_date: fd.get('follow_up_date') || null
        });
        toast('Consultation Saved', 'Diagnosis, orders, and invoice created.', 'success');
        closeModal();
        onSaved();
      } catch (err) { toast('Save Failed', err.message, 'danger'); }
    };
  });
}

export function openAvailabilityModal(doctor, onSaved) {
  const firstSched = (doctor.schedules && doctor.schedules[0]) || { start_time: '09:00', end_time: '17:00', slot_minutes: 30 };
  const activeDays = new Set((doctor.schedules || []).map((s) => s.day_of_week));
  openModal('Manage Doctor Availability & Schedule', `
    <form id="doc-avail-form" style="display:flex;flex-direction:column;gap:12px">
      <div class="form-grid">
        <div class="field"><label for="da-status">Current Availability Status</label>
          <select id="da-status" name="availability_status">
            ${['Available', 'Busy', 'On Leave', 'In Surgery'].map((s) => `<option value="${s}" ${doctor.availability_status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="da-fee">Consultation Fee ($)</label><input id="da-fee" name="consultation_fee" type="number" min="10" value="${doctor.consultation_fee}" required /></div>
        <div class="field"><label for="da-start">Shift Start</label><input id="da-start" name="start_time" type="time" value="${esc(firstSched.start_time)}" required /></div>
        <div class="field"><label for="da-end">Shift End</label><input id="da-end" name="end_time" type="time" value="${esc(firstSched.end_time)}" required /></div>
      </div>
      <div>
        <div class="text-xs muted" style="margin-bottom:6px">Working Days</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${DAYS.map((d, idx) => `<label style="display:flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" name="days" value="${idx}" ${activeDays.has(idx) ? 'checked' : ''} /> ${d}</label>`).join('')}
        </div>
      </div>
      <div class="text-xs muted">Current fee: ${fmtMoney(doctor.consultation_fee)} · Branch: ${esc(doctor.branch_name)}</div>
      <button type="submit" class="btn btn-primary">Save Availability</button>
    </form>
  `, (body) => {
    body.querySelector('#doc-avail-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const selectedDays = Array.from(body.querySelectorAll('input[name="days"]:checked')).map((c) => Number(c.value));
      const schedules = selectedDays.map((day) => ({
        day_of_week: day,
        start_time: fd.get('start_time'),
        end_time: fd.get('end_time'),
        slot_minutes: 30
      }));
      try {
        await api.put(`/api/doctors/${doctor.id}/schedules`, {
          availability_status: fd.get('availability_status'),
          consultation_fee: Number(fd.get('consultation_fee')),
          schedules
        });
        toast('Availability Updated', '', 'success');
        closeModal();
        onSaved();
      } catch (err) { toast('Update Failed', err.message, 'danger'); }
    };
  });
}

export function openAppointmentDetailsModal(a) {
  openModal(`Appointment Details — ${a.appointment_ref}`, `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="meta-line"><span>${esc(a.patient_name)} (${esc(a.patient_code)})</span><span>·</span>${statusBadge(a.status)}</div>
      <div class="card" style="background:var(--bg)">
        <div class="text-xs muted">Date & Slot</div><strong class="tabular">${esc(a.appointment_date)} at ${esc(a.appointment_time)}</strong>
        <div class="text-xs muted" style="margin-top:8px">Visit Type & Branch</div><div>${esc(a.visit_type)} · ${esc(a.branch_name)} (${esc(a.department_name)})</div>
        <div class="text-xs muted" style="margin-top:8px">Reason for Visit</div><div>${esc(a.reason || 'General Specialist Consultation')}</div>
      </div>
    </div>
  `);
}

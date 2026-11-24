import { api } from '../api.js';
import { emptyState, errorState, esc, fmtDate, fmtMoney, skeletonBlock, statusBadge, toast } from '../ui.js';
import { openAppointmentDetailsModal, openAvailabilityModal, openConsultationModal, openPatientChartModal } from './doctor-consult.js';

export async function renderDoctorPortal(container, user) {
  container.innerHTML = skeletonBlock(4);
  try {
    const [dashRes, aptRes, labRes, medRes, testRes] = await Promise.all([
      user.role === 'doctor' ? api.get('/api/doctors/me/dashboard') : Promise.resolve(null),
      api.get('/api/appointments'),
      api.get('/api/laboratory/orders'),
      api.get('/api/pharmacy/inventory'),
      api.get('/api/laboratory/tests')
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayApts = aptRes.appointments.filter((a) => a.appointment_date === todayStr);
    const upcomingApts = aptRes.appointments.filter((a) => a.appointment_date > todayStr && !['Cancelled', 'Completed', 'Checked Out'].includes(a.status));
    const doc = dashRes?.doctor;
    const patients = dashRes?.patients || [];
    const followUps = dashRes?.followUps || [];
    const radOrders = dashRes?.radiologyOrders || [];
    let tab = 'today';

    function draw() {
      const needsScheduleWizard = Boolean(doc && !doc.schedule_configured);
      container.innerHTML = `
        ${needsScheduleWizard ? `
          <div class="card" style="border:2px solid var(--primary);background:var(--surface);margin-bottom:16px" id="doc-setup-wizard-card">
            <div class="card-header" style="margin-bottom:10px">
              <div>
                <span class="status status-warning" style="margin-bottom:6px;display:inline-flex">Action Required · First-Login Setup</span>
                <h2 style="margin:0">Configure Your Working Schedule to Go Live</h2>
                <p class="text-sm muted" style="margin-top:4px">Patients cannot book appointments with you in Find a Doctor until you set your working days, hours, breaks, and slot duration.</p>
              </div>
            </div>
            <form id="doc-wizard-form" class="form-grid">
              <div class="field full">
                <label>Working Days</label>
                <div style="display:flex;gap:12px;flex-wrap:wrap;padding:6px 0">
                  ${[['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6],['Sun',0]].map(([lbl, val]) => `
                    <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer">
                      <input type="checkbox" name="wiz_days" value="${val}" ${[1,2,3,4,5].includes(val) ? 'checked' : ''} /> ${lbl}
                    </label>
                  `).join('')}
                </div>
              </div>
              <div class="field"><label for="wiz-start">Shift Start</label><input id="wiz-start" name="start_time" type="time" value="09:00" required /></div>
              <div class="field"><label for="wiz-end">Shift End</label><input id="wiz-end" name="end_time" type="time" value="17:00" required /></div>
              <div class="field"><label for="wiz-slot">Slot Length</label>
                <select id="wiz-slot" name="slot_minutes">
                  <option value="15">15 minutes</option>
                  <option value="20">20 minutes</option>
                  <option value="30" selected>30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>
              <div class="field"><label for="wiz-fee">Consultation Fee ($)</label><input id="wiz-fee" name="consultation_fee" type="number" min="10" value="${Number(doc.consultation_fee || 100)}" required /></div>
              <div class="field"><label for="wiz-bstart">Break Start (Optional)</label><input id="wiz-bstart" name="break_start" type="time" value="13:00" /></div>
              <div class="field"><label for="wiz-bend">Break End (Optional)</label><input id="wiz-bend" name="break_end" type="time" value="14:00" /></div>
              <div class="field full">
                <button type="submit" class="btn btn-primary" id="wiz-submit-btn">Save Schedule & Publish Profile</button>
              </div>
            </form>
          </div>
        ` : ''}

        ${doc ? `
          <div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
            <div>
              <div class="meta-line">
                <strong style="color:var(--primary)">${esc(doc.specialty_name)}</strong>
                <span>·</span><span>${esc(doc.department_name)}</span>
                <span>·</span><span>${esc(doc.branch_name)}</span>
                <span>·</span>${statusBadge(doc.availability_status || 'Available')}
                ${doc.schedule_configured ? '<span>·</span><span class="status status-success">Listed in Find a Doctor</span>' : ''}
              </div>
              <h1 style="margin-top:4px">${esc(doc.full_name)} <span class="text-sm muted">(${esc(doc.qualification)})</span></h1>
              <div class="text-xs muted tabular">${doc.experience_years} yrs experience · Consultation Fee ${fmtMoney(doc.consultation_fee)}</div>
            </div>
            <button class="btn btn-primary btn-sm" id="doc-avail-btn">Manage Availability & Fee</button>
          </div>
        ` : ''}

        <div class="kpi-grid">
          <div class="kpi-card"><span class="kpi-label">Today's Appointments</span><span class="kpi-value tabular">${todayApts.length}</span></div>
          <div class="kpi-card"><span class="kpi-label">Upcoming Visits</span><span class="kpi-value tabular">${upcomingApts.length}</span></div>
          <div class="kpi-card"><span class="kpi-label">Assigned Patients</span><span class="kpi-value tabular">${patients.length}</span></div>
          <div class="kpi-card"><span class="kpi-label">Pending Labs & Imaging</span><span class="kpi-value tabular">${labRes.orders.filter((l) => l.status !== 'Released').length + radOrders.filter((r) => r.status !== 'Released').length}</span></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="tabs">
              <button class="tab-btn ${tab === 'today' ? 'active' : ''}" data-t="today">Today & Queue (${todayApts.length})</button>
              <button class="tab-btn ${tab === 'upcoming' ? 'active' : ''}" data-t="upcoming">All / Upcoming (${aptRes.appointments.length})</button>
              <button class="tab-btn ${tab === 'patients' ? 'active' : ''}" data-t="patients">My Patients (${patients.length})</button>
              <button class="tab-btn ${tab === 'reports' ? 'active' : ''}" data-t="reports">Patient Reports & Follow-Ups (${followUps.length})</button>
            </div>
          </div>
          <div id="doc-tab-body"></div>
        </div>
      `;

      const body = container.querySelector('#doc-tab-body');
      if (tab === 'today' || tab === 'upcoming') {
        const list = tab === 'today' ? (todayApts.length ? todayApts : aptRes.appointments) : aptRes.appointments;
        body.innerHTML = list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Ref</th><th>Patient</th><th>Date & Time</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${list.map((a) => `
              <tr>
                <td class="mono">${esc(a.appointment_ref)}</td>
                <td><strong>${esc(a.patient_name)}</strong><div class="text-xs muted mono">${esc(a.patient_code)}</div></td>
                <td class="tabular">${esc(a.appointment_date)} ${esc(a.appointment_time)}</td>
                <td>${esc(a.reason || 'Consultation')}</td>
                <td>${statusBadge(a.status)}</td>
                <td><div style="display:flex;gap:6px;flex-wrap:wrap">
                  ${['Booked', 'Confirmed', 'Checked In', 'In Consultation'].includes(a.status) ? `<button class="btn btn-primary btn-sm start-consult-btn" data-id="${a.id}" data-pid="${a.patient_id}" data-pname="${esc(a.patient_name)}">Consult / Rx / Orders</button>` : ''}
                  <button class="btn btn-sm apt-det-btn" data-id="${a.id}">Details</button>
                  <button class="btn btn-sm view-rec-btn" data-pid="${a.patient_id}" data-pname="${esc(a.patient_name)}">Medical History</button>
                </div></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>` : emptyState('No appointments scheduled', 'Patient bookings assigned to your specialization appear here.');
      } else if (tab === 'patients') {
        body.innerHTML = patients.length ? `<div class="table-wrap"><table>
          <thead><tr><th>MRN</th><th>Patient Name</th><th>Gender / DOB</th><th>Blood Group</th><th>Contact</th><th>Authorized Chart</th></tr></thead>
          <tbody>
            ${patients.map((p) => `
              <tr>
                <td class="mono">${esc(p.patient_code)}</td>
                <td><strong>${esc(p.full_name)}</strong></td>
                <td class="tabular text-sm">${esc(p.gender)} · ${esc(p.dob)}</td>
                <td>${esc(p.blood_group || '—')}</td>
                <td class="text-xs">${esc(p.phone || '')}<div class="muted">${esc(p.email)}</div></td>
                <td><button class="btn btn-sm view-rec-btn" data-pid="${p.id}" data-pname="${esc(p.full_name)}">Open History & Notes</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>` : emptyState('No assigned patients yet', 'Only patients scheduled or admitted under your care appear here.');
      } else {
        body.innerHTML = `
          <div class="grid-2">
            <div>
              <h3 style="margin-bottom:8px">Scheduled Follow-Ups (${followUps.length})</h3>
              ${followUps.length ? followUps.map((f) => `
                <div class="list-row">
                  <div><strong>${esc(f.patient_name)}</strong> (${esc(f.patient_code)})<div class="text-xs muted">${esc(f.notes || 'Follow-up care')}</div></div>
                  <div style="display:flex;gap:6px;align-items:center"><span class="tabular text-xs">${esc(f.follow_up_date)}</span>${statusBadge(f.status)}</div>
                </div>
              `).join('') : '<p class="text-sm muted">No follow-ups scheduled yet.</p>'}
            </div>
            <div>
              <h3 style="margin-bottom:8px">Recent Lab & Radiology Reports</h3>
              ${labRes.orders.slice(0, 5).map((l) => `
                <div class="list-row"><div><strong>Lab: ${esc(l.test_name)}</strong> — ${esc(l.patient_name)}<div class="text-xs muted">${esc(l.result_value || l.status)}</div></div>${statusBadge(l.status)}</div>
              `).join('')}
              ${radOrders.slice(0, 5).map((r) => `
                <div class="list-row"><div><strong>${esc(r.modality)}: ${esc(r.study_name)}</strong> — ${esc(r.patient_name)}<div class="text-xs muted">${esc(r.impression || r.status)}</div></div>${statusBadge(r.status)}</div>
              `).join('')}
            </div>
          </div>
        `;
      }

      container.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { tab = b.dataset.t; draw(); }; });
      const wizForm = container.querySelector('#doc-wizard-form');
      if (wizForm) {
        wizForm.onsubmit = async (e) => {
          e.preventDefault();
          const fd = new FormData(wizForm);
          const selectedDays = Array.from(wizForm.querySelectorAll('input[name="wiz_days"]:checked')).map((c) => Number(c.value));
          if (!selectedDays.length) {
            toast('Select Working Days', 'Choose at least one working day.', 'danger');
            return;
          }
          const btn = wizForm.querySelector('#wiz-submit-btn');
          btn.disabled = true;
          try {
            await api.put('/api/doctors/me/schedule-setup', {
              working_days: selectedDays,
              start_time: fd.get('start_time'),
              end_time: fd.get('end_time'),
              slot_minutes: Number(fd.get('slot_minutes') || 30),
              break_start: fd.get('break_start') || null,
              break_end: fd.get('break_end') || null,
              consultation_fee: Number(fd.get('consultation_fee') || 100)
            });
            toast('Schedule Published', 'Your profile is now live in Find a Doctor.', 'success');
            await renderDoctorPortal(container, user);
          } catch (err) {
            toast('Setup Failed', err.message, 'danger');
          } finally {
            btn.disabled = false;
          }
        };
      }
      const availBtn = container.querySelector('#doc-avail-btn');
      if (availBtn && doc) availBtn.onclick = () => openAvailabilityModal(doc, () => renderDoctorPortal(container, user));
      container.querySelectorAll('.apt-det-btn').forEach((b) => {
        b.onclick = () => openAppointmentDetailsModal(aptRes.appointments.find((x) => x.id === Number(b.dataset.id)));
      });
      container.querySelectorAll('.start-consult-btn').forEach((b) => {
        b.onclick = () => openConsultationModal({
          appointmentId: Number(b.dataset.id), patientId: Number(b.dataset.pid), patientName: b.dataset.pname,
          medicines: medRes.medicines, labTests: testRes.tests, onSaved: () => renderDoctorPortal(container, user)
        });
      });
      container.querySelectorAll('.view-rec-btn').forEach((b) => {
        b.onclick = () => openPatientChartModal(Number(b.dataset.pid), b.dataset.pname);
      });
    }

    draw();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

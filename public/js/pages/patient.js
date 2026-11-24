import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtDate, fmtMoney, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderPatientHome(container, user, navigate) {
  container.innerHTML = skeletonBlock(5);
  try {
    const [data, aptRes] = await Promise.all([
      api.get('/api/patients/me/dashboard'),
      api.get('/api/appointments')
    ]);
    const p = data.profile;
    const pastApts = aptRes.appointments.filter((a) => ['Completed', 'Checked Out', 'Cancelled', 'No Show'].includes(a.status));

    container.innerHTML = `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
        <div>
          <div class="meta-line">
            <span class="mono" style="color:var(--primary);font-weight:600">Patient ID: ${esc(p.patient_code)}</span>
            <span>·</span><span>${esc(p.gender)}</span>
            <span>·</span><span>DOB: ${esc(p.dob)}</span>
            <span>·</span><span>Blood Group ${esc(p.blood_group || 'Not Set')}</span>
          </div>
          <h1 style="margin-top:4px">${esc(p.full_name)}</h1>
          <div class="text-xs muted">${esc(p.email)} · ${esc(p.phone || 'No phone on file')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="min-width:170px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span class="muted">Profile completion</span><strong class="tabular">${p.profile_completion}%</strong>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${p.profile_completion}%"></div></div>
          </div>
          <button class="btn btn-sm" data-nav="profile">Edit Profile</button>
        </div>
      </div>

      <div class="quick-grid">
        <button class="quick-btn" data-nav="patient/book"><strong>Book Appointment</strong><span class="text-xs muted">Select specialist & slot</span></button>
        <button class="quick-btn" data-nav="patient/doctors"><strong>View Doctors</strong><span class="text-xs muted">Directory & availability</span></button>
        <button class="quick-btn" data-nav="patient/specialties"><strong>Doctor Specializations</strong><span class="text-xs muted">Browse medical specialties</span></button>
        <button class="quick-btn" data-nav="patient/visits"><strong>My Appointments</strong><span class="text-xs muted">Upcoming & history (${aptRes.appointments.length})</span></button>
        <button class="quick-btn" data-nav="patient/medicines"><strong>My Prescriptions</strong><span class="text-xs muted">${data.activeRxCount} Rx · Refill requests</span></button>
        <button class="quick-btn" data-nav="patient/records?tab=labs"><strong>Laboratory Reports</strong><span class="text-xs muted">${data.releasedLabsCount} released report(s)</span></button>
        <button class="quick-btn" data-nav="patient/records?tab=radiology"><strong>Radiology Reports</strong><span class="text-xs muted">${data.releasedRadiologyCount || 0} imaging report(s)</span></button>
        <button class="quick-btn" data-nav="patient/records?tab=vitals"><strong>Medical History</strong><span class="text-xs muted">Allergies, vitals & chronic care</span></button>
        <button class="quick-btn" data-nav="patient/documents"><strong>Upload Medical Documents</strong><span class="text-xs muted">${data.documentsCount || 0} stored document(s)</span></button>
        <button class="quick-btn" data-nav="patient/payments"><strong>Billing & Payments</strong><span class="text-xs muted">${fmtMoney(data.pendingPayments.total)} due</span></button>
        <button class="quick-btn" data-nav="patient/records?tab=discharges"><strong>Discharge Summary</strong><span class="text-xs muted">${data.dischargeCount || 0} summary record(s)</span></button>
        <button class="quick-btn" id="pat-notif-shortcut"><strong>Notifications</strong><span class="text-xs muted">Alerts & updates</span></button>
        <button class="quick-btn" data-nav="patient/lab-booking"><strong>Book Lab Test</strong><span class="text-xs muted">Diagnostic collection slots</span></button>
        <button class="quick-btn" data-nav="patient/support"><strong>Help & Support</strong><span class="text-xs muted">24/7 desk & care guides</span></button>
        <button class="quick-btn sos" id="sos-trigger-btn"><strong>Emergency SOS</strong><span class="text-xs">Urgent triage request</span></button>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Pending Balance</span><span class="kpi-value tabular">${fmtMoney(data.pendingPayments.total)}</span><span class="kpi-sub">${data.pendingPayments.count} open invoice(s)</span></div>
        <div class="kpi-card"><span class="kpi-label">Lab & Radiology Reports</span><span class="kpi-value tabular">${data.releasedLabsCount + (data.releasedRadiologyCount || 0)}</span><span class="kpi-sub">${data.releasedLabsCount} lab · ${data.releasedRadiologyCount || 0} radiology</span></div>
        <div class="kpi-card"><span class="kpi-label">Active Prescriptions</span><span class="kpi-value tabular">${data.activeRxCount}</span><span class="kpi-sub">View & request refills</span></div>
        <div class="kpi-card"><span class="kpi-label">Medical Documents</span><span class="kpi-value tabular">${data.documentsCount || 0}</span><span class="kpi-sub">Uploaded patient files</span></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h2>Upcoming Appointment</h2><button class="btn btn-sm" data-nav="patient/visits">Manage Visits</button></div>
          ${data.upcomingAppointment ? `
            <div style="display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>${esc(data.upcomingAppointment.doctor_name)}</strong>${statusBadge(data.upcomingAppointment.status)}
              </div>
              <div class="meta-line"><span class="mono">${esc(data.upcomingAppointment.appointment_ref)}</span><span>·</span><span>${esc(data.upcomingAppointment.specialty_name)}</span></div>
              <div class="text-sm tabular">${esc(data.upcomingAppointment.appointment_date)} at ${esc(data.upcomingAppointment.appointment_time)} · ${esc(data.upcomingAppointment.branch_name)}</div>
            </div>
          ` : emptyState('No upcoming appointments', 'Schedule an in-person or video consultation with any specialist.', '<button class="btn btn-primary btn-sm" id="empty-book-btn">Book Appointment</button>')}
        </div>

        <div class="card">
          <div class="card-header"><h2>Appointment History & Consultations</h2><button class="btn btn-sm" data-nav="patient/records">Full Records</button></div>
          ${data.lastConsultation ? `
            <div style="display:flex;flex-direction:column;gap:8px">
              <strong>${esc(data.lastConsultation.doctor_name)}</strong>
              <div class="text-xs muted tabular">${fmtDate(data.lastConsultation.created_at)}</div>
              <p class="text-sm">${esc(data.lastConsultation.chief_complaint)}</p>
              <p class="text-xs muted">${esc(data.lastConsultation.treatment_plan || '')}</p>
            </div>
          ` : pastApts.length ? pastApts.slice(0, 3).map((a) => `
            <div class="list-row">
              <div><strong>${esc(a.doctor_name)}</strong><div class="text-xs muted tabular">${esc(a.appointment_date)} · ${esc(a.specialty_name)}</div></div>
              ${statusBadge(a.status)}
            </div>
          `).join('') : emptyState('No past visits yet', 'Completed appointments and clinician summaries will appear here.')}
        </div>
      </div>

      ${(data.followUps || []).length ? `
        <div class="card">
          <div class="card-header"><h2>Scheduled Follow-Ups</h2></div>
          ${data.followUps.map((f) => `
            <div class="list-row">
              <div><strong>${esc(f.doctor_name)}</strong><div class="text-xs muted">${esc(f.notes || 'Clinical follow-up')}</div></div>
              <div style="display:flex;gap:8px;align-items:center"><span class="tabular text-sm">${esc(f.follow_up_date)}</span>${statusBadge(f.status)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${data.announcements.length ? `
        <div class="card">
          <div class="card-header"><h2>Hospital Announcements</h2></div>
          ${data.announcements.map((a) => `
            <div class="list-row">
              <div><strong>${esc(a.title)}</strong><div class="text-sm muted">${esc(a.body)}</div></div>
              <button class="btn btn-sm ack-btn" data-id="${a.id}">Acknowledge</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    container.querySelectorAll('[data-nav]').forEach((el) => { el.onclick = () => navigate(el.dataset.nav); });
    const emptyBook = container.querySelector('#empty-book-btn');
    if (emptyBook) emptyBook.onclick = () => navigate('patient/book');
    container.querySelector('#sos-trigger-btn').onclick = () => openEmergencyModal(p, data.emergencies);
    container.querySelector('#pat-notif-shortcut').onclick = () => {
      const bell = document.getElementById('notif-bell-btn');
      if (bell) bell.click();
    };
    container.querySelectorAll('.ack-btn').forEach((b) => {
      b.onclick = async () => {
        await api.post(`/api/publisher/${b.dataset.id}/ack`, {});
        b.textContent = 'Acknowledged';
        b.disabled = true;
      };
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
    const retry = container.querySelector('#retry-load-btn');
    if (retry) retry.onclick = () => renderPatientHome(container, user, navigate);
  }
}

export function openEmergencyModal(profile, recentList = []) {
  openModal('Emergency Assistance (SOS)', `
    <div class="alert-banner error" style="margin-bottom:14px">
      For life-threatening emergencies, call local emergency services or our 24/7 Triage Desk directly:
      <a href="tel:+15559112273" style="font-weight:700;color:var(--danger);margin-left:6px">+1-555-911-CARE</a>
    </div>
    <form id="sos-form" class="form-grid">
      <div class="field"><label for="sos-type">Emergency Type</label>
        <select id="sos-type" name="emergency_type" required>
          <option value="Cardiac / Chest Pain">Cardiac / Chest Pain</option>
          <option value="Breathing Difficulty">Breathing Difficulty</option>
          <option value="Trauma / Injury">Trauma / Injury</option>
          <option value="High Fever / Seizure">High Fever / Seizure</option>
          <option value="Other Urgent Care">Other Urgent Care</option>
        </select>
      </div>
      <div class="field"><label for="sos-phone">Contact Phone</label><input id="sos-phone" name="contact_phone" required value="${esc(profile?.phone || '')}" /></div>
      <div class="field full"><label for="sos-loc">Current Location / Address</label><input id="sos-loc" name="location_text" required value="${esc(profile?.address || '')}" /></div>
      <div class="field full"><label for="sos-notes">Additional Notes</label><textarea id="sos-notes" name="notes" placeholder="Describe symptoms or access details..."></textarea></div>
      <div class="field full"><button type="submit" class="btn btn-danger">Submit Emergency Request</button></div>
    </form>
    ${recentList.length ? `
      <div style="margin-top:16px"><h3>Recent SOS Requests</h3>
        ${recentList.map((e) => `<div class="list-row"><div><strong class="mono">${esc(e.emergency_ref)}</strong> · ${esc(e.emergency_type)}<div class="text-xs muted">${esc(e.location_text)}</div></div>${statusBadge(e.status)}</div>`).join('')}
      </div>
    ` : ''}
  `, (body) => {
    body.querySelector('#sos-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const res = await api.post('/api/patients/emergency/sos', {
          emergency_type: fd.get('emergency_type'),
          contact_phone: fd.get('contact_phone'),
          location_text: fd.get('location_text'),
          notes: fd.get('notes'),
          patient_name: profile?.full_name
        });
        toast('Emergency Request Logged', `Reference ${res.emergency.emergency_ref} received by triage desk.`, 'danger');
        closeModal();
      } catch (err) { toast('Request Failed', err.message, 'danger'); }
    };
  });
}

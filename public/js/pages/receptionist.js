import { api } from '../api.js';
import { closeModal, errorState, esc, fmtMoney, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderReceptionistPortal(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const [patRes, aptRes, docRes, emgRes, meta] = await Promise.all([
      api.get('/api/patients'),
      api.get('/api/appointments'),
      api.get('/api/doctors'),
      api.get('/api/patients/emergency/list'),
      api.get('/api/doctors/meta/filters')
    ]);

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div><h1>Front-Office Reception Desk</h1><p class="text-sm muted">Patient registration, check-in/out, doctor availability, and admission desk.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm" id="rec-doc-avail-btn">Doctor Availability</button>
            <button class="btn btn-sm" id="rec-adm-btn">+ Register Admission</button>
            <button class="btn btn-sm" id="rec-reg-pat-btn">+ Register Patient</button>
            <button class="btn btn-primary btn-sm" id="rec-book-apt-btn">+ Book Appointment</button>
          </div>
        </div>
        <div class="field" style="max-width:360px;margin-bottom:14px">
          <label for="rec-pat-search">Search Registered Patients</label>
          <input id="rec-pat-search" placeholder="Search by name, MRN, email, or phone..." />
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>MRN</th><th>Patient Name</th><th>Contact</th><th>Gender / DOB</th><th>Status</th></tr></thead>
          <tbody id="rec-pat-tbody">
            ${patRes.patients.map((p) => `
              <tr>
                <td class="mono">${esc(p.patient_code)}</td>
                <td><strong>${esc(p.full_name)}</strong></td>
                <td class="text-sm">${esc(p.phone || '')}<div class="text-xs muted">${esc(p.email)}</div></td>
                <td class="tabular text-sm">${esc(p.gender)} · ${esc(p.dob)}</td>
                <td>${statusBadge(p.is_active ? 'Active' : 'Blocked')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Appointment Check-In, Check-Out & Scheduling</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Ref</th><th>Patient</th><th>Doctor</th><th>Schedule</th><th>Status</th><th>Front-Office Actions</th></tr></thead>
          <tbody>
            ${aptRes.appointments.map((a) => `
              <tr>
                <td class="mono">${esc(a.appointment_ref)}</td>
                <td><strong>${esc(a.patient_name)}</strong><div class="text-xs muted mono">${esc(a.patient_code)}</div></td>
                <td>${esc(a.doctor_name)}<div class="text-xs muted">${esc(a.department_name)}</div></td>
                <td class="tabular">${esc(a.appointment_date)} ${esc(a.appointment_time)}</td>
                <td>${statusBadge(a.status)}</td>
                <td><div style="display:flex;gap:6px;flex-wrap:wrap">
                  ${a.status === 'Booked' ? `<button class="btn btn-sm apt-act" data-id="${a.id}" data-st="Confirmed">Confirm</button>` : ''}
                  ${['Booked', 'Confirmed', 'Rescheduled'].includes(a.status) ? `<button class="btn btn-primary btn-sm apt-act" data-id="${a.id}" data-st="Checked In">Check In</button>` : ''}
                  ${['Checked In', 'In Consultation', 'Completed'].includes(a.status) ? `<button class="btn btn-success btn-sm apt-act" data-id="${a.id}" data-st="Checked Out">Check Out</button>` : ''}
                  ${['Booked', 'Confirmed'].includes(a.status) ? `<button class="btn btn-sm apt-act" data-id="${a.id}" data-st="No Show">No Show</button>` : ''}
                  ${!['Completed', 'Checked Out', 'Cancelled'].includes(a.status) ? `<button class="btn btn-sm apt-act" data-id="${a.id}" data-st="Cancelled">Cancel</button>` : ''}
                </div></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      </div>

      ${emgRes.emergencies.length ? `
        <div class="card">
          <div class="card-header"><h2>Emergency Triage Requests</h2></div>
          ${emgRes.emergencies.map((e) => `
            <div class="list-row">
              <div><strong class="mono">${esc(e.emergency_ref)}</strong> · ${esc(e.emergency_type)} — ${esc(e.patient_name)}<div class="text-xs muted">${esc(e.location_text)} · ${esc(e.contact_phone)}</div></div>
              ${statusBadge(e.status)}
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    container.querySelector('#rec-pat-search').oninput = async (e) => {
      const res = await api.get(`/api/patients?q=${encodeURIComponent(e.target.value)}`);
      container.querySelector('#rec-pat-tbody').innerHTML = res.patients.map((p) => `
        <tr><td class="mono">${esc(p.patient_code)}</td><td><strong>${esc(p.full_name)}</strong></td><td class="text-sm">${esc(p.phone || '')}<div class="text-xs muted">${esc(p.email)}</div></td><td class="tabular text-sm">${esc(p.gender)} · ${esc(p.dob)}</td><td>${statusBadge(p.is_active ? 'Active' : 'Blocked')}</td></tr>
      `).join('');
    };

    container.querySelectorAll('.apt-act').forEach((b) => {
      b.onclick = async () => {
        try {
          await api.patch(`/api/appointments/${b.dataset.id}/status`, { status: b.dataset.st });
          toast('Status Updated', `Appointment marked ${b.dataset.st}.`, 'success');
          renderReceptionistPortal(container);
        } catch (err) { toast('Error', err.message, 'danger'); }
      };
    });

    container.querySelector('#rec-reg-pat-btn').onclick = () => openRegisterPatientModal(() => renderReceptionistPortal(container));
    container.querySelector('#rec-book-apt-btn').onclick = () => openStaffBookModal(patRes.patients, docRes.doctors, () => renderReceptionistPortal(container));
    container.querySelector('#rec-doc-avail-btn').onclick = () => openDoctorAvailModal(docRes.doctors);
    container.querySelector('#rec-adm-btn').onclick = () => openReceptionAdmissionModal(patRes.patients, docRes.doctors, meta.departments);
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

function openDoctorAvailModal(doctors) {
  openModal('Live Doctor Availability & Fees', `
    <div class="table-wrap"><table>
      <thead><tr><th>Doctor</th><th>Specialization</th><th>Branch</th><th>Fee</th><th>Status</th></tr></thead>
      <tbody>
        ${doctors.map((d) => `
          <tr>
            <td><strong>${esc(d.full_name)}</strong></td>
            <td>${esc(d.specialty_name)}</td>
            <td>${esc(d.branch_name)}</td>
            <td class="num">${fmtMoney(d.consultation_fee)}</td>
            <td>${statusBadge(d.availability_status || 'Available')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `);
}

function openReceptionAdmissionModal(patients, doctors, departments) {
  openModal('Register Inpatient Admission', `
    <form id="rec-adm-form" class="form-grid">
      <div class="field full"><label for="ra-pat">Patient</label><select id="ra-pat" name="patient_id">${patients.map((p) => `<option value="${p.id}">${esc(p.full_name)} (${esc(p.patient_code)})</option>`).join('')}</select></div>
      <div class="field"><label for="ra-dept">Department</label><select id="ra-dept" name="department_id">${departments.filter((d) => d.category === 'clinical').map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ra-doc">Attending Doctor</label><select id="ra-doc" name="doctor_id">${doctors.map((d) => `<option value="${d.id}">${esc(d.full_name)}</option>`).join('')}</select></div>
      <div class="field full"><label for="ra-type">Admission Type</label><select id="ra-type" name="admission_type"><option>Elective</option><option>Emergency</option><option>Observation</option></select></div>
      <div class="field full"><label for="ra-rsn">Reason</label><input id="ra-rsn" name="reason" required placeholder="Clinical reason for admission" /></div>
      <div class="field full"><button type="submit" class="btn btn-primary">Register Admission</button></div>
    </form>
  `, (body) => {
    body.querySelector('#rec-adm-form').onsubmit = async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      try {
        await api.post('/api/admissions', { ...d, patient_id: Number(d.patient_id), department_id: Number(d.department_id), doctor_id: Number(d.doctor_id) });
        toast('Admission Registered', 'Sent to bed management & case manager.', 'success');
        closeModal();
      } catch (err) { toast('Error', err.message, 'danger'); }
    };
  });
}

function openRegisterPatientModal(onDone) {
  openModal('Register New Patient', `
    <form id="staff-reg-pat" class="form-grid">
      <div class="field full"><label for="sp-name">Full Name</label><input id="sp-name" name="full_name" required /></div>
      <div class="field"><label for="sp-email">Email</label><input id="sp-email" name="email" type="email" required /></div>
      <div class="field"><label for="sp-phone">Phone</label><input id="sp-phone" name="phone" required /></div>
      <div class="field"><label for="sp-dob">Date of Birth</label><input id="sp-dob" name="dob" type="date" required value="1990-01-01" /></div>
      <div class="field"><label for="sp-gen">Gender</label><select id="sp-gen" name="gender"><option>Female</option><option>Male</option><option>Other</option></select></div>
      <div class="field full"><label for="sp-addr">Address</label><input id="sp-addr" name="address" required /></div>
      <div class="field full"><button type="submit" class="btn btn-primary">Register Patient</button></div>
    </form>
  `, (body) => {
    body.querySelector('#staff-reg-pat').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/patients', Object.fromEntries(new FormData(e.target).entries()));
        toast('Patient Registered', 'MRN generated successfully.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Registration Error', err.message, 'danger'); }
    };
  });
}

function openStaffBookModal(patients, doctors, onDone) {
  const today = new Date().toISOString().slice(0, 10);
  openModal('Book Patient Appointment', `
    <form id="staff-book-form" class="form-grid">
      <div class="field full"><label for="sb-pat">Patient</label><select id="sb-pat" name="patient_id" required>${patients.map((p) => `<option value="${p.id}">${esc(p.full_name)} (${esc(p.patient_code)})</option>`).join('')}</select></div>
      <div class="field full"><label for="sb-doc">Doctor</label><select id="sb-doc" name="doctor_id" required>${doctors.map((d) => `<option value="${d.id}">${esc(d.full_name)} — ${esc(d.specialty_name)}</option>`).join('')}</select></div>
      <div class="field"><label for="sb-date">Date</label><input id="sb-date" name="appointment_date" type="date" value="${today}" required /></div>
      <div class="field"><label for="sb-time">Time Slot</label><select id="sb-time" name="appointment_time">${['09:00','09:30','10:00','10:30','11:00','14:00','14:30','15:00'].map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div class="field full"><label for="sb-reason">Reason</label><input id="sb-reason" name="reason" /></div>
      <div class="field full"><button type="submit" class="btn btn-primary">Confirm Booking</button></div>
    </form>
  `, (body) => {
    body.querySelector('#staff-book-form').onsubmit = async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      try {
        await api.post('/api/appointments', { ...d, patient_id: Number(d.patient_id), doctor_id: Number(d.doctor_id) });
        toast('Appointment Booked', '', 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Booking Failed', err.message, 'danger'); }
    };
  });
}

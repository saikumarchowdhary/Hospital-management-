import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtMoney, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderBookAppointment(container, user, navigate, query = {}) {
  container.innerHTML = skeletonBlock(4);
  try {
    const [meta, docRes] = await Promise.all([api.get('/api/doctors/meta/filters'), api.get('/api/doctors')]);
    const doctors = docRes.doctors;
    const preDoc = query.doctorId ? doctors.find((d) => d.id === Number(query.doctorId)) : doctors[0];

    let state = {
      branchId: preDoc ? String(preDoc.branch_id) : String(meta.branches[0]?.id || ''),
      departmentId: preDoc ? String(preDoc.department_id) : '',
      doctorId: preDoc ? String(preDoc.id) : '',
      date: new Date().toISOString().slice(0, 10),
      time: '',
      visitType: 'In-Person',
      reason: ''
    };

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h1>Book Appointment</h1>
            <p class="text-sm muted">Select branch, specialist, date, and real-time available slot.</p>
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label for="bk-branch">1. Hospital Branch</label>
            <select id="bk-branch">${meta.branches.map((b) => `<option value="${b.id}" ${String(b.id) === state.branchId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="bk-dept">2. Department</label>
            <select id="bk-dept"><option value="">All Clinical Departments</option>${meta.departments.filter((d) => d.category === 'clinical').map((d) => `<option value="${d.id}" ${String(d.id) === state.departmentId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="bk-doc">3. Doctor</label>
            <select id="bk-doc"></select>
          </div>
          <div class="field"><label for="bk-date">4. Appointment Date</label>
            <input id="bk-date" type="date" value="${state.date}" min="${state.date}" />
          </div>
          <div class="field full"><label>5. Available Time Slots</label>
            <div id="bk-slots" style="display:flex;flex-wrap:wrap;gap:8px"></div>
          </div>
          <div class="field"><label for="bk-type">6. Visit Type</label>
            <select id="bk-type"><option value="In-Person">In-Person Consultation</option><option value="Follow-Up">Follow-Up Visit</option><option value="Video Consult">Video Consultation</option></select>
          </div>
          <div class="field"><label for="bk-reason">7. Reason for Visit</label>
            <input id="bk-reason" placeholder="Briefly describe symptoms or checkup goal" />
          </div>
        </div>

        <div id="bk-review" class="card" style="background:var(--bg);margin-top:16px"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
          <button type="button" class="btn" id="bk-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="bk-confirm">Confirm Appointment</button>
        </div>
      </div>
    `;

    function syncDoctors() {
      const filtered = doctors.filter((d) =>
        (!state.branchId || String(d.branch_id) === state.branchId) &&
        (!state.departmentId || String(d.department_id) === state.departmentId)
      );
      const list = filtered.length ? filtered : doctors;
      const docSelect = container.querySelector('#bk-doc');
      docSelect.innerHTML = list.map((d) => `<option value="${d.id}" ${String(d.id) === state.doctorId ? 'selected' : ''}>${esc(d.full_name)} — ${esc(d.specialty_name)} (${fmtMoney(d.consultation_fee)})</option>`).join('');
      state.doctorId = docSelect.value;
      loadSlots();
    }

    async function loadSlots() {
      if (!state.doctorId) return;
      const slotsEl = container.querySelector('#bk-slots');
      slotsEl.innerHTML = '<span class="muted text-sm">Checking real-time availability...</span>';
      const res = await api.get(`/api/doctors/${state.doctorId}/slots?date=${state.date}`);
      state.time = '';
      slotsEl.innerHTML = res.slots.map((s) => {
        const avail = s.status === 'Available';
        return `<button type="button" class="btn btn-sm slot-pick-btn" data-time="${s.slot_time}" ${avail ? '' : 'disabled'}>${s.slot_time} ${avail ? '' : '(Booked)'}</button>`;
      }).join('');
      slotsEl.querySelectorAll('.slot-pick-btn').forEach((btn) => {
        btn.onclick = () => {
          slotsEl.querySelectorAll('.slot-pick-btn').forEach((x) => x.classList.remove('btn-primary'));
          btn.classList.add('btn-primary');
          state.time = btn.dataset.time;
          renderReview();
        };
      });
      renderReview();
    }

    function renderReview() {
      const doc = doctors.find((d) => String(d.id) === state.doctorId);
      container.querySelector('#bk-review').innerHTML = `
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div class="text-xs muted">Appointment Summary</div>
            <strong>${doc ? esc(doc.full_name) : 'Select a doctor'}</strong>
            <div class="text-sm muted tabular">${state.date} · ${state.time || 'Select a time slot'} · ${esc(state.visitType)}</div>
          </div>
          <div style="text-align:right">
            <div class="text-xs muted">Consultation Charges</div>
            <strong class="tabular" style="font-size:18px">${doc ? fmtMoney(doc.consultation_fee) : '$0.00'}</strong>
          </div>
        </div>
      `;
    }

    container.querySelector('#bk-branch').onchange = (e) => { state.branchId = e.target.value; syncDoctors(); };
    container.querySelector('#bk-dept').onchange = (e) => { state.departmentId = e.target.value; syncDoctors(); };
    container.querySelector('#bk-doc').onchange = (e) => { state.doctorId = e.target.value; loadSlots(); };
    container.querySelector('#bk-date').onchange = (e) => { state.date = e.target.value; loadSlots(); };
    container.querySelector('#bk-type').onchange = (e) => { state.visitType = e.target.value; renderReview(); };
    container.querySelector('#bk-cancel').onclick = () => navigate('patient/home');

    container.querySelector('#bk-confirm').onclick = async () => {
      if (!state.time) { toast('Select a slot', 'Please pick an available appointment time.', 'danger'); return; }
      const btn = container.querySelector('#bk-confirm');
      btn.disabled = true;
      try {
        const res = await api.post('/api/appointments', {
          doctor_id: Number(state.doctorId),
          appointment_date: state.date,
          appointment_time: state.time,
          visit_type: state.visitType,
          reason: container.querySelector('#bk-reason').value.trim()
        });
        toast('Appointment Confirmed', `Reference: ${res.appointment.appointment_ref}`, 'success');
        navigate('patient/visits');
      } catch (err) {
        toast('Booking Error', err.message, 'danger');
        loadSlots();
      } finally {
        btn.disabled = false;
      }
    };

    syncDoctors();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

export async function renderPatientAppointments(container, user, navigate) {
  container.innerHTML = skeletonBlock(4);
  try {
    const res = await api.get('/api/appointments');
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div><h1>My Appointments</h1><p class="text-sm muted">Track visit status, reschedule, or cancel upcoming bookings.</p></div>
          <button class="btn btn-primary btn-sm" id="new-apt-btn">Book Appointment</button>
        </div>
        ${res.appointments.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Reference</th><th>Doctor</th><th>Date & Time</th><th>Type</th><th>Fee</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${res.appointments.map((a) => `
                  <tr>
                    <td class="mono">${esc(a.appointment_ref)}</td>
                    <td><strong>${esc(a.doctor_name)}</strong><div class="text-xs muted">${esc(a.department_name)} · ${esc(a.branch_name)}</div></td>
                    <td class="tabular">${esc(a.appointment_date)} ${esc(a.appointment_time)}</td>
                    <td>${esc(a.visit_type)}</td>
                    <td class="num">${fmtMoney(a.fee)}</td>
                    <td>${statusBadge(a.status)}</td>
                    <td>
                      ${['Booked', 'Confirmed', 'Rescheduled'].includes(a.status) ? `
                        <div style="display:flex;gap:6px">
                          <button class="btn btn-sm resched-btn" data-id="${a.id}" data-doc="${a.doctor_id}">Reschedule</button>
                          <button class="btn btn-sm cancel-apt-btn" data-id="${a.id}">Cancel</button>
                        </div>
                      ` : '<span class="muted text-xs">No actions</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : emptyState('No appointments found', 'Book your first appointment with a MediCore specialist.')}
      </div>
    `;
    container.querySelector('#new-apt-btn').onclick = () => navigate('patient/book');
    container.querySelectorAll('.cancel-apt-btn').forEach((b) => {
      b.onclick = async () => {
        try {
          await api.patch(`/api/appointments/${b.dataset.id}/status`, { status: 'Cancelled', notes: 'Cancelled by patient' });
          toast('Appointment Cancelled', 'Slot released.', 'success');
          renderPatientAppointments(container, user, navigate);
        } catch (err) { toast('Error', err.message, 'danger'); }
      };
    });
    container.querySelectorAll('.resched-btn').forEach((b) => {
      b.onclick = () => openRescheduleModal(b.dataset.id, b.dataset.doc, () => renderPatientAppointments(container, user, navigate));
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

function openRescheduleModal(aptId, doctorId, onDone) {
  const today = new Date().toISOString().slice(0, 10);
  openModal('Reschedule Appointment', `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label for="rs-date">New Date</label><input id="rs-date" type="date" value="${today}" min="${today}" /></div>
      <div class="field"><label for="rs-time">New Time Slot</label><select id="rs-time"></select></div>
      <button class="btn btn-primary" id="rs-save">Confirm Reschedule</button>
    </div>
  `, async (body) => {
    async function load() {
      const d = body.querySelector('#rs-date').value;
      const res = await api.get(`/api/doctors/${doctorId}/slots?date=${d}`);
      const avail = res.slots.filter((s) => s.status === 'Available');
      body.querySelector('#rs-time').innerHTML = avail.map((s) => `<option value="${s.slot_time}">${s.slot_time}</option>`).join('');
    }
    body.querySelector('#rs-date').onchange = load;
    await load();
    body.querySelector('#rs-save').onclick = async () => {
      try {
        await api.patch(`/api/appointments/${aptId}/status`, {
          status: 'Rescheduled',
          new_date: body.querySelector('#rs-date').value,
          new_time: body.querySelector('#rs-time').value
        });
        toast('Rescheduled', 'Your appointment time has been updated.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Error', err.message, 'danger'); }
    };
  });
}

import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtMoney, openModal, skeletonBlock, statusBadge } from '../ui.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function renderDoctorDiscovery(container, _user, navigate, query = {}) {
  container.innerHTML = skeletonBlock(4);
  try {
    const meta = await api.get('/api/doctors/meta/filters');
    let filters = {
      q: '',
      specialtyId: query.specialtyId || '',
      departmentId: '',
      branchId: '',
      dayOfWeek: '',
      maxFee: ''
    };

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h1>Doctor Directory (${meta.specialties.length} Medical Specializations)</h1>
            <p class="text-sm muted">Search specialists by name, department, or specialization and book available slots.</p>
          </div>
          <button class="btn btn-sm" id="doc-spec-browse">Browse All Specializations</button>
        </div>
        <form id="doc-filter-form" class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
          <div class="field"><label for="df-q">Doctor / Specialty</label><input id="df-q" placeholder="Name, specialty or dept" /></div>
          <div class="field"><label for="df-spec">Specialization</label>
            <select id="df-spec"><option value="">All Specializations</option>${meta.specialties.map((s) => `<option value="${s.id}" ${String(s.id) === String(filters.specialtyId) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="df-dept">Department</label>
            <select id="df-dept"><option value="">All Departments</option>${meta.departments.filter((d) => d.category === 'clinical' || d.category === 'diagnostic').map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="df-branch">Branch</label>
            <select id="df-branch"><option value="">All Branches</option>${meta.branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="df-day">Available Day</label>
            <select id="df-day"><option value="">Any Day</option>${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="df-fee">Max Fee ($)</label><input id="df-fee" type="number" min="0" placeholder="e.g. 150" /></div>
        </form>
      </div>
      <div id="doctors-results" class="grid-3"></div>
    `;

    async function loadDoctors() {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
      const res = await api.get(`/api/doctors?${qs.toString()}`);
      const grid = container.querySelector('#doctors-results');
      if (!res.doctors.length) {
        const hasFilters = Object.values(filters).some(Boolean);
        grid.innerHTML = `<div style="grid-column:1/-1">${emptyState(
          hasFilters ? 'No doctors match these filters' : 'No verified doctors available yet',
          hasFilters ? 'Try clearing a filter to see available specialists.' : 'Verified and scheduled doctors will appear here automatically.'
        )}</div>`;
        return;
      }
      grid.innerHTML = res.doctors.map((d) => {
        const schedDays = (d.schedules || []).map((s) => DAYS[s.day_of_week]).join(', ') || 'Schedule not configured';
        const slotWindow = (d.schedules && d.schedules[0]) ? `${d.schedules[0].start_time}–${d.schedules[0].end_time}` : 'Pending schedule';
        const availStatus = d.availability_status || 'Available';
        return `
          <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;gap:12px">
            <div>
              <div style="display:flex;gap:12px;align-items:center;justify-content:space-between">
                <div style="display:flex;gap:12px;align-items:center">
                  <div style="width:44px;height:44px;border-radius:10px;background:var(--primary-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">
                    ${esc(d.full_name.replace(/^Dr\.\s*/i, '').split(' ').slice(0, 2).map((w) => w[0]).join(''))}
                  </div>
                  <div>
                    <h3>${esc(d.full_name)}</h3>
                    <div class="text-xs muted">${esc(d.qualification)}</div>
                  </div>
                </div>
                ${statusBadge(availStatus)}
              </div>
              <div class="meta-line" style="margin-top:10px">
                <strong style="color:var(--primary)">${esc(d.specialty_name)}</strong><span>·</span><span>${esc(d.department_name)}</span>
              </div>
              <div class="meta-line" style="margin-top:4px">
                <span class="tabular">${d.experience_years} yrs exp</span><span>·</span><span>${esc(d.branch_name)}</span>
              </div>
              <div class="text-xs muted tabular" style="margin-top:4px">Available: ${esc(schedDays)} (${esc(slotWindow)})</div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid var(--border-subtle)">
              <div><span class="text-xs muted">Consultation</span><div class="tabular" style="font-weight:700">${fmtMoney(d.consultation_fee)}</div></div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-sm doc-view-btn" data-id="${d.id}">Profile</button>
                <button class="btn btn-primary btn-sm doc-book-btn" data-id="${d.id}">Book Appointment</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      grid.querySelectorAll('.doc-view-btn').forEach((b) => {
        b.onclick = () => openDoctorModal(res.doctors.find((x) => x.id === Number(b.dataset.id)), navigate);
      });
      grid.querySelectorAll('.doc-book-btn').forEach((b) => {
        b.onclick = () => navigate(`patient/book?doctorId=${b.dataset.id}`);
      });
    }

    container.querySelector('#doc-spec-browse').onclick = () => navigate('patient/specialties');
    const bind = (id, key) => {
      const el = container.querySelector(id);
      el.oninput = el.onchange = () => { filters[key] = el.value; loadDoctors(); };
    };
    bind('#df-q', 'q');
    bind('#df-spec', 'specialtyId');
    bind('#df-dept', 'departmentId');
    bind('#df-branch', 'branchId');
    bind('#df-day', 'dayOfWeek');
    bind('#df-fee', 'maxFee');

    await loadDoctors();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

function openDoctorModal(doc, navigate) {
  const scheduleHtml = (doc.schedules || []).map((s) => `${DAYS[s.day_of_week]} ${s.start_time}–${s.end_time}`).join(' · ') || 'Mon–Sat 09:00–17:00';
  openModal(doc.full_name, `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="meta-line"><span>${esc(doc.qualification)}</span><span>·</span><span>${esc(doc.specialty_name)}</span><span>·</span><span>${esc(doc.department_name)}</span>${statusBadge(doc.availability_status || 'Available')}</div>
      <p class="text-sm">${esc(doc.bio || 'Board-certified specialist at MediCore HMS.')}</p>
      <div class="card" style="background:var(--bg)">
        <div class="text-xs muted">Branch</div><strong>${esc(doc.branch_name)}</strong>
        <div class="text-xs muted" style="margin-top:8px">Experience</div><strong>${doc.experience_years} years</strong>
        <div class="text-xs muted" style="margin-top:8px">Available Days & Slots</div><div class="text-sm tabular">${esc(scheduleHtml)}</div>
        <div class="text-xs muted" style="margin-top:8px">Consultation Fee</div><strong class="tabular">${fmtMoney(doc.consultation_fee)}</strong>
      </div>
      <button class="btn btn-primary" id="modal-book-doc">Book Appointment with ${esc(doc.full_name)}</button>
    </div>
  `, (body) => {
    body.querySelector('#modal-book-doc').onclick = () => {
      closeModal();
      navigate(`patient/book?doctorId=${doc.id}`);
    };
  });
}

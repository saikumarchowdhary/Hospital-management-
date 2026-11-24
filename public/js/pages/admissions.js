import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtDate, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderAdmissionsPage(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const [admRes, bedRes, patRes, docRes, meta, fupRes] = await Promise.all([
      api.get('/api/admissions'),
      api.get('/api/beds'),
      api.get('/api/patients'),
      api.get('/api/doctors'),
      api.get('/api/doctors/meta/filters'),
      api.get('/api/clinical/follow-ups').catch(() => ({ followUps: [] }))
    ]);
    const availBeds = bedRes.beds.filter((b) => b.status === 'Available');
    const followUps = fupRes.followUps || [];

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div><h1>Admissions & Case Management</h1><p class="text-sm muted">Track inpatient admissions, bed allocation, care coordination, discharge planning, and follow-ups.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm" id="cm-fup-btn">+ Schedule Follow-Up</button>
            <button class="btn btn-primary btn-sm" id="new-adm-btn">+ New Admission</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Admission Ref</th><th>Patient</th><th>Department & Doctor</th><th>Bed / Ward</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${admRes.admissions.map((a) => `
              <tr>
                <td class="mono">${esc(a.admission_ref)}</td>
                <td><strong>${esc(a.patient_name)}</strong><div class="text-xs muted mono">${esc(a.patient_code)}</div></td>
                <td>${esc(a.department_name)}<div class="text-xs muted">${esc(a.doctor_name)}</div></td>
                <td>${a.bed_code ? `<strong class="mono">${esc(a.bed_code)}</strong><div class="text-xs muted">${esc(a.ward_name || '')}</div>` : '<span class="muted">Unallocated</span>'}</td>
                <td>${esc(a.admission_type)}</td>
                <td>${statusBadge(a.status)}<div class="text-xs muted tabular">${fmtDate(a.admitted_at || a.created_at)}</div></td>
                <td><div style="display:flex;gap:6px;flex-wrap:wrap">
                  ${a.status === 'Requested' ? `<button class="btn btn-sm adm-st-btn" data-id="${a.id}" data-st="Approved">Approve</button>` : ''}
                  ${['Requested', 'Approved', 'Admitted', 'Active Care'].includes(a.status) && !a.bed_id ? `<button class="btn btn-primary btn-sm alloc-bed-btn" data-id="${a.id}">Allocate Bed</button>` : ''}
                  ${a.status === 'Admitted' ? `<button class="btn btn-sm adm-st-btn" data-id="${a.id}" data-st="Active Care">Active Care</button>` : ''}
                  ${a.status === 'Active Care' ? `<button class="btn btn-sm adm-st-btn" data-id="${a.id}" data-st="Discharge Pending">Plan Discharge</button>` : ''}
                  ${['Admitted', 'Active Care', 'Discharge Pending'].includes(a.status) ? `<button class="btn btn-danger btn-sm disch-btn" data-id="${a.id}">Discharge</button>` : ''}
                </div></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Follow-Up Coordination (${followUps.length})</h2></div>
        ${followUps.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Patient</th><th>Doctor</th><th>Follow-Up Date</th><th>Care Notes</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${followUps.map((f) => `
            <tr>
              <td><strong>${esc(f.patient_name)}</strong><div class="text-xs muted mono">${esc(f.patient_code)}</div></td>
              <td>${esc(f.doctor_name)}</td>
              <td class="tabular">${esc(f.follow_up_date)}</td>
              <td class="text-sm">${esc(f.notes || 'Post-discharge coordination')}</td>
              <td>${statusBadge(f.status)}</td>
              <td>${f.status !== 'Completed' ? `<button class="btn btn-sm fup-done-btn" data-id="${f.id}">Mark Completed</button>` : '<span class="text-xs muted">Closed</span>'}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>` : emptyState('No follow-ups scheduled', 'Schedule follow-up care plans for discharged or outpatient cases.')}
      </div>
    `;

    container.querySelector('#new-adm-btn').onclick = () => {
      openModal('Create Admission Request', `
        <form id="adm-create-form" class="form-grid">
          <div class="field full"><label for="ad-pat">Patient</label><select id="ad-pat" name="patient_id" required>${patRes.patients.map((p) => `<option value="${p.id}">${esc(p.full_name)} (${esc(p.patient_code)})</option>`).join('')}</select></div>
          <div class="field"><label for="ad-dept">Department</label><select id="ad-dept" name="department_id" required>${meta.departments.filter((d) => d.category === 'clinical').map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="ad-doc">Attending Doctor</label><select id="ad-doc" name="doctor_id" required>${docRes.doctors.map((d) => `<option value="${d.id}">${esc(d.full_name)}</option>`).join('')}</select></div>
          <div class="field"><label for="ad-type">Admission Type</label><select id="ad-type" name="admission_type"><option>Elective</option><option>Emergency</option><option>Observation</option></select></div>
          <div class="field full"><label for="ad-reason">Clinical Reason</label><textarea id="ad-reason" name="reason" required></textarea></div>
          <div class="field full"><button type="submit" class="btn btn-primary">Submit Admission</button></div>
        </form>
      `, (body) => {
        body.querySelector('#adm-create-form').onsubmit = async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.target).entries());
          try {
            await api.post('/api/admissions', { ...d, patient_id: Number(d.patient_id), department_id: Number(d.department_id), doctor_id: Number(d.doctor_id) });
            toast('Admission Created', '', 'success');
            closeModal();
            renderAdmissionsPage(container);
          } catch (err) { toast('Error', err.message, 'danger'); }
        };
      });
    };

    container.querySelector('#cm-fup-btn').onclick = () => {
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      openModal('Schedule Follow-Up Care', `
        <form id="cm-fup-form" class="form-grid">
          <div class="field full"><label for="cf-pat">Patient</label><select id="cf-pat" name="patient_id">${patRes.patients.map((p) => `<option value="${p.id}">${esc(p.full_name)} (${esc(p.patient_code)})</option>`).join('')}</select></div>
          <div class="field"><label for="cf-doc">Follow-Up Doctor</label><select id="cf-doc" name="doctor_id">${docRes.doctors.map((d) => `<option value="${d.id}">${esc(d.full_name)}</option>`).join('')}</select></div>
          <div class="field"><label for="cf-dt">Date</label><input id="cf-dt" name="follow_up_date" type="date" value="${nextWeek}" required /></div>
          <div class="field full"><label for="cf-nt">Coordination Notes</label><input id="cf-nt" name="notes" required placeholder="Check labs & medication tolerance" /></div>
          <div class="field full"><button type="submit" class="btn btn-primary">Schedule Follow-Up</button></div>
        </form>
      `, (body) => {
        body.querySelector('#cm-fup-form').onsubmit = async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.target).entries());
          try {
            await api.post('/api/clinical/follow-ups', { ...d, patient_id: Number(d.patient_id), doctor_id: Number(d.doctor_id) });
            toast('Follow-Up Scheduled', '', 'success');
            closeModal();
            renderAdmissionsPage(container);
          } catch (err) { toast('Error', err.message, 'danger'); }
        };
      });
    };

    container.querySelectorAll('.fup-done-btn').forEach((b) => {
      b.onclick = async () => {
        await api.patch(`/api/clinical/follow-ups/${b.dataset.id}`, { status: 'Completed' });
        toast('Follow-Up Completed', '', 'success');
        renderAdmissionsPage(container);
      };
    });
    container.querySelectorAll('.adm-st-btn').forEach((b) => {
      b.onclick = async () => {
        try {
          await api.patch(`/api/admissions/${b.dataset.id}/status`, { status: b.dataset.st });
          toast('Admission Updated', `Status: ${b.dataset.st}`, 'success');
          renderAdmissionsPage(container);
        } catch (err) { toast('Error', err.message, 'danger'); }
      };
    });
    container.querySelectorAll('.alloc-bed-btn').forEach((b) => {
      b.onclick = () => {
        openModal('Allocate Available Bed', `
          <form id="alloc-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="al-bed">Select Available Bed</label><select id="al-bed" name="bed_id" required>${availBeds.map((bd) => `<option value="${bd.id}">${esc(bd.bed_code)} · ${esc(bd.ward_name)} (Room ${esc(bd.room_number)})</option>`).join('')}</select></div>
            <button type="submit" class="btn btn-primary">Confirm Bed Allocation</button>
          </form>
        `, (body) => {
          body.querySelector('#alloc-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.post(`/api/admissions/${b.dataset.id}/allocate-bed`, { bed_id: Number(body.querySelector('#al-bed').value) });
              toast('Bed Allocated', 'Admission active.', 'success');
              closeModal();
              renderAdmissionsPage(container);
            } catch (err) { toast('Allocation Error', err.message, 'danger'); }
          };
        });
      };
    });
    container.querySelectorAll('.disch-btn').forEach((b) => {
      b.onclick = () => {
        openModal('Discharge Patient & Schedule Housekeeping', `
          <form id="disch-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="ds-sum">Discharge Summary</label><textarea id="ds-sum" name="summary" required placeholder="Clinical course and condition at discharge..."></textarea></div>
            <div class="field"><label for="ds-fup">Follow-Up Instructions</label><input id="ds-fup" name="follow_up_instructions" placeholder="OPD review in 7 days" /></div>
            <button type="submit" class="btn btn-danger">Complete Discharge & Queue Bed Cleaning</button>
          </form>
        `, (body) => {
          body.querySelector('#disch-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.post(`/api/admissions/${b.dataset.id}/discharge`, Object.fromEntries(new FormData(e.target).entries()));
              toast('Patient Discharged', 'Housekeeping cleaning task created.', 'success');
              closeModal();
              renderAdmissionsPage(container);
            } catch (err) { toast('Error', err.message, 'danger'); }
          };
        });
      };
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

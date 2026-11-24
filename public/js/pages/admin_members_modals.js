import { api } from '../api.js';
import { closeModal, esc, fmtDate, openModal, statusBadge, toast } from '../ui.js';

export async function openMemberProfileModal(memberId) {
  openModal('Member Profile, Activity & Work', '<div class="skeleton"></div>');
  try {
    const res = await api.get(`/api/admin/members/${memberId}`);
    const m = res.member;
    const body = document.getElementById('modal-body');
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding-bottom:12px;border-bottom:1px solid var(--border-subtle)">
        <div>
          <div class="meta-line"><span class="mono">${esc(m.user_code)}</span><span>·</span><strong>${esc(m.role_name)}</strong>${m.department_name ? `<span>·</span><span>${esc(m.department_name)}</span>` : ''}</div>
          <h3 style="margin-top:4px">${esc(m.full_name)}</h3>
          <div class="text-xs muted">${esc(m.email)} · ${esc(m.phone || 'No phone')}</div>
        </div>
        ${statusBadge(m.account_status || (m.is_active ? 'Active' : 'Suspended'))}
      </div>

      <div class="grid-2" style="margin-top:12px">
        <div class="text-sm">
          <div><strong>Registered:</strong> <span class="tabular">${fmtDate(m.created_at)}</span></div>
          <div><strong>Last Login:</strong> <span class="tabular">${fmtDate(m.last_login_at)}</span></div>
          ${m.patient_code ? `<div><strong>MRN:</strong> <span class="mono">${esc(m.patient_code)}</span> · DOB ${esc(m.dob)} (${esc(m.gender)})</div>` : ''}
          ${m.employee_code ? `<div><strong>Employee ID:</strong> <span class="mono">${esc(m.employee_code)}</span> · ${esc(m.designation)}</div>` : ''}
          ${m.specialty_name ? `<div><strong>Specialization:</strong> ${esc(m.specialty_name)} (${esc(m.doc_qualification || '')}, ${m.experience_years} yrs)</div>` : ''}
        </div>
        <div class="text-sm">
          <div><strong>Branch:</strong> ${esc(m.branch_name || 'Main')}</div>
          ${m.shift ? `<div><strong>Shift:</strong> ${esc(m.shift)}</div>` : ''}
          ${m.emergency_contact_name ? `<div><strong>Emergency Contact:</strong> ${esc(m.emergency_contact_name)} (${esc(m.emergency_contact_phone || '')})</div>` : ''}
          <div class="text-xs muted" style="margin-top:6px">Security policy: passwords are hashed and never displayed. Use Reset Password if needed.</div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:14px">
        <div>
          <h4 style="margin-bottom:6px">Assigned Work / Records</h4>
          ${res.assignments.length ? res.assignments.map((a) => `
            <div class="list-row"><span class="text-xs"><strong>${esc(a.ref)}</strong> · ${esc(a.kind)}<div class="muted tabular">${fmtDate(a.when_at)}</div></span>${statusBadge(a.status)}</div>
          `).join('') : '<p class="text-xs muted">No work records or visits logged yet.</p>'}
        </div>
        <div>
          <h4 style="margin-bottom:6px">Recent Login & Activity Log</h4>
          ${res.activity.length ? res.activity.slice(0, 8).map((l) => `
            <div class="list-row"><span class="text-xs mono">${esc(l.action)}<div class="muted">${fmtDate(l.created_at)}</div></span><span class="text-xs muted">${esc(l.entity_type || '')}</span></div>
          `).join('') : '<p class="text-xs muted">No audit activity yet.</p>'}
        </div>
      </div>
    `;
  } catch (err) {
    toast('Error', err.message, 'danger');
  }
}

export function openEditMemberModal(m, overview, onDone) {
  openModal(`Edit Member — ${m.full_name}`, `
    <form id="ed-mem-form" class="form-grid">
      <div class="field full"><label for="em-nm">Full Name</label><input id="em-nm" name="full_name" required value="${esc(m.full_name)}" /></div>
      <div class="field"><label for="em-ph">Mobile Number</label><input id="em-ph" name="phone" value="${esc(m.phone || '')}" /></div>
      <div class="field"><label for="em-rl">Assigned Role</label>
        <select id="em-rl" name="role_id">${overview.roles.map((r) => `<option value="${r.id}" ${r.id === m.role_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="em-dp">Department</label>
        <select id="em-dp" name="department_id"><option value="">None</option>${overview.departments.map((d) => `<option value="${d.id}" ${d.id === m.department_id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      </div>
      ${m.is_staff ? `<div class="field"><label for="em-dg">Designation</label><input id="em-dg" name="designation" value="${esc(m.designation || '')}" /></div>` : ''}
      ${m.role === 'doctor' ? `
        <div class="field"><label for="em-sp">Specialization</label>
          <select id="em-sp" name="specialty_id">${(overview.specialties || []).map((s) => `<option value="${s.id}" ${s.id === m.specialty_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label for="em-fe">Consultation Fee ($)</label><input id="em-fe" name="consultation_fee" type="number" min="10" value="${Number(m.consultation_fee || 100)}" /></div>
      ` : ''}
      <div class="field full"><button type="submit" class="btn btn-primary">Save Member Changes</button></div>
    </form>
  `, (body) => {
    body.querySelector('#ed-mem-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.patch(`/api/admin/members/${m.id}`, Object.fromEntries(new FormData(e.target).entries()));
        toast('Member Updated', `${m.full_name} saved.`, 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Update Failed', err.message, 'danger'); }
    };
  });
}

export function openResetPasswordModal(m, onDone) {
  openModal(`Secure Password Reset — ${m.full_name}`, `
    <p class="text-sm muted" style="margin-bottom:12px">Existing passwords are never exposed. Issue a reset code or assign a new temporary password for <span class="mono">${esc(m.email)}</span>.</p>
    <div id="rst-token-box" class="alert-banner success" style="display:none;margin-bottom:12px"></div>
    <button type="button" class="btn btn-sm" id="rst-gen-code-btn" style="margin-bottom:14px">Generate 24h One-Time Reset Code</button>
    <form id="rst-pwd-form" style="display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--border-subtle);padding-top:12px">
      <div class="field"><label for="rp-new">Or Set New Temporary Password (8+ chars, 1 number)</label><input id="rp-new" name="reset_password" type="password" required minlength="8" /></div>
      <button type="submit" class="btn btn-primary btn-sm">Update Password Directly</button>
    </form>
  `, (body) => {
    body.querySelector('#rst-gen-code-btn').onclick = async () => {
      const res = await api.post(`/api/admin/members/${m.id}/reset-token`, {});
      const box = body.querySelector('#rst-token-box');
      box.textContent = `One-Time Reset Code for ${res.email}: ${res.resetCode} (Member uses this in Forgot Password)`;
      box.style.display = 'block';
    };
    body.querySelector('#rst-pwd-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.patch(`/api/admin/members/${m.id}/status`, { reset_password: body.querySelector('#rp-new').value });
        toast('Password Reset', 'Temporary password set securely.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Error', err.message, 'danger'); }
    };
  });
}

export function openAdminRegisterMemberModal(overview, onDone) {
  const docRole = overview.roles.find((r) => r.code === 'doctor');
  openModal('Register Hospital Member (Active)', `
    <form id="adm-reg-form" class="form-grid">
      <div class="field full"><label for="ar-nm">Full Name</label><input id="ar-nm" name="full_name" required /></div>
      <div class="field"><label for="ar-em">Email</label><input id="ar-em" name="email" type="email" required /></div>
      <div class="field"><label for="ar-ph">Mobile Number</label><input id="ar-ph" name="phone" required placeholder="+1-555-0188" /></div>
      <div class="field"><label for="ar-rl">Role</label><select id="ar-rl" name="role_id">${overview.roles.filter((r) => r.code !== 'candidate').map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ar-dp">Department</label><select id="ar-dp" name="department_id">${overview.departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ar-pw">Password (8+ chars, 1 number)</label><input id="ar-pw" name="password" type="password" required /></div>
      <div id="ar-doc-fields" class="field full form-grid" style="display:none;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
        <div class="field"><label for="ar-sp">Doctor Specialization</label><select id="ar-sp" name="specialty_id">${(overview.specialties || []).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="ar-ql">Qualification</label><input id="ar-ql" name="qualification" value="MD" /></div>
        <div class="field"><label for="ar-ex">Experience (Years)</label><input id="ar-ex" name="experience_years" type="number" min="0" value="5" /></div>
        <div class="field"><label for="ar-fe">Consultation Fee ($)</label><input id="ar-fe" name="consultation_fee" type="number" min="10" value="110" /></div>
      </div>
      <div class="field full"><button type="submit" class="btn btn-primary">Register Member</button></div>
    </form>
  `, (body) => {
    const rSel = body.querySelector('#ar-rl');
    const docBox = body.querySelector('#ar-doc-fields');
    const toggle = () => { docBox.style.display = docRole && Number(rSel.value) === docRole.id ? 'grid' : 'none'; };
    rSel.onchange = toggle;
    toggle();
    body.querySelector('#adm-reg-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/admin/users', Object.fromEntries(new FormData(e.target).entries()));
        toast('Member Registered', 'Account activated immediately.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Registration Failed', err.message, 'danger'); }
    };
  });
}

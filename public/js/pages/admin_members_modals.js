import { api } from '../api.js';
import { getAccessToken } from '../session.js';
import { closeModal, esc, fmtDate, openModal, statusBadge, toast } from '../ui.js';

export async function openAttachmentPreviewModal(attachmentId, title = 'Credential Document') {
  openModal(title, '<div class="skeleton"></div>');
  try {
    const token = getAccessToken();
    const res = await fetch(`/api/admin/attachments/${attachmentId}`, {
      credentials: 'include',
      headers: {
        'X-Requested-With': 'MediCore-HMS',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) throw new Error(`Unable to load attachment (${res.status})`);
    const mime = res.headers.get('content-type') || '';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const body = document.getElementById('modal-body');
    if (mime.startsWith('image/')) {
      body.innerHTML = `
        <div style="text-align:center">
          <img src="${url}" alt="${esc(title)}" style="max-width:100%;max-height:70vh;border-radius:8px;border:1px solid var(--border)" />
          <div style="margin-top:10px"><a class="btn btn-sm" href="${url}" download="credential_${attachmentId}">Download File</a></div>
        </div>
      `;
    } else if (mime.includes('pdf')) {
      body.innerHTML = `
        <div>
          <iframe src="${url}" title="${esc(title)}" style="width:100%;height:65vh;border:1px solid var(--border);border-radius:8px"></iframe>
          <div style="margin-top:10px"><a class="btn btn-sm" href="${url}" download="credential_${attachmentId}.pdf">Download PDF</a></div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div style="padding:12px">
          <p class="text-sm muted">Preview not directly supported for ${esc(mime || 'this file type')}.</p>
          <a class="btn btn-primary btn-sm" href="${url}" download="credential_${attachmentId}">Download Attachment</a>
        </div>
      `;
    }
  } catch (err) {
    const body = document.getElementById('modal-body');
    if (body) body.innerHTML = `<div class="alert-banner error">${esc(err.message)}</div>`;
  }
}

export function openApproveSignupModal(reqItem, overview, onDone) {
  const roles = (overview.roles || []).filter((r) => r.code !== 'pending_staff' && r.code !== 'patient' && r.code !== 'candidate');
  const branches = overview.branches || [];
  const depts = overview.departments || [];
  const specs = overview.specialties || [];
  const isDoctor = reqItem.requested_role === 'doctor';

  openModal(`${isDoctor ? 'Verify & Approve Doctor' : 'Approve Staff Registration'} — ${reqItem.full_name}`, `
    <form id="app-signup-form" class="form-grid">
      <div class="field full">
        <div class="text-xs muted">Applicant: <strong>${esc(reqItem.full_name)}</strong> (${esc(reqItem.email)}) · Requested Role: <strong>${esc(reqItem.requested_role_label || reqItem.requested_role)}</strong></div>
      </div>
      <div class="field"><label for="as-role">Assign Role</label>
        <select id="as-role" name="role">
          ${roles.map((r) => `<option value="${esc(r.code)}" ${r.code === reqItem.requested_role ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label for="as-branch">Branch</label>
        <select id="as-branch" name="branch_id">
          ${branches.map((b) => `<option value="${b.id}" ${Number(b.id) === Number(reqItem.branch_id) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label for="as-dept">Department</label>
        <select id="as-dept" name="department_id">
          <option value="">— Select —</option>
          ${depts.map((d) => `<option value="${d.id}" ${Number(d.id) === Number(reqItem.department_id) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field" id="as-spec-wrap" style="display:${isDoctor ? 'flex' : 'none'}"><label for="as-spec">Specialty</label>
        <select id="as-spec" name="specialty_id">
          <option value="">— Default —</option>
          ${specs.map((s) => `<option value="${s.id}" ${Number(s.id) === Number(reqItem.specialty_id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field full"><label for="as-notes">Verification / Approval Notes</label><textarea id="as-notes" name="admin_notes" placeholder="Optional notes recorded in audit log..."></textarea></div>
      <div class="field full"><button type="submit" class="btn btn-primary">${isDoctor ? 'Verify Licence & Activate Doctor' : 'Approve & Activate Account'}</button></div>
    </form>
  `, (body) => {
    const rSel = body.querySelector('#as-role');
    const spWrap = body.querySelector('#as-spec-wrap');
    rSel.onchange = () => { spWrap.style.display = rSel.value === 'doctor' ? 'flex' : 'none'; };

    body.querySelector('#app-signup-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.post(`/api/admin/signup-requests/${reqItem.id}/approve`, {
          role: fd.get('role'),
          branch_id: fd.get('branch_id') ? Number(fd.get('branch_id')) : null,
          department_id: fd.get('department_id') ? Number(fd.get('department_id')) : null,
          specialty_id: fd.get('specialty_id') ? Number(fd.get('specialty_id')) : null,
          admin_notes: fd.get('admin_notes') || ''
        });
        toast('Account Approved', `${reqItem.full_name} is now active.`, 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Approval Failed', err.message, 'danger'); }
    };
  });
}

export function openRejectSignupModal(reqItem, onDone) {
  openModal(`Reject Registration — ${reqItem.full_name}`, `
    <form id="rej-signup-form" class="form-grid">
      <div class="field full"><label for="rj-reason">Reason for Rejection (Shown to Applicant)</label><textarea id="rj-reason" name="reason" required placeholder="e.g. Unverifiable medical licence number or invalid employee badge"></textarea></div>
      <div class="field full"><button type="submit" class="btn btn-primary" style="background:var(--danger)">Confirm Rejection</button></div>
    </form>
  `, (body) => {
    body.querySelector('#rej-signup-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.post(`/api/admin/signup-requests/${reqItem.id}/reject`, {
          reason: body.querySelector('#rj-reason').value.trim()
        });
        toast('Registration Rejected', 'Applicant notified with reason.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Reject Failed', err.message, 'danger'); }
    };
  });
}

export function openRequestInfoModal(reqItem, onDone) {
  openModal(`Request More Information — ${reqItem.full_name}`, `
    <form id="info-signup-form" class="form-grid">
      <div class="field full"><label for="ri-notes">Information Needed</label><textarea id="ri-notes" name="notes" required placeholder="Specify missing certificate, medical council details, or clear ID scan..."></textarea></div>
      <div class="field full"><button type="submit" class="btn btn-primary">Send Information Request</button></div>
    </form>
  `, (body) => {
    body.querySelector('#info-signup-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.post(`/api/admin/signup-requests/${reqItem.id}/request-info`, {
          notes: body.querySelector('#ri-notes').value.trim()
        });
        toast('Request Sent', 'Status marked as Info Requested.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Failed', err.message, 'danger'); }
    };
  });
}

export function openCsvImportModal(onDone) {
  openModal('Bulk CSV Member Import', `
    <div style="display:flex;flex-direction:column;gap:12px">
      <p class="text-xs muted">Columns: <code class="mono">full_name,email,mobile,role,password,department,branch,employee_id,medical_registration_number,medical_council,specialty</code></p>
      <form id="csv-import-form" style="display:flex;flex-direction:column;gap:10px">
        <div class="field"><label for="csv-file">Upload CSV File (Optional)</label><input id="csv-file" type="file" accept=".csv,text/csv" /></div>
        <div class="field"><label for="csv-text">Or Paste CSV Rows</label><textarea id="csv-text" rows="6" placeholder="full_name,email,mobile,role,password,department,branch&#10;Jane Doe,jane.d@hospital.org,+1-555-7701,nurse,Pass1234,Cardiology,Main"></textarea></div>
        <button type="submit" class="btn btn-primary btn-sm" id="csv-submit-btn">Validate & Import Members</button>
      </form>
      <div id="csv-report-box" style="display:none"></div>
    </div>
  `, (body) => {
    body.querySelector('#csv-import-form').onsubmit = async (e) => {
      e.preventDefault();
      const fileInput = body.querySelector('#csv-file');
      const textArea = body.querySelector('#csv-text');
      const btn = body.querySelector('#csv-submit-btn');
      const reportBox = body.querySelector('#csv-report-box');
      btn.disabled = true;
      try {
        let res;
        if (fileInput.files && fileInput.files[0]) {
          const fd = new FormData();
          fd.append('file', fileInput.files[0]);
          res = await api.post('/api/admin/members/import-csv', fd);
        } else {
          res = await api.post('/api/admin/members/import-csv', { csv_text: textArea.value });
        }
        reportBox.style.display = 'block';
        reportBox.innerHTML = `
          <div class="alert-banner ${res.errors.length ? 'warning' : 'success'}" style="margin-bottom:8px">
            Imported <strong>${res.createdCount}</strong> member(s), skipped <strong>${res.skippedCount}</strong> row(s).
          </div>
          ${res.errors.length ? `
            <div class="table-wrap" style="max-height:180px;overflow:auto"><table>
              <thead><tr><th>Row</th><th>Email</th><th>Validation Error</th></tr></thead>
              <tbody>${res.errors.map((er) => `<tr><td class="mono">${er.row}</td><td class="text-xs">${esc(er.email || '—')}</td><td class="text-xs" style="color:var(--danger)">${esc(er.message)}</td></tr>`).join('')}</tbody>
            </table></div>
          ` : ''}
        `;
        if (res.createdCount > 0) onDone();
      } catch (err) {
        toast('CSV Import Failed', err.message, 'danger');
      } finally {
        btn.disabled = false;
      }
    };
  });
}

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
          ${m.patient_code ? `<div><strong>Patient ID:</strong> <span class="mono">${esc(m.patient_code)}</span> · DOB ${esc(m.dob)} (${esc(m.gender)})</div>` : ''}
          ${m.employee_code ? `<div><strong>Employee ID:</strong> <span class="mono">${esc(m.employee_code)}</span> · ${esc(m.designation)}</div>` : ''}
          ${m.specialty_name ? `<div><strong>Specialization:</strong> ${esc(m.specialty_name)} (${esc(m.doc_qualification || '')}, ${m.experience_years} yrs)</div>` : ''}
          ${m.registration_number ? `<div><strong>Medical Reg:</strong> <span class="mono">${esc(m.registration_number)}</span> ${m.medical_council ? `(${esc(m.medical_council)})` : ''}</div>` : ''}
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
        <select id="em-rl" name="role_id">${overview.roles.filter((r) => r.code !== 'pending_staff').map((r) => `<option value="${r.id}" ${r.id === m.role_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="em-br">Branch</label>
        <select id="em-br" name="branch_id">${(overview.branches || []).map((b) => `<option value="${b.id}" ${b.id === m.branch_id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
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
  openModal('Provision Hospital User (Active)', `
    <form id="adm-reg-form" class="form-grid">
      <div class="field full"><label for="ar-nm">Full Name</label><input id="ar-nm" name="full_name" required /></div>
      <div class="field"><label for="ar-em">Email</label><input id="ar-em" name="email" type="email" required /></div>
      <div class="field"><label for="ar-ph">Mobile Number</label><input id="ar-ph" name="phone" required placeholder="+1-555-0188" /></div>
      <div class="field"><label for="ar-rl">Role</label><select id="ar-rl" name="role_id">${overview.roles.filter((r) => r.code !== 'candidate' && r.code !== 'pending_staff').map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ar-br">Branch</label><select id="ar-br" name="branch_id">${(overview.branches || []).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ar-dp">Department</label><select id="ar-dp" name="department_id">${overview.departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ar-emp">Employee ID (Optional)</label><input id="ar-emp" name="employee_id" placeholder="e.g. EMP-2045" /></div>
      <div class="field full"><label for="ar-pw">Password (8+ chars, 1 number)</label><input id="ar-pw" name="password" type="password" required /></div>
      <div id="ar-doc-fields" class="field full form-grid" style="display:none;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
        <div class="field"><label for="ar-reg">Medical Reg No.</label><input id="ar-reg" name="registration_number" placeholder="MED-REG-1002" /></div>
        <div class="field"><label for="ar-mc">Medical Council</label><input id="ar-mc" name="medical_council" placeholder="State Medical Council" /></div>
        <div class="field"><label for="ar-sp">Doctor Specialization</label><select id="ar-sp" name="specialty_id">${(overview.specialties || []).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="ar-ql">Qualification</label><input id="ar-ql" name="qualification" value="MD" /></div>
        <div class="field"><label for="ar-ex">Experience (Years)</label><input id="ar-ex" name="experience_years" type="number" min="0" value="5" /></div>
        <div class="field"><label for="ar-fe">Consultation Fee ($)</label><input id="ar-fe" name="consultation_fee" type="number" min="10" value="110" /></div>
      </div>
      <div class="field full"><button type="submit" class="btn btn-primary">Create Active User</button></div>
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
        toast('User Provisioned', 'Account activated immediately.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast('Registration Failed', err.message, 'danger'); }
    };
  });
}

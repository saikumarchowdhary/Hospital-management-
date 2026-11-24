import { api } from '../api.js';
import { emptyState, errorState, esc, fmtDate, skeletonBlock, statusBadge, toast } from '../ui.js';
import {
  openAdminRegisterMemberModal,
  openApproveSignupModal,
  openAttachmentPreviewModal,
  openCsvImportModal,
  openEditMemberModal,
  openMemberProfileModal,
  openRejectSignupModal,
  openRequestInfoModal,
  openResetPasswordModal
} from './admin_members_modals.js';

const ROLE_FILTERS = [
  ['all', 'All Users'],
  ['admin', 'Admins'],
  ['doctor', 'Doctors'],
  ['patient', 'Patients'],
  ['candidate', 'Candidates'],
  ['nurse', 'Nurses'],
  ['receptionist', 'Receptionists'],
  ['lab_staff', 'Lab Techs'],
  ['pharmacist', 'Pharmacists'],
  ['radiologist', 'Radiologists'],
  ['accountant', 'Accountants'],
  ['hr', 'HR'],
  ['publisher', 'Publishers'],
  ['approver', 'Approvers'],
  ['case_manager', 'Case Managers'],
  ['housekeeping', 'Housekeeping'],
  ['housekeeping_supervisor', 'Housekeeping Sup.'],
  ['bloodbank_staff', 'Blood Bank']
];

export async function renderAdminMembersPage(container) {
  container.innerHTML = skeletonBlock(5);
  try {
    const [memRes, ovRes, reqRes] = await Promise.all([
      api.get('/api/admin/members'),
      api.get('/api/admin/overview'),
      api.get('/api/admin/signup-requests')
    ]);
    const allMembers = memRes.members || [];
    const requests = reqRes.requests || [];
    const doctorRequests = requests.filter((r) => r.requested_role === 'doctor');
    const staffRequests = requests.filter((r) => r.requested_role !== 'doctor');

    let sectionTab = (reqRes.pendingDoctorsCount > 0) ? 'doc_queue' : (reqRes.pendingStaffCount > 0 ? 'staff_queue' : 'users');
    let roleFilter = 'all';
    let statusFilter = 'all';
    let branchFilter = 'all';
    let deptFilter = 'all';
    let queryText = '';

    function getFilteredUsers() {
      return allMembers.filter((m) => {
        if (roleFilter !== 'all' && m.role !== roleFilter) return false;
        const st = m.account_status || (m.is_active ? 'Active' : 'Suspended');
        if (statusFilter !== 'all' && st !== statusFilter) return false;
        if (branchFilter !== 'all' && Number(m.branch_id) !== Number(branchFilter)) return false;
        if (deptFilter !== 'all' && Number(m.department_id) !== Number(deptFilter)) return false;
        if (queryText) {
          const hay = `${m.user_code} ${m.full_name} ${m.email} ${m.phone || ''} ${m.department_name || ''} ${m.branch_name || ''} ${m.role_name} ${m.employee_code || ''} ${m.patient_code || ''}`.toLowerCase();
          if (!hay.includes(queryText.toLowerCase())) return false;
        }
        return true;
      });
    }

    function renderQueueTable(items, isDoctorQueue) {
      if (!items.length) {
        return emptyState(
          isDoctorQueue ? 'No Doctor Verification Requests' : 'No Staff Approval Requests',
          'Self-registered applications awaiting review will appear here.'
        );
      }
      return `
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Applicant</th>
            <th>${isDoctorQueue ? 'Licence & Council' : 'Requested Role & Employee ID'}</th>
            <th>Branch / Dept</th>
            <th>Documents</th>
            <th>Status</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${items.map((r) => `
              <tr>
                <td>
                  <strong>${esc(r.full_name)}</strong>
                  <div class="text-xs muted">${esc(r.email)} · ${esc(r.mobile || '—')}</div>
                  <div class="text-xs muted tabular">Submitted ${fmtDate(r.created_at)}</div>
                </td>
                <td class="text-xs">
                  ${isDoctorQueue ? `
                    <div><strong>Reg:</strong> <span class="mono">${esc(r.medical_registration_number || '—')}</span></div>
                    <div class="muted">${esc(r.medical_council || '—')} · ${esc(r.specialty_name || '—')}</div>
                    <div class="muted">${esc(r.qualification || '')} · ${r.experience_years || 0} yrs · $${r.consultation_fee || 100}</div>
                  ` : `
                    <div><strong>${esc(r.requested_role_label || r.requested_role)}</strong></div>
                    <div class="muted mono">${r.employee_id ? `ID: ${esc(r.employee_id)}` : 'Auto-assign ID'}</div>
                    <div class="muted">${esc(r.qualification || '')}</div>
                  `}
                </td>
                <td class="text-xs">
                  <div>${esc(r.branch_name || 'Main')}</div>
                  <div class="muted">${esc(r.department_name || '—')}</div>
                </td>
                <td class="text-xs">
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    ${r.licence_attachment_id ? `<button class="btn btn-sm mm-preview-att" data-att="${r.licence_attachment_id}" data-title="Licence — ${esc(r.full_name)}">View Licence</button>` : ''}
                    ${r.photo_attachment_id ? `<button class="btn btn-sm mm-preview-att" data-att="${r.photo_attachment_id}" data-title="Photo — ${esc(r.full_name)}">Photo</button>` : ''}
                    ${r.document_attachment_id ? `<button class="btn btn-sm mm-preview-att" data-att="${r.document_attachment_id}" data-title="Credential — ${esc(r.full_name)}">View ID/Doc</button>` : ''}
                    ${!r.licence_attachment_id && !r.photo_attachment_id && !r.document_attachment_id ? '<span class="muted">None uploaded</span>' : ''}
                  </div>
                </td>
                <td>
                  ${statusBadge(r.status)}
                  ${r.rejection_reason ? `<div class="text-xs muted" style="margin-top:3px">${esc(r.rejection_reason)}</div>` : ''}
                  ${r.admin_notes ? `<div class="text-xs muted" style="margin-top:3px">${esc(r.admin_notes)}</div>` : ''}
                </td>
                <td>
                  <div style="display:flex;gap:5px;flex-wrap:wrap">
                    ${['Pending', 'Info Requested'].includes(r.status) ? `
                      <button class="btn btn-primary btn-sm sq-approve" data-id="${r.id}">${isDoctorQueue ? 'Verify & Approve' : 'Approve'}</button>
                      <button class="btn btn-sm sq-info" data-id="${r.id}">Request Info</button>
                      <button class="btn btn-sm sq-reject" data-id="${r.id}" style="color:var(--danger)">Reject</button>
                    ` : `<span class="text-xs muted">Reviewed by ${esc(r.reviewer_name || 'Admin')}</span>`}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      `;
    }

    function draw() {
      const pendingCount = allMembers.filter((m) => ['Pending Approval', 'Pending Verification'].includes(m.account_status)).length;
      const activeCount = allMembers.filter((m) => (m.account_status || (m.is_active ? 'Active' : 'Suspended')) === 'Active').length;
      const suspendedCount = allMembers.filter((m) => m.account_status === 'Suspended' || !m.is_active).length;
      const list = getFilteredUsers();

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <h1>Users, Verification & Approval Queues</h1>
              <p class="text-sm muted">Review pending doctor licences and staff requests, provision active accounts, bulk import via CSV, or manage existing users.</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm" id="mm-csv-btn">Bulk CSV Import</button>
              <button class="btn btn-primary btn-sm" id="mm-add-btn">+ Provision User</button>
            </div>
          </div>

          <div class="kpi-grid" style="margin-bottom:14px">
            <div class="kpi-card"><span class="kpi-label">Total Accounts</span><span class="kpi-value tabular">${allMembers.length}</span></div>
            <div class="kpi-card"><span class="kpi-label">Active Users</span><span class="kpi-value tabular" style="color:var(--success)">${activeCount}</span></div>
            <div class="kpi-card"><span class="kpi-label">Pending Verification / Approval</span><span class="kpi-value tabular" style="color:var(--warning)">${reqRes.pendingCount || pendingCount}</span></div>
            <div class="kpi-card"><span class="kpi-label">Inactive / Suspended</span><span class="kpi-value tabular">${suspendedCount}</span></div>
          </div>

          <div class="tabs" style="margin-bottom:14px">
            <button class="tab-btn ${sectionTab === 'doc_queue' ? 'active' : ''}" data-st="doc_queue">
              Doctor Verification (${reqRes.pendingDoctorsCount || 0} pending)
            </button>
            <button class="tab-btn ${sectionTab === 'staff_queue' ? 'active' : ''}" data-st="staff_queue">
              Staff Approvals (${reqRes.pendingStaffCount || 0} pending)
            </button>
            <button class="tab-btn ${sectionTab === 'users' ? 'active' : ''}" data-st="users">
              Users Directory (${allMembers.length})
            </button>
          </div>

          ${sectionTab === 'doc_queue' ? renderQueueTable(doctorRequests, true) : ''}
          ${sectionTab === 'staff_queue' ? renderQueueTable(staffRequests, false) : ''}

          ${sectionTab === 'users' ? `
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
              <input id="mm-search" value="${esc(queryText)}" placeholder="Search by ID, name, email, phone, employee ID..." style="flex:1;min-width:220px;padding:8px 12px;border:1px solid var(--border);border-radius:8px" />
              <select id="mm-branch" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px">
                <option value="all">All Branches</option>
                ${(ovRes.branches || []).map((b) => `<option value="${b.id}" ${String(branchFilter) === String(b.id) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
              </select>
              <select id="mm-dept" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px">
                <option value="all">All Departments</option>
                ${(ovRes.departments || []).map((d) => `<option value="${d.id}" ${String(deptFilter) === String(d.id) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
              </select>
              <select id="mm-status" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px">
                <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
                <option value="Pending Verification" ${statusFilter === 'Pending Verification' ? 'selected' : ''}>Pending Verification</option>
                <option value="Pending Approval" ${statusFilter === 'Pending Approval' ? 'selected' : ''}>Pending Approval</option>
                <option value="Active" ${statusFilter === 'Active' ? 'selected' : ''}>Active</option>
                <option value="Suspended" ${statusFilter === 'Suspended' ? 'selected' : ''}>Suspended</option>
                <option value="Rejected" ${statusFilter === 'Rejected' ? 'selected' : ''}>Rejected</option>
              </select>
            </div>

            <div class="tabs" style="flex-wrap:wrap;margin-bottom:14px">
              ${ROLE_FILTERS.map(([code, label]) => `
                <button class="tab-btn ${roleFilter === code ? 'active' : ''}" data-rf="${code}">
                  ${esc(label)} (${code === 'all' ? allMembers.length : allMembers.filter((x) => x.role === code).length})
                </button>
              `).join('')}
            </div>

            <div class="table-wrap"><table>
              <thead><tr><th>User / Patient ID</th><th>Full Name</th><th>Email & Mobile</th><th>Role, Dept & Branch</th><th>Registered</th><th>Last Login</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${list.map((m) => {
                  const st = m.account_status || (m.is_active ? 'Active' : 'Suspended');
                  return `
                    <tr>
                      <td class="mono"><strong>${esc(m.user_code)}</strong>${m.patient_code ? `<div class="text-xs muted">${esc(m.patient_code)}</div>` : m.employee_code ? `<div class="text-xs muted">${esc(m.employee_code)}</div>` : ''}</td>
                      <td><strong>${esc(m.full_name)}</strong>${m.specialty_name ? `<div class="text-xs muted">${esc(m.specialty_name)}</div>` : ''}</td>
                      <td class="text-xs"><div>${esc(m.email)}</div><div class="muted">${esc(m.phone || '—')}</div></td>
                      <td class="text-xs"><strong>${esc(m.role_name)}</strong><div class="muted">${esc(m.department_name || '—')} · ${esc(m.branch_name || 'Main')}</div></td>
                      <td class="tabular text-xs">${fmtDate(m.created_at)}</td>
                      <td class="tabular text-xs">${fmtDate(m.last_login_at)}</td>
                      <td>${statusBadge(st)}</td>
                      <td><div style="display:flex;gap:5px;flex-wrap:wrap">
                        <button class="btn btn-sm mm-view" data-id="${m.id}">Profile</button>
                        <button class="btn btn-sm mm-edit" data-id="${m.id}">Edit</button>
                        <button class="btn btn-sm mm-tog" data-id="${m.id}" data-st="${st === 'Active' ? 'Suspended' : 'Active'}">${st === 'Active' ? 'Deactivate' : 'Reactivate'}</button>
                        <button class="btn btn-sm mm-rst" data-id="${m.id}">Reset PW</button>
                      </div></td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="8" class="muted">No users match your current filters.</td></tr>'}
              </tbody>
            </table></div>
          ` : ''}
        </div>
      `;

      container.querySelector('#mm-add-btn').onclick = () => openAdminRegisterMemberModal(ovRes, () => renderAdminMembersPage(container));
      container.querySelector('#mm-csv-btn').onclick = () => openCsvImportModal(() => renderAdminMembersPage(container));
      container.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { sectionTab = b.dataset.st; draw(); }; });

      container.querySelectorAll('.mm-preview-att').forEach((b) => {
        b.onclick = () => openAttachmentPreviewModal(Number(b.dataset.att), b.dataset.title);
      });
      container.querySelectorAll('.sq-approve').forEach((b) => {
        b.onclick = () => openApproveSignupModal(requests.find((x) => x.id === Number(b.dataset.id)), ovRes, () => renderAdminMembersPage(container));
      });
      container.querySelectorAll('.sq-reject').forEach((b) => {
        b.onclick = () => openRejectSignupModal(requests.find((x) => x.id === Number(b.dataset.id)), () => renderAdminMembersPage(container));
      });
      container.querySelectorAll('.sq-info').forEach((b) => {
        b.onclick = () => openRequestInfoModal(requests.find((x) => x.id === Number(b.dataset.id)), () => renderAdminMembersPage(container));
      });

      const searchEl = container.querySelector('#mm-search');
      if (searchEl) searchEl.oninput = (e) => { queryText = e.target.value; draw(); container.querySelector('#mm-search')?.focus(); };
      const statusEl = container.querySelector('#mm-status');
      if (statusEl) statusEl.onchange = (e) => { statusFilter = e.target.value; draw(); };
      const branchEl = container.querySelector('#mm-branch');
      if (branchEl) branchEl.onchange = (e) => { branchFilter = e.target.value; draw(); };
      const deptEl = container.querySelector('#mm-dept');
      if (deptEl) deptEl.onchange = (e) => { deptFilter = e.target.value; draw(); };

      container.querySelectorAll('[data-rf]').forEach((b) => { b.onclick = () => { roleFilter = b.dataset.rf; draw(); }; });
      container.querySelectorAll('.mm-view').forEach((b) => { b.onclick = () => openMemberProfileModal(Number(b.dataset.id)); });
      container.querySelectorAll('.mm-edit').forEach((b) => {
        b.onclick = () => openEditMemberModal(allMembers.find((x) => x.id === Number(b.dataset.id)), ovRes, () => renderAdminMembersPage(container));
      });
      container.querySelectorAll('.mm-rst').forEach((b) => {
        b.onclick = () => openResetPasswordModal(allMembers.find((x) => x.id === Number(b.dataset.id)), () => renderAdminMembersPage(container));
      });
      container.querySelectorAll('.mm-tog').forEach((b) => {
        b.onclick = async () => {
          await api.patch(`/api/admin/members/${b.dataset.id}/status`, { account_status: b.dataset.st });
          toast('Account Status Updated', `Marked ${b.dataset.st}.`, 'success');
          renderAdminMembersPage(container);
        };
      });
    }

    draw();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

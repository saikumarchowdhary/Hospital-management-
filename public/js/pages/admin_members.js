import { api } from '../api.js';
import { errorState, esc, fmtDate, skeletonBlock, statusBadge, toast } from '../ui.js';
import {
  openAdminRegisterMemberModal,
  openEditMemberModal,
  openMemberProfileModal,
  openResetPasswordModal
} from './admin_members_modals.js';

const ROLE_FILTERS = [
  ['all', 'All Members'],
  ['patient', 'Patients'],
  ['doctor', 'Doctors'],
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
  ['bloodbank_staff', 'Blood Bank']
];

export async function renderAdminMembersPage(container) {
  container.innerHTML = skeletonBlock(5);
  try {
    const [memRes, ovRes] = await Promise.all([
      api.get('/api/admin/members'),
      api.get('/api/admin/overview')
    ]);
    const allMembers = memRes.members || [];
    let roleFilter = 'all';
    let statusFilter = 'all';
    let queryText = '';

    function getFiltered() {
      return allMembers.filter((m) => {
        if (roleFilter !== 'all' && m.role !== roleFilter) return false;
        const st = m.account_status || (m.is_active ? 'Active' : 'Suspended');
        if (statusFilter !== 'all' && st !== statusFilter) return false;
        if (queryText) {
          const hay = `${m.user_code} ${m.full_name} ${m.email} ${m.phone || ''} ${m.department_name || ''} ${m.role_name}`.toLowerCase();
          if (!hay.includes(queryText.toLowerCase())) return false;
        }
        return true;
      });
    }

    function draw() {
      const pendingCount = allMembers.filter((m) => m.account_status === 'Pending Approval').length;
      const activeCount = allMembers.filter((m) => (m.account_status || (m.is_active ? 'Active' : 'Suspended')) === 'Active').length;
      const suspendedCount = allMembers.filter((m) => m.account_status === 'Suspended' || !m.is_active).length;
      const list = getFiltered();

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <h1>All Members Management</h1>
              <p class="text-sm muted">Directory of every registered hospital patient, doctor, and department staff member. Passwords are encrypted and never displayed.</p>
            </div>
            <button class="btn btn-primary btn-sm" id="mm-add-btn">+ Register Member</button>
          </div>

          <div class="kpi-grid" style="margin-bottom:14px">
            <div class="kpi-card"><span class="kpi-label">Total Members</span><span class="kpi-value tabular">${allMembers.length}</span></div>
            <div class="kpi-card"><span class="kpi-label">Active Accounts</span><span class="kpi-value tabular" style="color:var(--success)">${activeCount}</span></div>
            <div class="kpi-card"><span class="kpi-label">Pending Approvals</span><span class="kpi-value tabular" style="color:var(--warning)">${pendingCount}</span></div>
            <div class="kpi-card"><span class="kpi-label">Suspended / Inactive</span><span class="kpi-value tabular">${suspendedCount}</span></div>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
            <input id="mm-search" value="${esc(queryText)}" placeholder="Search by ID, name, email, phone, or department..." style="flex:1;min-width:240px;padding:8px 12px;border:1px solid var(--border);border-radius:8px" />
            <select id="mm-status" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px">
              <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="Pending Approval" ${statusFilter === 'Pending Approval' ? 'selected' : ''}>Pending Approval (${pendingCount})</option>
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
            <thead><tr><th>Member ID</th><th>Full Name</th><th>Email & Mobile</th><th>Role & Dept</th><th>Registered</th><th>Last Login</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${list.map((m) => {
                const st = m.account_status || (m.is_active ? 'Active' : 'Suspended');
                return `
                  <tr>
                    <td class="mono"><strong>${esc(m.user_code)}</strong>${m.patient_code ? `<div class="text-xs muted">${esc(m.patient_code)}</div>` : m.employee_code ? `<div class="text-xs muted">${esc(m.employee_code)}</div>` : ''}</td>
                    <td><strong>${esc(m.full_name)}</strong>${m.specialty_name ? `<div class="text-xs muted">${esc(m.specialty_name)}</div>` : ''}</td>
                    <td class="text-xs"><div>${esc(m.email)}</div><div class="muted">${esc(m.phone || '—')}</div></td>
                    <td class="text-xs"><strong>${esc(m.role_name)}</strong><div class="muted">${esc(m.department_name || '—')}</div></td>
                    <td class="tabular text-xs">${fmtDate(m.created_at)}</td>
                    <td class="tabular text-xs">${fmtDate(m.last_login_at)}</td>
                    <td>${statusBadge(st)}</td>
                    <td><div style="display:flex;gap:5px;flex-wrap:wrap">
                      <button class="btn btn-sm mm-view" data-id="${m.id}">Profile & Work</button>
                      ${st === 'Pending Approval' ? `
                        <button class="btn btn-primary btn-sm mm-rev" data-id="${m.id}" data-dec="Approved">Approve</button>
                        <button class="btn btn-sm mm-rev" data-id="${m.id}" data-dec="Rejected">Reject</button>
                      ` : `
                        <button class="btn btn-sm mm-edit" data-id="${m.id}">Edit</button>
                        <button class="btn btn-sm mm-tog" data-id="${m.id}" data-st="${st === 'Active' ? 'Suspended' : 'Active'}">${st === 'Active' ? 'Suspend' : 'Activate'}</button>
                      `}
                      <button class="btn btn-sm mm-rst" data-id="${m.id}">Reset PW</button>
                    </div></td>
                  </tr>
                `;
              }).join('') || '<tr><td colspan="8" class="muted">No members match your current filters.</td></tr>'}
            </tbody>
          </table></div>
        </div>
      `;

      container.querySelector('#mm-search').oninput = (e) => { queryText = e.target.value; draw(); container.querySelector('#mm-search')?.focus(); };
      container.querySelector('#mm-status').onchange = (e) => { statusFilter = e.target.value; draw(); };
      container.querySelectorAll('[data-rf]').forEach((b) => { b.onclick = () => { roleFilter = b.dataset.rf; draw(); }; });
      container.querySelector('#mm-add-btn').onclick = () => openAdminRegisterMemberModal(ovRes, () => renderAdminMembersPage(container));

      container.querySelectorAll('.mm-view').forEach((b) => { b.onclick = () => openMemberProfileModal(Number(b.dataset.id)); });
      container.querySelectorAll('.mm-edit').forEach((b) => {
        b.onclick = () => openEditMemberModal(allMembers.find((x) => x.id === Number(b.dataset.id)), ovRes, () => renderAdminMembersPage(container));
      });
      container.querySelectorAll('.mm-rst').forEach((b) => {
        b.onclick = () => openResetPasswordModal(allMembers.find((x) => x.id === Number(b.dataset.id)), () => renderAdminMembersPage(container));
      });
      container.querySelectorAll('.mm-rev').forEach((b) => {
        b.onclick = async () => {
          await api.post(`/api/admin/members/${b.dataset.id}/review`, { decision: b.dataset.dec });
          toast(`Registration ${b.dataset.dec}`, '', 'success');
          renderAdminMembersPage(container);
        };
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

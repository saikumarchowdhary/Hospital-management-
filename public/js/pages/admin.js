import { api } from '../api.js';
import { renderBarChart, renderDonutChart, renderLineChart } from '../charts.js';
import { closeModal, errorState, esc, fmtDate, fmtMoney, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderAdminDashboard(container) {
  container.innerHTML = skeletonBlock(5);
  try {
    const data = await api.get('/api/reports/dashboard');
    const k = data.kpis;
    const c = data.charts;
    const attention = data.attentionQueue || [];
    let snoozedIds = new Set();

    function drawDashboard() {
      const activeAttention = attention.filter((item) => !snoozedIds.has(item.id));
      container.innerHTML = `
        <div class="card-header">
          <div><h1>CareLine Hospital Operations Dashboard</h1><p class="text-sm muted">Live database metrics across clinical, diagnostic, bed, pharmacy, and revenue units.</p></div>
          <a href="#admin/members" class="btn btn-primary btn-sm">All Members Management</a>
        </div>

        ${activeAttention.length ? `
          <div class="card" style="background:linear-gradient(135deg, #DC2626, #EA580C);color:#fff;margin-bottom:20px;padding:20px;border-radius:14px;box-shadow:0 8px 24px rgba(220,38,38,0.25)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:28px">🔥</span>
                <div>
                  <h2 style="color:#fff;margin:0;font-size:20px;font-weight:700">Needs attention now (${activeAttention.length} item${activeAttention.length === 1 ? '' : 's'})</h2>
                  <p style="color:rgba(255,255,255,0.85);margin:2px 0 0 0;font-size:13px">Escalated external requests, unassigned dispatches & near-expiry blood alerts</p>
                </div>
              </div>
              <span class="status status-danger" style="background:rgba(255,255,255,0.2);color:#fff;font-weight:700">${activeAttention.length} Pending</span>
            </div>
            <div style="display:flex;gap:16px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory">
              ${activeAttention.map((item) => `
                <div style="min-width:300px;flex:1;background:rgba(255,255,255,0.15);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.3);border-radius:10px;padding:16px;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:space-between">
                  <div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.8);margin-bottom:6px">
                      <span class="mono">#${esc(item.ref || item.id)}</span>
                      <span style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:4px">${esc(item.age_label)}</span>
                    </div>
                    <h3 style="color:#fff;font-size:18px;font-weight:700;margin:0 0 4px 0">${esc(item.title)}</h3>
                    <div style="font-size:13px;color:rgba(255,255,255,0.9);margin-bottom:12px">Module: <strong>${esc(item.module_name)}</strong> · Owner: ${esc(item.owner_name)}</div>
                  </div>
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-sm action-resolve-btn" data-id="${item.id}" style="background:#fff;color:#DC2626;font-weight:700;border:none">Resolve / Assign</button>
                    <button class="btn btn-sm action-snooze-btn" data-id="${item.id}" style="background:rgba(0,0,0,0.25);color:#fff;border:none">Snooze</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="card" style="background:#16A34A15;border:1px solid #16A34A30;margin-bottom:20px;padding:20px;text-align:center;border-radius:12px">
            <div style="font-size:28px;margin-bottom:6px">✅</div>
            <h3 style="color:#16A34A;margin:0 0 4px 0">All clear — No urgent items requiring attention</h3>
            <p class="text-sm muted" style="margin:0">All escalated requests, dispatches, and blood inventory alerts have been handled.</p>
          </div>
        `}

        <div class="kpi-grid">
          <div class="kpi-card"><span class="kpi-label">Total Patients</span><span class="kpi-value tabular">${k.totalPatients}</span></div>
          <div class="kpi-card"><span class="kpi-label">Total Doctors</span><span class="kpi-value tabular">${k.totalDoctors}</span></div>
          <div class="kpi-card"><span class="kpi-label">Active Staff</span><span class="kpi-value tabular">${k.totalStaff}</span></div>
          <div class="kpi-card"><span class="kpi-label">Today's Appointments</span><span class="kpi-value tabular">${k.todaysAppointments}</span></div>
          <div class="kpi-card"><span class="kpi-label">Active Admissions</span><span class="kpi-value tabular">${k.activeAdmissions}</span></div>
          <div class="kpi-card"><span class="kpi-label">Available Beds</span><span class="kpi-value tabular" style="color:var(--success)">${k.availableBeds}</span></div>
          <div class="kpi-card"><span class="kpi-label">Occupied Beds</span><span class="kpi-value tabular">${k.occupiedBeds}</span></div>
          <div class="kpi-card"><span class="kpi-label">Pending Lab Tests</span><span class="kpi-value tabular">${k.pendingLabs}</span></div>
          <div class="kpi-card"><span class="kpi-label">Low Stock Medicines</span><span class="kpi-value tabular" style="color:var(--warning)">${k.lowStockMeds}</span></div>
          <div class="kpi-card"><span class="kpi-label">Outstanding Bills</span><span class="kpi-value tabular">${fmtMoney(k.outstandingPayments)}</span></div>
          <div class="kpi-card"><span class="kpi-label">Today's Revenue</span><span class="kpi-value tabular" style="color:var(--primary)">${fmtMoney(k.todaysRevenue)}</span></div>
        </div>

        <div class="grid-3">
          <div class="card">${renderBarChart(c.deptPerformance, 'Department Appointments')}</div>
          <div class="card">${renderDonutChart(c.bedStatusBreakdown, 'Bed Occupancy Breakdown')}</div>
          <div class="card">${renderDonutChart(c.appointmentsByStatus, 'Appointment Statuses')}</div>
          <div class="card">${renderLineChart(c.revenueByDay, 'Invoiced Revenue Trend')}</div>
          <div class="card">${renderLineChart(c.registrationsTrend, 'Patient Registrations')}</div>
          <div class="card">${renderBarChart(c.labTurnaround, 'Laboratory Order Pipeline')}</div>
        </div>

        <div class="card">
          <div class="card-header"><h2>Recent Hospital Activity & Audit Feed</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Timestamp</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th></tr></thead>
            <tbody>
              ${data.recentActivity.map((a) => `
                <tr>
                  <td class="tabular text-xs">${fmtDate(a.created_at)}</td>
                  <td>${esc(a.actor_name || 'System')}</td>
                  <td class="text-xs muted">${esc(a.actor_role || '—')}</td>
                  <td class="mono">${esc(a.action)}</td>
                  <td class="text-xs">${esc(a.entity_type)} #${esc(a.entity_id || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        </div>
      `;

      container.querySelectorAll('.action-snooze-btn').forEach((btn) => {
        btn.onclick = () => {
          const id = Number(btn.dataset.id);
          snoozedIds.add(id);
          toast('Snoozed', 'Item snoozed until tomorrow.', 'info');
          drawDashboard();
        };
      });

      container.querySelectorAll('.action-resolve-btn').forEach((btn) => {
        btn.onclick = () => {
          const id = Number(btn.dataset.id);
          const item = attention.find(x => x.id === id);
          openModal(`Resolve Attention Item #${item ? (item.ref || item.id) : id}`, `
            <div style="display:flex;flex-direction:column;gap:12px">
              <p>Action required for <strong>${esc(item ? item.title : 'Item')}</strong> (${esc(item ? item.module_name : '')}).</p>
              <div class="field"><label>Assigned Officer / Responder</label><input id="res-officer" value="${esc(item ? item.owner_name : 'Admin')}"/></div>
              <button class="btn btn-primary btn-sm" id="confirm-resolve-btn">Confirm Resolution & Close Item</button>
            </div>
          `, (body) => {
            body.querySelector('#confirm-resolve-btn').onclick = () => {
              snoozedIds.add(id);
              toast('Resolved', 'Item marked as handled successfully.', 'success');
              closeModal();
              drawDashboard();
            };
          });
        };
      });
    }

    drawDashboard();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

export async function renderAdminControlPage(container) {
  container.innerHTML = skeletonBlock(5);
  try {
    const ov = await api.get('/api/admin/overview');
    let tab = 'users';

    function draw() {
      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="tabs">
              <button class="tab-btn ${tab === 'users' ? 'active' : ''}" data-t="users">Staff & Users (${ov.users.length})</button>
              <button class="tab-btn ${tab === 'roles' ? 'active' : ''}" data-t="roles">Role Permissions</button>
              <button class="tab-btn ${tab === 'depts' ? 'active' : ''}" data-t="depts">Departments (${ov.departments.length})</button>
              <button class="tab-btn ${tab === 'settings' ? 'active' : ''}" data-t="settings">Settings</button>
              <button class="tab-btn ${tab === 'audit' ? 'active' : ''}" data-t="audit">Audit Logs (${ov.auditLogs.length})</button>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm" id="adm-new-dept">+ Department</button>
              <button class="btn btn-primary btn-sm" id="adm-new-user">+ Create Staff</button>
            </div>
          </div>
          <div id="adm-body"></div>
        </div>
      `;

      const body = container.querySelector('#adm-body');
      if (tab === 'users') {
        body.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Code</th><th>Name & Email</th><th>Role</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${ov.users.map((u) => `
            <tr>
              <td class="mono">${esc(u.user_code)}</td>
              <td><strong>${esc(u.full_name)}</strong><div class="text-xs muted">${esc(u.email)}</div></td>
              <td>${esc(u.role_name)}</td>
              <td>${esc(u.department_name || '—')}</td>
              <td>${statusBadge(u.is_active ? 'Active' : 'Blocked')}</td>
              <td>
                <button class="btn btn-sm adm-tog-btn" data-id="${u.id}" data-act="${u.is_active ? '0' : '1'}">${u.is_active ? 'Deactivate' : 'Activate'}</button>
              </td>
            </tr>
          `).join('')}</tbody>
        </table></div>`;
      } else if (tab === 'roles') {
        body.innerHTML = ov.roles.map((r) => {
          const assigned = new Set(ov.rolePermissions.filter((rp) => rp.role_id === r.id).map((rp) => rp.permission_id));
          return `
            <div class="list-row">
              <div><strong>${esc(r.name)}</strong> <span class="mono text-xs muted">(${esc(r.code)})</span><div class="text-xs muted">${assigned.size} permission(s) enabled</div></div>
              <button class="btn btn-sm edit-perm-btn" data-id="${r.id}" data-name="${esc(r.name)}">Configure Permissions</button>
            </div>
          `;
        }).join('');
      } else if (tab === 'depts') {
        body.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Code</th><th>Department Name</th><th>Category</th><th>Branch</th><th>Status</th></tr></thead>
          <tbody>${ov.departments.map((d) => `
            <tr><td class="mono">${esc(d.code)}</td><td><strong>${esc(d.name)}</strong></td><td>${esc(d.category)}</td><td>${esc(d.branch_name || 'Main')}</td><td>${statusBadge(d.is_active ? 'Active' : 'Inactive')}</td></tr>
          `).join('')}</tbody>
        </table></div>`;
      } else if (tab === 'settings') {
        body.innerHTML = ov.settings.map((s) => `
          <form class="list-row set-form" data-key="${esc(s.key)}">
            <div style="flex:1"><strong>${esc(s.key)}</strong><div class="text-xs muted">${esc(s.description || '')}</div></div>
            <input name="value" value="${esc(s.value)}" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;min-width:220px" />
            <button type="submit" class="btn btn-sm">Save</button>
          </form>
        `).join('');
      } else {
        body.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>${ov.auditLogs.map((l) => `
            <tr><td class="tabular text-xs">${fmtDate(l.created_at)}</td><td>${esc(l.actor_name || 'System')}</td><td class="text-xs">${esc(l.actor_role || '—')}</td><td class="mono">${esc(l.action)}</td><td class="text-xs">${esc(l.entity_type)} #${esc(l.entity_id || '')}</td><td class="text-xs muted">${esc((l.details || '').slice(0, 70))}</td></tr>
          `).join('')}</tbody>
        </table></div>`;
      }

      container.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { tab = b.dataset.t; draw(); }; });
      container.querySelectorAll('.adm-tog-btn').forEach((b) => {
        b.onclick = async () => {
          await api.patch(`/api/admin/users/${b.dataset.id}/status`, { is_active: b.dataset.act === '1' });
          toast('Account Updated', '', 'success');
          renderAdminControlPage(container);
        };
      });
      container.querySelectorAll('.edit-perm-btn').forEach((b) => {
        b.onclick = () => {
          const rid = Number(b.dataset.id);
          const assigned = new Set(ov.rolePermissions.filter((rp) => rp.role_id === rid).map((rp) => rp.permission_id));
          openModal(`Permissions — ${b.dataset.name}`, `
            <form id="perm-form" style="display:flex;flex-direction:column;gap:8px">
              ${ov.permissions.map((p) => `
                <label style="display:flex;gap:8px;align-items:center;font-size:13px">
                  <input type="checkbox" name="pid" value="${p.id}" ${assigned.has(p.id) ? 'checked' : ''} />
                  <span class="mono">${esc(p.code)}</span> — <span class="muted">${esc(p.description)}</span>
                </label>
              `).join('')}
              <button type="submit" class="btn btn-primary" style="margin-top:10px">Save Permissions</button>
            </form>
          `, (mBody) => {
            mBody.querySelector('#perm-form').onsubmit = async (e) => {
              e.preventDefault();
              const ids = Array.from(mBody.querySelectorAll('input[name="pid"]:checked')).map((c) => Number(c.value));
              await api.put(`/api/admin/roles/${rid}/permissions`, { permission_ids: ids });
              toast('Permissions Updated', '', 'success');
              closeModal();
              renderAdminControlPage(container);
            };
          });
        };
      });
      container.querySelectorAll('.set-form').forEach((f) => {
        f.onsubmit = async (e) => {
          e.preventDefault();
          await api.put('/api/admin/settings', { key: f.dataset.key, value: f.querySelector('input').value });
          toast('Setting Saved', f.dataset.key, 'success');
        };
      });

      container.querySelector('#adm-new-user').onclick = () => {
        const docRole = ov.roles.find((r) => r.code === 'doctor');
        openModal('Create Doctor / Staff Account', `
          <form id="stf-form" class="form-grid">
            <div class="field full"><label for="sf-nm">Full Name</label><input id="sf-nm" name="full_name" required placeholder="e.g. Dr. Maya Verma" /></div>
            <div class="field"><label for="sf-em">Email</label><input id="sf-em" name="email" type="email" required /></div>
            <div class="field"><label for="sf-rl">Role</label><select id="sf-rl" name="role_id">${ov.roles.filter((r) => r.is_staff).map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
            <div class="field"><label for="sf-dp">Department</label><select id="sf-dp" name="department_id">${ov.departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
            <div class="field"><label for="sf-pw">Password (8+ chars, 1 number)</label><input id="sf-pw" name="password" type="password" required /></div>
            <div id="sf-doc-fields" class="field full form-grid" style="display:none;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
              <div class="field"><label for="sf-sp">Doctor Specialization</label>
                <select id="sf-sp" name="specialty_id">${(ov.specialties || []).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
              </div>
              <div class="field"><label for="sf-ql">Qualification</label><input id="sf-ql" name="qualification" value="MD" /></div>
              <div class="field"><label for="sf-ex">Experience (Years)</label><input id="sf-ex" name="experience_years" type="number" min="0" value="5" /></div>
              <div class="field"><label for="sf-fe">Consultation Fee ($)</label><input id="sf-fe" name="consultation_fee" type="number" min="10" value="100" /></div>
            </div>
            <div class="field full"><button type="submit" class="btn btn-primary">Create Account</button></div>
          </form>
        `, (mBody) => {
          const roleSel = mBody.querySelector('#sf-rl');
          const docBox = mBody.querySelector('#sf-doc-fields');
          const toggleDocFields = () => {
            docBox.style.display = docRole && Number(roleSel.value) === docRole.id ? 'grid' : 'none';
          };
          roleSel.onchange = toggleDocFields;
          toggleDocFields();
          mBody.querySelector('#stf-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.post('/api/admin/users', Object.fromEntries(new FormData(e.target).entries()));
              toast('Staff Account Created', '', 'success');
              closeModal();
              renderAdminControlPage(container);
            } catch (err) { toast('Error', err.message, 'danger'); }
          };
        });
      };

      container.querySelector('#adm-new-dept').onclick = () => {
        openModal('Add Department', `
          <form id="dept-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="dp-cd">Code</label><input id="dp-cd" name="code" required placeholder="ONC" /></div>
            <div class="field"><label for="dp-nm">Department Name</label><input id="dp-nm" name="name" required placeholder="Oncology" /></div>
            <div class="field"><label for="dp-ct">Category</label><select id="dp-ct" name="category"><option value="clinical">clinical</option><option value="diagnostic">diagnostic</option><option value="support">support</option><option value="admin">admin</option></select></div>
            <button type="submit" class="btn btn-primary">Add Department</button>
          </form>
        `, (mBody) => {
          mBody.querySelector('#dept-form').onsubmit = async (e) => {
            e.preventDefault();
            await api.post('/api/admin/departments', Object.fromEntries(new FormData(e.target).entries()));
            toast('Department Added', '', 'success');
            closeModal();
            renderAdminControlPage(container);
          };
        });
      };
    }
    draw();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

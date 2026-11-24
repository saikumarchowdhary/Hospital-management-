import { api } from '../api.js';
import { closeModal, emptyState, esc, openModal, statusBadge, toast } from '../ui.js';

export function renderAttendanceTab(body, empRes, onReload) {
  const today = new Date().toISOString().slice(0, 10);
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <h3>Daily Staff Attendance (${empRes.attendance.length} log entries)</h3>
      <form id="hr-att-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select name="employee_id" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px">
          ${empRes.employees.map((e) => `<option value="${e.id}">${esc(e.full_name)} (${esc(e.employee_code)})</option>`).join('')}
        </select>
        <input name="attendance_date" type="date" value="${today}" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px" required />
        <select name="status" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px">
          <option>Present</option><option>Late</option><option>Half Day</option><option>On Leave</option><option>Absent</option>
        </select>
        <input name="check_in" type="time" value="09:00" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px" />
        <button type="submit" class="btn btn-primary btn-sm">Mark Attendance</button>
      </form>
    </div>
    ${empRes.attendance.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Employee</th><th>Emp ID</th><th>Designation</th><th>Check In</th><th>Check Out</th><th>Status</th></tr></thead>
      <tbody>${empRes.attendance.map((a) => `
        <tr><td class="tabular">${esc(a.attendance_date)}</td><td><strong>${esc(a.employee_name)}</strong></td><td class="mono">${esc(a.employee_code)}</td><td>${esc(a.designation)}</td><td class="tabular">${esc(a.check_in || '—')}</td><td class="tabular">${esc(a.check_out || '—')}</td><td>${statusBadge(a.status === 'Present' ? 'Active' : a.status === 'Absent' ? 'Rejected' : 'Pending')}</td></tr>
      `).join('')}</tbody>
    </table></div>` : emptyState('No attendance logs yet', 'Use the form above to record staff attendance.')}
  `;

  body.querySelector('#hr-att-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api.post('/api/hr/attendance', { ...d, employee_id: Number(d.employee_id) });
      toast('Attendance Recorded', `${d.attendance_date}: ${d.status}`, 'success');
      onReload();
    } catch (err) { toast('Error', err.message, 'danger'); }
  };
}

export function openRegisterEmployeeModal(empRes, onReload) {
  openModal('Register New Hospital Employee', `
    <form id="hr-emp-form" class="form-grid">
      <div class="field full"><label for="he-nm">Full Name</label><input id="he-nm" name="full_name" required /></div>
      <div class="field"><label for="he-em">Work Email</label><input id="he-em" name="email" type="email" required /></div>
      <div class="field"><label for="he-ph">Phone</label><input id="he-ph" name="phone" /></div>
      <div class="field"><label for="he-rl">Hospital Role</label><select id="he-rl" name="role_id">${(empRes.staffRoles || []).map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="he-dp">Department</label><select id="he-dp" name="department_id">${(empRes.departments || []).map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="he-dg">Designation</label><input id="he-dg" name="designation" required value="Hospital Specialist" /></div>
      <div class="field"><label for="he-sl">Monthly Base Salary ($)</label><input id="he-sl" name="base_salary" type="number" min="500" value="5500" /></div>
      <div class="field full"><label for="he-pw">Initial Password (8+ chars, 1 number)</label><input id="he-pw" name="password" type="password" required /></div>
      <div class="field full"><button type="submit" class="btn btn-primary">Register Employee</button></div>
    </form>
  `, (mBody) => {
    mBody.querySelector('#hr-emp-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/hr/employees', Object.fromEntries(new FormData(e.target).entries()));
        toast('Employee Registered', 'Profile and login account created.', 'success');
        closeModal();
        onReload();
      } catch (err) { toast('Registration Failed', err.message, 'danger'); }
    };
  });
}

import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtDate, fmtMoney, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';
import { openRegisterEmployeeModal, renderAttendanceTab } from './hr-extra.js';

export async function renderHrPage(container, user) {
  container.innerHTML = skeletonBlock(4);
  try {
    const isHr = ['hr', 'admin'].includes(user.role);
    const [vacRes, appRes, empRes] = await Promise.all([
      api.get('/api/hr/vacancies'),
      api.get('/api/hr/applications'),
      isHr ? api.get('/api/hr/employees') : Promise.resolve(null)
    ]);

    if (!isHr) {
      renderCandidateView(container, vacRes.vacancies, appRes.applications);
      return;
    }

    let tab = 'recruitment';
    function draw() {
      const apps = appRes.applications;
      container.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-card"><span class="kpi-label">Active Employees</span><span class="kpi-value tabular">${empRes.employees.filter((e) => e.employment_status === 'Active').length}</span></div>
          <div class="kpi-card"><span class="kpi-label">Open Vacancies</span><span class="kpi-value tabular">${vacRes.vacancies.filter((v) => v.status === 'Published').length}</span></div>
          <div class="kpi-card"><span class="kpi-label">Applications</span><span class="kpi-value tabular">${apps.length}</span></div>
          <div class="kpi-card"><span class="kpi-label">Leave Pending</span><span class="kpi-value tabular">${empRes.leaves.filter((l) => l.status === 'Pending').length}</span></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="tabs">
              <button class="tab-btn ${tab === 'recruitment' ? 'active' : ''}" data-t="recruitment">Recruitment (${apps.length})</button>
              <button class="tab-btn ${tab === 'vacancies' ? 'active' : ''}" data-t="vacancies">Vacancies (${vacRes.vacancies.length})</button>
              <button class="tab-btn ${tab === 'employees' ? 'active' : ''}" data-t="employees">Employees (${empRes.employees.length})</button>
              <button class="tab-btn ${tab === 'attendance' ? 'active' : ''}" data-t="attendance">Attendance (${(empRes.attendance || []).length})</button>
              <button class="tab-btn ${tab === 'leaves' ? 'active' : ''}" data-t="leaves">Leaves (${empRes.leaves.length})</button>
              <button class="tab-btn ${tab === 'payroll' ? 'active' : ''}" data-t="payroll">Payroll (${empRes.payroll.length})</button>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm" id="hr-new-emp">+ Register Employee</button>
              <button class="btn btn-sm" id="hr-run-pay">+ Process Payroll</button>
              <button class="btn btn-primary btn-sm" id="hr-new-vac">+ Post Vacancy</button>
            </div>
          </div>
          <div id="hr-tab-body"></div>
        </div>
      `;

      const body = container.querySelector('#hr-tab-body');
      if (tab === 'recruitment') {
        body.innerHTML = apps.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Ref</th><th>Candidate</th><th>Vacancy</th><th>Interview</th><th>Status</th><th>Workflow Action</th></tr></thead>
          <tbody>${apps.map((a) => `
            <tr>
              <td class="mono">${esc(a.application_ref)}</td>
              <td><strong>${esc(a.candidate_name)}</strong><div class="text-xs muted">${esc(a.candidate_email)}</div></td>
              <td>${esc(a.vacancy_title)}</td>
              <td class="text-xs">${esc(a.interview_summary || 'Not scheduled')}</td>
              <td>${statusBadge(a.status)}</td>
              <td><div style="display:flex;gap:6px;flex-wrap:wrap">
                ${a.status === 'Submitted' ? `<button class="btn btn-sm hr-app-step" data-id="${a.id}" data-st="Under Review">Review</button>` : ''}
                ${a.status === 'Under Review' ? `<button class="btn btn-sm hr-app-step" data-id="${a.id}" data-st="Shortlisted">Shortlist</button>` : ''}
                ${a.status === 'Shortlisted' ? `<button class="btn btn-primary btn-sm hr-int-btn" data-id="${a.id}">Schedule Interview</button>` : ''}
                ${a.status === 'Interview Scheduled' ? `<button class="btn btn-success btn-sm hr-app-step" data-id="${a.id}" data-st="Selected">Select</button>` : ''}
                ${a.status === 'Selected' ? `<button class="btn btn-primary btn-sm hr-app-step" data-id="${a.id}" data-st="Offer Issued">Issue Offer</button>` : ''}
                ${a.status === 'Offer Issued' ? `<button class="btn btn-success btn-sm hr-app-step" data-id="${a.id}" data-st="Joined">Mark Joined</button>` : ''}
                ${a.resume_attachment_id ? `<a class="btn btn-sm" href="/api/admin/attachments/${a.resume_attachment_id}" target="_blank" rel="noopener">Resume</a>` : ''}
              </div></td>
            </tr>
          `).join('')}</tbody>
        </table></div>` : emptyState('No applications yet', 'Candidate applications appear here.');
      } else if (tab === 'vacancies') {
        body.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Code</th><th>Role Title</th><th>Department</th><th>Type</th><th>Positions</th><th>Status</th></tr></thead>
          <tbody>${vacRes.vacancies.map((v) => `
            <tr><td class="mono">${esc(v.vacancy_code)}</td><td><strong>${esc(v.title)}</strong></td><td>${esc(v.department_name || 'General')}</td><td>${esc(v.employment_type)}</td><td class="num">${v.positions}</td><td>${statusBadge(v.status)}</td></tr>
          `).join('')}</tbody>
        </table></div>`;
      } else if (tab === 'employees') {
        body.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Emp ID</th><th>Name</th><th>Role</th><th>Department</th><th>Designation</th><th>Base Salary</th><th>Status</th></tr></thead>
          <tbody>${empRes.employees.map((e) => `
            <tr><td class="mono">${esc(e.employee_code)}</td><td><strong>${esc(e.full_name)}</strong><div class="text-xs muted">${esc(e.email)}</div></td><td>${esc(e.role_name)}</td><td>${esc(e.department_name || '—')}</td><td>${esc(e.designation)}</td><td class="num">${fmtMoney(e.base_salary)}</td><td>${statusBadge(e.employment_status)}</td></tr>
          `).join('')}</tbody>
        </table></div>`;
      } else if (tab === 'attendance') {
        renderAttendanceTab(body, empRes, () => renderHrPage(container, user));
      } else if (tab === 'leaves') {
        body.innerHTML = empRes.leaves.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${empRes.leaves.map((l) => `
            <tr><td><strong>${esc(l.employee_name)}</strong></td><td>${esc(l.leave_type)}</td><td class="tabular">${esc(l.start_date)} to ${esc(l.end_date)}</td><td>${esc(l.reason)}</td><td>${statusBadge(l.status)}</td>
            <td>${l.status === 'Pending' ? `<button class="btn btn-success btn-sm lv-act" data-id="${l.id}" data-st="Approved">Approve</button> <button class="btn btn-sm lv-act" data-id="${l.id}" data-st="Rejected">Reject</button>` : '—'}</td></tr>
          `).join('')}</tbody>
        </table></div>` : emptyState('No leave requests', 'Staff leave submissions appear here.');
      } else {
        body.innerHTML = empRes.payroll.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Period</th><th>Payslip Ref</th><th>Employee</th><th>Gross</th><th>Deductions</th><th>Net Salary</th><th>Status</th></tr></thead>
          <tbody>${empRes.payroll.map((p) => `
            <tr><td class="mono">${esc(p.pay_period)}</td><td class="mono">${esc(p.payslip_ref || '—')}</td><td><strong>${esc(p.employee_name)}</strong></td><td class="num">${fmtMoney(p.gross_salary)}</td><td class="num">${fmtMoney(p.deductions)}</td><td class="num"><strong>${fmtMoney(p.net_salary)}</strong></td><td>${statusBadge(p.status)}</td></tr>
          `).join('')}</tbody>
        </table></div>` : emptyState('No payroll processed', 'Click Process Payroll to generate monthly payslips.');
      }

      container.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { tab = b.dataset.t; draw(); }; });
      container.querySelectorAll('.hr-app-step').forEach((b) => {
        b.onclick = async () => {
          await api.patch(`/api/hr/applications/${b.dataset.id}/status`, { status: b.dataset.st });
          toast('Candidate Updated', b.dataset.st, 'success');
          renderHrPage(container, user);
        };
      });
      container.querySelectorAll('.hr-int-btn').forEach((b) => {
        b.onclick = () => {
          openModal('Schedule Candidate Interview', `
            <form id="int-form" style="display:flex;flex-direction:column;gap:12px">
              <div class="field"><label for="in-dt">Date & Time</label><input id="in-dt" name="scheduled_at" type="datetime-local" required /></div>
              <div class="field"><label for="in-nm">Interviewer</label><input id="in-nm" name="interviewer_name" value="${esc(user.full_name)}" required /></div>
              <button type="submit" class="btn btn-primary">Schedule Interview</button>
            </form>
          `, (mBody) => {
            mBody.querySelector('#int-form').onsubmit = async (e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.target).entries());
              await api.patch(`/api/hr/applications/${b.dataset.id}/status`, { status: 'Interview Scheduled', ...d });
              toast('Interview Scheduled', '', 'success');
              closeModal();
              renderHrPage(container, user);
            };
          });
        };
      });
      container.querySelectorAll('.lv-act').forEach((b) => {
        b.onclick = async () => {
          await api.patch(`/api/hr/leaves/${b.dataset.id}`, { status: b.dataset.st });
          toast('Leave Updated', b.dataset.st, 'success');
          renderHrPage(container, user);
        };
      });
      container.querySelector('#hr-new-emp').onclick = () => openRegisterEmployeeModal(empRes, () => renderHrPage(container, user));
      container.querySelector('#hr-run-pay').onclick = async () => {
        const res = await api.post('/api/hr/payroll/run', {});
        toast('Payroll Processed', res.message, 'success');
        renderHrPage(container, user);
      };
      container.querySelector('#hr-new-vac').onclick = () => {
        openModal('Post Job Vacancy', `
          <form id="vac-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="vc-t">Job Title</label><input id="vc-t" name="title" required /></div>
            <div class="field"><label for="vc-pos">Positions</label><input id="vc-pos" name="positions" type="number" value="1" min="1" /></div>
            <div class="field"><label for="vc-desc">Job Description</label><textarea id="vc-desc" name="description" required></textarea></div>
            <button type="submit" class="btn btn-primary">Publish Vacancy</button>
          </form>
        `, (mBody) => {
          mBody.querySelector('#vac-form').onsubmit = async (e) => {
            e.preventDefault();
            await api.post('/api/hr/vacancies', Object.fromEntries(new FormData(e.target).entries()));
            toast('Vacancy Published', '', 'success');
            closeModal();
            renderHrPage(container, user);
          };
        });
      };
    }
    draw();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

function renderCandidateView(container, vacancies, applications) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div><h1>MediCore Careers Portal</h1><p class="text-sm muted">Explore open hospital positions and track your applications.</p></div></div>
      <div class="grid-2">
        ${vacancies.map((v) => `
          <div class="card">
            <div class="meta-line"><span class="mono">${esc(v.vacancy_code)}</span><span>·</span><span>${esc(v.employment_type)}</span><span>·</span><span>${v.positions} opening(s)</span></div>
            <h3 style="margin:6px 0">${esc(v.title)}</h3>
            <p class="text-sm muted" style="margin-bottom:12px">${esc(v.description)}</p>
            <button class="btn btn-primary btn-sm apply-vac-btn" data-id="${v.id}" data-title="${esc(v.title)}">Apply with Resume</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>My Job Applications</h2></div>
      ${applications.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Ref</th><th>Position</th><th>Interview</th><th>Applied</th><th>Status</th></tr></thead>
          <tbody>
            ${applications.map((a) => `
              <tr><td class="mono">${esc(a.application_ref)}</td><td><strong>${esc(a.vacancy_title)}</strong></td><td>${esc(a.interview_summary || 'Pending')}</td><td class="tabular text-xs">${fmtDate(a.created_at)}</td><td>${statusBadge(a.status)}</td></tr>
            `).join('')}
          </tbody>
        </table></div>
      ` : emptyState('No applications submitted', 'Apply for an open role above.')}
    </div>
  `;

  container.querySelectorAll('.apply-vac-btn').forEach((b) => {
    b.onclick = () => {
      openModal(`Apply — ${b.dataset.title}`, `
        <form id="cand-apply-form" style="display:flex;flex-direction:column;gap:12px">
          <input type="hidden" name="vacancy_id" value="${b.dataset.id}" />
          <div class="field"><label for="ca-note">Cover Note</label><textarea id="ca-note" name="cover_note" required placeholder="Share your clinical or operational background..."></textarea></div>
          <div class="field"><label for="ca-res">Upload Resume (PDF/TXT/PNG, max 5MB)</label><input id="ca-res" name="resume" type="file" accept=".pdf,.txt,.png,.jpg" /></div>
          <button type="submit" class="btn btn-primary">Submit Application</button>
        </form>
      `, (body) => {
        body.querySelector('#cand-apply-form').onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api.post('/api/hr/applications', new FormData(e.target));
            toast('Application Submitted', '', 'success');
            closeModal();
            renderHrPage(container, { role: 'candidate' });
          } catch (err) { toast('Error', err.message, 'danger'); }
        };
      });
    };
  });
}

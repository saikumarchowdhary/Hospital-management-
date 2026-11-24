import { api } from '../api.js';
import { clearAuthSession } from '../session.js';
import { esc, toast } from '../ui.js';

export async function renderPendingApprovalScreen(root, user) {
  let request = null;
  try {
    const res = await api.get('/api/auth/my-signup-request');
    request = res.request;
  } catch {
    request = null;
  }

  const status = request?.status || user.account_status || 'Pending';
  const badgeClass = status === 'Approved' ? 'success' : status === 'Rejected' ? 'danger' : status === 'Info Requested' ? 'info' : 'warning';

  root.innerHTML = `
    <div style="max-width:760px;margin:32px auto;padding:0 16px">
      <div class="card" style="padding:28px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:16px">
          <div style="display:flex;align-items:center;gap:12px">
            <img src="/assets/icon.svg" alt="MediCore HMS" style="width:40px;height:40px;border-radius:8px" />
            <div>
              <h1 style="font-size:20px;margin:0">Hospital Staff Registration</h1>
              <p class="text-sm muted" style="margin:2px 0 0 0">Administrative Verification Queue</p>
            </div>
          </div>
          <span class="badge ${badgeClass}" style="font-size:13px;padding:6px 12px">
            ${esc(status === 'Pending' ? 'Pending Administrator Approval' : status)}
          </span>
        </div>

        ${status === 'Info Requested' ? `
          <div class="alert-banner info" style="margin-bottom:20px;padding:14px">
            <strong>Administrator Requested More Information:</strong><br />
            ${esc(request?.admin_notes || 'Please contact administration or provide additional credential details.')}
          </div>
        ` : ''}

        ${status === 'Rejected' ? `
          <div class="alert-banner error" style="margin-bottom:20px;padding:14px">
            <strong>Application Rejected by Hospital Administration:</strong><br />
            ${esc(request?.rejection_reason || 'Registration did not meet hospital credentialing requirements.')}
          </div>
        ` : ''}

        ${status === 'Pending' ? `
          <div class="alert-banner warning" style="margin-bottom:20px;padding:14px">
            <strong>Application Under Review</strong><br />
            Your staff account is currently pending administrative review. In compliance with hospital safety and clinical governance policies, all staff accounts must be verified before clinical data or patient records can be accessed.
          </div>
        ` : ''}

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:24px;background:var(--bg);padding:16px;border-radius:8px;border:1px solid var(--border)">
          <div>
            <span class="text-xs muted">Applicant Name</span>
            <div style="font-weight:600">${esc(request?.full_name || user.full_name)}</div>
          </div>
          <div>
            <span class="text-xs muted">Work Email</span>
            <div class="mono text-xs">${esc(request?.email || user.email)}</div>
          </div>
          <div>
            <span class="text-xs muted">Mobile Number</span>
            <div>${esc(request?.phone || user.phone || '-')}</div>
          </div>
          <div>
            <span class="text-xs muted">Requested Staff Role</span>
            <div style="font-weight:600;color:var(--primary)">${esc(request?.requested_role_label || request?.requested_role || 'Staff')}</div>
          </div>
          <div>
            <span class="text-xs muted">Branch</span>
            <div>${esc(request?.branch_name || 'Central Hospital')}</div>
          </div>
          <div>
            <span class="text-xs muted">Department</span>
            <div>${esc(request?.department_name || 'Clinical Support')}</div>
          </div>
          <div>
            <span class="text-xs muted">Employee / Badge ID</span>
            <div class="mono text-xs">${esc(request?.employee_id || 'Auto-assigned upon approval')}</div>
          </div>
          <div>
            <span class="text-xs muted">Professional Qualification</span>
            <div>${esc(request?.qualification || 'Not specified')}</div>
          </div>
          <div>
            <span class="text-xs muted">Credential Document</span>
            <div>
              ${request?.document_url ? `
                <span class="text-xs" style="color:var(--primary);font-weight:500">📎 ${esc(request.document_url)}</span>
              ` : '<span class="text-xs muted">None uploaded</span>'}
            </div>
          </div>
          <div>
            <span class="text-xs muted">Submission Date</span>
            <div class="text-xs">${esc(request?.created_at || 'Recently submitted')}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--border);padding-top:18px">
          <button type="button" class="btn btn-secondary" id="btn-pending-logout">Sign Out</button>

          ${status !== 'Approved' && status !== 'Withdrawn' ? `
            <button type="button" class="btn btn-danger" id="btn-withdraw-application">Withdraw Application</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  root.querySelector('#btn-pending-logout').onclick = async () => {
    try { await api.post('/api/auth/logout'); } catch {}
    clearAuthSession('SIGNED_OUT');
    window.location.hash = '';
    window.location.reload();
  };

  const withdrawBtn = root.querySelector('#btn-withdraw-application');
  if (withdrawBtn) {
    withdrawBtn.onclick = async () => {
      if (!confirm('Are you sure you want to withdraw your staff registration request?')) return;
      withdrawBtn.disabled = true;
      try {
        await api.post('/api/auth/withdraw-signup');
        toast('Application Withdrawn', 'Your registration request has been withdrawn.', 'info');
        clearAuthSession('SIGNED_OUT');
        window.location.hash = '';
        window.location.reload();
      } catch (err) {
        toast('Withdrawal Failed', err.message, 'error');
        withdrawBtn.disabled = false;
      }
    };
  }
}

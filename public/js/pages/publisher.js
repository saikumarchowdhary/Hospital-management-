import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtDate, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderPublisherPage(container, user) {
  container.innerHTML = skeletonBlock(4);
  try {
    const res = await api.get('/api/publisher');
    const canPublish = ['publisher', 'admin'].includes(user.role);
    const canApprove = ['approver', 'admin'].includes(user.role);
    const pending = res.announcements.filter((a) => a.status === 'Pending Approval');
    const approvals = res.approvals || [];

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Total Notices</span><span class="kpi-value tabular">${res.announcements.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Pending Approval</span><span class="kpi-value tabular" style="color:var(--warning)">${pending.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Published</span><span class="kpi-value tabular" style="color:var(--success)">${res.announcements.filter((a) => a.status === 'Published').length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Review Actions</span><span class="kpi-value tabular">${approvals.length}</span></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div><h1>Notices & Approval Queue</h1><p class="text-sm muted">Publishers draft and submit notices; independent Approvers review with remarks and publish to audiences.</p></div>
          ${canPublish ? '<button class="btn btn-primary btn-sm" id="pub-new-btn">+ Create Notice</button>' : ''}
        </div>
        ${res.announcements.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Title</th><th>Audience</th><th>Priority</th><th>Window</th><th>Views / Acks</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${res.announcements.map((a) => `
                <tr>
                  <td><strong>${esc(a.title)}</strong><div class="text-xs muted">${esc(a.body.slice(0, 90))}</div></td>
                  <td>${esc(a.audience || 'all')}</td>
                  <td>${esc(a.priority)}</td>
                  <td class="tabular text-xs">${esc(a.start_date)} to ${esc(a.expiry_date)}</td>
                  <td class="tabular">${a.views_count} / ${a.acks_count}</td>
                  <td>${statusBadge(a.status)}</td>
                  <td><div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${canApprove && a.status === 'Pending Approval' ? `
                      <button class="btn btn-success btn-sm pub-rev" data-id="${a.id}" data-dec="Approved" data-title="${esc(a.title)}">Approve & Publish</button>
                      <button class="btn btn-danger btn-sm pub-rev" data-id="${a.id}" data-dec="Rejected" data-title="${esc(a.title)}">Reject</button>
                    ` : ''}
                    ${a.attachment_id ? `<a class="btn btn-sm" href="/api/admin/attachments/${a.attachment_id}" target="_blank" rel="noopener">Attachment</a>` : ''}
                  </div></td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        ` : emptyState('No announcements', 'Create a notice to share updates with patients or staff.')}
      </div>

      ${approvals.length ? `
        <div class="card">
          <div class="card-header"><h2>Approval History & Reviewer Remarks</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Notice</th><th>Reviewer</th><th>Decision</th><th>Remarks</th><th>Reviewed At</th></tr></thead>
            <tbody>
              ${approvals.map((ap) => `
                <tr><td><strong>${esc(ap.announcement_title)}</strong></td><td>${esc(ap.reviewer_name)}</td><td>${statusBadge(ap.decision)}</td><td class="text-sm">${esc(ap.comments || 'No remarks')}</td><td class="tabular text-xs">${fmtDate(ap.created_at)}</td></tr>
              `).join('')}
            </tbody>
          </table></div>
        </div>
      ` : ''}
    `;

    const newBtn = container.querySelector('#pub-new-btn');
    if (newBtn) {
      newBtn.onclick = () => {
        openModal('Draft Hospital Notice', `
          <form id="pub-form" class="form-grid">
            <div class="field full"><label for="pb-t">Headline</label><input id="pb-t" name="title" required /></div>
            <div class="field full"><label for="pb-b">Announcement Body</label><textarea id="pb-b" name="body" required></textarea></div>
            <div class="field"><label for="pb-aud">Audience</label><select id="pb-aud" name="audience"><option value="all">All Users</option><option value="patient">Patients Only</option><option value="doctor">Doctors</option><option value="nurse">Nurses</option></select></div>
            <div class="field"><label for="pb-pri">Priority</label><select id="pb-pri" name="priority"><option>Normal</option><option>High</option><option>Urgent</option></select></div>
            <div class="field full"><label for="pb-att">Attachment (Optional)</label><input id="pb-att" name="attachment" type="file" accept=".pdf,.png,.jpg" /></div>
            <div class="field full"><button type="submit" class="btn btn-primary">Submit for Approval</button></div>
          </form>
        `, (body) => {
          body.querySelector('#pub-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.post('/api/publisher', new FormData(e.target));
              toast('Submitted for Approval', '', 'success');
              closeModal();
              renderPublisherPage(container, user);
            } catch (err) { toast('Error', err.message, 'danger'); }
          };
        });
      };
    }

    container.querySelectorAll('.pub-rev').forEach((b) => {
      b.onclick = () => {
        openModal(`${b.dataset.dec} Notice — ${b.dataset.title}`, `
          <form id="rev-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="rv-rem">Reviewer Remarks</label><textarea id="rv-rem" name="comments" required placeholder="Add compliance review notes or reason...">${b.dataset.dec === 'Approved' ? 'Approved for publication' : ''}</textarea></div>
            <button type="submit" class="btn ${b.dataset.dec === 'Approved' ? 'btn-success' : 'btn-danger'}">Confirm ${esc(b.dataset.dec)}</button>
          </form>
        `, (body) => {
          body.querySelector('#rev-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.post(`/api/publisher/${b.dataset.id}/review`, { decision: b.dataset.dec, comments: body.querySelector('#rv-rem').value.trim() });
              toast('Notice Reviewed', b.dataset.dec, 'success');
              closeModal();
              renderPublisherPage(container, user);
            } catch (err) { toast('Review Blocked', err.message, 'danger'); }
          };
        });
      };
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderCampaignsPage(container, user) {
  container.innerHTML = skeletonBlock(4);
  try {
    const res = await api.get('/api/campaigns');
    const canPublish = ['publisher', 'admin'].includes(user.role);
    const canApprove = ['approver', 'admin'].includes(user.role);

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div><h1>Promotional Campaigns (Sponsored)</h1><p class="text-sm muted">All patient-facing promotions are clearly labeled Sponsored and never obstruct clinical care or SOS access.</p></div>
          ${canPublish ? '<button class="btn btn-primary btn-sm" id="camp-new-btn">+ Create Campaign</button>' : ''}
        </div>
        ${res.campaigns.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Campaign</th><th>Audience</th><th>Dates</th><th>Impressions / Clicks</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${res.campaigns.map((c) => `
                <tr>
                  <td><strong>${esc(c.name)}</strong><div class="text-xs muted">${esc(c.description)}</div></td>
                  <td>${esc(c.audience)}</td>
                  <td class="tabular text-xs">${esc(c.start_date)} to ${esc(c.end_date)}</td>
                  <td class="tabular">${c.impressions} / ${c.clicks}</td>
                  <td>${statusBadge(c.status)}</td>
                  <td>
                    ${canApprove && c.status === 'Pending Approval' ? `
                      <button class="btn btn-success btn-sm cmp-rev" data-id="${c.id}" data-dec="Approved">Approve</button>
                      <button class="btn btn-danger btn-sm cmp-rev" data-id="${c.id}" data-dec="Rejected">Reject</button>
                    ` : '<span class="text-xs muted">—</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        ` : emptyState('No campaigns', 'Create a promotional health campaign.')}
      </div>
    `;

    const newBtn = container.querySelector('#camp-new-btn');
    if (newBtn) {
      newBtn.onclick = () => {
        openModal('Create Promotional Campaign', `
          <form id="cmp-form" class="form-grid">
            <div class="field full"><label for="cm-n">Campaign Name</label><input id="cm-n" name="name" required /></div>
            <div class="field full"><label for="cm-d">Description</label><textarea id="cm-d" name="description" required></textarea></div>
            <div class="field"><label for="cm-aud">Audience</label><select id="cm-aud" name="audience"><option>Patients</option><option>All</option></select></div>
            <div class="field"><label for="cm-dest">Destination Route</label><input id="cm-dest" name="destination_url" value="#patient/lab-booking" /></div>
            <div class="field full"><label for="cm-trm">Offer Terms</label><input id="cm-trm" name="offer_terms" placeholder="Local demonstration promotion terms" /></div>
            <div class="field full"><label for="cm-ban">Banner Image (Optional)</label><input id="cm-ban" name="banner" type="file" accept=".png,.jpg,.jpeg" /></div>
            <div class="field full"><button type="submit" class="btn btn-primary">Submit for Approval</button></div>
          </form>
        `, (body) => {
          body.querySelector('#cmp-form').onsubmit = async (e) => {
            e.preventDefault();
            await api.post('/api/campaigns', new FormData(e.target));
            toast('Campaign Submitted', '', 'success');
            closeModal();
            renderCampaignsPage(container, user);
          };
        });
      };
    }

    container.querySelectorAll('.cmp-rev').forEach((b) => {
      b.onclick = async () => {
        try {
          await api.post(`/api/campaigns/${b.dataset.id}/review`, { decision: b.dataset.dec });
          toast('Campaign Updated', b.dataset.dec, 'success');
          renderCampaignsPage(container, user);
        } catch (err) { toast('Blocked', err.message, 'danger'); }
      };
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

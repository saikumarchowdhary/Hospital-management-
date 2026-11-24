import { api } from '../api.js';
import { errorState, esc, skeletonBlock, toast } from '../ui.js';

export async function renderProfilePage(container, user, onLogout) {
  container.innerHTML = skeletonBlock(3);
  try {
    let profile = null;
    if (user.role === 'patient') {
      const d = await api.get('/api/patients/me/dashboard');
      profile = d.profile;
    }

    container.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div>
              <h1>Account Profile</h1>
              <p class="text-sm muted">${esc(user.role_name)}${user.department_name ? ` · ${esc(user.department_name)}` : ''} · <span class="mono">${esc(user.user_code)}</span> · ${esc(user.account_status || 'Active')}</p>
            </div>
            <button class="btn btn-danger btn-sm" id="prof-logout-btn">Sign Out</button>
          </div>
          <form id="profile-form" class="form-grid">
            <div class="field"><label for="pf-name">Full Name</label><input id="pf-name" name="full_name" value="${esc(user.full_name)}" required /></div>
            <div class="field"><label for="pf-phone">Phone</label><input id="pf-phone" name="phone" value="${esc(user.phone || '')}" /></div>
            <div class="field full"><label for="pf-email">Email</label><input id="pf-email" value="${esc(user.email)}" disabled /></div>
            ${profile ? `
              <div class="field full"><label for="pf-addr">Address</label><input id="pf-addr" name="address" value="${esc(profile.address || '')}" /></div>
              <div class="field"><label for="pf-bg">Blood Group</label><input id="pf-bg" name="blood_group" value="${esc(profile.blood_group || '')}" /></div>
              <div class="field"><label for="pf-ec">Emergency Contact Name</label><input id="pf-ec" name="emergency_contact_name" value="${esc(profile.emergency_contact_name || '')}" /></div>
              <div class="field full"><label for="pf-ecp">Emergency Contact Phone</label><input id="pf-ecp" name="emergency_contact_phone" value="${esc(profile.emergency_contact_phone || '')}" /></div>
            ` : ''}
            <div class="field full"><button type="submit" class="btn btn-primary">Save Profile</button></div>
          </form>
        </div>

        ${user.is_staff ? `
          <div class="card">
            <div class="card-header"><h2>Staff Leave Request</h2></div>
            <form id="leave-form" class="form-grid">
              <div class="field"><label for="lv-type">Leave Type</label>
                <select id="lv-type" name="leave_type"><option>Annual</option><option>Sick</option><option>Emergency</option></select>
              </div>
              <div class="field"><label for="lv-start">Start Date</label><input id="lv-start" name="start_date" type="date" required /></div>
              <div class="field"><label for="lv-end">End Date</label><input id="lv-end" name="end_date" type="date" required /></div>
              <div class="field full"><label for="lv-reason">Reason</label><input id="lv-reason" name="reason" required /></div>
              <div class="field full"><button type="submit" class="btn btn-primary">Submit Leave Request</button></div>
            </form>
          </div>
        ` : `
          <div class="card">
            <div class="card-header"><h2>Privacy & Security</h2></div>
            <p class="text-sm muted">Your clinical records are isolated to your account and authorized clinicians involved in your care. Payment simulations never store real card numbers.</p>
          </div>
        `}
      </div>
    `;

    container.querySelector('#prof-logout-btn').onclick = onLogout;
    container.querySelector('#profile-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await api.put('/api/patients/me/profile', Object.fromEntries(fd.entries()));
      toast('Profile Saved', 'Your information has been updated.', 'success');
    };
    const lvForm = container.querySelector('#leave-form');
    if (lvForm) {
      lvForm.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(lvForm);
        await api.post('/api/hr/leaves', Object.fromEntries(fd.entries()));
        toast('Leave Submitted', 'Forwarded to HR for approval.', 'success');
        lvForm.reset();
      };
    }
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

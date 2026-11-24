import { api } from './api.js';
import { clearFirstFailedRequestError, setAuthSession } from './session.js';
import { esc, toast } from './ui.js';

export function renderPatientRegisterForm() {
  return `
    <form id="register-form" class="form-grid">
      <div class="field full"><label for="reg-name">Full Name</label><input id="reg-name" name="full_name" required placeholder="Jane Doe" /></div>
      <div class="field"><label for="reg-dob">Date of Birth</label><input id="reg-dob" name="dob" type="date" required value="1992-04-15" /></div>
      <div class="field"><label for="reg-gender">Gender</label><select id="reg-gender" name="gender" required><option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other</option></select></div>
      <div class="field"><label for="reg-mobile">Mobile Number</label><input id="reg-mobile" name="mobile" required placeholder="+1-555-0199" /></div>
      <div class="field"><label for="reg-email">Email Address</label><input id="reg-email" name="email" type="email" required placeholder="jane@example.com" /></div>
      <div class="field full"><label for="reg-address">Residential Address</label><input id="reg-address" name="address" required placeholder="123 Main Street, Metro City" /></div>
      <div class="field"><label for="reg-emg-name">Emergency Contact Name</label><input id="reg-emg-name" name="emergency_contact_name" required placeholder="e.g. Mark Doe" /></div>
      <div class="field"><label for="reg-emg-phone">Emergency Contact Phone</label><input id="reg-emg-phone" name="emergency_contact_phone" required placeholder="+1-555-0144" /></div>
      <div class="field"><label for="reg-pass">Password (8+ chars & 1 number)</label><input id="reg-pass" name="password" type="password" required minlength="8" /></div>
      <div class="field"><label for="reg-confirm">Confirm Password</label><input id="reg-confirm" name="confirm" type="password" required minlength="8" /></div>
      <div class="field full">
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;cursor:pointer">
          <input type="checkbox" id="reg-consent" required style="margin-top:2px" />
          <span>I consent to MediCore HMS storing my patient profile and medical appointments. Patient ID is generated automatically.</span>
        </label>
      </div>
      <div class="field full"><button type="submit" class="btn btn-primary" id="reg-submit-btn">Create Patient Account (Instant Access)</button></div>
    </form>
  `;
}

export function renderStaffRegisterForm(meta) {
  const roles = (meta?.staffRoles || []).filter((r) => r.code !== 'doctor' && r.code !== 'admin');
  const depts = meta?.departments || [];
  const branches = meta?.branches || [];

  return `
    <div id="staff-pending-banner" class="alert-banner success" style="display:none;margin-bottom:12px"></div>
    <form id="staff-register-form" class="form-grid">
      <div class="field full">
        <label for="sr-role">I am applying as... (Select Staff Role)</label>
        <select id="sr-role" name="requested_role" required>
          ${roles.map((r) => `<option value="${esc(r.code)}">${esc(r.name)}</option>`).join('')}
        </select>
        <span class="text-xs muted" style="margin-top:2px;display:block">Note: Doctor and Administrator appointments are managed solely by Hospital Administration.</span>
      </div>

      <div class="field full"><label for="sr-name">Full Name</label><input id="sr-name" name="full_name" required placeholder="e.g. Nurse Clara Bennett" /></div>
      <div class="field"><label for="sr-email">Work Email</label><input id="sr-email" name="email" type="email" required placeholder="staff@hospital.com" /></div>
      <div class="field"><label for="sr-mobile">Mobile Number</label><input id="sr-mobile" name="mobile" required placeholder="+1-555-0299" /></div>

      <div class="field"><label for="sr-branch">Assigned Branch</label>
        <select id="sr-branch" name="branch_id" required>
          ${branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field"><label for="sr-dept">Department</label>
        <select id="sr-dept" name="department_id" required>
          ${depts.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field"><label for="sr-empid">Employee / Badge ID (Optional)</label><input id="sr-empid" name="employee_id" placeholder="e.g. EMP-9201" /></div>
      <div class="field"><label for="sr-qual">Professional Qualification</label><input id="sr-qual" name="qualification" placeholder="e.g. B.Sc Nursing, PharmD, CPA" /></div>

      <div class="field full">
        <label for="sr-doc-file">Credential / ID Document Upload (Optional - PDF or Image, max 5 MB)</label>
        <input id="sr-doc-file" name="document_file" type="file" accept=".pdf,image/*" />
        <span class="text-xs muted">Upload state medical council license, nursing registration, or hospital ID.</span>
      </div>

      <div class="field"><label for="sr-pass">Password (8+ chars & 1 number)</label><input id="sr-pass" name="password" type="password" required minlength="8" /></div>
      <div class="field"><label for="sr-confirm">Confirm Password</label><input id="sr-confirm" name="confirm" type="password" required minlength="8" /></div>
      <div class="field full"><button type="submit" class="btn btn-primary" id="sr-submit-btn">Submit Staff Registration for Approval</button></div>
    </form>
  `;
}

export function bindPatientRegisterEvents(root) {
  const form = root.querySelector('#register-form');
  const errBox = root.querySelector('#auth-error');
  const submitBtn = root.querySelector('#reg-submit-btn');

  form.onsubmit = async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    const fd = new FormData(form);
    const password = fd.get('password');
    if (password !== fd.get('confirm')) { errBox.textContent = 'Passwords do not match.'; errBox.style.display = 'block'; return; }
    if (!/\d/.test(password) || String(password).length < 8) { errBox.textContent = 'Password must be at least 8 characters and include a number.'; errBox.style.display = 'block'; return; }
    submitBtn.disabled = true;
    try {
      const payload = { ...Object.fromEntries(fd.entries()), consent: root.querySelector('#reg-consent').checked };
      const res = await api.post('/api/auth/register', payload);
      if (!(res.token || res.accessToken)) {
        throw new Error('Registration succeeded but no access token was returned by server.');
      }
      clearFirstFailedRequestError();
      toast('Welcome to MediCore HMS', `Account ${res.user.user_code} created.`, 'success');
      setAuthSession({
        user: res.user,
        token: res.token || res.accessToken,
        refreshToken: res.refreshToken,
        expiresAt: res.expiresAt
      }, 'SIGNED_IN');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  };
}

export function bindStaffRegisterEvents(root) {
  const form = root.querySelector('#staff-register-form');
  const errBox = root.querySelector('#auth-error');
  const okBanner = root.querySelector('#staff-pending-banner');
  const submitBtn = root.querySelector('#sr-submit-btn');
  const fileInput = root.querySelector('#sr-doc-file');

  form.onsubmit = async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    okBanner.style.display = 'none';
    const fd = new FormData(form);
    const password = fd.get('password');
    if (password !== fd.get('confirm')) { errBox.textContent = 'Passwords do not match.'; errBox.style.display = 'block'; return; }
    if (!/\d/.test(password) || String(password).length < 8) { errBox.textContent = 'Password must be at least 8 characters and include a number.'; errBox.style.display = 'block'; return; }

    const file = fileInput?.files?.[0];
    if (file && file.size > 5 * 1024 * 1024) {
      errBox.textContent = 'Uploaded document must not exceed 5 MB.';
      errBox.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    try {
      let documentUrl = '';
      if (file) {
        documentUrl = `uploaded://${encodeURIComponent(file.name)} (${(file.size / 1024).toFixed(1)} KB)`;
      }

      const payload = {
        account_type: 'staff',
        requested_role: fd.get('requested_role'),
        full_name: fd.get('full_name'),
        email: fd.get('email'),
        mobile: fd.get('mobile'),
        branch_id: Number(fd.get('branch_id')),
        department_id: Number(fd.get('department_id')),
        employee_id: fd.get('employee_id') || '',
        qualification: fd.get('qualification') || '',
        document_url: documentUrl,
        password
      };

      const res = await api.post('/api/auth/register', payload);
      okBanner.innerHTML = `
        <strong>Registration Submitted!</strong><br />
        ${esc(res.message)}<br />
        <span class="text-xs">Your account has been created with status <em>Pending Approval</em>. You may log in now to view your submission status.</span>
      `;
      okBanner.style.display = 'block';
      form.reset();
      toast('Registration Submitted', 'Awaiting administrative approval.', 'success');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  };
}

import { api } from './api.js';
import { clearFirstFailedRequestError, setAuthSession } from './session.js';
import { esc, toast } from './ui.js';

const CONSENT_VERSION = 'v2.0';
const CONSENT_TEXT = 'I consent to MediCore HMS storing and processing my personal identity, care records, and appointments under hospital privacy safeguards.';

export function renderUnifiedRegisterForm(meta, selectedAccountType = 'patient') {
  const roles = (meta?.staffRoles || []).filter((r) => r.code !== 'doctor' && r.code !== 'admin');
  const depts = meta?.departments || [];
  const branches = meta?.branches || [];
  const specs = meta?.specialties || [];

  return `
    <div id="signup-pending-banner" class="alert-banner success" style="display:none;margin-bottom:12px"></div>
    <form id="unified-register-form" class="form-grid" enctype="multipart/form-data">
      <div class="field full">
        <label for="reg-iam">I am a...</label>
        <select id="reg-iam" name="account_type" required>
          <option value="patient" ${selectedAccountType === 'patient' ? 'selected' : ''}>Patient (Instant Portal Access & Patient ID)</option>
          <option value="candidate" ${selectedAccountType === 'candidate' ? 'selected' : ''}>Candidate (Jobs & My Applications)</option>
          <option value="doctor" ${selectedAccountType === 'doctor' ? 'selected' : ''}>Doctor (Licence Verification Required)</option>
          <option value="staff" ${selectedAccountType === 'staff' ? 'selected' : ''}>Hospital Staff (Administrator Approval Required)</option>
        </select>
        <span class="text-xs muted" style="display:block;margin-top:3px">Administrator accounts are provisioned only by Hospital Administration.</span>
      </div>

      <div class="field full"><label for="reg-name">Full Name</label><input id="reg-name" name="full_name" required placeholder="Full legal name" /></div>
      <div class="field"><label for="reg-email">${selectedAccountType === 'staff' || selectedAccountType === 'doctor' ? 'Work Email' : 'Email Address'}</label><input id="reg-email" name="email" type="email" required placeholder="name@example.com" /></div>
      <div class="field"><label for="reg-mobile">Mobile Number</label><input id="reg-mobile" name="mobile" required placeholder="+1-555-0199" /></div>

      <div class="field full" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="text-xs muted">Optional Email Verification (OTP)</span>
          <button type="button" class="btn btn-sm" id="reg-send-otp-btn">Send Verification Code</button>
        </div>
        <div id="reg-otp-row" style="display:none;margin-top:8px;gap:8px;align-items:center">
          <input id="reg-otp-code" placeholder="6-digit OTP code" style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px" />
          <button type="button" class="btn btn-sm btn-primary" id="reg-verify-otp-btn">Verify</button>
          <span id="reg-otp-status" class="text-xs muted"></span>
        </div>
      </div>

      ${selectedAccountType === 'patient' ? `
        <div class="field"><label for="reg-dob">Date of Birth</label><input id="reg-dob" name="dob" type="date" required value="1992-04-15" /></div>
        <div class="field"><label for="reg-gender">Gender</label><select id="reg-gender" name="gender" required><option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other</option></select></div>
        <div class="field full"><label for="reg-address">Residential Address</label><input id="reg-address" name="address" required placeholder="123 Main Street, Metro City" /></div>
        <div class="field"><label for="reg-emg-name">Emergency Contact Name</label><input id="reg-emg-name" name="emergency_contact_name" placeholder="Emergency contact name" /></div>
        <div class="field"><label for="reg-emg-phone">Emergency Contact Phone</label><input id="reg-emg-phone" name="emergency_contact_phone" placeholder="+1-555-0144" /></div>
      ` : ''}

      ${selectedAccountType === 'doctor' ? `
        <div class="field"><label for="doc-regno">Medical Registration Number</label><input id="doc-regno" name="medical_registration_number" required placeholder="e.g. MED-REG-88210" /></div>
        <div class="field"><label for="doc-council">Medical Council</label><input id="doc-council" name="medical_council" required placeholder="e.g. State Medical Council" /></div>
        <div class="field"><label for="doc-branch">Primary Branch</label>
          <select id="doc-branch" name="branch_id" required>
            ${branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="doc-dept">Department</label>
          <select id="doc-dept" name="department_id" required>
            ${depts.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="doc-spec">Specialty</label>
          <select id="doc-spec" name="specialty_id" required>
            ${specs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="doc-qual">Qualifications</label><input id="doc-qual" name="qualification" required placeholder="e.g. MBBS, MD (Cardiology)" /></div>
        <div class="field"><label for="doc-exp">Experience (Years)</label><input id="doc-exp" name="experience_years" type="number" min="0" value="5" required /></div>
        <div class="field"><label for="doc-fee">Consultation Fee ($)</label><input id="doc-fee" name="consultation_fee" type="number" min="10" value="100" required /></div>
        <div class="field"><label for="doc-photo">Profile Photo (PNG/JPG)</label><input id="doc-photo" name="photo" type="file" accept="image/png,image/jpeg" /></div>
        <div class="field"><label for="doc-licence">Medical Licence Upload (PDF/Image)</label><input id="doc-licence" name="licence" type="file" accept=".pdf,image/png,image/jpeg" required /></div>
      ` : ''}

      ${selectedAccountType === 'staff' ? `
        <div class="field full">
          <label for="sr-role">Staff Role</label>
          <select id="sr-role" name="requested_role" required>
            ${roles.map((r) => `<option value="${esc(r.code)}">${esc(r.name)}</option>`).join('')}
          </select>
        </div>
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
        <div class="field"><label for="sr-empid">Employee / Badge ID</label><input id="sr-empid" name="employee_id" placeholder="e.g. EMP-9201" /></div>
        <div class="field"><label for="sr-qual">Qualification</label><input id="sr-qual" name="qualification" placeholder="e.g. B.Sc Nursing, PharmD" /></div>
        <div class="field full">
          <label for="sr-doc-file">Hospital ID / Credential Upload (Optional - PDF or Image, max 5 MB)</label>
          <input id="sr-doc-file" name="document_file" type="file" accept=".pdf,image/*" />
        </div>
      ` : ''}

      <div class="field"><label for="reg-pass">Password (8+ chars & 1 number)</label><input id="reg-pass" name="password" type="password" required minlength="8" /></div>
      <div class="field"><label for="reg-confirm">Confirm Password</label><input id="reg-confirm" name="confirm" type="password" required minlength="8" /></div>

      ${selectedAccountType === 'patient' ? `
        <div class="field full">
          <label style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;cursor:pointer">
            <input type="checkbox" id="reg-consent" required style="margin-top:2px" />
            <span>${esc(CONSENT_TEXT)} <span class="mono text-xs muted">(${CONSENT_VERSION})</span></span>
          </label>
        </div>
      ` : ''}

      <div class="field full">
        <button type="submit" class="btn btn-primary" id="reg-submit-btn">
          ${selectedAccountType === 'patient' ? 'Create Patient Account (Instant Access)' : selectedAccountType === 'candidate' ? 'Create Candidate Account (Instant Access)' : selectedAccountType === 'doctor' ? 'Submit Doctor Verification Request' : 'Submit Staff Registration for Approval'}
        </button>
      </div>
    </form>
  `;
}

export function bindUnifiedRegisterEvents(root, { onAccountTypeChange }) {
  const iamSel = root.querySelector('#reg-iam');
  if (iamSel) {
    iamSel.onchange = () => onAccountTypeChange(iamSel.value);
  }

  let otpVerified = false;
  const sendOtpBtn = root.querySelector('#reg-send-otp-btn');
  const otpRow = root.querySelector('#reg-otp-row');
  const otpStatus = root.querySelector('#reg-otp-status');
  const verifyOtpBtn = root.querySelector('#reg-verify-otp-btn');

  if (sendOtpBtn) {
    sendOtpBtn.onclick = async () => {
      const email = root.querySelector('#reg-email')?.value?.trim();
      if (!email) { toast('Email Required', 'Enter your email address first.', 'danger'); return; }
      try {
        const res = await api.post('/api/auth/send-otp', { channel: 'email', target: email, purpose: 'signup' });
        otpRow.style.display = 'flex';
        otpStatus.textContent = res.sandboxCode ? `Dev OTP: ${res.sandboxCode}` : 'Code sent to email';
        toast('OTP Sent', 'Check your inbox for the 6-digit verification code.', 'success');
      } catch (err) {
        toast('OTP Error', err.message, 'danger');
      }
    };
  }
  if (verifyOtpBtn) {
    verifyOtpBtn.onclick = async () => {
      const email = root.querySelector('#reg-email')?.value?.trim();
      const code = root.querySelector('#reg-otp-code')?.value?.trim();
      if (!email || !code) return;
      try {
        await api.post('/api/auth/verify-otp', { channel: 'email', target: email, code, purpose: 'signup' });
        otpVerified = true;
        otpStatus.textContent = 'Verified';
        otpStatus.style.color = 'var(--success)';
        toast('Verified', 'Email address confirmed.', 'success');
      } catch (err) {
        otpStatus.textContent = err.message;
        otpStatus.style.color = 'var(--danger)';
      }
    };
  }

  const form = root.querySelector('#unified-register-form');
  const errBox = root.querySelector('#auth-error');
  const okBanner = root.querySelector('#signup-pending-banner');
  const submitBtn = root.querySelector('#reg-submit-btn');

  form.onsubmit = async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    okBanner.style.display = 'none';

    const fd = new FormData(form);
    const password = String(fd.get('password') || '');
    if (password !== String(fd.get('confirm') || '')) {
      errBox.textContent = 'Passwords do not match.';
      errBox.style.display = 'block';
      return;
    }
    if (!/\d/.test(password) || password.length < 8) {
      errBox.textContent = 'Password must be at least 8 characters and include a number.';
      errBox.style.display = 'block';
      return;
    }

    const accType = String(fd.get('account_type') || 'patient');
    if (accType === 'patient') {
      const consentEl = root.querySelector('#reg-consent');
      fd.set('consent', consentEl?.checked ? 'true' : 'false');
      fd.set('consent_text', CONSENT_TEXT);
      fd.set('consent_version', CONSENT_VERSION);
    }
    if (otpVerified) fd.set('otp_verified', 'true');

    submitBtn.disabled = true;
    try {
      const hasFile = Array.from(form.querySelectorAll('input[type="file"]')).some((el) => el.files && el.files.length > 0);
      const bodyToSend = hasFile ? fd : Object.fromEntries(fd.entries());
      if (!hasFile && accType === 'patient') {
        bodyToSend.consent = root.querySelector('#reg-consent')?.checked || false;
        bodyToSend.consent_text = CONSENT_TEXT;
        bodyToSend.consent_version = CONSENT_VERSION;
      }

      const res = await api.post('/api/auth/register', bodyToSend);
      if (res.pendingApproval || res.pendingVerification) {
        okBanner.innerHTML = `
          <strong>${res.pendingVerification ? 'Verification Submitted!' : 'Registration Submitted!'}</strong><br />
          ${esc(res.message)}
        `;
        okBanner.style.display = 'block';
        form.reset();
        toast('Submitted', res.pendingVerification ? 'Awaiting medical licence verification.' : 'Awaiting administrator approval.', 'success');
        return;
      }

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

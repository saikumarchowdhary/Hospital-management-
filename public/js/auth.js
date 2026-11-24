import { api } from './api.js';
import {
  bindPatientRegisterEvents, bindStaffRegisterEvents,
  renderPatientRegisterForm, renderStaffRegisterForm
} from './auth_register.js';
import { LOGIN_PORTALS } from './demo-portals.js';
import { bindDemoAccountsEvents, renderDemoAccountsPanel } from './demo_accounts_view.js';
import { clearFirstFailedRequestError, setAuthSession } from './session.js';
import { closeModal, esc, openModal, renderErrorLogBanner, toast } from './ui.js';

export async function renderAuthScreen(root) {
  let demoAccounts = [];
  let demoGroups = [];
  let demoVisible = true;
  let doctorSearch = '';
  let regMeta = { staffRoles: [], departments: [], branches: [], specialties: [] };
  try {
    const [demoRes, metaRes] = await Promise.all([
      api.get('/api/demo-accounts'),
      api.get('/api/auth/registration-meta')
    ]);
    demoAccounts = demoRes.accounts || [];
    demoGroups = demoRes.groups || [];
    demoVisible = demoRes.visible !== false;
    regMeta = metaRes || regMeta;
  } catch {
    demoAccounts = [];
    demoGroups = [];
    demoVisible = true;
  }

  let mode = 'login';
  let selectedRole = 'patient';

  function draw() {
    const portalMeta = LOGIN_PORTALS.find((p) => p.role === selectedRole) || {
      role: selectedRole,
      title: selectedRole.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      subtitle: 'Portal workspace access'
    };

    root.innerHTML = `
      <div id="request-error-log-slot"></div>
      <div class="auth-layout">
        <div class="card" style="padding:24px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <img src="/assets/icon.svg" alt="MediCore HMS" style="width:36px;height:36px;border-radius:8px" />
            <div>
              <h1>MediCore HMS</h1>
              <p class="text-sm muted">Role-Based Hospital & Clinical Operations Portal</p>
            </div>
          </div>

          <div class="tabs" style="width:100%;display:grid;grid-template-columns:1fr 1fr 1fr;margin-bottom:16px">
            <button class="tab-btn ${mode === 'login' ? 'active' : ''}" id="tab-login">Role Login</button>
            <button class="tab-btn ${mode === 'register' ? 'active' : ''}" id="tab-register">Patient Signup</button>
            <button class="tab-btn ${mode === 'staff' ? 'active' : ''}" id="tab-staff">Staff Request</button>
          </div>

          <div id="auth-error" class="alert-banner error" style="display:none;margin-bottom:14px"></div>
          ${mode === 'login' ? renderLoginForm(portalMeta, selectedRole) : mode === 'register' ? renderPatientRegisterForm() : renderStaffRegisterForm(regMeta)}
        </div>

        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card">
            <div class="card-header">
              <div>
                <h2>Select Hospital Login Portal (15 Departments)</h2>
                <p class="text-sm muted">Choose your department or patient portal, then sign in with Email or Employee/Patient ID.</p>
              </div>
            </div>
            <div class="demo-grid" style="grid-template-columns:repeat(auto-fill,minmax(175px,1fr))">
              ${LOGIN_PORTALS.map((p, idx) => `
                <button type="button" class="demo-card portal-pick-btn" data-role="${esc(p.role)}"
                  style="${selectedRole === p.role && mode === 'login' ? 'border-color:var(--primary);background:var(--primary-soft)' : ''}">
                  <div class="text-xs muted tabular">#${idx + 1}</div>
                  <div style="font-weight:600;color:var(--text)">${esc(p.title)}</div>
                  <div class="text-xs muted">${esc(p.subtitle)}</div>
                </button>
              `).join('')}
            </div>
          </div>

          ${demoVisible ? renderDemoAccountsPanel(demoGroups, doctorSearch) : ''}
        </div>
      </div>
    `;

    root.querySelector('#tab-login').onclick = () => { mode = 'login'; draw(); };
    root.querySelector('#tab-register').onclick = () => { mode = 'register'; draw(); };
    root.querySelector('#tab-staff').onclick = () => { mode = 'staff'; draw(); };

    root.querySelectorAll('.portal-pick-btn').forEach((btn) => {
      btn.onclick = () => {
        selectedRole = btn.dataset.role;
        mode = 'login';
        draw();
        const match = demoAccounts.find((a) => a.role === selectedRole);
        if (match) root.querySelector('#login-identifier').value = match.email;
      };
    });

    if (mode === 'login') bindLoginEvents(root);
    else if (mode === 'register') bindPatientRegisterEvents(root);
    else bindStaffRegisterEvents(root);

    if (demoVisible) {
      bindDemoAccountsEvents(root, (role, email, pass) => {
        selectedRole = role;
        mode = 'login';
        draw();
        root.querySelector('#login-identifier').value = email;
        root.querySelector('#login-password').value = pass;
        toast('Demo Account Selected', `${email} (${role.replace(/_/g, ' ')})`);
      }, (term) => {
        doctorSearch = term;
        const panelSlot = root.querySelector('#demo-accounts-card');
        if (panelSlot) {
          const temp = document.createElement('div');
          temp.innerHTML = renderDemoAccountsPanel(demoGroups, doctorSearch);
          panelSlot.replaceWith(temp.firstElementChild);
          bindDemoAccountsEvents(root, (role, email, pass) => {
            selectedRole = role;
            mode = 'login';
            draw();
            root.querySelector('#login-identifier').value = email;
            root.querySelector('#login-password').value = pass;
            toast('Demo Account Selected', `${email} (${role.replace(/_/g, ' ')})`);
          }, (newTerm) => {
            doctorSearch = newTerm;
            draw();
          });
          const newSearch = root.querySelector('#doctor-demo-search');
          if (newSearch) {
            newSearch.focus();
            newSearch.selectionStart = newSearch.selectionEnd = newSearch.value.length;
          }
        }
      });
    }
    renderErrorLogBanner();
  }

  draw();
}

function renderLoginForm(portalMeta, selectedRole) {
  return `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px">
      <div class="text-xs muted">Active Login Flow</div>
      <strong style="font-size:15px">${esc(portalMeta.title)}</strong>
      <div class="text-xs muted">${esc(portalMeta.subtitle)}</div>
    </div>
    <form id="login-form" style="display:flex;flex-direction:column;gap:14px">
      <div class="field">
        <label for="login-role">Portal Role</label>
        <select id="login-role" name="expected_role">
          ${LOGIN_PORTALS.map((p) => `<option value="${esc(p.role)}" ${selectedRole === p.role ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}
          <option value="external_coordinator" ${selectedRole === 'external_coordinator' ? 'selected' : ''}>External Coordinator</option>
          <option value="candidate" ${selectedRole === 'candidate' ? 'selected' : ''}>Careers / Candidate</option>
        </select>
      </div>
      <div class="field">
        <label for="login-identifier">Email or Employee / Patient ID</label>
        <input id="login-identifier" name="identifier" required placeholder="e.g. patient@demo.com or DOC-2001" autocomplete="username" />
      </div>
      <div class="field">
        <label for="login-password">Password</label>
        <div class="input-row">
          <input id="login-password" name="password" type="password" required placeholder="Enter password" autocomplete="current-password" />
          <button type="button" class="toggle-eye" id="toggle-pass-btn">Show</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="login-remember" checked /> Remember session (7 days)
        </label>
        <button type="button" id="forgot-pass-btn" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:13px;padding:0">Forgot password?</button>
      </div>
      <button type="submit" class="btn btn-primary" id="login-submit-btn">Sign In to ${esc(portalMeta.title)}</button>
    </form>
  `;
}

function bindLoginEvents(root) {
  const passInput = root.querySelector('#login-password');
  const toggleBtn = root.querySelector('#toggle-pass-btn');
  toggleBtn.onclick = () => {
    const isPwd = passInput.type === 'password';
    passInput.type = isPwd ? 'text' : 'password';
    toggleBtn.textContent = isPwd ? 'Hide' : 'Show';
  };
  root.querySelector('#forgot-pass-btn').onclick = () => openForgotModal();

  const form = root.querySelector('#login-form');
  const errBox = root.querySelector('#auth-error');
  const submitBtn = root.querySelector('#login-submit-btn');

  form.onsubmit = async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    submitBtn.disabled = true;
    try {
      const res = await api.post('/api/auth/login', {
        identifier: root.querySelector('#login-identifier').value.trim(),
        password: passInput.value,
        expected_role: root.querySelector('#login-role').value,
        remember: root.querySelector('#login-remember').checked
      });
      if (!(res.token || res.accessToken)) {
        throw new Error('Login succeeded but no access token was returned by server.');
      }
      clearFirstFailedRequestError();
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

function openForgotModal() {
  openModal('Reset Password (Local Demo)', `
    <form id="forgot-form" style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label for="fp-email">Account Email</label><input id="fp-email" type="email" required /></div>
      <button type="submit" class="btn btn-primary btn-sm">Generate Demo Reset Code</button>
    </form>
    <div id="fp-stage2" style="display:none;margin-top:16px">
      <div id="fp-code-banner" class="alert-banner success" style="margin-bottom:12px"></div>
      <form id="reset-form" style="display:flex;flex-direction:column;gap:12px">
        <div class="field"><label for="rp-code">Reset Code</label><input id="rp-code" required /></div>
        <div class="field"><label for="rp-pass">New Password (8+ chars, 1 number)</label><input id="rp-pass" type="password" required /></div>
        <button type="submit" class="btn btn-primary btn-sm">Update Password</button>
      </form>
    </div>
  `, (body) => {
    body.querySelector('#forgot-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = body.querySelector('#fp-email').value.trim();
      const res = await api.post('/api/auth/forgot-password', { email });
      body.querySelector('#fp-stage2').style.display = 'block';
      body.querySelector('#fp-code-banner').textContent = res.demoResetCode ? `Local Demo Reset Code: ${res.demoResetCode}` : res.message;
      body.querySelector('#reset-form').onsubmit = async (ev) => {
        ev.preventDefault();
        try {
          await api.post('/api/auth/reset-password', { email, code: body.querySelector('#rp-code').value.trim(), new_password: body.querySelector('#rp-pass').value });
          toast('Password Reset', 'You can now log in with your new password.', 'success');
          closeModal();
        } catch (err) { toast('Reset Failed', err.message, 'danger'); }
      };
    };
  });
}

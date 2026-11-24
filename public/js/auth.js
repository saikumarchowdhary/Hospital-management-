import { api } from './api.js';
import { bindUnifiedRegisterEvents, renderUnifiedRegisterForm } from './auth_register.js';
import { bindDemoAccountsEvents, renderDemoAccountsPanel } from './demo_accounts_view.js';
import { clearFirstFailedRequestError, setAuthSession } from './session.js';
import { closeModal, esc, openModal, renderErrorLogBanner, toast } from './ui.js';

export async function renderAuthScreen(root) {
  let demoGroups = [];
  let demoVisible = false;
  let needsSetup = false;
  let doctorSearch = '';
  let regMeta = { staffRoles: [], departments: [], branches: [], specialties: [] };
  try {
    const [setupRes, demoRes, metaRes] = await Promise.all([
      api.get('/api/auth/setup-status'),
      api.get('/api/demo-accounts'),
      api.get('/api/auth/registration-meta')
    ]);
    needsSetup = Boolean(setupRes?.needsSetup);
    demoGroups = demoRes.groups || [];
    demoVisible = demoRes.visible === true;
    regMeta = metaRes || regMeta;
  } catch {
    demoGroups = [];
    demoVisible = false;
    needsSetup = false;
  }

  if (needsSetup) {
    renderFirstRunSetupScreen(root);
    return;
  }

  let mode = 'login';
  let signupAccountType = 'patient';

  function draw() {
    root.innerHTML = `
      <div id="request-error-log-slot"></div>
      <div class="${demoVisible ? 'auth-layout' : 'auth-single'}" style="${demoVisible ? '' : 'max-width:560px;margin:40px auto;padding:0 16px'}">
        <div class="card" style="padding:24px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <img src="/assets/icon.svg" alt="MediCore HMS" style="width:36px;height:36px;border-radius:8px" />
            <div>
              <h1>MediCore HMS</h1>
              <p class="text-sm muted">Multi-User Hospital & Clinical Portal</p>
            </div>
          </div>

          <div class="tabs" style="width:100%;display:grid;grid-template-columns:1fr 1fr;margin-bottom:16px">
            <button class="tab-btn ${mode === 'login' ? 'active' : ''}" id="tab-login">Sign In</button>
            <button class="tab-btn ${mode === 'register' ? 'active' : ''}" id="tab-register">Create Account</button>
          </div>

          <div id="auth-error" class="alert-banner error" style="display:none;margin-bottom:14px"></div>
          ${mode === 'login' ? renderLoginForm() : renderUnifiedRegisterForm(regMeta, signupAccountType)}
        </div>

        ${demoVisible ? `
          <div style="display:flex;flex-direction:column;gap:18px">
            ${renderDemoAccountsPanel(demoGroups, doctorSearch)}
          </div>
        ` : ''}
      </div>
    `;

    root.querySelector('#tab-login').onclick = () => { mode = 'login'; draw(); };
    root.querySelector('#tab-register').onclick = () => { mode = 'register'; draw(); };

    if (mode === 'login') {
      bindLoginEvents(root);
    } else {
      bindUnifiedRegisterEvents(root, {
        onAccountTypeChange: (nextType) => {
          signupAccountType = nextType;
          draw();
        }
      });
    }

    if (demoVisible) {
      const fillDemo = (role, email, pass) => {
        mode = 'login';
        draw();
        root.querySelector('#login-identifier').value = email;
        root.querySelector('#login-password').value = pass;
        toast('Demo Account Selected', `${email} (${role.replace(/_/g, ' ')})`);
      };
      bindDemoAccountsEvents(root, fillDemo, (term) => {
        doctorSearch = term;
        const panelSlot = root.querySelector('#demo-accounts-card');
        if (panelSlot) {
          const temp = document.createElement('div');
          temp.innerHTML = renderDemoAccountsPanel(demoGroups, doctorSearch);
          panelSlot.replaceWith(temp.firstElementChild);
          bindDemoAccountsEvents(root, fillDemo, (newTerm) => {
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

function renderLoginForm() {
  return `
    <form id="login-form" style="display:flex;flex-direction:column;gap:14px">
      <div class="field">
        <label for="login-identifier">Email or Employee / Patient ID</label>
        <input id="login-identifier" name="identifier" required placeholder="Enter email address or user ID" autocomplete="username" />
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
      <button type="submit" class="btn btn-primary" id="login-submit-btn">Sign In</button>
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
  openModal('Reset Password', `
    <form id="forgot-form" style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label for="fp-email">Account Email</label><input id="fp-email" type="email" required placeholder="Enter your registered email" /></div>
      <button type="submit" class="btn btn-primary btn-sm">Send Reset Instructions</button>
    </form>
    <div id="fp-stage2" style="display:none;margin-top:16px">
      <div id="fp-code-banner" class="alert-banner success" style="margin-bottom:12px"></div>
      <form id="reset-form" style="display:flex;flex-direction:column;gap:12px">
        <div class="field"><label for="rp-code">Reset Code</label><input id="rp-code" required /></div>
        <div class="field"><label for="rp-pass">New Password (8+ chars, 1 number)</label><input id="rp-pass" type="password" required minlength="8" /></div>
        <button type="submit" class="btn btn-primary btn-sm">Update Password</button>
      </form>
    </div>
  `, (body) => {
    let targetEmail = '';
    body.querySelector('#forgot-form').onsubmit = async (e) => {
      e.preventDefault();
      targetEmail = body.querySelector('#fp-email').value.trim();
      const res = await api.post('/api/auth/forgot-password', { email: targetEmail });
      body.querySelector('#fp-stage2').style.display = 'block';
      body.querySelector('#fp-code-banner').textContent = res.demoResetCode
        ? `${res.message} Code: ${res.demoResetCode}`
        : res.message;
    };
    body.querySelector('#reset-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/auth/reset-password', {
          email: targetEmail,
          code: body.querySelector('#rp-code').value.trim(),
          new_password: body.querySelector('#rp-pass').value
        });
        toast('Password Reset', 'Sign in with your new password.', 'success');
        closeModal();
      } catch (err) {
        toast('Reset Failed', err.message, 'danger');
      }
    };
  });
}

function renderFirstRunSetupScreen(root) {
  root.innerHTML = `
    <div id="request-error-log-slot"></div>
    <div style="max-width:520px;margin:48px auto;padding:0 16px">
      <div class="card" style="padding:28px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <img src="/assets/icon.svg" alt="MediCore HMS" style="width:40px;height:40px;border-radius:8px" />
          <div>
            <h1>First-Run Hospital Setup</h1>
            <p class="text-sm muted">Create the initial Administrator account to initialize MediCore HMS.</p>
          </div>
        </div>
        <div id="setup-error" class="alert-banner error" style="display:none;margin-bottom:14px"></div>
        <form id="first-run-setup-form" class="form-grid">
          <div class="field full"><label for="su-name">Administrator Full Name</label><input id="su-name" name="full_name" required placeholder="e.g. Dr. Arthur Vance" /></div>
          <div class="field full"><label for="su-email">Administrator Email</label><input id="su-email" name="email" type="email" required placeholder="admin@hospital.org" /></div>
          <div class="field full"><label for="su-mobile">Mobile Number (Optional)</label><input id="su-mobile" name="mobile" placeholder="+1-555-0100" /></div>
          <div class="field"><label for="su-pass">Password (8+ chars & 1 number)</label><input id="su-pass" name="password" type="password" required minlength="8" /></div>
          <div class="field"><label for="su-confirm">Confirm Password</label><input id="su-confirm" name="confirm" type="password" required minlength="8" /></div>
          <div class="field full"><button type="submit" class="btn btn-primary" id="su-submit-btn">Create Administrator & Enter Workspace</button></div>
        </form>
      </div>
    </div>
  `;

  const form = root.querySelector('#first-run-setup-form');
  const errBox = root.querySelector('#setup-error');
  const btn = root.querySelector('#su-submit-btn');

  form.onsubmit = async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    const fd = new FormData(form);
    const password = String(fd.get('password') || '');
    if (password !== String(fd.get('confirm') || '')) {
      errBox.textContent = 'Passwords do not match.';
      errBox.style.display = 'block';
      return;
    }
    btn.disabled = true;
    try {
      const res = await api.post('/api/auth/setup-admin', {
        full_name: fd.get('full_name'),
        email: fd.get('email'),
        mobile: fd.get('mobile'),
        password
      });
      clearFirstFailedRequestError();
      toast('Administrator Created', 'Welcome to MediCore HMS.', 'success');
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
      btn.disabled = false;
    }
  };
  renderErrorLogBanner();
}

import { api } from './api.js';
import { renderAuthScreen } from './auth.js';
import { connectEvents, disconnectEvents, onStreamStatus, subscribeEvent } from './events.js';
import { bindInstallButtons, initPWA, renderInstallButton } from './pwa.js';
import { dispatchRoute, getDefaultRoute, getNavForRole, parseHash } from './router.js';
import {
  clearAuthSession, clearFirstFailedRequestError, getAccessToken,
  getRefreshToken, getSession, onAuthStateChange, setAuthSession, waitForSession
} from './session.js';
import { errorState, esc, fmtDate, icon, renderErrorLogBanner, toast } from './ui.js';

const root = document.getElementById('app');
let currentUser = null;
let sidebarCollapsed = false;
let mobileMenuOpen = false;
let notifOpen = false;
let notifications = [];
let unreadCount = 0;
let liveRefreshTimer = null;

function navigate(route) {
  mobileMenuOpen = false;
  notifOpen = false;
  window.location.hash = `#${route}`;
}

async function refreshNotifications() {
  if (!currentUser || !getAccessToken()) return;
  try {
    const res = await api.get('/api/notifications');
    notifications = res.items || res.notifications || [];
    unreadCount = res.unreadCount || 0;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = String(unreadCount);
      badge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
    }
    const listEl = document.getElementById('notif-list-body');
    if (listEl && notifOpen) listEl.innerHTML = renderNotifList();
  } catch {
    // exact first error already recorded by api.js
  }
}

function renderNotifList() {
  if (!notifications.length) return '<div class="text-sm muted" style="padding:12px">No notifications yet.</div>';
  return notifications.slice(0, 15).map((n) => `
    <div class="list-row" style="${n.is_read ? 'opacity:0.7' : 'font-weight:500'}">
      <div style="min-width:0">
        <div class="text-sm">${esc(n.title)}</div>
        <div class="text-xs muted">${esc(n.message)}</div>
        <div class="text-xs muted tabular" style="margin-top:2px">${fmtDate(n.created_at)}</div>
      </div>
      ${!n.is_read ? `<button class="btn btn-sm notif-read-btn" data-id="${n.id}">Read</button>` : ''}
    </div>
  `).join('');
}

function renderShell() {
  const nav = getNavForRole(currentUser.role);
  const { route } = parseHash();

  if (nav.isPatient) {
    root.innerHTML = `
      <div class="patient-shell">
        <header class="patient-topbar">
          <div class="brand">
            <img src="/assets/icon.svg" alt="CareLine" />
            <span>CareLine</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;position:relative">
            <span id="sse-pill" class="status status-neutral">Connecting</span>
            ${renderInstallButton()}
            <button type="button" class="btn btn-icon" id="notif-bell-btn" aria-label="Notifications" style="position:relative">
              ${icon.bell}
              <span id="notif-badge" class="status status-danger" style="position:absolute;top:-4px;right:-4px;padding:0 5px;font-size:10px;display:${unreadCount ? 'inline-flex' : 'none'}">${unreadCount}</span>
            </button>
          </div>
        </header>
        <div id="notif-popover-slot"></div>
        <div id="request-error-log-slot"></div>
        <main class="patient-main" id="page-content"></main>
        <nav class="bottom-nav" aria-label="Patient Navigation">
          ${nav.bottomNav.map((b) => `
            <button type="button" class="bottom-nav-btn ${route === b.route ? 'active' : ''}" data-route="${b.route}">
              ${icon[b.iconKey] || icon.home}
              <span>${esc(b.label)}</span>
            </button>
          `).join('')}
        </nav>
      </div>
    `;
  } else {
    root.innerHTML = `
      <div class="shell">
        <aside class="sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}" id="app-sidebar">
          <div class="sidebar-head">
            <div class="brand">
              <img src="/assets/icon.svg" alt="CareLine" />
              <span class="brand-text">CareLine HMS</span>
            </div>
            <button type="button" class="btn btn-icon btn-sm" id="collapse-sidebar-btn" title="Toggle sidebar">${icon.menu}</button>
          </div>
          <nav class="sidebar-nav" aria-label="Hospital Staff Navigation">
            ${nav.sections.map((sec) => `
              <div class="nav-section-title">${esc(sec.title)}</div>
              ${sec.items.map((item) => `
                <button type="button" class="nav-item ${route === item.route ? 'active' : ''}" data-route="${item.route}">
                  ${icon[item.iconKey] || icon.file}
                  <span class="nav-label">${esc(item.label)}</span>
                </button>
              `).join('')}
            `).join('')}
          </nav>
        </aside>
        <div class="main-area">
          <header class="topbar">
            <div class="topbar-left">
              <button type="button" class="btn btn-icon mobile-only" id="mobile-menu-btn" aria-label="Menu">${icon.menu}</button>
              <div class="search-box">
                ${icon.search}
                <input id="topbar-quick-jump" placeholder="Jump to module (e.g. lab, pharmacy, beds)..." />
              </div>
            </div>
            <div class="topbar-right" style="position:relative">
              <span id="sse-pill" class="status status-neutral">Connecting</span>
              ${renderInstallButton()}
              <button type="button" class="btn btn-icon" id="notif-bell-btn" aria-label="Notifications" style="position:relative">
                ${icon.bell}
                <span id="notif-badge" class="status status-danger" style="position:absolute;top:-4px;right:-4px;padding:0 5px;font-size:10px;display:${unreadCount ? 'inline-flex' : 'none'}">${unreadCount}</span>
              </button>
              <button type="button" class="btn btn-sm" data-route="profile">${esc(currentUser.full_name)} · <span class="text-xs muted">${esc(currentUser.role_name || currentUser.role)}${currentUser.department_name ? ` (${esc(currentUser.department_name)})` : ''}</span></button>
              <button type="button" class="btn btn-sm" id="topbar-logout-btn">Sign Out</button>
            </div>
          </header>
          <div id="notif-popover-slot"></div>
          <div id="request-error-log-slot"></div>
          <main class="content-wrap" id="page-content"></main>
        </div>
      </div>
    `;
  }

  bindShellEvents(nav);
  renderErrorLogBanner();
}

function bindShellEvents(nav) {
  bindInstallButtons(root);
  root.querySelectorAll('[data-route]').forEach((btn) => { btn.onclick = () => navigate(btn.dataset.route); });

  const collapseBtn = document.getElementById('collapse-sidebar-btn');
  if (collapseBtn) {
    collapseBtn.onclick = () => {
      sidebarCollapsed = !sidebarCollapsed;
      document.getElementById('app-sidebar')?.classList.toggle('collapsed', sidebarCollapsed);
    };
  }

  const mobBtn = document.getElementById('mobile-menu-btn');
  if (mobBtn) {
    mobBtn.onclick = () => {
      mobileMenuOpen = !mobileMenuOpen;
      document.getElementById('app-sidebar')?.classList.toggle('mobile-open', mobileMenuOpen);
    };
  }

  const jumpInput = document.getElementById('topbar-quick-jump');
  if (jumpInput) {
    const items = nav.sections.flatMap((s) => s.items);
    jumpInput.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      const q = jumpInput.value.trim().toLowerCase();
      const match = items.find((i) => i.label.toLowerCase().includes(q) || i.route.toLowerCase().includes(q));
      if (match) { jumpInput.value = ''; navigate(match.route); }
      else toast('No matching module', 'Try another authorized module name.', 'info');
    };
  }

  const logoutBtn = document.getElementById('topbar-logout-btn');
  if (logoutBtn) logoutBtn.onclick = handleLogout;

  const bellBtn = document.getElementById('notif-bell-btn');
  if (bellBtn) {
    const slot = document.getElementById('notif-popover-slot');
    slot.onclick = async (e) => {
      if (e.target.id === 'mark-all-read-btn') { await api.post('/api/notifications/read-all', {}); await refreshNotifications(); }
      else if (e.target.classList.contains('notif-read-btn')) { await api.post(`/api/notifications/${e.target.dataset.id}/read`, {}); await refreshNotifications(); }
    };
    bellBtn.onclick = async () => {
      notifOpen = !notifOpen;
      if (!notifOpen) { slot.innerHTML = ''; return; }
      await refreshNotifications();
      slot.innerHTML = `<div class="notif-popover"><div class="card-header" style="margin-bottom:8px"><strong>Notifications</strong><button type="button" class="btn btn-sm" id="mark-all-read-btn">Mark All Read</button></div><div id="notif-list-body">${renderNotifList()}</div></div>`;
    };
  }

  onStreamStatus((state) => {
    const pill = document.getElementById('sse-pill');
    if (!pill) return;
    pill.textContent = state;
    pill.className = `status ${state === 'Live' ? 'status-success' : state === 'Reconnecting' ? 'status-warning' : 'status-neutral'}`;
  });
}

async function handleLogout() {
  try { await api.post('/api/auth/logout', {}); } catch { /* ignore */ }
  clearFirstFailedRequestError();
  clearAuthSession(true);
}

function updateActiveNavHighlight() {
  const { route } = parseHash();
  root.querySelectorAll('[data-route]').forEach((el) => el.classList.toggle('active', el.dataset.route === route));
}

async function renderCurrentRoute() {
  if (!currentUser) return;
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;
  updateActiveNavHighlight();
  try {
    await dispatchRoute(pageContent, currentUser, navigate, handleLogout);
  } catch (err) {
    pageContent.innerHTML = errorState(err?.message || 'Unable to render page.');
  }
  const retryBtn = pageContent.querySelector('#retry-load-btn');
  if (retryBtn && !retryBtn.onclick) {
    retryBtn.onclick = () => renderCurrentRoute();
  }
}

async function handleSignedInSession() {
  const session = await waitForSession();
  currentUser = session.user;
  const { route } = parseHash();
  if (!route) window.location.hash = `#${getDefaultRoute(currentUser.role)}`;
  renderShell();
  connectEvents();
  await refreshNotifications();
  await renderCurrentRoute();
}

async function bootstrap() {
  initPWA();
  window.addEventListener('medicore:request-error', () => renderErrorLogBanner());

  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      await handleSignedInSession();
    } else if (event === 'TOKEN_REFRESHED') {
      if (session?.user) currentUser = session.user;
      if (currentUser) connectEvents();
    } else if (event === 'SIGNED_OUT') {
      disconnectEvents();
      currentUser = null;
      window.location.hash = '';
      renderAuthScreen(root);
    }
  });

  subscribeEvent((evType) => {
    refreshNotifications();
    const liveRoutes = new Set([
      'appointment:created', 'appointment:updated', 'patient:checked_in',
      'lab:ordered', 'lab:released', 'radiology:ordered', 'radiology:released',
      'prescription:created', 'pharmacy:dispensed', 'invoice:created', 'payment:updated',
      'admission:created', 'admission:discharged', 'bed:allocated', 'bed:released',
      'vitals:recorded', 'treatment:updated', 'member:registered', 'member:updated',
      'housekeeping:updated', 'notice:published', 'recruitment:updated'
    ]);
    if (!currentUser || !liveRoutes.has(evType) || document.querySelector('.modal-backdrop')) return;
    const tag = document.activeElement?.tagName;
    if (tag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    clearTimeout(liveRefreshTimer);
    liveRefreshTimer = setTimeout(() => {
      if (currentUser && !document.querySelector('.modal-backdrop')) renderCurrentRoute();
    }, 350);
  });

  window.addEventListener('hashchange', () => { if (currentUser) renderCurrentRoute(); });
  const hasStoredSession = Boolean(getAccessToken() || getRefreshToken());
  try {
    const res = await api.get('/api/auth/me', { suppressErrorLog: !hasStoredSession });
    setAuthSession({ user: res.user, token: getAccessToken(), refreshToken: getRefreshToken(), expiresAt: getSession()?.expiresAt }, 'SIGNED_IN');
  } catch {
    clearAuthSession(false);
    renderAuthScreen(root);
  }
}

bootstrap();

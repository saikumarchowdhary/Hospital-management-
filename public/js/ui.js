import { clearFirstFailedRequestError, getFirstFailedRequestError, getRefreshRetryStatus } from './session.js';

export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderErrorLogBanner(slotId = 'request-error-log-slot') {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const err = getFirstFailedRequestError();
  if (!err) { slot.innerHTML = ''; return; }
  const detail = `${err.method} ${err.path} (${err.status || 'NET'}): ${err.message}${err.refreshError ? ` | Refresh: ${err.refreshError}` : ''}`;
  slot.innerHTML = `
    <div class="alert-banner error" style="margin:10px 16px 0;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12.5px">
      <div style="min-width:0"><strong>First Failed Request Error:</strong> <span class="mono" style="word-break:break-word">${esc(detail)}</span></div>
      <button type="button" class="btn btn-sm" id="dismiss-first-err-btn" style="flex-shrink:0">Dismiss</button>
    </div>
  `;
  slot.querySelector('#dismiss-first-err-btn').onclick = () => clearFirstFailedRequestError();
}

export function fmtMoney(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export function fmtDate(d) {
  if (!d) return '—';
  return String(d).slice(0, 16).replace('T', ' ');
}

export function statusBadge(status) {
  const s = String(status || 'Unknown');
  const map = {
    Confirmed: 'info', Booked: 'info', Ordered: 'info', Scheduled: 'info', Requested: 'info', Submitted: 'info', Assigned: 'info',
    'Checked In': 'warning', 'In Consultation': 'warning', Processing: 'warning', 'Awaiting Review': 'warning',
    'Pending Approval': 'warning', 'Discharge Pending': 'warning', 'Awaiting Inspection': 'warning', Pending: 'warning',
    Cleaning: 'warning', 'In Progress': 'warning', 'Query Raised': 'warning', Delayed: 'warning', Reserved: 'warning', Busy: 'warning',
    Completed: 'success', Released: 'success', Paid: 'success', Available: 'success', Active: 'success', Published: 'success',
    Approved: 'success', Dispensed: 'success', Settled: 'success', Fulfilled: 'success', Closed: 'success', Joined: 'success',
    Passed: 'success', 'Checked Out': 'success', Admitted: 'info', 'Active Care': 'info', Occupied: 'info',
    Cancelled: 'danger', Rejected: 'danger', Failed: 'danger', 'No Show': 'danger', Maintenance: 'danger', 'In Surgery': 'danger', Suspended: 'danger',
    Refunded: 'neutral', Discharged: 'neutral', Draft: 'neutral', Issued: 'info', 'On Leave': 'neutral'
  };
  const cls = map[s] || 'neutral';
  return `<span class="status status-${cls}">${esc(s)}</span>`;
}

export function toast(title, message = '', type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `
    <div>
      <div style="font-weight:600;color:${type === 'danger' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--text)'}">${esc(title)}</div>
      ${message ? `<div class="text-sm muted" style="margin-top:2px">${esc(message)}</div>` : ''}
    </div>
    <button class="btn btn-sm" aria-label="Dismiss" style="min-height:26px;padding:2px 8px">×</button>
  `;
  el.querySelector('button').onclick = () => el.remove();
  root.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

export function openModal(title, bodyHtml, onMount) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-card">
        <div class="card-header">
          <h2>${esc(title)}</h2>
          <button class="btn btn-sm" id="modal-close-btn">Close</button>
        </div>
        <div id="modal-body">${bodyHtml}</div>
      </div>
    </div>
  `;
  root.querySelector('#modal-close-btn').onclick = closeModal;
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  };
  if (onMount) onMount(root.querySelector('#modal-body'));
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

export function skeletonBlock(rows = 4) {
  return `<div class="card" style="display:flex;flex-direction:column;gap:12px">${Array.from({ length: rows }, () => '<div class="skeleton"></div>').join('')}</div>`;
}

export function emptyState(title, desc, actionHtml = '') {
  return `
    <div class="card" style="text-align:center;padding:34px 20px">
      <h3>${esc(title)}</h3>
      <p class="muted text-sm" style="margin:6px auto 14px;max-width:420px">${esc(desc)}</p>
      ${actionHtml}
    </div>
  `;
}

export function errorState(message, onRetryId = 'retry-load-btn') {
  const firstErr = getFirstFailedRequestError();
  const refreshStatus = getRefreshRetryStatus();
  const exactLine = firstErr
    ? `${firstErr.method} ${firstErr.path} (${firstErr.status || 'NET'}): ${firstErr.message}${firstErr.refreshError ? ` | Refresh error: ${firstErr.refreshError}` : ''}`
    : message;
  const retryNote = refreshStatus?.attempted
    ? (refreshStatus.succeeded ? 'Retried automatically after token refresh.' : 'Automatic token refresh & retry failed.')
    : 'Automatic token refresh & retry completed before showing Retry.';

  return `
    <div class="card" style="text-align:center;padding:30px 20px;border-color:#FECACA">
      <h3 style="color:var(--danger)">Unable to load data</h3>
      <p class="muted text-sm" style="margin:6px auto 10px">${esc(message)}</p>
      <div id="first-failed-request-log" style="margin:10px auto 16px;max-width:560px;text-align:left;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 12px;font-size:12px;color:#991B1B">
        <div style="font-weight:700;margin-bottom:3px">First Failed Request Error:</div>
        <div class="mono" style="word-break:break-word">${esc(exactLine)}</div>
        <div style="margin-top:4px;color:#B91C1C">${esc(retryNote)}</div>
      </div>
      <button class="btn btn-primary btn-sm" id="${esc(onRetryId)}">Retry</button>
    </div>
  `;
}

export const icon = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
};

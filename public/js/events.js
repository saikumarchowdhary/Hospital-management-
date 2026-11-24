import { getAccessToken, recordFirstFailedRequestError, refreshAccessToken } from './session.js';
import { toast } from './ui.js';

let eventSource = null;
const listeners = new Set();
let statusCallback = null;
let lastState = 'Disconnected';
let reconnectTimer = null;
let refreshAttemptedForStream = false;

export function onStreamStatus(cb) {
  statusCallback = cb;
  cb(lastState);
}

export function subscribeEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(state) {
  lastState = state;
  if (statusCallback) statusCallback(state);
}

export function connectEvents() {
  disconnectEvents();
  if (typeof EventSource === 'undefined') return;
  const token = getAccessToken();
  if (!token) {
    setStatus('Offline');
    return;
  }

  setStatus('Connecting');
  const streamUrl = `/api/events/stream?token=${encodeURIComponent(token)}`;
  eventSource = new EventSource(streamUrl, { withCredentials: true });

  eventSource.addEventListener('connected', () => {
    refreshAttemptedForStream = false;
    setStatus('Live');
  });

  const eventTypes = [
    'appointment:created', 'appointment:updated', 'patient:checked_in',
    'admission:created', 'bed:allocated', 'admission:discharged', 'bed:released',
    'lab:ordered', 'lab:released', 'radiology:ordered', 'radiology:released',
    'prescription:created', 'pharmacy:dispensed', 'treatment:updated', 'vitals:recorded',
    'followup:scheduled', 'member:registered', 'member:updated',
    'invoice:created', 'payment:updated', 'emergency:created',
    'notice:published', 'recruitment:updated', 'housekeeping:updated', 'notification'
  ];

  for (const type of eventTypes) {
    eventSource.addEventListener(type, (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.title) {
          toast(data.title, data.message || '', data.category === 'danger' ? 'danger' : 'info');
        }
        for (const fn of listeners) fn(type, data);
      } catch {
        // ignore parse errors
      }
    });
  }

  eventSource.onerror = async () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    setStatus('Reconnecting');
    if (!refreshAttemptedForStream) {
      refreshAttemptedForStream = true;
      const refreshed = await refreshAccessToken();
      if (refreshed.ok) {
        connectEvents();
        return;
      }
      recordFirstFailedRequestError({
        method: 'GET',
        path: '/api/events/stream',
        status: refreshed.status || 401,
        message: refreshed.error || 'Realtime stream authentication failed.',
        retriedWithRefresh: true
      });
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (getAccessToken()) connectEvents();
    }, 5000);
  };
}

export function disconnectEvents() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  setStatus('Offline');
}

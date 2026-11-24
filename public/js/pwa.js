import { toast } from './ui.js';

let deferredPrompt = null;

export function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.querySelectorAll('[data-pwa-install]').forEach((btn) => {
      btn.style.display = 'inline-flex';
    });
  });

  window.addEventListener('offline', () => {
    toast('Offline Mode', 'Network unavailable. Viewing cached shell.', 'danger');
  });
  window.addEventListener('online', () => {
    toast('Connection Restored', 'Live hospital sync resumed.', 'success');
  });
}

export function renderInstallButton() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return '';
  return `<button type="button" class="btn btn-sm" data-pwa-install style="${deferredPrompt ? '' : 'display:none'}">Install App</button>`;
}

export function bindInstallButtons(root = document) {
  root.querySelectorAll('[data-pwa-install]').forEach((btn) => {
    btn.onclick = async () => {
      if (!deferredPrompt) return;
      await deferredPrompt.prompt();
      deferredPrompt = null;
      btn.style.display = 'none';
    };
  });
}

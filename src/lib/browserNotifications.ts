export type BrowserNotificationPermissionState = NotificationPermission | 'unsupported';

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (window.Notification.permission === 'granted' || window.Notification.permission === 'denied') {
    return window.Notification.permission;
  }
  try {
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return window.Notification.permission || 'default';
  }
}

export async function sendBrowserNotification(options: {
  title: string;
  body: string;
  tag?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(options.title, {
          body: options.body,
          tag: options.tag,
          icon: '/assets/icon.svg',
        });
        return true;
      }
    }
    const notif = new window.Notification(options.title, {
      body: options.body,
      tag: options.tag,
      icon: '/assets/icon.svg',
    });
    notif.onclick = () => {
      try {
        window.focus();
        notif.close();
      } catch {}
    };
    return true;
  } catch {
    return false;
  }
}

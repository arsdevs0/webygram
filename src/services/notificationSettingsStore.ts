export interface NotificationPreferences { notificationsEnabled: boolean; soundsEnabled: boolean; }
const key = 'webygram_notification_preferences_v1';
let preferences: NotificationPreferences = { notificationsEnabled: true, soundsEnabled: true };
try { const saved = JSON.parse(localStorage.getItem(key) || '{}'); for (const field of ['notificationsEnabled', 'soundsEnabled'] as const) if (typeof saved[field] === 'boolean') preferences[field] = saved[field]; } catch {}
const listeners = new Set<() => void>();
export const notificationSettingsStore = {
  get: () => preferences,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  set(field: keyof NotificationPreferences, value: boolean) { preferences = { ...preferences, [field]: value }; try { localStorage.setItem(key, JSON.stringify(preferences)); } catch {} listeners.forEach(listener => listener()); },
};
export function showMessageNotification(chatId: string, title: string, body: string) {
  if (!preferences.notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
  try { const notification = new Notification(title, { body, tag: 'telegram-' + chatId, silent: !preferences.soundsEnabled }); notification.onclick = () => { window.focus(); window.dispatchEvent(new CustomEvent('webygram-open-chat', { detail: chatId })); notification.close(); }; } catch {}
}

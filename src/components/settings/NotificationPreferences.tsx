import React, { useState, useSyncExternalStore } from 'react';
import { notificationSettingsStore } from '../../services/notificationSettingsStore';
export function NotificationPreferences() {
  const settings = useSyncExternalStore(notificationSettingsStore.subscribe, notificationSettingsStore.get);
  const [notice, setNotice] = useState('');
  const toggleNotifications = async () => {
    const enabled = !settings.notificationsEnabled;
    notificationSettingsStore.set('notificationsEnabled', enabled);
    if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') { const permission = await Notification.requestPermission(); if (permission !== 'granted') setNotice('Browser notifications are blocked. Allow them in your browser site settings.'); }
  };
  return <div className="tg-next-card"><button type="button" role="switch" aria-checked={settings.notificationsEnabled} onClick={() => void toggleNotifications()} className="tg-next-row"><span className="flex-1">Message notifications</span><span className={'tg-next-switch ' + (settings.notificationsEnabled ? 'is-on' : '')}><span /></span></button><button type="button" role="switch" aria-checked={settings.soundsEnabled} onClick={() => notificationSettingsStore.set('soundsEnabled', !settings.soundsEnabled)} className="tg-next-row"><span className="flex-1">App sounds</span><span className={'tg-next-switch ' + (settings.soundsEnabled ? 'is-on' : '')}><span /></span></button><p className="tg-compose-status">Sounds control message chimes, actions and call ringtones. Individual chats also have Mute in their profile.</p>{notice && <p role="status" className="tg-compose-status">{notice}</p>}</div>;
}

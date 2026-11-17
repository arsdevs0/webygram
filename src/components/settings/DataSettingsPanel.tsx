import React, { useState } from 'react';
import { ArrowLeft, Database } from 'lucide-react';
import { modSettingsStore } from '../../services/modSettingsStore';
import { useEffect } from 'react';
interface Props { isOpen: boolean; onClose: () => void }
export function DataSettingsPanel(p: Props) {
  const [settings, setSettings] = useState(modSettingsStore.getSettings()), [storage, setStorage] = useState<string>('');
  useEffect(() => modSettingsStore.subscribe(setSettings), []);
  useEffect(() => { let cancelled = false; navigator.storage?.estimate?.().then(value => { if (!cancelled && value.usage !== undefined) setStorage((value.usage / 1024 / 1024).toFixed(1) + ' MB used on this browser'); }).catch(() => {}); return () => { cancelled = true; }; }, []);
  return <div role="dialog" aria-modal="true" aria-label="Data and Storage" className="tg-mobile-panel fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={p.onClose}><div className="tg-next-page w-full max-w-md max-h-[88dvh] rounded-3xl" onClick={e => e.stopPropagation()}><header className="tg-next-header"><button type="button" aria-label="Back from data settings" className="tg-icon-button" onClick={p.onClose}><ArrowLeft /></button><h1>Data and Storage</h1></header><div className="tg-next-scroll"><div className="tg-next-card">{([['autoDownloadMedia', 'Auto-download media'], ['autoPlayGifs', 'Auto-play GIFs'], ['highQualityVoiceNotes', 'High-quality voice notes']] as const).map(([key, label]) => <button type="button" role="switch" aria-checked={settings[key]} key={key} className="tg-next-row" onClick={() => modSettingsStore.updateSetting(key, !settings[key])}><span className="flex-1">{label}</span><span className={'tg-next-switch ' + (settings[key] ? 'is-on' : '')}><span /></span></button>)}</div><div className="tg-next-card p-5 flex items-center gap-3"><Database className="text-primary" /><span>{storage || 'Browser storage'}</span></div></div></div></div>;
}


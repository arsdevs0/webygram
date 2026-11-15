import React, { useState, useRef } from 'react';
import {
  Flame,
  Clock,
  Upload,
  X,
  Send,
  ShieldAlert,
  Film,
  Image as ImageIcon,
  Sparkles,
  Check,
} from 'lucide-react';
import { modSettingsStore } from '../../services/modSettingsStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSend: (params: {
    fileDataUrl: string;
    fileName: string;
    mediaType: 'photo' | 'video';
    caption: string;
    expireSeconds: number;
  }) => void;
}

const TIMER_PRESETS: Array<{ seconds: number; label: string; badge: string; desc: string }> = [
  { seconds: 1, label: '1s', badge: '1×', desc: 'View Once (Immediate burn)' },
  { seconds: 3, label: '3s', badge: '3s', desc: 'Quick 3-second peek' },
  { seconds: 5, label: '5s', badge: '5s', desc: 'Standard 5-second timer' },
  { seconds: 10, label: '10s', badge: '10s', desc: '10-second self-destruct' },
  { seconds: 30, label: '30s', badge: '30s', desc: '30-second extended view' },
  { seconds: 60, label: '1m', badge: '1m', desc: '60-second full minute' },
];

export const DisappearingMediaModal: React.FC<Props> = ({ isOpen, onClose, onSend }) => {
  const defaultSec = modSettingsStore.getSettings().defaultDisappearingTimer || 5;
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [caption, setCaption] = useState('');
  const [expireSeconds, setExpireSeconds] = useState<number>(defaultSec > 0 ? defaultSec : 5);
  const [spoilerPreview, setSpoilerPreview] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    setMediaType(file.type.startsWith('video/') ? 'video' : 'photo');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedMediaUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSend = () => {
    if (!selectedMediaUrl) return;
    onSend({
      fileDataUrl: selectedMediaUrl,
      fileName:
        selectedFileName ||
        (mediaType === 'video' ? `ttl_video_${Date.now()}.mp4` : `ttl_photo_${Date.now()}.jpg`),
      mediaType,
      caption: caption.trim(),
      expireSeconds,
    });
    setSelectedMediaUrl('');
    setSelectedFileName('');
    setCaption('');
    onClose();
  };

  const activePreset =
    TIMER_PRESETS.find((p) => p.seconds === expireSeconds) || TIMER_PRESETS[2];

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Disappearing media" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface dark:bg-surface border border-outline dark:border-outline rounded-3xl shadow-2xl overflow-hidden text-ink dark:text-ink flex flex-col max-h-[90vh]"
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline dark:border-white/[0.07] bg-surface-low dark:bg-canvas/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-white shadow-md">
              <Flame className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
                <span>Self-Destructing Media</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 dark:bg-rose-500/20 border border-rose-500/35 text-rose-600 dark:text-rose-300 text-[10px] font-mono">
                  {activePreset.badge}
                </span>
              </h2>
              <p className="text-[11px] text-muted dark:text-muted">{activePreset.desc}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted dark:text-muted hover:text-ink dark:hover:text-white rounded-full hover:bg-hover/70 dark:hover:bg-hover transition-colors cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Media Canvas & Timer Selector */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {selectedMediaUrl ? (
            <div className="relative rounded-2xl overflow-hidden border border-outline dark:border-outline bg-surface group">
              {mediaType === 'video' ? (
                <video
                  src={selectedMediaUrl}
                  controls={!spoilerPreview}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className={`w-full h-56 object-contain transition-all duration-300 ${
                    spoilerPreview ? 'blur-md scale-105 brightness-75' : ''
                  }`}
                />
              ) : (
                <img
                  src={selectedMediaUrl}
                  alt="Disappearing media preview"
                  className={`w-full h-56 object-cover transition-all duration-300 ${
                    spoilerPreview ? 'blur-md scale-105 brightness-75' : ''
                  }`}
                />
              )}

              {/* Center Official Telegram Flame + Timer Ring Overlay */}
              <div
                onClick={() => setSpoilerPreview(!spoilerPreview)}
                className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer select-none"
              >
                <div className="w-16 h-16 rounded-full bg-black/65 backdrop-blur-md border-2 border-white/40 flex flex-col items-center justify-center shadow-2xl text-white">
                  <Flame className="w-5 h-5 text-rose-400 animate-pulse" />
                  <span className="text-xs font-extrabold font-mono mt-0.5">{activePreset.label}</span>
                </div>
                <span className="mt-2 px-3 py-1 rounded-full bg-black/65 backdrop-blur-xs text-[10.5px] font-medium text-white/90 border border-white/15">
                  {spoilerPreview ? 'Spoiler Blur Active (Tap to preview clear)' : 'Tap to re-enable Spoiler Blur'}
                </span>
              </div>

              <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-xs text-[10.5px] font-semibold text-white flex items-center gap-1.5 border border-white/10">
                {mediaType === 'video' ? (
                  <Film className="w-3 h-3 text-primary" />
                ) : (
                  <ImageIcon className="w-3 h-3 text-primary" />
                )}
                <span className="truncate max-w-[160px]">{selectedFileName}</span>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/70 hover:bg-black/90 text-[10.5px] font-semibold text-primary border border-white/15 cursor-pointer"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-48 rounded-2xl border-2 border-dashed border-primary/40 hover:border-primary bg-surface-low dark:bg-canvas/90 hover:bg-hover dark:hover:bg-hover flex flex-col items-center justify-center gap-2.5 text-muted dark:text-muted hover:text-ink dark:hover:text-white transition-all cursor-pointer group"
            >
              <div className="w-14 h-14 rounded-full bg-primary/15 group-hover:bg-primary/25 text-primary flex items-center justify-center transition-transform group-hover:scale-105">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-center px-3">
                <span className="text-xs font-bold text-ink dark:text-ink block">
                  Choose Photo or Video for Timed Message
                </span>
                <span className="text-[11px] text-muted dark:text-muted">
                  Supports View Once (1s) up to 60s self-destruct timer
                </span>
              </div>
            </button>
          )}

          {/* Official Telegram Circular Timer Dial Strip */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted dark:text-muted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Auto-Destruct Timer</span>
              </span>
              <span className="text-[11px] font-mono text-rose-500 dark:text-rose-400 font-semibold">
                {activePreset.desc}
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5 p-1.5 rounded-2xl bg-elevated dark:bg-canvas border border-outline dark:border-white/[0.06]">
              {TIMER_PRESETS.map((preset) => {
                const isSelected = expireSeconds === preset.seconds;
                return (
                  <button
                    key={preset.seconds}
                    type="button"
                    onClick={() => setExpireSeconds(preset.seconds)}
                    className={`py-2 rounded-xl text-xs font-bold font-mono flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-elevated text-white shadow-md scale-[1.02]'
                        : 'text-muted dark:text-muted hover:text-ink dark:hover:text-white hover:bg-white dark:hover:bg-hover'
                    }`}
                  >
                    <span>{preset.label}</span>
                    {isSelected && <Check className="w-2.5 h-2.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-low dark:bg-canvas/90 border border-outline dark:border-white/[0.06] text-[11px] text-muted dark:text-muted">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span>
              Sent via native MTProto <span className="text-ink dark:text-ink font-mono">ttlSeconds</span>. Countdown starts only after the recipient opens the media.
            </span>
          </div>
        </div>

        {/* Integrated Telegram Bottom Caption + Circular Send Bar */}
        <div className="p-3 bg-surface-low dark:bg-canvas border-t border-outline dark:border-white/[0.07] flex items-center gap-2">
          <div className="flex-1 flex items-center bg-surface dark:bg-surface border border-outline dark:border-outline rounded-full px-3.5 py-2">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && selectedMediaUrl) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Add a caption..."
              className="w-full bg-transparent text-xs text-ink dark:text-ink placeholder-muted dark:placeholder-[#6C7883] focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={!selectedMediaUrl}
            onClick={handleSend}
            className="w-10 h-10 rounded-full bg-primary hover:bg-primary-hover disabled:opacity-40 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer shrink-0"
            title={`Send Timed ${mediaType === 'video' ? 'Video' : 'Photo'} (${activePreset.label})`}
          >
            <Send className="w-4 h-4 translate-x-[0.5px]" />
          </button>
        </div>
      </div>
    </div>
  );
};

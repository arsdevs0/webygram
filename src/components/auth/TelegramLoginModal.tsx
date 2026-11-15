import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Phone,
  QrCode,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Key,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  Lock,
} from 'lucide-react';
import { telegramService } from '../../services/telegramService';
import { soundEffects } from '../../services/soundEffects';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

const COUNTRIES = [
  { code: '+91', name: 'India' },
  { code: '+1', name: 'USA / Canada' },
  { code: '+44', name: 'United Kingdom' },
  { code: '+971', name: 'UAE' },
  { code: '+49', name: 'Germany' },
  { code: '+33', name: 'France' },
  { code: '+7', name: 'Kazakhstan / Russia' },
  { code: '+81', name: 'Japan' },
  { code: '+55', name: 'Brazil' },
];

const PYTHON_STRING_SESSION_SCRIPT = `# pip install telethon
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id = YOUR_API_ID
api_hash = "YOUR_API_HASH"

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print(client.session.save())`;

export const TelegramLoginModal: React.FC<Props> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<'qr' | 'phone' | 'session'>('qr');
  const [step, setStep] = useState<'phone' | 'code'>('phone');

  const [countryCode, setCountryCode] = useState('+91');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [apiId, setApiId] = useState(() => localStorage.getItem('tgplus_api_id') || '');
  const [apiHash, setApiHash] = useState(() => localStorage.getItem('tgplus_api_hash') || '');
  const [showCustomApi, setShowCustomApi] = useState(false);

  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [isCodeViaApp, setIsCodeViaApp] = useState(true);
  const [verificationCode, setVerificationCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [password2FA, setPassword2FA] = useState('');

  const [sessionString, setSessionString] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrNeeds2FA, setQrNeeds2FA] = useState(false);
  const [qr2FAHint, setQr2FAHint] = useState('');
  const [qr2FAPassword, setQr2FAPassword] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAutoStartedQrRef = useRef(false);

  const saveOptionalApiCredentials = useCallback(() => {
    const cleanId = apiId.trim();
    const cleanHash = apiHash.trim();
    try {
      if (cleanId && cleanHash) {
        localStorage.setItem('tgplus_api_id', cleanId);
        localStorage.setItem('tgplus_api_hash', cleanHash);
      }
    } catch {
      // ignore
    }
    return {
      parsedId: cleanId ? Number(cleanId) : undefined,
      cleanHash: cleanHash || undefined,
    };
  }, [apiId, apiHash]);

  const handleStartQr = useCallback(async () => {
    setError(null);
    setQrNeeds2FA(false);
    setQr2FAPassword('');
    const { parsedId, cleanHash } = saveOptionalApiCredentials();
    setQrLoading(true);
    try {
      const data = await telegramService.startQrLogin(parsedId, cleanHash);
      setQrDataUrl(data.qrDataUrl);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to generate Telegram QR code.');
    } finally {
      setQrLoading(false);
    }
  }, [saveOptionalApiCredentials]);

  // Auto-generate QR code immediately when modal opens on QR tab, and cancel pending QR on close/tab switch
  useEffect(() => {
    if (!isOpen) {
      if (hasAutoStartedQrRef.current) {
        hasAutoStartedQrRef.current = false;
        void telegramService.cancelQrLogin();
      }
      setQrNeeds2FA(false);
      setQr2FAPassword('');
      setError(null);
      return;
    }

    if (activeTab === 'qr' && !hasAutoStartedQrRef.current) {
      hasAutoStartedQrRef.current = true;
      void handleStartQr();
    } else if (activeTab !== 'qr' && hasAutoStartedQrRef.current) {
      hasAutoStartedQrRef.current = false;
      void telegramService.cancelQrLogin();
    }
  }, [isOpen, activeTab, handleStartQr]);

  // Subscribe to WebSocket QR updates AND poll status as a fallback
  useEffect(() => {
    if (!isOpen) return;

    const unsub = telegramService.subscribeQrEvents((ev) => {
      if (ev.type === 'QR_REFRESH' && ev.qrDataUrl) {
        setQrDataUrl(ev.qrDataUrl);
      } else if (ev.type === 'QR_NEEDS_2FA') {
        setQrNeeds2FA(true);
        setQr2FAHint(ev.hint || '');
        setError(null);
      } else if (ev.type === 'QR_ERROR' && ev.error) {
        setError(ev.error);
      } else if (ev.type === 'AUTH_UPDATED') {
        hasAutoStartedQrRef.current = false;
        soundEffects.playReaction();
        onLoginSuccess();
        onClose();
      }
    });

    const pollInterval =
      activeTab === 'qr'
        ? window.setInterval(async () => {
            try {
              const st = await telegramService.getQrStatus();
              if (st.isConnected && st.user) {
                hasAutoStartedQrRef.current = false;
                soundEffects.playReaction();
                onLoginSuccess();
                onClose();
                return;
              }
              if (st.status === 'waiting_scan' && st.qrDataUrl) {
                setQrDataUrl(st.qrDataUrl);
              } else if (st.status === 'needs_2fa') {
                setQrNeeds2FA(true);
                setQr2FAHint(st.hint || '');
              } else if (st.status === 'error' && st.error) {
                setError(st.error);
              }
            } catch {
              // ignore transient polling failure
            }
          }, 1500)
        : null;

    return () => {
      unsub();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isOpen, activeTab, onClose, onLoginSuccess]);

  if (!isOpen) return null;

  const handleSubmitQr2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qr2FAPassword) return;
    setError(null);
    setIsLoading(true);
    try {
      await telegramService.submitQr2FA(qr2FAPassword);
      hasAutoStartedQrRef.current = false;
      soundEffects.playReaction();
      onLoginSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || '2FA verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const { parsedId, cleanHash } = saveOptionalApiCredentials();
    const fullPhone = `${countryCode}${phoneDigits.replace(/\s+/g, '')}`.trim();

    if (phoneDigits.replace(/\D/g, '').length < 6) {
      setError('Enter a valid phone number.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await telegramService.requestPhoneCode({
        apiId: parsedId,
        apiHash: cleanHash,
        phoneNumber: fullPhone,
      });
      setPhoneCodeHash(res.phoneCodeHash);
      setIsCodeViaApp(res.isCodeViaApp);
      setRequires2FA(false);
      setStep('code');
      soundEffects.playPop();
    } catch (err: unknown) {
      setError((err as Error).message || 'Could not send verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const fullPhone = `${countryCode}${phoneDigits.replace(/\s+/g, '')}`.trim();

    try {
      const result = await telegramService.verifyPhoneCode({
        phoneNumber: fullPhone,
        code: verificationCode.trim(),
        phoneCodeHash,
        password2FA: password2FA || undefined,
      });

      if (result.requires2FA) {
        setRequires2FA(true);
        setError('Two-Step Verification password required. Enter your 2FA password below.');
        return;
      }

      soundEffects.playReaction();
      onLoginSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { parsedId, cleanHash } = saveOptionalApiCredentials();

    setIsLoading(true);
    try {
      await telegramService.authenticateWithSessionString({
        apiId: parsedId,
        apiHash: cleanHash,
        sessionString: sessionString.trim(),
      });
      soundEffects.playReaction();
      onLoginSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to authenticate session string.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(PYTHON_STRING_SESSION_SCRIPT);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-[3px]">
      <div className="w-full max-w-md bg-surface dark:bg-surface border border-outline dark:border-outline rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-ink dark:text-ink">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.63 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 4-1.74 6.72-2.92 8.16-3.55 3.88-1.7 4.69-1.99 5.22-2 .12 0 .38.03.55.17.14.12.18.28.2.45-.02.07-.02.24-.04.4z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Sign in to Telegram</h3>
              <p className="text-[11px] text-muted dark:text-muted">
                Scan QR code, verify phone, or paste StringSession
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-ink dark:text-muted dark:hover:text-white rounded-lg hover:bg-hover/70 dark:hover:bg-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Real MTProto Tabs */}
        <div className="grid grid-cols-3 p-1.5 bg-surface-low dark:bg-canvas border-b border-outline dark:border-outline gap-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('qr');
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 font-semibold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'qr'
                ? 'bg-primary text-white'
                : 'text-muted dark:text-muted hover:bg-hover/60 dark:hover:bg-hover'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>QR Scan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('phone');
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 font-semibold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'phone'
                ? 'bg-primary text-white'
                : 'text-muted dark:text-muted hover:bg-hover/60 dark:hover:bg-hover'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Phone</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('session');
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 font-semibold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'session'
                ? 'bg-primary text-white'
                : 'text-muted dark:text-muted hover:bg-hover/60 dark:hover:bg-hover'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Session</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="flex flex-col items-center text-center space-y-4 py-1">
              {qrNeeds2FA ? (
                <form onSubmit={handleSubmitQr2FA} className="w-full space-y-3.5 text-left">
                  <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/30 flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-semibold text-ink dark:text-ink">
                        Two-Step Verification Required
                      </p>
                      <p className="text-[11px] text-muted dark:text-muted mt-0.5">
                        QR scan accepted. Enter your Telegram Cloud Password
                        {qr2FAHint ? ` (Hint: ${qr2FAHint})` : ''} to finish signing in.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium block mb-1.5">2FA Cloud Password</label>
                    <input
                      type="password"
                      value={qr2FAPassword}
                      onChange={(e) => setQr2FAPassword(e.target.value)}
                      placeholder="Enter your 2FA password..."
                      required
                      autoFocus
                      className="w-full px-3 py-2.5 text-xs bg-surface-low dark:bg-elevated border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleStartQr()}
                      className="px-4 py-2.5 text-xs font-medium text-muted dark:text-muted hover:bg-hover dark:hover:bg-hover rounded-xl cursor-pointer"
                    >
                      New QR
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                      {isLoading ? 'Verifying Password...' : 'Unlock Telegram Session'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {qrDataUrl ? (
                    <div className="p-3 bg-white rounded-2xl border-2 border-primary/30 shadow-md">
                      <img src={qrDataUrl} alt="Telegram QR Login" className="w-48 h-48 block rounded-lg" />
                    </div>
                  ) : (
                    <div className="w-48 h-48 rounded-2xl bg-elevated dark:bg-elevated border border-outline dark:border-outline flex flex-col items-center justify-center p-4 text-center">
                      <RefreshCw
                        className={`w-8 h-8 text-primary mb-2 ${qrLoading ? 'animate-spin' : ''}`}
                      />
                      <p className="text-[11px] text-muted dark:text-muted">
                        {qrLoading ? 'Connecting to Telegram MTProto...' : 'Generating live QR token'}
                      </p>
                    </div>
                  )}

                  <div className="space-y-1.5 text-xs">
                    <p className="font-semibold">Log in to Telegram by QR Code</p>
                    <ol className="text-[11px] text-muted dark:text-muted space-y-1 text-left max-w-xs mx-auto list-decimal pl-4">
                      <li>Open Telegram on your phone.</li>
                      <li>
                        Go to <span className="font-semibold text-ink dark:text-muted">Settings → Devices → Link Desktop Device</span>.
                      </li>
                      <li>Point your phone at this screen to confirm login.</li>
                    </ol>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleStartQr()}
                    disabled={qrLoading}
                    className="w-full py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? 'animate-spin' : ''}`} />
                    <span>{qrDataUrl ? 'Refresh QR Code' : 'Generate Live QR Code'}</span>
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === 'phone' && step === 'phone' && (
            <form onSubmit={handleRequestCode} className="space-y-3.5">
              <div>
                <label className="text-xs font-medium block mb-1">Country</label>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface-low dark:bg-elevated border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary cursor-pointer"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">Phone Number</label>
                <div className="flex gap-2">
                  <span className="px-3 py-2 text-xs bg-elevated dark:bg-canvas border border-outline dark:border-outline rounded-xl text-muted dark:text-muted font-mono flex items-center">
                    {countryCode}
                  </span>
                  <input
                    type="tel"
                    value={phoneDigits}
                    onChange={(e) => setPhoneDigits(e.target.value)}
                    placeholder="9876543210"
                    required
                    className="flex-1 px-3 py-2 text-xs bg-surface-low dark:bg-elevated border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted dark:text-muted">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <span>Direct MTProto connection to official Telegram servers.</span>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <span>Requesting code from Telegram...</span>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {activeTab === 'phone' && step === 'code' && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="text-center space-y-1">
                <div className="text-xs">
                  Code sent to{' '}
                  <span className="font-mono font-semibold text-primary">
                    {countryCode} {phoneDigits}
                  </span>
                </div>
                <p className="text-[11px] text-muted dark:text-muted">
                  {isCodeViaApp
                    ? 'Check your Telegram app on another device for the login code.'
                    : 'Enter the verification code sent via SMS.'}
                </p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="12345"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                required
                className="w-full text-center tracking-[0.45em] font-mono text-base font-bold py-2.5 bg-surface-low dark:bg-elevated border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary"
                autoFocus
              />

              <div>
                <label className="text-xs font-medium block mb-1">
                  {requires2FA ? 'Two-Step Verification (2FA) Password' : '2FA Cloud Password (If enabled)'}
                </label>
                <input
                  type="password"
                  placeholder="Enter Telegram 2FA password..."
                  value={password2FA}
                  onChange={(e) => setPassword2FA(e.target.value)}
                  required={requires2FA}
                  className="w-full px-3 py-2 text-xs bg-surface-low dark:bg-elevated border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setRequires2FA(false);
                    setError(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-muted hover:text-ink dark:text-muted dark:hover:text-white rounded-xl cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  {isLoading ? 'Verifying with Telegram...' : 'Sign In'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'session' && (
            <form onSubmit={handleSessionLogin} className="space-y-3.5">
              <div className="p-3 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">GramJS / Telethon StringSession</span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="px-2 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedScript ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedScript ? 'Copied' : 'Copy Python Script'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted dark:text-muted">
                  Paste an existing StringSession to connect immediately.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">StringSession</label>
                <textarea
                  rows={3}
                  value={sessionString}
                  onChange={(e) => setSessionString(e.target.value)}
                  placeholder="1BVtsOHQBu7..."
                  required
                  className="w-full px-3 py-2 text-xs font-mono bg-surface-low dark:bg-elevated border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                {isLoading ? 'Authenticating Session...' : 'Connect with StringSession'}
              </button>
            </form>
          )}

          {/* Optional Custom API Credentials */}
          <div className="border-t border-outline dark:border-outline pt-3">
            <button
              type="button"
              onClick={() => setShowCustomApi(!showCustomApi)}
              className="w-full flex items-center justify-between text-[11px] text-muted dark:text-muted hover:text-primary cursor-pointer"
            >
              <span>Custom App API Credentials (optional)</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCustomApi ? 'rotate-180' : ''}`} />
            </button>

            {showCustomApi && (
              <div className="mt-2.5 p-3 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold">my.telegram.org Credentials</span>
                  <a
                    href="https://my.telegram.org/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline font-medium"
                  >
                    Open my.telegram.org
                  </a>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-muted dark:text-muted block mb-1">
                      API ID
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Default"
                      value={apiId}
                      onChange={(e) => setApiId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-lg focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-muted dark:text-muted block mb-1">
                      API Hash
                    </label>
                    <input
                      type="text"
                      placeholder="Default Desktop App Hash"
                      value={apiHash}
                      onChange={(e) => setApiHash(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-lg focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

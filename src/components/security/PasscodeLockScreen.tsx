import React, { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { passcodeService } from '../../services/passcodeService';

interface Props {
  onUnlocked: () => void;
}

export const PasscodeLockScreen: React.FC<Props> = ({ onUnlocked }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || checking) return;
    setChecking(true);
    setError(null);
    const ok = await passcodeService.unlockWithPass(pin);
    setChecking(false);
    if (ok) {
      setPin('');
      onUnlocked();
    } else {
      setError('Incorrect passcode. Try again.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas dark:bg-canvas p-6 text-ink dark:text-ink">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-xs p-6 rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline shadow-2xl text-center space-y-4"
      >
        <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold">TG Plus Locked</h2>
          <p className="text-xs text-muted dark:text-muted">
            Enter your local passcode to unlock your chats
          </p>
        </div>
        <input
          type="password"
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Enter passcode..."
          className="w-full px-3.5 py-2.5 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline text-center text-sm tracking-widest focus:outline-none focus:border-primary"
        />
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button
          type="submit"
          disabled={!pin.trim() || checking}
          className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Unlock className="w-3.5 h-3.5" />
          <span>Unlock</span>
        </button>
      </form>
    </div>
  );
};

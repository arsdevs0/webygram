import React from 'react';
import { Send } from 'lucide-react';
export function WelcomeView({ onLogin, onPhone }: { onLogin: () => void; onPhone: () => void }) {
  return <section className="tg-next-welcome"><div className="tg-welcome-art"><div className="tg-welcome-clouds" /><div className="tg-welcome-logo"><Send /></div><h1>Webygram</h1><p>Fast. Secure. Powerful.</p></div><div className="tg-welcome-actions"><button type="button" className="tg-next-primary" onClick={onLogin}>Start Messaging</button><button type="button" className="tg-next-text-button" onClick={onPhone}>Continue with Phone</button></div></section>;
}


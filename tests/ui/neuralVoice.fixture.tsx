import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/telegram-next.css';
import { VoiceChangerStudio } from '../../src/components/voice/VoiceChangerStudio';
import { voiceChanger } from '../../src/services/voiceChangerEngine';
(window as any).voice = voiceChanger;
createRoot(document.getElementById('root')!).render(<VoiceChangerStudio isOpen={true} onClose={() => {}} />);

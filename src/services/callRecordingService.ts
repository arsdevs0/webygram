import { recordingFileName } from '../utils/recordingMetadata';
import { telegramService } from './telegramService';

export interface CallRecording {
  id: string;
  name: string;
  fileName: string;
  startedAt: number;
  duration: number;
  blob: Blob;
  accountId: string;
}
interface RecordingState {
  recording: boolean;
  name: string;
  seconds: number;
  saving: boolean;
  pending: CallRecording[];
  notice: string;
}

class RecordingStore {
  private dbPromise?: Promise<IDBDatabase>;
  private db() {
    return this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('webygram-call-recordings', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { this.dbPromise = undefined; reject(request.error); };
    });
  }
  async all(): Promise<CallRecording[]> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const request = db.transaction('pending').objectStore('pending').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async write(recording: CallRecording | string) {
    const db = await this.db();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pending', 'readwrite');
      const store = tx.objectStore('pending');
      if (typeof recording === 'string') store.delete(recording); else store.put(recording);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

class CallRecordingService {
  private state: RecordingState = { recording: false, name: '', seconds: 0, saving: false, pending: [], notice: '' };
  private listeners = new Set<(state: RecordingState) => void>();
  private store = new RecordingStore();
  private recorder: MediaRecorder | null = null;
  private context: AudioContext | null = null;
  private sources: MediaStreamAudioSourceNode[] = [];
  private ownedStream: MediaStream | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private starting = false;
  private savingIds = new Set<string>();
  private beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };

  getState() { return { ...this.state }; }
  subscribe(listener: (state: RecordingState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }
  private update(next: Partial<RecordingState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.getState());
  }
  async restore() {
    try {
      const records = await this.store.all();
      const byId = new Map([...records, ...this.state.pending].map(record => [record.id, record]));
      this.update({ pending: [...byId.values()] });
    } catch { /* in-memory downloads remain available when storage is unavailable */ }
  }
  async start(name: string, streams?: MediaStream[]) {
    if (this.starting || this.recorder || this.state.recording) return;
    this.starting = true;
    try {
      const accountId = telegramService.getAuthSession().user.id;
      if (!telegramService.getAuthSession().isConnected || !accountId) throw new Error('Sign in to Telegram before recording so the clip can be saved to your account.');
      if (typeof MediaRecorder === 'undefined') throw new Error('Audio recording is not supported by this browser.');
      if (!streams) {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Tab audio recording needs a desktop browser with screen sharing.');
        this.ownedStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        streams = [this.ownedStream];
      }
      const audioStreams = streams.filter(stream => stream.getAudioTracks().some(track => track.readyState === 'live'));
      if (!audioStreams.length) throw new Error('No call audio was shared. Choose the call tab and enable “Share tab audio”.');
      this.context = new AudioContext({ latencyHint: 'interactive' });
      await this.context.resume();
      const destination = this.context.createMediaStreamDestination();
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.ratio.value = 12;
      limiter.connect(destination);
      this.sources = audioStreams.map(stream => {
        const source = this.context!.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        source.connect(limiter);
        return source;
      });
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(destination.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      this.recorder = recorder;
      const startedAt = Date.now();
      const recordingName = name.trim() || 'Voice chat';
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = event => {
        if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
        if (bytes >= 36 * 1024 * 1024) this.stop();
      };
      recorder.onerror = () => { this.update({ notice: 'Recording interrupted. Saving the audio captured so far.' }); this.stop(); };
      recorder.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        this.cleanup();
        if (!blob.size) { this.update({ notice: 'No audio was captured.' }); return; }
        const record = { id: crypto.randomUUID(), accountId, name: recordingName, startedAt, duration, blob, fileName: recordingFileName(recordingName, startedAt, blob.type) };
        this.update({ pending: [...this.state.pending, record], notice: 'Saving recording…' });
        void this.store.write(record).catch(() => {
          this.update({ notice: 'Browser storage is full. Keep this page open until the recording is saved.' });
        }).then(() => this.save(record.id));
      };
      this.ownedStream?.getTracks().forEach(track => track.addEventListener('ended', () => this.stop(), { once: true }));
      recorder.start(1000);
      this.update({ recording: true, name: recordingName, seconds: 0, notice: '' });
      window.addEventListener('beforeunload', this.beforeUnload);
      this.timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        this.update({ seconds });
        if (seconds >= 1800) this.stop();
      }, 1000);
    } catch (error) {
      this.cleanup();
      this.update({ notice: (error as Error).message || 'Could not start recording.' });
    } finally { this.starting = false; }
  }
  stop() {
    if (this.recorder?.state !== 'inactive' && this.recorder) {
      this.update({ notice: 'Finishing recording…' });
      this.recorder.stop();
    }
  }
  private cleanup() {
    if (this.timer) clearInterval(this.timer);
    this.recorder = null;
    for (const source of this.sources) source.disconnect();
    this.sources = [];
    this.ownedStream?.getTracks().forEach(track => track.stop());
    this.ownedStream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.update({ recording: false });
    window.removeEventListener('beforeunload', this.beforeUnload);
  }
  async save(id: string) {
    const record = this.state.pending.find(item => item.id === id);
    if (!record || this.savingIds.has(id)) return;
    this.savingIds.add(id);
    this.update({ saving: true });
    try {
      if (telegramService.getAuthSession().user.id !== record.accountId) throw new Error('Sign in to the account that made this recording to save it.');
      const fileDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(record.blob);
      });
      const response = await fetch('/api/tg/calls/recordings/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, accountId: record.accountId, name: record.name, fileName: record.fileName, startedAt: record.startedAt, duration: record.duration, fileDataUrl }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Upload failed');
      await this.store.write(id).catch(() => {});
      this.update({ pending: this.state.pending.filter(item => item.id !== id), notice: `“${record.name}” saved to Saved Messages.` });
    } catch (error) {
      this.update({ notice: `Recording kept for retry: ${(error as Error).message}` });
    } finally {
      this.savingIds.delete(id);
      this.update({ saving: this.savingIds.size > 0 });
    }
  }
  download(id: string) {
    const record = this.state.pending.find(item => item.id === id);
    if (!record) return;
    const url = URL.createObjectURL(record.blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = record.fileName; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export const callRecordingService = new CallRecordingService();
import { appFetch as fetch } from './appTransport';

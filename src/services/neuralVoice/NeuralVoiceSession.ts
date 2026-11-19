export interface NeuralUpdate {
  status: 'loading' | 'checking' | 'buffering' | 'active' | 'slow' | 'error';
  message?: string; p50ms?: number; p95ms?: number;
}
const loadedContexts = new WeakMap<AudioContext, Promise<void>>();
export class NeuralVoiceSession {
  public node: AudioWorkletNode | null = null;
  private worker: Worker;
  private disposed = false;
  private settle?: (value: boolean) => void;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private context: AudioContext, private update: (state: NeuralUpdate) => void) {
    this.worker = new Worker(new URL('./neuralVoice.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onerror = () => this.fail('AI voice could not start in this browser. Lightweight effects are active.');
  }
  async start(): Promise<boolean> {
    const base = new URL(import.meta.env.BASE_URL + 'voice/', location.origin);
    this.update({ status: 'loading' });
    try {
      let loading = loadedContexts.get(this.context);
      if (!loading) {
        loading = this.context.audioWorklet.addModule(new URL('neural-bridge.worklet.js', base));
        loadedContexts.set(this.context, loading);
        void loading.catch(() => loadedContexts.delete(this.context));
      }
      await loading;
      if (this.disposed) return false;
      return await new Promise<boolean>(resolve => {
        this.settle = resolve;
        this.timer = setTimeout(() => this.fail('AI voice loading timed out. Tap Retry AI.'), 90000);
        this.worker.onerror = () => this.fail('AI voice could not start in this browser. Lightweight effects are active.');
        this.worker.onmessage = ({ data }) => {
          if (this.disposed) return;
          if (data.type === 'checking') this.update({ status: 'checking' });
          else if (data.type === 'slow') {
            this.update({ status: 'slow', p50ms: data.p50ms, p95ms: data.p95ms,
              message: 'This device is too slow for realtime AI. Lightweight effects are active.' });
            this.dispose();
          } else if (data.type === 'error') this.fail(data.message);
          else if (data.type === 'ready') {
            this.node = new AudioWorkletNode(this.context, 'neural-voice-bridge', {
              numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
            });
            this.node.onprocessorerror = () => this.fail('AI audio stopped. Lightweight effects are active.');
            this.node.port.onmessage = ({ data: state }) => {
              if (state.type === 'playing') this.update({ status: 'active' });
              else if (state.type === 'stalled') this.fail('AI cannot keep up on this device. Lightweight effects are active.');
            };
            const channel = new MessageChannel();
            this.worker.postMessage({ type: 'connect', port: channel.port1 }, [channel.port1]);
            this.node.port.postMessage({ type: 'connect', port: channel.port2 }, [channel.port2]);
            clearTimeout(this.timer);
            this.update({ status: 'buffering', p50ms: data.p50ms, p95ms: data.p95ms });
            this.settle?.(true); this.settle = undefined;
          }
        };
        this.worker.postMessage({ type: 'init', manifestUrl: new URL('llvc-v1.json', base).href,
          modelUrl: new URL('llvc-v1.onnx', base).href, runtimeUrl: new URL('ort/', base).href });
      });
    } catch (error) { this.fail((error as Error).message); return false; }
  }
  activate() { this.node?.port.postMessage({ type: 'active', value: true }); }
  private fail(message: string) {
    if (this.disposed) return;
    this.update({ status: 'error', message });
    this.dispose();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.settle?.(false); this.settle = undefined;
    this.node?.disconnect();
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); }
    this.worker.terminate();
  }
}

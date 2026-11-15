import { Buffer } from 'buffer';
import encoderUrl from 'opus-recorder/dist/encoderWorker.min.js?url';

export async function convertBrowserVoice(input: Uint8Array, _extension: string, fallbackDuration: number) {
  // Firefox can record Telegram's native format directly.
  if (Buffer.from(input.subarray(0, 4)).toString() === 'OggS') {
    return { oggBuffer: Buffer.from(input), duration: Math.max(1, Math.round(fallbackDuration)), waveform: Buffer.alloc(0) };
  }
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(new Uint8Array(input).buffer);
    const mono = new Float32Array(audio.length);
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const samples = audio.getChannelData(channel);
      for (let index = 0; index < mono.length; index++) mono[index] += samples[index] / audio.numberOfChannels;
    }
    const oggBuffer = await encodeOpus(mono, audio.sampleRate);
    return { oggBuffer, duration: Math.max(1, Math.round(audio.duration)), waveform: Buffer.alloc(0) };
  } finally { await context.close(); }
}

export function encodeOpus(samples: Float32Array, sampleRate: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(encoderUrl);
    const pages: Buffer[] = [];
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { finish(); reject(new Error('Voice encoding timed out. Please retry.')); }, 60000);
    worker.onerror = () => { finish(); reject(new Error('Could not encode this voice recording.')); };
    worker.onmessage = ({ data }) => {
      if (data.message === 'ready') {
        worker.postMessage({ command: 'getHeaderPages' });
        worker.postMessage({ command: 'encode', buffers: [samples] }, [samples.buffer]);
        worker.postMessage({ command: 'done' });
      } else if (data.message === 'page') pages.push(Buffer.from(data.page));
      else if (data.message === 'done') {
        finish();
        const bytes = Buffer.concat(pages);
        if (bytes.length < 64 || bytes.subarray(0, 4).toString() !== 'OggS') reject(new Error('Voice encoder returned no audio.'));
        else resolve(bytes);
      }
    };
    worker.postMessage({ command: 'init', originalSampleRate: sampleRate, encoderSampleRate: 48000,
      numberOfChannels: 1, encoderApplication: 2048, encoderBitRate: 32000, encoderComplexity: 5,
      bufferLength: 4096, encoderFrameSize: 20, maxFramesPerPage: 40, resampleQuality: 3 });
  });
}

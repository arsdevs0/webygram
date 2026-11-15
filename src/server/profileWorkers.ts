import { fork, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import type { BrowserProfile } from './browserProfiles';

export interface ProfileWorker { port: number; secret: string; lastUsed: number; child: ChildProcess; sockets: number; requests: number }
export class ProfileWorkers {
  private workers = new Map<string, Promise<ProfileWorker>>();
  private timer: ReturnType<typeof setInterval>;
  constructor(private limit = 8, private entry = path.resolve('server.ts')) {
    this.timer = setInterval(() => {
      for (const [id, job] of this.workers) void job.then(worker => {
        if (!worker.sockets && !worker.requests && Date.now() - worker.lastUsed > 10 * 60_000) { worker.child.kill(); }
      }).catch(() => {});
    }, 60_000);
    this.timer.unref();
  }
  async get(profile: BrowserProfile): Promise<ProfileWorker> {
    let job = this.workers.get(profile.id);
    if (!job) {
      if (this.workers.size >= this.limit) throw new Error('The server is busy. Please try again shortly.');
      job = this.start(profile);
      this.workers.set(profile.id, job);
      void job.catch(() => { if (this.workers.get(profile.id) === job) this.workers.delete(profile.id); });
    }
    const worker = await job;
    worker.lastUsed = Date.now();
    return worker;
  }
  private start(profile: BrowserProfile): Promise<ProfileWorker> {
    return new Promise((resolve, reject) => {
      const secret = crypto.randomBytes(32).toString('hex');
      const child = fork(this.entry, [], {
        env: { ...process.env, PORT: '0', DATA_DIR: profile.dataDir, TG_PROFILE_WORKER: '1', TG_PROFILE_KEY: secret, TELEGRAM_SESSION: '' },
        windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Session startup timed out. Please retry.')); }, 30000);
      child.stderr?.on('data', () => { /* Consume diagnostics without exposing private Telegram data. */ });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.on('message', (message: any) => {
        if (message?.type === 'PROFILE_READY' && Number.isInteger(message.port)) {
          clearTimeout(timer); resolve({ port: message.port, secret, child, lastUsed: Date.now(), sockets: 0, requests: 0 });
        }
      });
      child.once('exit', () => { clearTimeout(timer); this.workers.delete(profile.id); reject(new Error('Session process stopped. Please retry.')); });
    });
  }
  close() {
    clearInterval(this.timer);
    for (const job of this.workers.values()) void job.then(w => w.child.kill()).catch(() => {});
    this.workers.clear();
  }
}

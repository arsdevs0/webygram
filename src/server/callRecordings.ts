import type { Express } from 'express';
import type { TelegramClient } from 'telegram';
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads.js';
import fs from 'node:fs';
import path from 'node:path';
import { recordingFileName } from '../utils/recordingMetadata.ts';

/** Explicit user-started recordings are saved only to the signed-in user's own account. */
export function registerCallRecordingRoutes(app: Express, directory: string, getSession: () => { client: TelegramClient | null; accountId: string }) {
  const inFlight = new Map<string, Promise<string>>();
  app.post('/api/tg/calls/recordings/save', async (req, res) => {
    const { client, accountId } = getSession();
    if (!client?.connected || !accountId) return res.status(401).json({ error: 'Sign in to Telegram to save this recording.' });
    if (req.body.accountId !== accountId) return res.status(409).json({ error: 'This recording belongs to another account.' });
    const id = String(req.body.id || '');
    const name = String(req.body.name || 'Voice chat').trim().slice(0, 80);
    const startedAt = Number(req.body.startedAt);
    const duration = Math.round(Number(req.body.duration));
    const match = String(req.body.fileDataUrl || '').match(/^data:(audio\/(?:webm|ogg|mp4)(?:;codecs=[^;,]+)?);base64,([A-Za-z0-9+/=]+)$/);
    if (!/^[a-f0-9-]{36}$/i.test(id) || !Number.isFinite(startedAt) || !Number.isFinite(new Date(startedAt).getTime()) || !Number.isFinite(duration) || duration < 1 || duration > 1900 || !match) {
      return res.status(400).json({ error: 'Invalid audio recording.' });
    }
    const key = accountId + '-' + id;
    const receiptPath = path.join(directory, 'recording-' + key + '.json');
    try {
      if (fs.existsSync(receiptPath)) return res.json({ ok: true, messageId: JSON.parse(fs.readFileSync(receiptPath, 'utf8')).messageId });
      let saving = inFlight.get(key);
      if (!saving) {
        saving = (async () => {
          const buffer = Buffer.from(match[2], 'base64');
          if (!buffer.length || buffer.length > 40 * 1024 * 1024) throw new Error('Recording must be smaller than 40 MB.');
          const fileName = recordingFileName(name, startedAt, match[1]);
          const message = await client.sendFile('me', {
            file: new CustomFile(fileName, buffer.length, '', buffer),
            caption: name + '\n' + new Date(startedAt).toLocaleString('en-GB') + ' · ' + Math.floor(duration / 60) + ':' + String(duration % 60).padStart(2, '0'),
            forceDocument: true,
            silent: true,
            attributes: [new Api.DocumentAttributeAudio({ duration, title: name, performer: 'Call recording' })],
          });
          const messageId = message.id.toString();
          fs.writeFileSync(receiptPath + '.part', JSON.stringify({ messageId }));
          fs.renameSync(receiptPath + '.part', receiptPath);
          return messageId;
        })();
        inFlight.set(key, saving);
        void saving.catch(() => inFlight.delete(key));
      }
      return res.json({ ok: true, messageId: await saving });
    } catch (error) {
      return res.status(502).json({ error: (error as Error).message || 'Could not save recording.' });
    }
  });
}

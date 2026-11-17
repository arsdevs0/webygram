import { registerNativeCallRoutes, serializeNativeCall } from './src/server/nativeCalls';
import { registerContactRoutes } from './src/server/contacts';
import { registerCallRecordingRoutes } from './src/server/callRecordings';
import { registerMessageSearchRoutes } from './src/server/messageSearch';
import { chooseThumbnail, imageMime, withFreshMedia } from './src/server/mediaLoading';
import { parseByteRange } from './src/utils/byteRange';
import { atomicDownload } from './src/utils/atomicDownload';
import { normalizeForwardRequest, isForwardRestriction } from './src/utils/forwardOptions';
import { createForwardJob, runForwardJob, type ForwardJob } from './src/server/messageForwarding';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { Api, TelegramClient, helpers } from 'telegram';
import { computeCheck } from 'telegram/Password.js';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage, Raw } from 'telegram/events/index.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import { DeletedMessage } from 'telegram/events/DeletedMessage.js';
import { CustomFile } from 'telegram/client/uploads.js';
import { strippedPhotoToJpg } from 'telegram/Utils.js';

dotenv.config();
if (process.env.TG_PROFILE_WORKER !== '1' || !process.env.TG_PROFILE_KEY) {
  throw new Error('Start Webygram with npm run dev or npm start so each browser receives its own session.');
}

function resolveWritableDataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  // Never fall back to the shared workspace when a browser's directory fails.
  if (!configured) throw new Error('The browser session data directory is required.');
  fs.mkdirSync(configured, { recursive: true });
  fs.accessSync(configured, fs.constants.W_OK);
  return configured;
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = resolveWritableDataDir();
const SESSION_FILE = path.join(DATA_DIR, '.tgplus-session.json');
const VAULT_DIR = path.join(DATA_DIR, '.tgplus-vault');
const VAULT_INDEX_FILE = path.join(VAULT_DIR, 'vault-index.json');
const DELETED_LOG_FILE = path.join(VAULT_DIR, 'deleted-log.json');
const TARGET_GROUP_FILE = path.join(VAULT_DIR, 'target-group.json');
const DIALOGS_SNAPSHOT_FILE = path.join(VAULT_DIR, 'dialogs-snapshot.json');
const AUTO_FORWARD_FILE = path.join(VAULT_DIR, 'auto-forward-rules.json');
const SENT_MEDIA_FILE = path.join(VAULT_DIR, 'sent-media-registry.json');

if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
}

interface StoredSessionData {
  apiId: number;
  apiHash: string;
  sessionString: string;
  phoneNumber?: string;
}

interface AyuGramServerConfig {
  antiDeleteEnabled: boolean;
  saveDeletedMedia: boolean;
  antiEditEnabled: boolean;
  saveDisappearingMedia: boolean;
  preventTTLExpiration: boolean;
  autoSaveExpiringToSavedMessages: boolean;
  bypassContentRestrictions: boolean;
  hideForwardTag: boolean;
  ghostModeActive: boolean;
  sendOnlineStatus: boolean;
  sendReadReceipts: boolean;
  sendTypingIndicators: boolean;
  invisibleStories: boolean;
}

interface VaultEntry {
  key: string;
  chatId: string;
  chatTitle: string;
  messageId: number;
  mediaType: 'photo' | 'video' | 'voice' | 'file';
  fileName: string;
  mimeType: string;
  filePath: string;
  fileSize: number;
  isDisappearing: boolean;
  ttlSeconds?: number;
  savedAt: number;
}

interface CachedMessageMeta {
  groupedId?: string;
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  entities?: {
    type: 'bold' | 'italic' | 'code' | 'pre' | 'spoiler' | 'blockquote' | 'textUrl' | 'url' | 'mention';
    offset: number;
    length: number;
    url?: string;
  }[];
  timestamp: number;
  isOutgoing: boolean;
  isRead?: boolean;
  isDeletedBySender?: boolean;
  deletedAt?: number;
  editHistory?: { text: string; timestamp: number }[];
  isSavedFromTTL?: boolean;
  poll?: unknown;
  replyMarkup?: unknown;
  repliesCount?: number;
  canComment?: boolean;
  views?: number;
  forwards?: number;
  postAuthor?: string;
  replyToMsgId?: number;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
    mediaType?: string;
  };
  topicId?: number;
  media?: {
    isRoundVideo?: boolean;
    type: 'photo' | 'video' | 'voice' | 'file' | 'sticker' | 'gif';
    url: string;
    thumbnailUrl?: string;
    inlineThumb?: string;
    width?: number;
    height?: number;
    fileName?: string;
    fileSize?: string;
    duration?: number;
    waveform?: number[];
    mimeType?: string;
    isAnimated?: boolean;
    isDisappearing?: boolean;
    expireSeconds?: number;
    isExpired?: boolean;
    viewed?: boolean;
  };
}

interface DeletedLogEntry {
  id: string;
  chatId: string;
  originalMessageId: string;
  senderName: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'photo' | 'video' | 'voice' | 'file' | 'sticker' | 'gif';
  deletedAt: number;
}

let ayuConfig: AyuGramServerConfig = {
  antiDeleteEnabled: true,
  saveDeletedMedia: true,
  antiEditEnabled: true,
  saveDisappearingMedia: true,
  preventTTLExpiration: true,
  autoSaveExpiringToSavedMessages: true,
  bypassContentRestrictions: true,
  hideForwardTag: true,
  ghostModeActive: true,
  sendOnlineStatus: false,
  sendReadReceipts: false,
  sendTypingIndicators: false,
  invisibleStories: true,
};

const DEFAULT_TG_API_ID = Number(process.env.TELEGRAM_API_ID || 2040);
const DEFAULT_TG_API_HASH = String(process.env.TELEGRAM_API_HASH || 'b18441a1ff607e10a989891a5462e627');

let client: TelegramClient | null = null;
let pendingAuthClient: TelegramClient | null = null;
let initSessionPromise: Promise<void> | null = null;
let currentApiId = Number(process.env.TELEGRAM_API_ID || 0);
let currentApiHash = String(process.env.TELEGRAM_API_HASH || '');
let pendingPhone = '';
let pendingPhoneCodeHash = '';
let currentMe: Api.User | null = null;

interface QrAuthState {
  status: 'idle' | 'waiting_scan' | 'needs_2fa' | 'authorized' | 'error';
  qrUrl?: string;
  qrDataUrl?: string;
  hint?: string;
  error?: string;
  expires?: number;
  sessionString?: string;
  apiId?: number;
  apiHash?: string;
}

let qrAuthState: QrAuthState = { status: 'idle' };
let pendingQr2FAHandler: ((password: string) => Promise<{ ok: boolean; error?: string }>) | null = null;
let qrFlowGeneration = 0;
let qrWakeupResolver: (() => void) | null = null;

// Caches for AyuGram Anti-Delete, Anti-Edit, and TTL Media Vault
const messageCacheByChat = new Map<string, Map<number, CachedMessageMeta>>();
const msgIdToChatId = new Map<number, string>();
let vaultIndex: Record<string, VaultEntry> = {};
let deletedLogs: DeletedLogEntry[] = [];

interface TargetGroupConfig {
  id: string;
  title: string;
  username?: string;
  link: string;
  type: 'group' | 'channel' | 'saved' | 'user';
  memberCount?: number;
  setAt: number;
}

interface DialogSnapshot {
  id: string;
  type: 'user' | 'group' | 'channel' | 'bot' | 'saved';
  title: string;
  username?: string;
  avatarUrl?: string;
  unreadCount: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isProtected?: boolean;
  isVerified?: boolean;
  isCreator?: boolean;
  isAdmin?: boolean;
  canPostMessages?: boolean;
  canSendMedia?: boolean;
  sendRestrictionReason?: string;
  isForum?: boolean;
  draftText?: string;
  hasScheduled?: boolean;
  isDeletedChat?: boolean;
  deletedAt?: number;
  status?: string;
  memberCount?: number;
  lastMessage?: {
    text: string;
    timestamp: number;
    senderName?: string;
    isOutgoing?: boolean;
    isRead?: boolean;
  };
}

const stickerDocCache = new Map<string, Api.Document>();
const docDownloadInFlight = new Map<string, Promise<Buffer | null>>();

interface AutoForwardRuleServer {
  chatId: string;
  chatTitle: string;
  enabled: boolean;
  includePhotos: boolean;
  includeVideos: boolean;
  includeFiles: boolean;
  lastMsgId: number;
  forwardedCount: number;
  lastForwardedAt?: number;
}

interface SentMediaRecord {
  msgIds: number[];
  fingerprints: string[];
  updatedAt: number;
}

let savedTargetGroup: TargetGroupConfig | null = null;
let dialogsSnapshot: Record<string, DialogSnapshot> = {};
let autoForwardRules: Record<string, AutoForwardRuleServer> = {};
let sentMediaRegistry: Record<string, SentMediaRecord> = {};
const targetExistingFingerprintsCache = new Map<string, { at: number; fps: Set<string> }>();
const inFlightTargetSendKeys = new Set<string>();

try {
  if (fs.existsSync(VAULT_INDEX_FILE)) {
    vaultIndex = JSON.parse(fs.readFileSync(VAULT_INDEX_FILE, 'utf-8'));
  }
} catch {
  vaultIndex = {};
}

try {
  if (fs.existsSync(DELETED_LOG_FILE)) {
    deletedLogs = JSON.parse(fs.readFileSync(DELETED_LOG_FILE, 'utf-8'));
  }
} catch {
  deletedLogs = [];
}

try {
  if (fs.existsSync(TARGET_GROUP_FILE)) {
    savedTargetGroup = JSON.parse(fs.readFileSync(TARGET_GROUP_FILE, 'utf-8'));
  }
} catch {
  savedTargetGroup = null;
}

try {
  if (fs.existsSync(DIALOGS_SNAPSHOT_FILE)) {
    dialogsSnapshot = JSON.parse(fs.readFileSync(DIALOGS_SNAPSHOT_FILE, 'utf-8'));
  }
} catch {
  dialogsSnapshot = {};
}

try {
  if (fs.existsSync(AUTO_FORWARD_FILE)) {
    autoForwardRules = JSON.parse(fs.readFileSync(AUTO_FORWARD_FILE, 'utf-8'));
  }
} catch {
  autoForwardRules = {};
}

try {
  if (fs.existsSync(SENT_MEDIA_FILE)) {
    sentMediaRegistry = JSON.parse(fs.readFileSync(SENT_MEDIA_FILE, 'utf-8'));
  }
} catch {
  sentMediaRegistry = {};
}

function persistAutoForwardRules() {
  try {
    fs.writeFileSync(AUTO_FORWARD_FILE, JSON.stringify(autoForwardRules, null, 2));
  } catch {
    // ignore
  }
}

function persistSentMediaRegistry() {
  try {
    fs.writeFileSync(SENT_MEDIA_FILE, JSON.stringify(sentMediaRegistry, null, 2));
  } catch {
    // ignore
  }
}

function persistDialogsSnapshot() {
  try {
    fs.writeFileSync(DIALOGS_SNAPSHOT_FILE, JSON.stringify(dialogsSnapshot, null, 2));
  } catch {
    // ignore
  }
}

function persistTargetGroup() {
  try {
    if (savedTargetGroup) {
      fs.writeFileSync(TARGET_GROUP_FILE, JSON.stringify(savedTargetGroup, null, 2));
    } else if (fs.existsSync(TARGET_GROUP_FILE)) {
      fs.unlinkSync(TARGET_GROUP_FILE);
    }
  } catch {
    // ignore
  }
}

function persistVaultIndex() {
  try {
    fs.writeFileSync(VAULT_INDEX_FILE, JSON.stringify(vaultIndex, null, 2));
  } catch {
    // ignore disk error
  }
}

function persistDeletedLogs() {
  try {
    fs.writeFileSync(DELETED_LOG_FILE, JSON.stringify(deletedLogs.slice(0, 200), null, 2));
  } catch {
    // ignore disk error
  }
}

const SESSION_BACKUP_FILE = path.join(VAULT_DIR, '.tgplus-session.bak.json');

function saveSessionFile(data: StoredSessionData) {
  const payload = JSON.stringify(data, null, 2);
  for (const targetFile of [SESSION_FILE, SESSION_BACKUP_FILE]) {
    try {
      const tmp = `${targetFile}.tmp.${process.pid}`;
      fs.writeFileSync(tmp, payload);
      fs.renameSync(tmp, targetFile);
    } catch {
      try {
        fs.writeFileSync(targetFile, payload);
      } catch {
        // ignore
      }
    }
  }
}

function removeSessionFiles() {
  for (const targetFile of [SESSION_FILE, SESSION_BACKUP_FILE]) {
    try {
      if (fs.existsSync(targetFile)) {
        fs.unlinkSync(targetFile);
      }
    } catch {
      // ignore
    }
  }
}

function loadSessionFile(): StoredSessionData | null {
  for (const candidate of [SESSION_FILE, SESSION_BACKUP_FILE]) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        if (parsed && parsed.sessionString) {
          return parsed as StoredSessionData;
        }
      }
    } catch {
      // try next backup
    }
  }
  const envSession = process.env.TELEGRAM_SESSION?.trim();
  if (envSession) {
    return {
      apiId: Number(process.env.TELEGRAM_API_ID || DEFAULT_TG_API_ID),
      apiHash: String(process.env.TELEGRAM_API_HASH || DEFAULT_TG_API_HASH),
      sessionString: envSession,
    };
  }
  return null;
}

function getRawTgError(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err || '');
  const e = err as { errorMessage?: string; message?: string };
  return String(e.errorMessage || e.message || err || '');
}

function isPermanentSessionError(err: unknown): boolean {
  const msg = getRawTgError(err).toUpperCase();
  return (
    msg.includes('AUTH_KEY_UNREGISTERED') ||
    msg.includes('AUTH_KEY_INVALID') ||
    msg.includes('AUTH_KEY_PERM_EMPTY') ||
    msg.includes('SESSION_REVOKED') ||
    msg.includes('SESSION_EXPIRED') ||
    msg.includes('USER_DEACTIVATED') ||
    msg.includes('AUTH_KEY_DUPLICATED')
  );
}

function isTransientConnectionError(err: unknown): boolean {
  const msg = getRawTgError(err);
  const upper = msg.toUpperCase();
  return (
    upper.includes('NOT CONNECTED') ||
    upper.includes('CONNECTION_NOT_INITED') ||
    upper.includes('TIMEOUT') ||
    upper.includes('ECONNRESET') ||
    upper.includes('ETIMEDOUT') ||
    upper.includes('EPIPE') ||
    upper.includes('CONNECTION CLOSED') ||
    upper.includes('SENDMESSAGE') && upper.includes('FAIL') ||
    upper.includes('RECONNECT')
  );
}

function parsePositiveInt(val: unknown): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function isBanExpired(rights?: { untilDate?: number } | null): boolean {
  if (!rights || typeof rights.untilDate !== 'number' || rights.untilDate <= 0) {
    return false;
  }
  return rights.untilDate * 1000 <= Date.now();
}

const peerEntityCache = new Map<string, Api.TypeUser | Api.TypeChat>();
const rawMessageCache = new Map<string, Api.Message>();
const chatReadOutboxMaxId = new Map<string, number>();
const avatarNegCache = new Map<string, number>();
const avatarInFlight = new Map<string, Promise<Buffer | null>>();
let activeAvatarJobs = 0;
const avatarQueue: (() => void)[] = [];

const mediaInFlight = new Map<string, Promise<VaultEntry | null>>();
const mediaThumbInFlight = new Map<string, Promise<Buffer | null>>();
let activeMediaJobs = 0;
const mediaQueue: (() => void)[] = [];

function storeRawMessage(chatId: string, msg: Api.Message) {
  const key = getVaultKey(chatId, msg.id);
  rawMessageCache.delete(key);
  rawMessageCache.set(key, msg);
  if (rawMessageCache.size > 6000) {
    const oldest = rawMessageCache.keys().next().value;
    if (oldest) rawMessageCache.delete(oldest);
  }
}

function extractInstantThumbBuffer(msg: Api.Message): Buffer | null {
  try {
    const mMedia = msg.media;
    if (mMedia instanceof Api.MessageMediaPhoto && mMedia.photo instanceof Api.Photo) {
      const sizes = mMedia.photo.sizes || [];
      const cached = sizes.find((s): s is Api.PhotoCachedSize => s instanceof Api.PhotoCachedSize);
      if (cached && cached.bytes && cached.bytes.length > 0) {
        return Buffer.from(cached.bytes);
      }
      const stripped = sizes.find((s): s is Api.PhotoStrippedSize => s instanceof Api.PhotoStrippedSize);
      if (stripped && stripped.bytes && stripped.bytes.length > 0) {
        return strippedPhotoToJpg(Buffer.from(stripped.bytes));
      }
    } else if (mMedia instanceof Api.MessageMediaDocument && mMedia.document instanceof Api.Document) {
      const thumbs = mMedia.document.thumbs || [];
      const cached = thumbs.find((s): s is Api.PhotoCachedSize => s instanceof Api.PhotoCachedSize);
      if (cached && cached.bytes && cached.bytes.length > 0) {
        return Buffer.from(cached.bytes);
      }
      const stripped = thumbs.find((s): s is Api.PhotoStrippedSize => s instanceof Api.PhotoStrippedSize);
      if (stripped && stripped.bytes && stripped.bytes.length > 0) {
        return strippedPhotoToJpg(Buffer.from(stripped.bytes));
      }
    }
  } catch {
    // ignore decode errors
  }
  return null;
}

async function runWithAvatarLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeAvatarJobs >= 12) {
    await new Promise<void>((resolve) => avatarQueue.push(resolve));
  }
  activeAvatarJobs++;
  try {
    return await fn();
  } finally {
    activeAvatarJobs--;
    const next = avatarQueue.shift();
    if (next) next();
  }
}

async function runWithMediaLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeMediaJobs >= 18) {
    await new Promise<void>((resolve) => mediaQueue.push(resolve));
  }
  activeMediaJobs++;
  try {
    return await fn();
  } finally {
    activeMediaJobs--;
    const next = mediaQueue.shift();
    if (next) next();
  }
}

function hasEntityPhoto(ent: unknown): boolean {
  if (!ent || typeof ent !== 'object') return false;
  const photo = (ent as { photo?: unknown }).photo;
  if (!photo) return false;
  if (photo instanceof Api.UserProfilePhotoEmpty || photo instanceof Api.ChatPhotoEmpty) return false;
  return true;
}

const wsClients = new Set<WebSocket>();

function broadcastWs(payload: Record<string, unknown>) {
  const raw = JSON.stringify(payload);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    }
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function serializeUser(user: Api.User | null) {
  if (!user) {
    return {
      id: '',
      firstName: 'Not Signed In',
      status: 'offline' as const,
    };
  }
  return {
    id: user.id.toString(),
    firstName: user.firstName || 'Telegram',
    lastName: user.lastName || '',
    username: user.username || '',
    phone: user.phone ? `+${user.phone.replace(/^\+/, '')}` : '',
    avatarUrl: `/api/tg/avatar/me`,
    isPremium: Boolean(user.premium),
    status: ayuConfig.ghostModeActive && !ayuConfig.sendOnlineStatus ? ('offline' as const) : ('online' as const),
    bio: '',
  };
}

function decodeTelegramWaveform(raw?: Buffer | Uint8Array): number[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const totalBits = raw.length * 8;
  const sampleCount = Math.floor(totalBits / 5);
  if (sampleCount <= 0) return undefined;
  const samples: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const bitOffset = i * 5;
    const byteIdx = bitOffset >> 3;
    const bitInByte = bitOffset & 7;
    const lo = raw[byteIdx] || 0;
    const hi = byteIdx + 1 < raw.length ? raw[byteIdx + 1] : 0;
    const val = ((lo | (hi << 8)) >> bitInByte) & 0x1f;
    samples.push(Math.max(16, Math.min(100, Math.round((val / 31) * 86) + 14)));
  }
  const targetBars = 28;
  if (samples.length <= targetBars) return samples;
  const out: number[] = [];
  const step = samples.length / targetBars;
  for (let b = 0; b < targetBars; b++) {
    const start = Math.floor(b * step);
    const end = Math.max(start + 1, Math.floor((b + 1) * step));
    let sum = 0;
    for (let k = start; k < end; k++) sum += samples[k];
    out.push(Math.round(sum / (end - start)));
  }
  return out;
}

function encodeTelegramWaveform(samples01To31: number[]): Buffer {
  const count = 100;
  const normalized = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const srcIdx = Math.min(samples01To31.length - 1, Math.floor((i / count) * samples01To31.length));
    const v = samples01To31.length > 0 ? samples01To31[srcIdx] : 8;
    normalized[i] = Math.max(0, Math.min(31, Math.round(v)));
  }
  const byteLen = Math.ceil((count * 5) / 8);
  const buf = Buffer.alloc(byteLen);
  for (let i = 0; i < count; i++) {
    const val = normalized[i];
    const bitOffset = i * 5;
    const byteIdx = bitOffset >> 3;
    const bitInByte = bitOffset & 7;
    buf[byteIdx] |= (val << bitInByte) & 0xff;
    if (bitInByte > 3 && byteIdx + 1 < byteLen) {
      buf[byteIdx + 1] |= val >> (8 - bitInByte);
    }
  }
  return buf;
}

function runExecFile(cmd: string, args: string[], encoding?: 'buffer'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { maxBuffer: 32 * 1024 * 1024, encoding: encoding || 'buffer' },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      }
    );
  });
}

async function convertBufferToTelegramVoice(
  inputBuffer: Buffer,
  inputExt: string,
  fallbackDuration: number
): Promise<{ oggBuffer: Buffer; duration: number; waveform: Buffer }> {
  const uid = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const cleanExt = inputExt.replace(/[^a-z0-9]/gi, '') || 'webm';
  const inPath = path.join(os.tmpdir(), `webygram_vin_${uid}.${cleanExt}`);
  const outPath = path.join(os.tmpdir(), `webygram_vout_${uid}.ogg`);

  try {
    fs.writeFileSync(inPath, inputBuffer);
    await runExecFile('ffmpeg', [
      '-y',
      '-i',
      inPath,
      '-vn',
      '-c:a',
      'libopus',
      '-b:a',
      '32k',
      '-vbr',
      'on',
      '-compression_level',
      '10',
      '-application',
      'voip',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-f',
      'ogg',
      outPath,
    ]);

    const oggBuffer = fs.readFileSync(outPath);
    if (!oggBuffer || oggBuffer.length < 32) {
      throw new Error('Transcoded OGG output was empty.');
    }

    let realDuration = Math.max(1, Math.round(fallbackDuration || 1));
    let waveformSamples: number[] = [];

    try {
      const pcmBuf = await runExecFile('ffmpeg', [
        '-y',
        '-i',
        outPath,
        '-ac',
        '1',
        '-ar',
        '8000',
        '-f',
        's16le',
        'pipe:1',
      ]);
      const sampleCount = Math.floor(pcmBuf.length / 2);
      if (sampleCount > 0) {
        realDuration = Math.max(1, Math.round(sampleCount / 8000));
        const buckets = 100;
        const chunk = Math.max(1, Math.floor(sampleCount / buckets));
        const peaks: number[] = [];
        let maxPeak = 1;
        for (let b = 0; b < buckets; b++) {
          const start = b * chunk;
          const end = Math.min(sampleCount, start + chunk);
          let peak = 0;
          for (let s = start; s < end; s++) {
            const val = Math.abs(pcmBuf.readInt16LE(s * 2));
            if (val > peak) peak = val;
          }
          peaks.push(peak);
          if (peak > maxPeak) maxPeak = peak;
        }
        const scaleRef = Math.max(maxPeak, 1200);
        waveformSamples = peaks.map((p) =>
          Math.max(1, Math.min(31, Math.round(Math.pow(p / scaleRef, 0.72) * 31)))
        );
      }
    } catch {
      waveformSamples = Array.from({ length: 100 }, (_, idx) =>
        Math.max(4, Math.min(28, Math.round(14 + Math.sin(idx * 0.45) * 9)))
      );
    }

    return {
      oggBuffer,
      duration: realDuration,
      waveform: encodeTelegramWaveform(waveformSamples),
    };
  } finally {
    try {
      if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
    } catch {
      // ignore cleanup
    }
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {
      // ignore cleanup
    }
  }
}

function detectMediaInfo(msg: Api.Message): {
  type: 'photo' | 'video' | 'voice' | 'file' | 'sticker' | 'gif';
  mimeType: string;
  fileName: string;
  fileSize?: string;
  width?: number;
  height?: number;
  duration?: number;
  waveform?: number[];
  isDisappearing: boolean;
  expireSeconds?: number;
  isAnimated?: boolean;
} | null {
  let media: unknown = msg.media;
  if (!media) return null;

  let ttl = (media as { ttlSeconds?: number }).ttlSeconds;
  if (media instanceof Api.MessageMediaWebPage) {
    if (media.webpage instanceof Api.WebPage) {
      media = media.webpage.document || media.webpage.photo || null;
      ttl = undefined;
    } else {
      return null;
    }
  }
  if (!media) return null;

  if (media instanceof Api.MessageMediaPhoto || media instanceof Api.Photo) {
    const photo = media instanceof Api.Photo ? media : media.photo;
    const size = photo instanceof Api.Photo ? photo.sizes.filter((s): s is Api.PhotoSize | Api.PhotoSizeProgressive => s instanceof Api.PhotoSize || s instanceof Api.PhotoSizeProgressive).sort((a, b) => b.w * b.h - a.w * a.h)[0] : undefined;
    return {
      type: 'photo',
      width: size?.w,
      height: size?.h,
      mimeType: 'image/jpeg',
      fileName: `tg_photo_${msg.id}.jpg`,
      isDisappearing: Boolean(ttl && ttl > 0),
      expireSeconds: ttl || undefined,
    };
  }

  const doc =
    media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document
      ? media.document
      : media instanceof Api.Document
      ? media
      : null;

  if (doc) {
    const mime = doc.mimeType || 'application/octet-stream';
    const attrs = doc.attributes || [];
    let fileName = `tg_file_${msg.id}`;
    let duration = 0;
    let isVoice = false;
    let waveform: number[] | undefined;
    let isVideo = mime.startsWith('video/');
    let isAnimated = false;
    let isSticker = false;

    for (const attr of attrs) {
      if (attr instanceof Api.DocumentAttributeFilename) {
        fileName = attr.fileName;
      } else if (attr instanceof Api.DocumentAttributeAudio) {
        duration = attr.duration || 0;
        if (attr.voice) {
          isVoice = true;
          if (attr.waveform) {
            waveform = decodeTelegramWaveform(attr.waveform);
          }
        }
      } else if (attr instanceof Api.DocumentAttributeVideo) {
        duration = attr.duration || 0;
        isVideo = true;
      } else if (attr instanceof Api.DocumentAttributeAnimated) {
        isAnimated = true;
      } else if (attr instanceof Api.DocumentAttributeSticker) {
        isSticker = true;
      }
    }

    if (isSticker) {
      if (!fileName.includes('.')) {
        fileName += mime.includes('tgsticker') ? '.tgs' : mime.includes('webm') ? '.webm' : '.webp';
      }
      return {
        type: 'sticker',
        mimeType: mime,
        fileName,
        fileSize: formatBytes(Number(doc.size)),
        isDisappearing: false,
        isAnimated: mime.includes('tgsticker') || mime.includes('webm') || isAnimated,
      };
    }

    if (isAnimated && (mime.startsWith('video/') || mime === 'image/gif')) {
      if (!fileName.includes('.')) fileName += mime === 'image/gif' ? '.gif' : '.mp4';
      return {
        type: 'gif',
        mimeType: mime,
        fileName,
        fileSize: formatBytes(Number(doc.size)),
        duration: duration || undefined,
        isDisappearing: Boolean(ttl && ttl > 0),
        expireSeconds: ttl || undefined,
        isAnimated: true,
      };
    }

    if (isVoice || mime === 'audio/ogg') {
      if (!fileName.includes('.')) fileName += '.ogg';
      return {
        type: 'voice',
        mimeType: mime === 'application/octet-stream' ? 'audio/ogg' : mime,
        fileName,
        fileSize: formatBytes(Number(doc.size)),
        duration,
        waveform,
        isDisappearing: Boolean(ttl && ttl > 0),
        expireSeconds: ttl || undefined,
      };
    }

    if (isVideo) {
      if (!fileName.includes('.')) fileName += '.mp4';
      return {
        type: 'video',
        mimeType: mime.startsWith('video/') ? mime : 'video/mp4',
        fileName,
        fileSize: formatBytes(Number(doc.size)),
        duration,
        isDisappearing: Boolean(ttl && ttl > 0),
        expireSeconds: ttl || undefined,
        isAnimated,
      };
    }

    if (mime.startsWith('image/')) {
      if (!fileName.includes('.')) fileName += mime.includes('webp') ? '.webp' : '.jpg';
      return {
        type: 'photo',
        mimeType: mime,
        fileName,
        fileSize: formatBytes(Number(doc.size)),
        isDisappearing: Boolean(ttl && ttl > 0),
        expireSeconds: ttl || undefined,
        isAnimated,
      };
    }

    return {
      type: 'file',
      mimeType: mime,
      fileName,
      fileSize: formatBytes(Number(doc.size)),
      duration: duration || undefined,
      isDisappearing: Boolean(ttl && ttl > 0),
      expireSeconds: ttl || undefined,
    };
  }

  return null;
}

function extractTextWithEntitiesStr(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && 'text' in (val as { text?: unknown })) {
    return String((val as { text?: unknown }).text || '');
  }
  return String(val);
}

function serializeEntities(entities?: Api.TypeMessageEntity[]) {
  if (!entities || entities.length === 0) return undefined;
  const out: CachedMessageMeta['entities'] = [];
  for (const e of entities) {
    if (e instanceof Api.MessageEntityBold) {
      out.push({ type: 'bold', offset: e.offset, length: e.length });
    } else if (e instanceof Api.MessageEntityItalic) {
      out.push({ type: 'italic', offset: e.offset, length: e.length });
    } else if (e instanceof Api.MessageEntityCode) {
      out.push({ type: 'code', offset: e.offset, length: e.length });
    } else if (e instanceof Api.MessageEntityPre) {
      out.push({ type: 'pre', offset: e.offset, length: e.length });
    } else if (e instanceof Api.MessageEntitySpoiler) {
      out.push({ type: 'spoiler', offset: e.offset, length: e.length });
    } else if (e instanceof Api.MessageEntityBlockquote) {
      out.push({ type: 'blockquote', offset: e.offset, length: e.length });
    } else if (e instanceof Api.MessageEntityTextUrl) {
      out.push({ type: 'textUrl', offset: e.offset, length: e.length, url: e.url });
    } else if (e instanceof Api.MessageEntityUrl) {
      out.push({ type: 'url', offset: e.offset, length: e.length });
    } else if (e instanceof Api.MessageEntityMention) {
      out.push({ type: 'mention', offset: e.offset, length: e.length });
    }
  }
  return out.length > 0 ? out : undefined;
}

function parseRichMarkdown(raw: string): { message: string; entities: Api.TypeMessageEntity[] } {
  const entities: Api.TypeMessageEntity[] = [];
  let plain = '';
  let i = 0;

  while (i < raw.length) {
    // Escaped token or standard spans: **bold**, __italic__, ||spoiler||, `code`, [label](url)
    if (raw.startsWith('**', i)) {
      const end = raw.indexOf('**', i + 2);
      if (end > i + 2) {
        const inner = raw.slice(i + 2, end);
        entities.push(new Api.MessageEntityBold({ offset: plain.length, length: inner.length }));
        plain += inner;
        i = end + 2;
        continue;
      }
    }
    if (raw.startsWith('__', i)) {
      const end = raw.indexOf('__', i + 2);
      if (end > i + 2) {
        const inner = raw.slice(i + 2, end);
        entities.push(new Api.MessageEntityItalic({ offset: plain.length, length: inner.length }));
        plain += inner;
        i = end + 2;
        continue;
      }
    }
    if (raw.startsWith('||', i)) {
      const end = raw.indexOf('||', i + 2);
      if (end > i + 2) {
        const inner = raw.slice(i + 2, end);
        entities.push(new Api.MessageEntitySpoiler({ offset: plain.length, length: inner.length }));
        plain += inner;
        i = end + 2;
        continue;
      }
    }
    if (raw.startsWith('`', i)) {
      const end = raw.indexOf('`', i + 1);
      if (end > i + 1) {
        const inner = raw.slice(i + 1, end);
        entities.push(new Api.MessageEntityCode({ offset: plain.length, length: inner.length }));
        plain += inner;
        i = end + 1;
        continue;
      }
    }
    if (raw[i] === '[') {
      const closeBracket = raw.indexOf(']', i + 1);
      if (closeBracket > i + 1 && raw[closeBracket + 1] === '(') {
        const closeParen = raw.indexOf(')', closeBracket + 2);
        if (closeParen > closeBracket + 2) {
          const label = raw.slice(i + 1, closeBracket);
          const url = raw.slice(closeBracket + 2, closeParen).trim();
          if (/^https?:\/\//i.test(url)) {
            entities.push(
              new Api.MessageEntityTextUrl({
                offset: plain.length,
                length: label.length,
                url,
              })
            );
            plain += label;
            i = closeParen + 1;
            continue;
          }
        }
      }
    }
    if ((i === 0 || raw[i - 1] === '\n') && raw.startsWith('> ', i)) {
      const lineEnd = raw.indexOf('\n', i + 2);
      const inner = lineEnd === -1 ? raw.slice(i + 2) : raw.slice(i + 2, lineEnd);
      if (inner.length > 0) {
        entities.push(new Api.MessageEntityBlockquote({ offset: plain.length, length: inner.length }));
        plain += inner;
        i = lineEnd === -1 ? raw.length : lineEnd;
        continue;
      }
    }
    plain += raw[i];
    i++;
  }

  const validEntities = entities.filter(
    (e) =>
      typeof e.offset === 'number' &&
      typeof e.length === 'number' &&
      e.length > 0 &&
      e.offset >= 0 &&
      e.offset + e.length <= plain.length
  );

  if (!plain && raw.trim().length > 0) {
    return { message: raw, entities: [] };
  }

  return { message: plain, entities: validEntities };
}

function serializePoll(media: unknown) {
  if (!(media instanceof Api.MessageMediaPoll) || !media.poll) return undefined;
  const p = media.poll;
  const results = media.results;
  const resList = results?.results || [];

  const options = p.answers.map((ans) => {
    const optHex = Buffer.from(ans.option).toString('hex');
    const r = resList.find((x) => Buffer.from(x.option).toString('hex') === optHex);
    return {
      text: extractTextWithEntitiesStr(ans.text),
      optionHex: optHex,
      voters: r ? r.voters : 0,
      chosen: Boolean(r?.chosen),
      correct: Boolean(r?.correct),
    };
  });

  return {
    id: p.id.toString(),
    question: extractTextWithEntitiesStr(p.question),
    options,
    totalVoters: results?.totalVoters || 0,
    closed: Boolean(p.closed),
    multipleChoice: Boolean(p.multipleChoice),
    quiz: Boolean(p.quiz),
    solution: results?.solution ? extractTextWithEntitiesStr(results.solution) : undefined,
    publicVoters: Boolean(p.publicVoters),
  };
}

function serializeReplyMarkup(markup: unknown) {
  if (!(markup instanceof Api.ReplyInlineMarkup) || !markup.rows?.length) return undefined;
  const rows = markup.rows.map((row) =>
    row.buttons
      .map((btn) => {
        if (btn instanceof Api.KeyboardButtonUrl) {
          return { text: btn.text, url: btn.url };
        }
        if (btn instanceof Api.KeyboardButtonCallback) {
          return { text: btn.text, callbackDataHex: Buffer.from(btn.data).toString('hex') };
        }
        if (btn instanceof Api.KeyboardButtonSwitchInline) {
          return { text: btn.text, switchInline: btn.query };
        }
        if ('text' in btn) {
          return { text: String((btn as { text: string }).text) };
        }
        return null;
      })
      .filter(Boolean)
  );
  return rows.filter((r) => r.length > 0);
}

function serializeBannedRights(rights?: Api.ChatBannedRights | null) {
  return {
    sendMessages: !rights?.sendMessages,
    sendMedia: !rights?.sendMedia,
    sendStickers: !rights?.sendStickers,
    sendPolls: !rights?.sendPolls,
    embedLinks: !rights?.embedLinks,
    inviteUsers: !rights?.inviteUsers,
    pinMessages: !rights?.pinMessages,
    changeInfo: !rights?.changeInfo,
  };
}

function getVaultKey(chatId: string, msgId: number) {
  return `${chatId}_${msgId}`;
}

async function cacheMediaToVault(
  tgClient: TelegramClient,
  chatId: string,
  chatTitle: string,
  msg: Api.Message,
  isDisappearing: boolean,
  ttlSeconds?: number
): Promise<VaultEntry | null> {
  const info = detectMediaInfo(msg);
  if (!info) return null;

  const key = getVaultKey(chatId, msg.id);
  const existing = vaultIndex[key];
  if (existing && fs.existsSync(existing.filePath)) {
    return existing;
  }

  const inflight = mediaInFlight.get(key);
  if (inflight) return inflight;

  const task = runWithMediaLimit(async () => {
    const doubleCheck = vaultIndex[key];
    if (doubleCheck && fs.existsSync(doubleCheck.filePath)) {
      return doubleCheck;
    }
    try {
      const ext =
        path.extname(info.fileName) ||
        (info.type === 'video' ? '.mp4' : info.type === 'voice' ? '.ogg' : '.jpg');
      const safeName = `${chatId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${msg.id}${ext}`;
      const filePath = path.join(VAULT_DIR, safeName);
      // GramJS supports a writer at runtime; its public type only lists string/Buffer.
      const fileSize = await withFreshMedia(msg, source => atomicDownload(filePath, writer =>
        tgClient.downloadMedia(source, { outputFile: writer as unknown as Buffer })
      ), async () => {
        const peer = await resolvePeer(tgClient, chatId);
        const fresh = (await tgClient.getMessages(peer, { ids: [msg.id] }))[0];
        if (fresh) storeRawMessage(chatId, fresh);
        return fresh;
      }
      );

      const entry: VaultEntry = {
        key,
        chatId,
        chatTitle,
        messageId: msg.id,
        mediaType:
          info.type === 'sticker' || info.type === 'gif'
            ? info.mimeType.startsWith('video/')
              ? 'video'
              : 'photo'
            : info.type,
        fileName: info.fileName,
        mimeType: info.mimeType,
        filePath,
        fileSize,
        isDisappearing,
        ttlSeconds,
        savedAt: Date.now(),
      };
      vaultIndex[key] = entry;
      persistVaultIndex();
      return entry;
    } catch (err) {
      console.warn('Media vault cache warning:', (err as Error).message);
      return null;
    }
  }).finally(() => {
    mediaInFlight.delete(key);
  });

  mediaInFlight.set(key, task);
  return task;
}

function serializeMessage(
  msg: Api.Message,
  chatId: string,
  senderName?: string,
  senderAvatar?: string
): CachedMessageMeta & { senderAvatar?: string } {
  const mediaInfo = detectMediaInfo(msg);
  const key = getVaultKey(chatId, msg.id);
  const existingCache = messageCacheByChat.get(chatId)?.get(msg.id);
  const vaulted = vaultIndex[key];

  const resolvedSender =
    senderName ||
    existingCache?.senderName ||
    (msg.out ? (currentMe?.firstName || 'You') : 'Telegram');

  let senderIdStr = chatId;
  if (msg.fromId instanceof Api.PeerUser) {
    senderIdStr = msg.fromId.userId.toString();
  } else if (msg.fromId instanceof Api.PeerChannel) {
    senderIdStr = `-100${msg.fromId.channelId.toString().replace(/^-100/, '')}`;
  } else if (msg.fromId instanceof Api.PeerChat) {
    senderIdStr = `-${msg.fromId.chatId.toString().replace(/^-/, '')}`;
  } else if (!msg.out && msg.peerId instanceof Api.PeerUser) {
    senderIdStr = msg.peerId.userId.toString();
  } else if (msg.out && currentMe) {
    senderIdStr = currentMe.id.toString();
  } else if (msg.senderId) {
    senderIdStr = msg.senderId.toString();
  }

  const embeddedSender = (msg as unknown as { _sender?: unknown })._sender;
  if (embeddedSender && senderIdStr && !peerEntityCache.has(senderIdStr)) {
    extractEntityQuickMeta(embeddedSender, senderIdStr);
  }

  const pollData = serializePoll(msg.media);
  const replyMarkup = serializeReplyMarkup(msg.replyMarkup);
  const entities = serializeEntities(msg.entities);
  const replyHeader = msg.replyTo instanceof Api.MessageReplyHeader ? msg.replyTo : undefined;
  const replyToMsgId = replyHeader?.replyToMsgId;
  const topicId = replyHeader?.replyToTopId || (replyHeader?.forumTopic ? replyHeader.replyToMsgId : undefined);

  let replyToObj = existingCache?.replyTo;
  if (!replyToObj && replyToMsgId) {
    const cachedReply = messageCacheByChat.get(chatId)?.get(replyToMsgId);
    if (cachedReply) {
      replyToObj = {
        id: String(replyToMsgId),
        senderName: cachedReply.senderName || 'Message',
        text: cachedReply.text || (cachedReply.media ? `${cachedReply.media.type === 'photo' ? 'Photo' : cachedReply.media.type === 'video' ? 'Video' : cachedReply.media.type === 'voice' ? 'Voice message' : cachedReply.media.type === 'sticker' ? 'Sticker' : cachedReply.media.fileName || 'Media'}` : 'Message'),
        mediaType: cachedReply.media?.type,
      };
    } else {
      const rawReply = rawMessageCache.get(getVaultKey(chatId, replyToMsgId));
      if (rawReply) {
        const rMedia = detectMediaInfo(rawReply);
        replyToObj = {
          id: String(replyToMsgId),
          senderName: rawReply.out ? (currentMe?.firstName || 'You') : rawReply.postAuthor || 'Reply',
          text: rawReply.message || (rMedia ? `${rMedia.type === 'photo' ? 'Photo' : rMedia.type === 'video' ? 'Video' : rMedia.type === 'voice' ? 'Voice message' : rMedia.type === 'sticker' ? 'Sticker' : rMedia.fileName || 'Media'}` : 'Message'),
          mediaType: rMedia?.type,
        };
      }
    }
  }

  const canComment = Boolean(msg.replies?.comments);

  const meIdStr = currentMe?.id?.toString();
  const readOutboxMax = chatReadOutboxMaxId.get(chatId);
  const computedIsRead = !msg.out
    ? true
    : chatId === 'me' || (meIdStr && chatId === meIdStr)
    ? true
    : typeof readOutboxMax === 'number'
    ? msg.id <= readOutboxMax
    : Boolean(existingCache?.isRead);

  const meta: CachedMessageMeta & { senderAvatar?: string } = {
    id: String(msg.id),
    chatId,
    senderId: senderIdStr,
    senderName: resolvedSender,
    senderAvatar: senderAvatar ?? (existingCache as (CachedMessageMeta & { senderAvatar?: string }) | undefined)?.senderAvatar,
    text: msg.message || '',
    entities,
    groupedId: msg.groupedId?.toString(),
    timestamp: msg.date ? msg.date * 1000 : Date.now(),
    isOutgoing: Boolean(msg.out),
    isRead: computedIsRead,
    isDeletedBySender: existingCache?.isDeletedBySender,
    deletedAt: existingCache?.deletedAt,
    editHistory: existingCache?.editHistory,
    isSavedFromTTL: Boolean(vaulted?.isDisappearing || existingCache?.isSavedFromTTL),
    poll: pollData,
    replyMarkup,
    repliesCount: msg.replies?.replies || 0,
    canComment,
    views: typeof msg.views === 'number' ? msg.views : undefined,
    forwards: typeof msg.forwards === 'number' ? msg.forwards : undefined,
    postAuthor: msg.postAuthor || undefined,
    replyToMsgId,
    replyTo: replyToObj,
    topicId,
    media: mediaInfo
      ? (() => {
          let inlineThumb = existingCache?.media?.inlineThumb;
          if (
            !inlineThumb &&
            (mediaInfo.type === 'photo' ||
              mediaInfo.type === 'video' ||
              mediaInfo.type === 'gif' ||
              mediaInfo.type === 'sticker')
          ) {
            const instantBuf = extractInstantThumbBuffer(msg);
            if (instantBuf && instantBuf.length > 0) {
              inlineThumb = `data:image/jpeg;base64,${instantBuf.toString('base64')}`;
            }
          }
          return {
            type: mediaInfo.type,
            url: `/api/tg/media/${encodeURIComponent(chatId)}/${msg.id}`,
            thumbnailUrl:
              mediaInfo.type === 'photo' ||
              mediaInfo.type === 'sticker' ||
              mediaInfo.type === 'gif' ||
              (mediaInfo.type === 'video' && !mediaInfo.isAnimated)
                ? `/api/tg/media/${encodeURIComponent(chatId)}/${msg.id}?thumb=1&v=2`
                : undefined,
            inlineThumb,
            width: mediaInfo.width,
            height: mediaInfo.height,
            fileName: mediaInfo.fileName,
            fileSize: mediaInfo.fileSize,
            duration: mediaInfo.duration,
            waveform: mediaInfo.waveform,
            mimeType: mediaInfo.mimeType,
            isAnimated: mediaInfo.isAnimated,
            isRoundVideo: Boolean(msg.media instanceof Api.MessageMediaDocument && msg.media.document instanceof Api.Document && msg.media.document.attributes.some(attr => attr instanceof Api.DocumentAttributeVideo && attr.roundMessage)),
            isDisappearing: mediaInfo.isDisappearing,
            expireSeconds: mediaInfo.expireSeconds,
            isExpired: false,
          };
        })()
      : existingCache?.media,
  };

  if (msg.reactions?.results?.length) {
    (meta as unknown as { reactions: unknown[] }).reactions = msg.reactions.results
      .map((r) => {
        if (r.reaction instanceof Api.ReactionEmoji) {
          return {
            emoji: r.reaction.emoticon,
            count: r.count,
            hasReacted: Boolean(r.chosenOrder !== undefined),
          };
        }
        if (r.reaction instanceof Api.ReactionCustomEmoji) {
          return {
            emoji: '⭐',
            count: r.count,
            hasReacted: Boolean(r.chosenOrder !== undefined),
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  return meta;
}

function storeMessageInCache(chatId: string, msgId: number, meta: CachedMessageMeta) {
  let chatMap = messageCacheByChat.get(chatId);
  if (!chatMap) {
    chatMap = new Map<number, CachedMessageMeta>();
    messageCacheByChat.set(chatId, chatMap);
  }
  chatMap.set(msgId, meta);
  msgIdToChatId.set(msgId, chatId);
}

function extractEntityQuickMeta(
  ent: unknown,
  fallbackId: string
): { id: string; title: string; avatar?: string } {
  if (ent instanceof Api.User) {
    const id = ent.id.toString();
    peerEntityCache.set(id, ent);
    const title = `${ent.firstName || ''} ${ent.lastName || ''}`.trim() || ent.username || 'User';
    return {
      id,
      title,
      avatar: hasEntityPhoto(ent) ? `/api/tg/avatar/${encodeURIComponent(id)}` : undefined,
    };
  }
  if (ent instanceof Api.Channel) {
    const id = `-100${ent.id.toString().replace(/^-100/, '')}`;
    peerEntityCache.set(id, ent);
    return {
      id,
      title: ent.title || 'Channel',
      avatar: hasEntityPhoto(ent) ? `/api/tg/avatar/${encodeURIComponent(id)}` : undefined,
    };
  }
  if (ent instanceof Api.Chat) {
    const id = `-${ent.id.toString().replace(/^-/, '')}`;
    peerEntityCache.set(id, ent);
    return {
      id,
      title: ent.title || 'Group',
      avatar: hasEntityPhoto(ent) ? `/api/tg/avatar/${encodeURIComponent(id)}` : undefined,
    };
  }
  return { id: fallbackId, title: 'Telegram' };
}

function getPeerChatIdString(peer?: Api.TypePeer): string {
  if (!peer) return '';
  if (peer instanceof Api.PeerUser) return peer.userId.toString();
  if (peer instanceof Api.PeerChat) return `-${peer.chatId.toString()}`;
  if (peer instanceof Api.PeerChannel) return `-100${peer.channelId.toString()}`;
  return '';
}

async function resolveEntityTitle(
  tgClient: TelegramClient,
  msg: Api.Message
): Promise<{ chatId: string; chatTitle: string; senderName: string; senderAvatar?: string }> {
  let chatId = msg.chatId ? msg.chatId.toString() : getPeerChatIdString(msg.peerId);
  let chatTitle = 'Telegram';
  let senderName = msg.out ? (currentMe?.firstName || 'You') : 'Telegram';
  let senderAvatar: string | undefined;

  const cachedChat = chatId ? peerEntityCache.get(chatId) : undefined;
  if (cachedChat) {
    const quick = extractEntityQuickMeta(cachedChat, chatId);
    chatId = quick.id;
    chatTitle = quick.title;
  }

  let sid = '';
  if (msg.fromId instanceof Api.PeerUser) sid = msg.fromId.userId.toString();
  else if (msg.fromId instanceof Api.PeerChannel) sid = `-100${msg.fromId.channelId.toString()}`;
  else if (msg.fromId instanceof Api.PeerChat) sid = `-${msg.fromId.chatId.toString()}`;
  else if (!msg.out && msg.peerId instanceof Api.PeerUser) sid = msg.peerId.userId.toString();

  const cachedSender = sid ? peerEntityCache.get(sid) : undefined;
  if (cachedSender) {
    const quick = extractEntityQuickMeta(cachedSender, sid);
    senderName = quick.title;
    senderAvatar = quick.avatar;
  }

  try {
    const [chat, sender] = await Promise.all([
      cachedChat ? Promise.resolve(cachedChat) : msg.getChat().catch(() => undefined),
      cachedSender ? Promise.resolve(cachedSender) : msg.getSender().catch(() => undefined),
    ]);
    if (chat) {
      const quick = extractEntityQuickMeta(chat, chatId);
      chatId = quick.id;
      chatTitle = quick.title;
    }
    if (sender) {
      const quick = extractEntityQuickMeta(sender, sid);
      senderName = quick.title;
      senderAvatar = quick.avatar;
    }
  } catch {
    // fallback already populated
  }

  void tgClient;
  return { chatId, chatTitle, senderName, senderAvatar };
}

interface StrictMediaCandidate {
  kind: 'photo' | 'video';
  fingerprint: string;
  isDisappearing: boolean;
  expireSeconds?: number;
}

function extractStrictPhotoOrVideo(msg: Api.Message): StrictMediaCandidate | null {
  const media = msg.media;
  if (!media) return null;

  // Reject web previews, polls, contacts, locations, games, stickers, etc.
  if (media instanceof Api.MessageMediaWebPage) return null;

  const ttl = (media as { ttlSeconds?: number }).ttlSeconds;
  const isDisappearing = Boolean(ttl && ttl > 0);
  const expireSeconds = ttl || undefined;

  if (media instanceof Api.MessageMediaPhoto) {
    if (media.photo instanceof Api.Photo && media.photo.id) {
      return {
        kind: 'photo',
        fingerprint: `photo:${media.photo.id.toString()}`,
        isDisappearing,
        expireSeconds,
      };
    }
    return null;
  }

  const doc =
    media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document
      ? media.document
      : null;

  if (!doc || !doc.id) return null;

  const mime = (doc.mimeType || '').toLowerCase();
  const attrs = doc.attributes || [];
  let fileName = '';
  let isSticker = false;
  let isAnimated = false;
  let isVoiceOrAudio = false;
  let isVideo = mime.startsWith('video/');

  for (const attr of attrs) {
    if (attr instanceof Api.DocumentAttributeFilename) {
      fileName = (attr.fileName || '').toLowerCase();
    } else if (attr instanceof Api.DocumentAttributeSticker) {
      isSticker = true;
    } else if (attr instanceof Api.DocumentAttributeAnimated) {
      isAnimated = true;
    } else if (attr instanceof Api.DocumentAttributeAudio) {
      isVoiceOrAudio = true;
    } else if (attr instanceof Api.DocumentAttributeVideo) {
      isVideo = true;
    }
  }

  // Strictly reject GIFs, stickers, voice/audio, and generic document files
  if (
    isSticker ||
    isAnimated ||
    isVoiceOrAudio ||
    mime === 'image/gif' ||
    mime.includes('tgsticker') ||
    fileName.endsWith('.gif') ||
    fileName.endsWith('.webp') ||
    fileName.endsWith('.tgs')
  ) {
    return null;
  }

  if (isVideo) {
    return {
      kind: 'video',
      fingerprint: `doc:${doc.id.toString()}`,
      isDisappearing,
      expireSeconds,
    };
  }

  return null;
}

function getSentPairKey(fromChatId: string, targetChatId: string): string {
  return `${fromChatId}=>${targetChatId}`;
}

function wasAlreadySentToTarget(
  fromChatId: string,
  targetChatId: string,
  msgId: number,
  fingerprint: string
): boolean {
  const key = getSentPairKey(fromChatId, targetChatId);
  const rec = sentMediaRegistry[key];
  if (rec) {
    if (rec.msgIds.includes(msgId)) return true;
    if (fingerprint && rec.fingerprints.includes(fingerprint)) return true;
  }
  const targetFps = targetExistingFingerprintsCache.get(targetChatId);
  if (targetFps && fingerprint && targetFps.fps.has(fingerprint)) {
    return true;
  }
  return false;
}

function markSentToTarget(
  fromChatId: string,
  targetChatId: string,
  msgId: number,
  fingerprint: string
) {
  const key = getSentPairKey(fromChatId, targetChatId);
  const existing = sentMediaRegistry[key] || {
    msgIds: [],
    fingerprints: [],
    updatedAt: Date.now(),
  };
  if (!existing.msgIds.includes(msgId)) {
    existing.msgIds.push(msgId);
    if (existing.msgIds.length > 12_000) {
      existing.msgIds = existing.msgIds.slice(-10_000);
    }
  }
  if (fingerprint && !existing.fingerprints.includes(fingerprint)) {
    existing.fingerprints.push(fingerprint);
    if (existing.fingerprints.length > 12_000) {
      existing.fingerprints = existing.fingerprints.slice(-10_000);
    }
  }
  existing.updatedAt = Date.now();
  sentMediaRegistry[key] = existing;
  persistSentMediaRegistry();

  if (fingerprint) {
    const cachedTarget = targetExistingFingerprintsCache.get(targetChatId);
    if (cachedTarget) {
      cachedTarget.fps.add(fingerprint);
    }
  }
}

async function hydrateTargetSentFingerprints(
  tgClient: TelegramClient,
  targetChatId: string,
  toPeer: Api.TypeEntityLike,
  forceRefresh: boolean = false
): Promise<Set<string>> {
  const existing = targetExistingFingerprintsCache.get(targetChatId);
  if (!forceRefresh && existing && Date.now() - existing.at < 45_000) {
    return existing.fps;
  }
  const fps = new Set<string>(existing?.fps || []);
  try {
    const recentTarget = await tgClient.getMessages(toPeer, {
      limit: 250,
      filter: new Api.InputMessagesFilterPhotoVideo(),
    });
    for (const tm of recentTarget) {
      if (!(tm instanceof Api.Message)) continue;
      const strict = extractStrictPhotoOrVideo(tm);
      if (strict?.fingerprint) {
        fps.add(strict.fingerprint);
      }
    }
  } catch {
    // non-fatal if target history cannot be read
  }
  targetExistingFingerprintsCache.set(targetChatId, { at: Date.now(), fps });
  return fps;
}

async function sendStrictMediaOnlyToTarget(
  tgClient: TelegramClient,
  fromChatId: string,
  chatTitle: string,
  fromPeer: Api.TypeEntityLike,
  toPeer: Api.TypeEntityLike,
  targetChatId: string,
  msg: Api.Message,
  info: StrictMediaCandidate
): Promise<'sent' | 'duplicate' | 'failed'> {
  if (wasAlreadySentToTarget(fromChatId, targetChatId, msg.id, info.fingerprint)) {
    return 'duplicate';
  }
  const inflightKey = `${fromChatId}=>${targetChatId}:${msg.id}`;
  if (inFlightTargetSendKeys.has(inflightKey)) {
    return 'duplicate';
  }
  inFlightTargetSendKeys.add(inflightKey);

  try {
    const inputFrom = await tgClient.getInputEntity(fromPeer);
    const inputTo = await tgClient.getInputEntity(toPeer);

    const attemptForward = async () => {
      await tgClient.invoke(
        new Api.messages.ForwardMessages({
          fromPeer: inputFrom,
          id: [msg.id],
          randomId: [helpers.generateRandomLong(true)],
          toPeer: inputTo,
          dropAuthor: true,
          dropMediaCaptions: true,
        })
      );
    };

    try {
      await attemptForward();
      markSentToTarget(fromChatId, targetChatId, msg.id, info.fingerprint);
      return 'sent';
    } catch (fwdErr) {
      const errMsg = String((fwdErr as Error).message || '');
      const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)/);
      if (floodMatch) {
        const waitSec = Math.min(35, Number(floodMatch[1]) || 3);
        await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
        try {
          await attemptForward();
          markSentToTarget(fromChatId, targetChatId, msg.id, info.fingerprint);
          return 'sent';
        } catch {
          // fall through to bypass upload if enabled
        }
      }

      if (ayuConfig.bypassContentRestrictions) {
        const entry = await cacheMediaToVault(
          tgClient,
          fromChatId,
          chatTitle || fromChatId,
          msg,
          Boolean(info.isDisappearing),
          info.expireSeconds
        );
        if (entry && fs.existsSync(entry.filePath)) {
          await tgClient.sendFile(inputTo, {
            file: entry.filePath,
            caption: undefined,
            supportsStreaming: info.kind === 'video',
          });
          markSentToTarget(fromChatId, targetChatId, msg.id, info.fingerprint);
          return 'sent';
        }
      }
      return 'failed';
    }
  } catch (err) {
    console.warn('Strict media send error:', (err as Error).message);
    return 'failed';
  } finally {
    inFlightTargetSendKeys.delete(inflightKey);
  }
}

async function forwardSingleMediaToTargetGroup(
  tgClient: TelegramClient,
  fromChatId: string,
  msg: Api.Message,
  rule: AutoForwardRuleServer
): Promise<boolean> {
  if (!savedTargetGroup || fromChatId === savedTargetGroup.id) return false;
  const info = extractStrictPhotoOrVideo(msg);
  if (!info) return false;
  const matches =
    (info.kind === 'photo' && rule.includePhotos) ||
    (info.kind === 'video' && rule.includeVideos);
  if (!matches) return false;

  try {
    const fromPeer = await resolvePeer(tgClient, fromChatId);
    const toPeer = await resolvePeer(tgClient, savedTargetGroup.id);
    await hydrateTargetSentFingerprints(tgClient, savedTargetGroup.id, toPeer, false);

    const outcome = await sendStrictMediaOnlyToTarget(
      tgClient,
      fromChatId,
      rule.chatTitle || fromChatId,
      fromPeer,
      toPeer,
      savedTargetGroup.id,
      msg,
      info
    );

    if (outcome === 'sent') {
      rule.lastMsgId = Math.max(rule.lastMsgId || 0, msg.id);
      rule.forwardedCount = (rule.forwardedCount || 0) + 1;
      rule.lastForwardedAt = Date.now();
      autoForwardRules[fromChatId] = rule;
      persistAutoForwardRules();
      broadcastWs({
        type: 'AUTO_FORWARD_UPDATED',
        rule,
        targetTitle: savedTargetGroup.title,
      });
      return true;
    }
    if (outcome === 'duplicate') {
      rule.lastMsgId = Math.max(rule.lastMsgId || 0, msg.id);
      autoForwardRules[fromChatId] = rule;
      persistAutoForwardRules();
    }
  } catch (err) {
    console.warn('Auto-forward single media error:', (err as Error).message);
  }
  return false;
}

let autoForwardIntervalTimer: NodeJS.Timeout | null = null;

function startAutoForwardBackgroundWatcher() {
  if (autoForwardIntervalTimer) clearInterval(autoForwardIntervalTimer);
  autoForwardIntervalTimer = setInterval(async () => {
    if (!client || !client.connected || !savedTargetGroup) return;
    const activeRules = Object.values(autoForwardRules).filter((r) => r.enabled);
    for (const rule of activeRules) {
      if (!client || !client.connected || !savedTargetGroup) break;
      if (rule.chatId === savedTargetGroup.id) continue;
      try {
        const peer = await resolvePeer(client, rule.chatId);
        const recent = await client.getMessages(peer, {
          limit: 30,
          filter: new Api.InputMessagesFilterPhotoVideo(),
        });
        const newMsgs = [...recent]
          .reverse()
          .filter((m): m is Api.Message => m instanceof Api.Message && m.id > (rule.lastMsgId || 0));
        for (const m of newMsgs) {
          rule.lastMsgId = Math.max(rule.lastMsgId || 0, m.id);
          await forwardSingleMediaToTargetGroup(client, rule.chatId, m, rule);
        }
        persistAutoForwardRules();
      } catch {
        // ignore transient peer error
      }
    }
  }, 18_000);
}

function attachRealtimeHandlers(tgClient: TelegramClient) {
  startAutoForwardBackgroundWatcher();

  // 1. Incoming real-time messages (instant WS push; background TTL vault capture + Auto-Forward)
  tgClient.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg) return;
      const { chatId, chatTitle, senderName, senderAvatar } = await resolveEntityTitle(tgClient, msg);
      if (!chatId) return;

      const mediaInfo = detectMediaInfo(msg);
      const serialized = serializeMessage(msg, chatId, senderName, senderAvatar);
      if (mediaInfo?.isDisappearing && ayuConfig.saveDisappearingMedia) {
        serialized.isSavedFromTTL = true;
      }

      storeRawMessage(chatId, msg);
      storeMessageInCache(chatId, msg.id, serialized);
      broadcastWs({
        type: 'NEW_MESSAGE',
        chatId,
        chatTitle,
        message: serialized,
      });

      const activeRule = autoForwardRules[chatId];
      if (activeRule?.enabled && savedTargetGroup && chatId !== savedTargetGroup.id && msg.id > (activeRule.lastMsgId || 0)) {
        activeRule.lastMsgId = Math.max(activeRule.lastMsgId || 0, msg.id);
        void forwardSingleMediaToTargetGroup(tgClient, chatId, msg, activeRule);
      }

      if (mediaInfo?.isDisappearing && ayuConfig.saveDisappearingMedia) {
        void (async () => {
          const entry = await cacheMediaToVault(tgClient, chatId, chatTitle, msg, true, mediaInfo.expireSeconds);
          if (entry && ayuConfig.autoSaveExpiringToSavedMessages && fs.existsSync(entry.filePath)) {
            try {
              await tgClient.sendFile('me', {
                file: entry.filePath,
                caption: `Saved disappearing ${entry.mediaType} from ${chatTitle}`,
                supportsStreaming: entry.mediaType === 'video',
              });
            } catch (err) {
              console.warn('Auto-save to Saved Messages failed:', (err as Error).message);
            }
          }
        })();
      }
    } catch (err) {
      console.warn('NewMessage handler error:', (err as Error).message);
    }
  }, new NewMessage({}));

  // 2. Real-time Anti-Edit revision capture
  tgClient.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg) return;
      const { chatId, senderName, senderAvatar } = await resolveEntityTitle(tgClient, msg);
      if (!chatId) return;

      const chatMap = messageCacheByChat.get(chatId);
      const prev = chatMap?.get(msg.id);
      const updated = serializeMessage(msg, chatId, senderName, senderAvatar);

      if (ayuConfig.antiEditEnabled && prev && prev.text !== updated.text) {
        const history = prev.editHistory ? [...prev.editHistory] : [];
        history.push({ text: prev.text, timestamp: Date.now() });
        updated.editHistory = history;
      } else if (prev?.editHistory) {
        updated.editHistory = prev.editHistory;
      }
      (updated as unknown as { isEdited: boolean }).isEdited = true;

      storeMessageInCache(chatId, msg.id, updated);
      broadcastWs({
        type: 'EDIT_MESSAGE',
        chatId,
        message: updated,
      });
    } catch (err) {
      console.warn('EditedMessage handler error:', (err as Error).message);
    }
  }, new EditedMessage({}));

  // 3. Real-time Anti-Delete preservation (including supergroups/channels)
  tgClient.addEventHandler(async (event) => {
    try {
      if (!ayuConfig.antiDeleteEnabled) return;
      for (const deletedId of event.deletedIds) {
        let targetChatId = msgIdToChatId.get(deletedId);
        if (!targetChatId && event.peer) {
          try {
            const peerEnt = await tgClient.getEntity(event.peer);
            if (peerEnt) {
              targetChatId = extractEntityQuickMeta(peerEnt, '').id;
            }
          } catch {
            // ignore
          }
        }
        if (!targetChatId) continue;

        const chatMap = messageCacheByChat.get(targetChatId);
        const cached = chatMap?.get(deletedId);
        if (cached) {
          cached.isDeletedBySender = true;
          cached.deletedAt = Date.now();
          storeMessageInCache(targetChatId, deletedId, cached);

          if (!deletedLogs.some((l) => l.originalMessageId === String(deletedId))) {
            deletedLogs.unshift({
              id: `del_${Date.now()}_${deletedId}`,
              chatId: targetChatId,
              originalMessageId: String(deletedId),
              senderName: cached.senderName,
              text: cached.text,
              mediaUrl: cached.media?.url,
              mediaType: cached.media?.type,
              deletedAt: cached.deletedAt,
            });
            persistDeletedLogs();
          }

          broadcastWs({
            type: 'DELETE_MESSAGE',
            chatId: targetChatId,
            messageId: String(deletedId),
            deletedAt: cached.deletedAt,
            deletedLog: deletedLogs[0],
          });
        }
      }
    } catch (err) {
      console.warn('DeletedMessage handler error:', (err as Error).message);
    }
  }, new DeletedMessage({}));

  // 4. Typing, Recording Voice, Online Status, Read Receipts, Live Reactions
  tgClient.addEventHandler(async (update: Api.TypeUpdate | Api.TypeUpdates) => {
    try {
      if (update instanceof Api.UpdateUserTyping) {
        const chatId = update.userId.toString();
        const text =
          update.action instanceof Api.SendMessageRecordAudioAction
            ? 'recording voice...'
            : 'typing...';
        broadcastWs({ type: 'TYPING', chatId, text });
      } else if (update instanceof Api.UpdateChatUserTyping) {
        const chatId = `-${update.chatId.toString()}`;
        const text =
          update.action instanceof Api.SendMessageRecordAudioAction
            ? 'recording voice...'
            : 'typing...';
        broadcastWs({ type: 'TYPING', chatId, text });
      } else if (update instanceof Api.UpdateChannelUserTyping) {
        const chatId = `-100${update.channelId.toString()}`;
        const text =
          update.action instanceof Api.SendMessageRecordAudioAction
            ? 'recording voice...'
            : 'typing...';
        broadcastWs({ type: 'TYPING', chatId, text });
      } else if (update instanceof Api.UpdateUserStatus) {
        const userId = update.userId.toString();
        const isOnline = update.status instanceof Api.UserStatusOnline;
        broadcastWs({
          type: 'USER_STATUS',
          userId,
          status: isOnline ? 'online' : 'offline',
        });
      } else if (update instanceof Api.UpdateReadHistoryOutbox) {
        const chatId = getPeerChatIdString(update.peer);
        if (chatId) {
          chatReadOutboxMaxId.set(chatId, update.maxId);
          broadcastWs({ type: 'READ_OUTBOX', chatId, maxId: update.maxId });
        }
      } else if (update instanceof Api.UpdateReadHistoryInbox) {
        const chatId = getPeerChatIdString(update.peer);
        if (chatId) {
          broadcastWs({
            type: 'READ_INBOX',
            chatId,
            maxId: update.maxId,
            stillUnreadCount: update.stillUnreadCount,
          });
        }
      } else if (update instanceof Api.UpdateReadChannelOutbox) {
        const chatId = `-100${update.channelId.toString()}`;
        chatReadOutboxMaxId.set(chatId, update.maxId);
        broadcastWs({ type: 'READ_OUTBOX', chatId, maxId: update.maxId });
      } else if (update instanceof Api.UpdateReadChannelInbox) {
        const chatId = `-100${update.channelId.toString()}`;
        broadcastWs({
          type: 'READ_INBOX',
          chatId,
          maxId: update.maxId,
          stillUnreadCount: update.stillUnreadCount,
        });
      } else if (update instanceof Api.UpdateMessageReactions) {
        const chatId = getPeerChatIdString(update.peer);
        if (chatId) {
          const reactions = (update.reactions?.results || [])
            .map((r) => {
              if (r.reaction instanceof Api.ReactionEmoji) {
                return {
                  emoji: r.reaction.emoticon,
                  count: r.count,
                  hasReacted: Boolean(r.chosenOrder !== undefined),
                };
              }
              return null;
            })
            .filter(Boolean);
          broadcastWs({
            type: 'REACTIONS_UPDATED',
            chatId,
            messageId: String(update.msgId),
            reactions,
          });
        }
      } else if (update instanceof Api.UpdatePhoneCall) {
        const pc = update.phoneCall as unknown as {
          id?: { toString(): string };
          accessHash?: { toString(): string };
          participantId?: { toString(): string };
          adminId?: { toString(): string };
          video?: boolean;
          className?: string;
        };
        if (pc) {
          broadcastWs({
            type: 'PHONE_CALL_UPDATE',
            callId: pc.id?.toString(),
            accessHash: pc.accessHash?.toString(),
            adminId: pc.adminId?.toString(),
            participantId: pc.participantId?.toString(),
            video: Boolean(pc.video),
            state: pc.className || 'PhoneCall',
            nativeCall: serializeNativeCall(update.phoneCall),
          });
        }
      } else if (update instanceof Api.UpdatePhoneCallSignalingData) {
        broadcastWs({
          type: 'PHONE_CALL_SIGNAL',
          callId: update.phoneCallId?.toString(),
          dataBase64: Buffer.from(update.data || []).toString('base64'),
        });
      }
    } catch {
      // ignore
    }
  }, new Raw({}));
}

async function destroyTgClientSafely(tg: TelegramClient | null) {
  if (!tg) return;
  try {
    await tg.destroy();
  } catch {
    try {
      await tg.disconnect();
    } catch {
      // ignore cleanup error
    }
  }
}

async function cleanupPendingAuth() {
  qrFlowGeneration++;
  if (qrWakeupResolver) {
    const wake = qrWakeupResolver;
    qrWakeupResolver = null;
    wake();
  }
  pendingQr2FAHandler = null;
  const old = pendingAuthClient;
  pendingAuthClient = null;
  await destroyTgClientSafely(old);
}

function attachSafeErrorHandler(tg: TelegramClient) {
  // Prevent GramJS internal _handleReconnect from crashing or throwing unhandled errors
  (tg as unknown as { _errorHandler?: (err: Error) => Promise<void> })._errorHandler = async (err: Error) => {
    const msg = err?.message || '';
    if (msg.includes('SESSION_PASSWORD_NEEDED') || msg.includes('TIMEOUT') || msg.includes('Not connected')) {
      return;
    }
    console.warn('Telegram client background warning:', msg);
  };
}

let ensureReconnectPromise: Promise<TelegramClient | null> | null = null;

async function ensureConnectedClient(forceReconnect = false): Promise<TelegramClient | null> {
  if (!forceReconnect && client && client.connected && currentMe) {
    return client;
  }
  if (ensureReconnectPromise) {
    return ensureReconnectPromise;
  }

  ensureReconnectPromise = (async () => {
    if (initSessionPromise && !forceReconnect) {
      await initSessionPromise.catch(() => {});
      if (client && client.connected && currentMe) {
        return client;
      }
    }

    if (client) {
      try {
        if (!client.connected) {
          await client.connect();
        }
        const ok = await client.checkAuthorization();
        if (ok) {
          if (!currentMe) {
            currentMe = (await client.getMe()) as Api.User;
          }
          const latestSession = ((client.session as StringSession).save() as unknown as string) || '';
          const savedDisk = loadSessionFile();
          if (latestSession && currentApiId && currentApiHash && latestSession !== savedDisk?.sessionString) {
            saveSessionFile({
              apiId: currentApiId,
              apiHash: currentApiHash,
              sessionString: latestSession,
              phoneNumber: currentMe?.phone ? `+${currentMe.phone}` : savedDisk?.phoneNumber,
            });
          }
          return client;
        }
      } catch (err) {
        if (isPermanentSessionError(err)) {
          const dead = client;
          client = null;
          currentMe = null;
          await destroyTgClientSafely(dead);
          removeSessionFiles();
          return null;
        }
      }
    }

    await initClientFromSavedSession(forceReconnect);
    return client && client.connected ? client : null;
  })().finally(() => {
    ensureReconnectPromise = null;
  });

  return ensureReconnectPromise;
}

async function activateAuthorizedSession(
  sessionString: string,
  apiId: number,
  apiHash: string,
  phoneNumber?: string
): Promise<{ user: Api.User; sessionString: string }> {
  const existingDisk = loadSessionFile();
  if (
    client &&
    client.connected &&
    currentMe &&
    (existingDisk?.sessionString === sessionString ||
      ((client.session as StringSession).save() as unknown as string) === sessionString)
  ) {
    const curSession = ((client.session as StringSession).save() as unknown as string) || sessionString;
    return { user: currentMe, sessionString: curSession };
  }

  const liveClient = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
    reconnectRetries: 10,
    retryDelay: 2000,
    autoReconnect: true,
    timeout: 15,
    deviceModel: 'TG Plus Web',
    systemVersion: 'Linux',
    appVersion: '2.0.0',
  });
  attachSafeErrorHandler(liveClient);
  await liveClient.connect();

  const authorized = await liveClient.checkAuthorization();
  if (!authorized) {
    await destroyTgClientSafely(liveClient);
    throw new Error('AUTH_KEY_UNREGISTERED: Authorized Telegram session could not be verified.');
  }

  const me = (await liveClient.getMe()) as Api.User;
  const finalSession = ((liveClient.session as StringSession).save() as unknown as string) || sessionString;

  const prevClient = client;
  currentApiId = apiId;
  currentApiHash = apiHash;
  currentMe = me;
  client = liveClient;

  saveSessionFile({
    apiId,
    apiHash,
    sessionString: finalSession,
    phoneNumber: phoneNumber || (me.phone ? `+${me.phone}` : ''),
  });

  attachRealtimeHandlers(liveClient);
  if (prevClient && prevClient !== liveClient) {
    void destroyTgClientSafely(prevClient);
  }
  return { user: me, sessionString: finalSession };
}

async function initClientFromSavedSession(forceReset = false): Promise<void> {
  if (initSessionPromise) {
    return initSessionPromise;
  }

  initSessionPromise = (async () => {
    const saved = loadSessionFile();
    if (!saved || !saved.sessionString || !saved.apiId || !saved.apiHash) return;

    if (client && !forceReset) {
      if (client.connected && currentMe) return;
      const prev = client;
      client = null;
      await destroyTgClientSafely(prev);
    } else if (client && forceReset) {
      const prev = client;
      client = null;
      await destroyTgClientSafely(prev);
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      let tg: TelegramClient | null = null;
      try {
        tg = new TelegramClient(new StringSession(saved.sessionString), saved.apiId, saved.apiHash, {
          connectionRetries: 5,
          reconnectRetries: 10,
          retryDelay: 2000,
          autoReconnect: true,
          timeout: 15,
          deviceModel: 'TG Plus Web',
          systemVersion: 'Linux',
          appVersion: '2.0.0',
        });
        attachSafeErrorHandler(tg);
        await tg.connect();
        const isAuth = await tg.checkAuthorization();
        if (isAuth) {
          const me = (await tg.getMe()) as Api.User;
          currentApiId = saved.apiId;
          currentApiHash = saved.apiHash;
          currentMe = me;
          client = tg;
          const refreshedSession = ((tg.session as StringSession).save() as unknown as string) || saved.sessionString;
          if (refreshedSession && refreshedSession !== saved.sessionString) {
            saveSessionFile({
              apiId: saved.apiId,
              apiHash: saved.apiHash,
              sessionString: refreshedSession,
              phoneNumber: me.phone ? `+${me.phone}` : saved.phoneNumber,
            });
          }
          attachRealtimeHandlers(tg);
          console.log(`Webygram connected to real Telegram as ${currentMe.firstName || currentMe.username}`);
          return;
        }
        await destroyTgClientSafely(tg);
        return;
      } catch (err) {
        if (tg) {
          await destroyTgClientSafely(tg);
        }
        if (isPermanentSessionError(err)) {
          console.warn('Telegram session was permanently revoked:', getRawTgError(err));
          removeSessionFiles();
          return;
        }
        console.warn(`Saved session auto-connect attempt ${attempt} warning:`, (err as Error).message);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 1200));
        }
      }
    }
  })().finally(() => {
    initSessionPromise = null;
  });

  return initSessionPromise;
}

async function resolvePeer(tgClient: TelegramClient, chatId: string) {
  const normalized = String(chatId || '').trim();
  if (!normalized) {
    throw new Error('Missing chat identifier.');
  }
  if (normalized === 'me' || normalized === currentMe?.id?.toString()) {
    return 'me';
  }
  const cached = peerEntityCache.get(normalized);
  if (cached) {
    try {
      return await tgClient.getInputEntity(cached);
    } catch {
      return cached;
    }
  }
  const isNumericId = /^-?\d+$/.test(normalized);
  if (isNumericId) {
    // 1. Check rawMessageCache for a message in this chat or from this peer
    const chatPrefix = `${normalized}_`;
    for (const [k, rawMsg] of rawMessageCache.entries()) {
      const peerMatch = getPeerChatIdString(rawMsg.peerId) === normalized || k.startsWith(chatPrefix);
      if (peerMatch) {
        const embChat = (rawMsg as unknown as { _chat?: unknown })._chat;
        if (embChat) {
          extractEntityQuickMeta(embChat, normalized);
          const nowCached = peerEntityCache.get(normalized);
          if (nowCached) {
            try {
              return await tgClient.getInputEntity(nowCached);
            } catch {
              return nowCached;
            }
          }
        }
        try {
          const inputChat = await rawMsg.getInputChat();
          if (inputChat) return inputChat;
        } catch {
          // continue
        }
      }

      const fromPeerId = getPeerChatIdString(rawMsg.fromId);
      if (fromPeerId === normalized) {
        const emb = (rawMsg as unknown as { _sender?: unknown })._sender;
        if (emb) {
          extractEntityQuickMeta(emb, normalized);
          const nowCached = peerEntityCache.get(normalized);
          if (nowCached) {
            try {
              return await tgClient.getInputEntity(nowCached);
            } catch {
              return nowCached;
            }
          }
        }
        try {
          const s = await rawMsg.getSender();
          if (s) {
            extractEntityQuickMeta(s, normalized);
            return await tgClient.getInputEntity(s);
          }
        } catch {
          // continue
        }
      }
    }

    // 2. Try GramJS entity cache (string first so -100... prefixes aren't lost, then BigInt/Number)
    for (const candidate of [normalized, helpers.returnBigInt(normalized), Number(normalized)]) {
      try {
        return await tgClient.getInputEntity(candidate as Api.TypeEntityLike);
      } catch {
        // continue
      }
    }

    // 3. If dialogsSnapshot knows this chat's username, resolve cleanly via Telegram
    const snapUsername = dialogsSnapshot[normalized]?.username?.replace(/^@/, '').trim();
    if (snapUsername) {
      try {
        const entByUser = await tgClient.getEntity(`@${snapUsername}`);
        if (entByUser && (entByUser instanceof Api.User || entByUser instanceof Api.Channel || entByUser instanceof Api.Chat)) {
          peerEntityCache.set(normalized, entByUser);
          return await tgClient.getInputEntity(entByUser);
        }
      } catch {
        // continue
      }
    }
  } else {
    try {
      return await tgClient.getInputEntity(normalized);
    } catch {
      // continue to dialog scan
    }
  }

  // 4. Scan active + archived dialogs up to 200 each and populate peerEntityCache
  const [mainRes, archivedRes] = await Promise.allSettled([
    tgClient.getDialogs({ limit: 200, archived: false }),
    tgClient.getDialogs({ limit: 150, archived: true }),
  ]);
  const allDialogs = [
    ...(mainRes.status === 'fulfilled' ? mainRes.value : []),
    ...(archivedRes.status === 'fulfilled' ? archivedRes.value : []),
  ];

  let matchedInputPeer: Api.TypeInputPeer | null = null;
  for (const d of allDialogs) {
    const idStr = d.id ? d.id.toString() : '';
    const ent = d.entity;
    if (idStr && (ent instanceof Api.User || ent instanceof Api.Channel || ent instanceof Api.Chat)) {
      peerEntityCache.set(idStr, ent);
    }
    if (idStr === normalized) {
      if (d.inputEntity) matchedInputPeer = d.inputEntity;
      else if (ent) {
        try {
          matchedInputPeer = await tgClient.getInputEntity(ent);
        } catch {
          // ignore
        }
      }
    }
  }
  if (matchedInputPeer) return matchedInputPeer;

  throw new Error(`Chat ${normalized} could not be resolved on Telegram. Try opening it once from your chat list or username.`);
}

async function resolveTargetGroupByLink(
  tgClient: TelegramClient,
  rawLink: string
): Promise<{ peer: unknown; config: TargetGroupConfig }> {
  const input = rawLink.trim();
  if (!input) {
    throw new Error('Enter a Telegram group or channel link (e.g. https://t.me/... or @group).');
  }

  if (input.toLowerCase() === 'me' || input.toLowerCase() === 'saved') {
    return {
      peer: 'me',
      config: {
        id: 'me',
        title: 'Saved Messages',
        link: 'me',
        type: 'saved',
        setAt: Date.now(),
      },
    };
  }

  const inviteMatch = input.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:\+|joinchat\/)([a-zA-Z0-9_-]+)/i);
  let entity: Api.TypeChat | Api.TypeUser | null = null;

  if (inviteMatch) {
    const hash = inviteMatch[1];
    const check = await tgClient.invoke(new Api.messages.CheckChatInvite({ hash }));
    if (check instanceof Api.ChatInviteAlready) {
      entity = check.chat;
    } else if (check instanceof Api.ChatInvitePeek) {
      entity = check.chat;
    } else {
      const imported = await tgClient.invoke(new Api.messages.ImportChatInvite({ hash }));
      if ('chats' in imported && Array.isArray(imported.chats) && imported.chats.length > 0) {
        entity = imported.chats[0];
      }
    }
  } else {
    const privateMsgMatch = input.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/c\/(\d+)(?:\/\d+)?/i);
    if (privateMsgMatch) {
      const chatId = `-100${privateMsgMatch[1]}`;
      entity = (await tgClient.getEntity(chatId)) as Api.TypeChat | Api.TypeUser;
    } else {
      let clean = input.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').split('/')[0].split('?')[0].trim();
      if (!clean) throw new Error('Invalid Telegram group link.');
      if (/^-?\d+$/.test(clean)) {
        const cachedEnt = peerEntityCache.get(clean);
        if (cachedEnt) {
          entity = cachedEnt;
        } else {
          const resolvedPeer = await resolvePeer(tgClient, clean);
          entity = (await tgClient.getEntity(resolvedPeer as Api.TypeEntityLike)) as Api.TypeChat | Api.TypeUser;
        }
      } else {
        if (!clean.startsWith('@')) {
          clean = `@${clean}`;
        }
        entity = (await tgClient.getEntity(clean)) as Api.TypeChat | Api.TypeUser;
      }
    }
  }

  if (!entity) {
    throw new Error('Could not resolve Telegram group or channel from that link.');
  }

  let id = '';
  let title = 'Target Group';
  let username = '';
  let type: TargetGroupConfig['type'] = 'group';
  let memberCount: number | undefined;

  if (entity instanceof Api.Channel) {
    id = `-100${entity.id.toString().replace(/^-100/, '')}`;
    title = entity.title || 'Channel';
    username = entity.username || '';
    type = entity.broadcast ? 'channel' : 'group';
    memberCount = entity.participantsCount || undefined;
  } else if (entity instanceof Api.Chat) {
    id = `-${entity.id.toString().replace(/^-/, '')}`;
    title = entity.title || 'Group';
    type = 'group';
    memberCount = entity.participantsCount || undefined;
  } else if (entity instanceof Api.User) {
    id = entity.id.toString();
    title = `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || entity.username || 'User';
    username = entity.username || '';
    type = 'user';
  }

  const inputPeer = await tgClient.getInputEntity(entity);
  return {
    peer: inputPeer,
    config: {
      id,
      title,
      username,
      link: input,
      type,
      memberCount,
      setAt: Date.now(),
    },
  };
}

async function main() {
  const app = express();
  app.use((req, res, next) => {
    if (req.headers['x-profile-worker-key'] !== process.env.TG_PROFILE_KEY) return res.status(403).end();
    next();
  });
  app.use(express.json({ limit: '60mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', verifyClient: (info: { req: http.IncomingMessage }) => info.req.headers['x-profile-worker-key'] === process.env.TG_PROFILE_KEY });

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'PING' && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
          return;
        }
        if (msg?.type === 'CALL_SIGNAL') {
          const serialized = JSON.stringify({ ...msg, relayedAt: Date.now() });
          for (const peerWs of wsClients) {
            if (peerWs !== ws && peerWs.readyState === WebSocket.OPEN) {
              peerWs.send(serialized);
            }
          }
        }
      } catch {
        // ignore
      }
    });
    ws.on('close', () => wsClients.delete(ws));
  });

  // Transparently auto-reconnect saved session before any /api/tg/* route checks !client.connected
  app.use('/api/tg', async (req, _res, next) => {
    // Cached images remain usable while an authenticated session reconnects.
    if (currentMe && (req.path.startsWith('/avatar/') || req.path.startsWith('/media/'))) return next();
    if (
      req.path.startsWith('/auth/') ||
      req.path === '/status' ||
      req.path === '/logout'
    ) {
      return next();
    }
    if (!client || !client.connected || !currentMe) {
      await ensureConnectedClient().catch(() => null);
    }
    next();
  });

  // --- Auth & Status Endpoints ---

  app.get('/api/tg/status', async (_req, res) => {
    try {
      // Auto-restore from saved disk/backup session if no active live client is connected yet
      await ensureConnectedClient();

      if (!client || !client.connected) {
        return res.json({
          isConnected: false,
          hasSavedSession: Boolean(loadSessionFile()),
          user: serializeUser(null),
          ayuConfig,
          deletedLogs,
          vaultCount: Object.keys(vaultIndex).length,
        });
      }

      let authorized = false;
      try {
        authorized = await client.checkAuthorization();
      } catch (authErr) {
        if (isPermanentSessionError(authErr)) {
          removeSessionFiles();
          const dead = client;
          client = null;
          currentMe = null;
          await destroyTgClientSafely(dead);
          return res.json({
            isConnected: false,
            invalidSession: true,
            user: serializeUser(null),
            ayuConfig,
            deletedLogs,
            vaultCount: Object.keys(vaultIndex).length,
          });
        }
        // Transient error during checkAuthorization — keep alive if currentMe is valid
        authorized = Boolean(currentMe);
      }

      if (!authorized) {
        return res.json({
          isConnected: false,
          hasSavedSession: Boolean(loadSessionFile()),
          user: serializeUser(null),
          ayuConfig,
          deletedLogs,
          vaultCount: Object.keys(vaultIndex).length,
        });
      }

      if (!currentMe) {
        try {
          currentMe = (await client.getMe()) as Api.User;
        } catch {
          return res.json({
            isConnected: false,
            hasSavedSession: Boolean(loadSessionFile()),
            user: serializeUser(null),
            ayuConfig,
            deletedLogs,
            vaultCount: Object.keys(vaultIndex).length,
          });
        }
      }

      return res.json({
        isConnected: true,
        user: serializeUser(currentMe),
        phoneNumber: currentMe.phone ? `+${currentMe.phone}` : '',
        dcId: (client.session as StringSession).dcId || 2,
        ayuConfig,
        deletedLogs,
        vaultCount: Object.keys(vaultIndex).length,
      });
    } catch {
      return res.json({
        isConnected: false,
        hasSavedSession: Boolean(loadSessionFile()),
        user: serializeUser(null),
        ayuConfig,
        deletedLogs,
        vaultCount: Object.keys(vaultIndex).length,
      });
    }
  });

  app.post('/api/tg/auth/send-code', async (req, res) => {
    try {
      const savedDisk = loadSessionFile();
      const apiId = Number(req.body.apiId) || currentApiId || savedDisk?.apiId || DEFAULT_TG_API_ID;
      const apiHash =
        String(req.body.apiHash || '').trim() || currentApiHash || savedDisk?.apiHash || DEFAULT_TG_API_HASH;
      const phoneNumber = String(req.body.phoneNumber || '').trim();

      if (!phoneNumber) {
        return res.status(400).json({ error: 'International phone number is required.' });
      }

      await cleanupPendingAuth();

      currentApiId = apiId;
      currentApiHash = apiHash;
      pendingPhone = phoneNumber;

      const authClient = new TelegramClient(new StringSession(''), apiId, apiHash, {
        connectionRetries: 5,
        reconnectRetries: 0,
        autoReconnect: false,
        timeout: 15,
        deviceModel: 'TG Plus Web',
        systemVersion: 'Linux',
        appVersion: '2.0.0',
      });
      attachSafeErrorHandler(authClient);
      await authClient.connect();
      pendingAuthClient = authClient;

      const result = await authClient.sendCode({ apiId, apiHash }, phoneNumber);
      pendingPhoneCodeHash = result.phoneCodeHash;

      return res.json({
        phoneCodeHash: result.phoneCodeHash,
        isCodeViaApp: result.isCodeViaApp,
      });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Failed to send verification code.' });
    }
  });

  app.post('/api/tg/auth/verify-code', async (req, res) => {
    try {
      const authClient = pendingAuthClient;
      if (!authClient) {
        return res.status(400).json({ error: 'No active verification session. Please request a code again.' });
      }
      if (!authClient.connected) {
        await authClient.connect();
      }

      const code = String(req.body.code || '').trim();
      const password2FA = req.body.password2FA ? String(req.body.password2FA) : '';
      const phoneNumber = String(req.body.phoneNumber || pendingPhone).trim();
      const phoneCodeHash = String(req.body.phoneCodeHash || pendingPhoneCodeHash).trim();

      try {
        await authClient.invoke(
          new Api.auth.SignIn({
            phoneNumber,
            phoneCodeHash,
            phoneCode: code,
          })
        );
      } catch (signInErr: unknown) {
        const msg =
          (signInErr as { errorMessage?: string; message?: string }).errorMessage ||
          (signInErr as Error).message ||
          '';
        if (msg.includes('SESSION_PASSWORD_NEEDED')) {
          if (!password2FA) {
            return res.status(401).json({
              requires2FA: true,
              error: 'Two-Step Verification (2FA) password is required for this Telegram account.',
            });
          }
          const srp = await authClient.invoke(new Api.account.GetPassword());
          const check = await computeCheck(srp, password2FA);
          await authClient.invoke(new Api.auth.CheckPassword({ password: check }));
        } else {
          throw signInErr;
        }
      }

      const rawSession = ((authClient.session as StringSession).save() as unknown as string) || '';
      await cleanupPendingAuth();

      const { user, sessionString } = await activateAuthorizedSession(
        rawSession,
        currentApiId || DEFAULT_TG_API_ID,
        currentApiHash || DEFAULT_TG_API_HASH,
        phoneNumber
      );

      broadcastWs({
        type: 'AUTH_UPDATED',
        isConnected: true,
        user: serializeUser(user),
        sessionString,
        apiId: currentApiId,
        apiHash: currentApiHash,
      });

      return res.json({
        isConnected: true,
        user: serializeUser(user),
        sessionString,
        apiId: currentApiId,
        apiHash: currentApiHash,
      });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Verification failed.' });
    }
  });

  app.get('/api/tg/auth/qr-status', (_req, res) => {
    return res.json({
      ...qrAuthState,
      isConnected: Boolean(client && client.connected && currentMe),
      user: currentMe ? serializeUser(currentMe) : undefined,
    });
  });

  app.post('/api/tg/auth/qr-2fa', async (req, res) => {
    const password = String(req.body.password || '');
    if (!password) {
      return res.status(400).json({ error: 'Enter your Two-Step Verification password.' });
    }
    if (!pendingQr2FAHandler) {
      return res.status(400).json({ error: 'No pending 2FA QR challenge. Refresh QR code and scan again.' });
    }
    try {
      const outcome = await pendingQr2FAHandler(password);
      if (!outcome.ok) {
        return res.status(401).json({ error: outcome.error || 'Incorrect 2FA password.' });
      }
      return res.json({
        ok: true,
        isConnected: Boolean(client && client.connected && currentMe),
        user: currentMe ? serializeUser(currentMe) : undefined,
        sessionString: qrAuthState.sessionString,
        apiId: qrAuthState.apiId,
        apiHash: qrAuthState.apiHash,
      });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || '2FA verification failed.' });
    }
  });

  app.post('/api/tg/auth/qr-cancel', async (_req, res) => {
    await cleanupPendingAuth();
    qrAuthState = { status: 'idle' };
    return res.json({ ok: true });
  });

  app.post('/api/tg/auth/qr-start', async (req, res) => {
    await cleanupPendingAuth();
    const myGen = qrFlowGeneration;

    try {
      const savedDisk = loadSessionFile();
      const apiId = Number(req.body.apiId) || currentApiId || savedDisk?.apiId || DEFAULT_TG_API_ID;
      const apiHash =
        String(req.body.apiHash || '').trim() || currentApiHash || savedDisk?.apiHash || DEFAULT_TG_API_HASH;

      currentApiId = apiId;
      currentApiHash = apiHash;
      qrAuthState = { status: 'waiting_scan' };

      const qrClient = new TelegramClient(new StringSession(''), apiId, apiHash, {
        connectionRetries: 5,
        reconnectRetries: 0,
        autoReconnect: false,
        timeout: 15,
        deviceModel: 'TG Plus Web',
        systemVersion: 'Linux',
        appVersion: '2.0.0',
      });
      attachSafeErrorHandler(qrClient);
      await qrClient.connect();

      if (myGen !== qrFlowGeneration) {
        await destroyTgClientSafely(qrClient);
        return;
      }
      pendingAuthClient = qrClient;

      const wakeUp = () => {
        if (qrWakeupResolver) {
          const fn = qrWakeupResolver;
          qrWakeupResolver = null;
          fn();
        }
      };

      qrClient.addEventHandler((update: Api.TypeUpdate) => {
        if (update instanceof Api.UpdateLoginToken) {
          wakeUp();
        }
      }, new Raw({}));

      const finishQrWithAuthorizedClient = async () => {
        const rawSession = ((qrClient.session as StringSession).save() as unknown as string) || '';
        pendingAuthClient = null;
        pendingQr2FAHandler = null;
        await destroyTgClientSafely(qrClient);

        const { user, sessionString } = await activateAuthorizedSession(rawSession, apiId, apiHash);
        qrAuthState = {
          status: 'authorized',
          sessionString,
          apiId,
          apiHash,
        };
        broadcastWs({
          type: 'AUTH_UPDATED',
          isConnected: true,
          user: serializeUser(user),
          sessionString,
          apiId,
          apiHash,
        });
      };

      const startTime = Date.now();
      let sentFirstQr = false;

      // Clean cancellable QR polling / UpdateLoginToken driver in background
      void (async () => {
        try {
          while (myGen === qrFlowGeneration && Date.now() - startTime < 180_000) {
            if (!qrClient.connected) {
              await qrClient.connect();
            }
            if (myGen !== qrFlowGeneration) return;

            let result: Api.auth.TypeLoginToken;
            try {
              result = await qrClient.invoke(
                new Api.auth.ExportLoginToken({
                  apiId: Number(apiId),
                  apiHash,
                  exceptIds: [],
                })
              );
            } catch (err: unknown) {
              if (myGen !== qrFlowGeneration) return;
              const errMsg = (err as { errorMessage?: string; message?: string }).errorMessage || (err as Error).message || '';
              if (errMsg.includes('SESSION_PASSWORD_NEEDED')) {
                const srp = await qrClient.invoke(new Api.account.GetPassword());
                qrAuthState = {
                  ...qrAuthState,
                  status: 'needs_2fa',
                  hint: srp.hint || '',
                };
                broadcastWs({ type: 'QR_NEEDS_2FA', hint: srp.hint || '' });
                await waitForQr2FACompletion(qrClient, srp, myGen, finishQrWithAuthorizedClient);
                return;
              }
              throw err;
            }

            if (myGen !== qrFlowGeneration) return;

            if (result instanceof Api.auth.LoginTokenSuccess) {
              await finishQrWithAuthorizedClient();
              return;
            }

            if (result instanceof Api.auth.LoginTokenMigrateTo) {
              try {
                await qrClient._switchDC(result.dcId);
                const imported = await qrClient.invoke(
                  new Api.auth.ImportLoginToken({ token: result.token })
                );
                if (imported instanceof Api.auth.LoginTokenSuccess) {
                  await finishQrWithAuthorizedClient();
                  return;
                }
              } catch (migErr: unknown) {
                const errMsg =
                  (migErr as { errorMessage?: string; message?: string }).errorMessage ||
                  (migErr as Error).message ||
                  '';
                if (errMsg.includes('SESSION_PASSWORD_NEEDED')) {
                  const srp = await qrClient.invoke(new Api.account.GetPassword());
                  qrAuthState = {
                    ...qrAuthState,
                    status: 'needs_2fa',
                    hint: srp.hint || '',
                  };
                  broadcastWs({ type: 'QR_NEEDS_2FA', hint: srp.hint || '' });
                  await waitForQr2FACompletion(qrClient, srp, myGen, finishQrWithAuthorizedClient);
                  return;
                }
                throw migErr;
              }
            }

            if (result instanceof Api.auth.LoginToken) {
              const token = result.token.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
              const qrUrl = `tg://login?token=${token}`;
              const qrDataUrl = await QRCode.toDataURL(qrUrl, {
                width: 224,
                margin: 2,
                color: { dark: '#0B1221', light: '#FFFFFF' },
              });
              if (myGen !== qrFlowGeneration) return;

              qrAuthState = {
                status: 'waiting_scan',
                qrUrl,
                qrDataUrl,
                expires: result.expires,
              };

              if (!sentFirstQr && !res.headersSent) {
                sentFirstQr = true;
                res.json({ qrUrl, qrDataUrl, expires: result.expires });
              } else {
                broadcastWs({ type: 'QR_REFRESH', qrUrl, qrDataUrl, expires: result.expires });
              }

              const msUntilRefresh = Math.min(25_000, Math.max(4_000, result.expires * 1000 - Date.now() - 2000));
              await new Promise<void>((resolve) => {
                const timer = setTimeout(() => {
                  if (qrWakeupResolver === done) qrWakeupResolver = null;
                  resolve();
                }, msUntilRefresh);
                const done = () => {
                  clearTimeout(timer);
                  resolve();
                };
                qrWakeupResolver = done;
              });
            }
          }

          if (myGen === qrFlowGeneration) {
            qrAuthState = { status: 'error', error: 'QR code expired. Click Refresh QR Code to continue.' };
            broadcastWs({ type: 'QR_ERROR', error: qrAuthState.error });
            await cleanupPendingAuth();
          }
        } catch (err) {
          if (myGen !== qrFlowGeneration) return;
          const msg = (err as { errorMessage?: string; message?: string }).errorMessage || (err as Error).message || 'QR login failed.';
          qrAuthState = { status: 'error', error: msg };
          broadcastWs({ type: 'QR_ERROR', error: msg });
          if (!sentFirstQr && !res.headersSent) {
            sentFirstQr = true;
            res.status(400).json({ error: msg });
          }
          await cleanupPendingAuth();
        }
      })();
    } catch (err) {
      const msg = (err as Error).message || 'Could not start QR login.';
      qrAuthState = { status: 'error', error: msg };
      if (!res.headersSent) {
        return res.status(400).json({ error: msg });
      }
    }
  });

  async function waitForQr2FACompletion(
    qrClient: TelegramClient,
    srp: Api.account.Password,
    myGen: number,
    onSuccess: () => Promise<void>
  ) {
    return new Promise<void>((resolveLoop) => {
      pendingQr2FAHandler = async (password: string) => {
        if (myGen !== qrFlowGeneration) {
          return { ok: false, error: 'QR session expired. Refresh QR code and scan again.' };
        }
        try {
          if (!qrClient.connected) {
            await qrClient.connect();
          }
          const srpCheck = await computeCheck(srp, password);
          await qrClient.invoke(new Api.auth.CheckPassword({ password: srpCheck }));
          await onSuccess();
          resolveLoop();
          return { ok: true };
        } catch (err: unknown) {
          const errMsg =
            (err as { errorMessage?: string; message?: string }).errorMessage ||
            (err as Error).message ||
            'Invalid 2FA password.';
          if (errMsg.includes('PASSWORD_HASH_INVALID')) {
            return { ok: false, error: 'Incorrect 2FA password. Please try again.' };
          }
          return { ok: false, error: errMsg };
        }
      };
    });
  }

  app.post('/api/tg/auth/session', async (req, res) => {
    try {
      const savedDisk = loadSessionFile();
      const apiId = Number(req.body.apiId) || currentApiId || savedDisk?.apiId || DEFAULT_TG_API_ID;
      const apiHash =
        String(req.body.apiHash || '').trim() || currentApiHash || savedDisk?.apiHash || DEFAULT_TG_API_HASH;
      const sessionString = String(req.body.sessionString || '').trim();
      if (!sessionString) {
        return res.status(400).json({ error: 'StringSession is required.' });
      }

      await cleanupPendingAuth();

      const { user, sessionString: finalSession } = await activateAuthorizedSession(
        sessionString,
        apiId,
        apiHash
      );

      broadcastWs({
        type: 'AUTH_UPDATED',
        isConnected: true,
        user: serializeUser(user),
        sessionString: finalSession,
        apiId,
        apiHash,
      });

      return res.json({
        isConnected: true,
        user: serializeUser(user),
        sessionString: finalSession,
        apiId,
        apiHash,
      });
    } catch (err) {
      const permanent = isPermanentSessionError(err);
      if (permanent) {
        removeSessionFiles();
        return res.status(401).json({
          error: (err as Error).message || 'Session string is invalid or revoked.',
          invalidSession: true,
        });
      }
      return res.status(503).json({
        error: (err as Error).message || 'Temporary Telegram connection issue — keeping saved session intact.',
        invalidSession: false,
        transient: true,
      });
    }
  });

  app.post('/api/tg/logout', async (_req, res) => {
    try {
      await cleanupPendingAuth();
      const prevClient = client;
      client = null;
      await destroyTgClientSafely(prevClient);
      currentMe = null;
      qrAuthState = { status: 'idle' };
      messageCacheByChat.clear();
      rawMessageCache.clear();
      msgIdToChatId.clear();
      chatReadOutboxMaxId.clear();
      dialogsSnapshot = {};
      if (fs.existsSync(DIALOGS_SNAPSHOT_FILE)) {
        fs.unlinkSync(DIALOGS_SNAPSHOT_FILE);
      }
      removeSessionFiles();
      broadcastWs({
        type: 'AUTH_UPDATED',
        isConnected: false,
        explicitLogout: true,
        user: serializeUser(null),
      });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- Dialogs & Folders ---

  app.get('/api/tg/dialogs', async (_req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated with Telegram' });
    }
    try {
      const [mainRes, archivedRes] = await Promise.allSettled([
        client.getDialogs({ limit: 100, archived: false }),
        client.getDialogs({ limit: 100, archived: true }),
      ]);
      const mainDialogs = mainRes.status === 'fulfilled' ? mainRes.value : [];
      const archivedDialogs = archivedRes.status === 'fulfilled' ? archivedRes.value : [];
      const seenDialogIds = new Set<string>();
      const dialogs: typeof mainDialogs = [];
      const archivedForceIds = new Set<string>();

      for (const d of mainDialogs) {
        const idStr = d.id ? d.id.toString() : '';
        if (idStr && !seenDialogIds.has(idStr)) {
          seenDialogIds.add(idStr);
          dialogs.push(d);
        }
      }
      for (const d of archivedDialogs) {
        const idStr = d.id ? d.id.toString() : '';
        if (idStr) {
          archivedForceIds.add(idStr);
          if (!seenDialogIds.has(idStr)) {
            seenDialogIds.add(idStr);
            dialogs.push(d);
          }
        }
      }

      const meId = currentMe?.id?.toString();
      const liveChatIds = new Set<string>();

      const chats: DialogSnapshot[] = dialogs.map((d) => {
        const idStr = d.id ? d.id.toString() : '';
        if (idStr) liveChatIds.add(idStr);
        const ent = d.entity;
        if (idStr && (ent instanceof Api.User || ent instanceof Api.Channel || ent instanceof Api.Chat)) {
          peerEntityCache.set(idStr, ent);
        }
        const photoPresent = hasEntityPhoto(ent);

        let type: 'user' | 'group' | 'channel' | 'bot' | 'saved' = 'user';
        let username = '';
        let isVerified = false;
        let isProtected = false;
        let isCreator = false;
        let isAdmin = false;
        let canPostMessages = true;
        let isForum = false;
        let memberCount: number | undefined;
        let status: string | undefined;

        let canSendMedia = true;
        let sendRestrictionReason = '';

        if (idStr === meId) {
          type = 'saved';
        } else if (ent instanceof Api.User) {
          type = ent.bot ? 'bot' : 'user';
          username = ent.username || '';
          isVerified = Boolean(ent.verified);
          status = ent.status instanceof Api.UserStatusOnline ? 'online' : 'offline';
        } else if (ent instanceof Api.Channel) {
          type = ent.broadcast ? 'channel' : 'group';
          username = ent.username || '';
          isVerified = Boolean(ent.verified);
          isProtected = Boolean(ent.noforwards);
          isCreator = Boolean(ent.creator);
          isAdmin = Boolean(ent.creator || ent.adminRights);
          isForum = Boolean(ent.forum);
          memberCount = ent.participantsCount || undefined;
          if (ent.broadcast) {
            canPostMessages = Boolean(ent.creator || ent.adminRights?.postMessages);
            canSendMedia = canPostMessages;
            if (!canPostMessages) {
              sendRestrictionReason = 'Only channel administrators can post messages in this channel.';
            }
          } else {
            const banned = ent.bannedRights && !isBanExpired(ent.bannedRights) ? ent.bannedRights : null;
            const defBanned = ent.defaultBannedRights;
            if (ent.left) {
              canPostMessages = false;
              canSendMedia = false;
              sendRestrictionReason = 'You must join this group before sending messages.';
            } else if (!isCreator && !isAdmin && banned?.sendMessages) {
              canPostMessages = false;
              canSendMedia = false;
              sendRestrictionReason = 'You are restricted from sending messages in this group.';
            } else if (!isCreator && !isAdmin && defBanned?.sendMessages) {
              canPostMessages = false;
              canSendMedia = false;
              sendRestrictionReason = 'Sending messages is disabled by group administrators.';
            } else if (!isCreator && !isAdmin && (banned?.sendMedia || defBanned?.sendMedia)) {
              canSendMedia = false;
              sendRestrictionReason = 'Sending photos, videos, and files is restricted in this group.';
            }
          }
        } else if (ent instanceof Api.Chat) {
          type = 'group';
          isProtected = Boolean(ent.noforwards);
          isCreator = Boolean(ent.creator);
          isAdmin = Boolean(ent.creator || ent.adminRights);
          memberCount = ent.participantsCount || undefined;
          if (ent.left || ent.deactivated) {
            canPostMessages = false;
            canSendMedia = false;
            sendRestrictionReason = ent.deactivated
              ? 'This group has been deactivated.'
              : 'You have left this group.';
          } else if (!isCreator && !isAdmin && ent.defaultBannedRights?.sendMessages) {
            canPostMessages = false;
            canSendMedia = false;
            sendRestrictionReason = 'Sending messages is disabled by group administrators.';
          }
        }

        const lastMsg = d.message;
        const lastMedia = lastMsg ? detectMediaInfo(lastMsg) : null;
        const lastPoll = lastMsg?.media instanceof Api.MessageMediaPoll ? lastMsg.media.poll : null;
        const lastText =
          lastMsg?.message ||
          (lastPoll ? `Poll: ${extractTextWithEntitiesStr(lastPoll.question)}` : '') ||
          (lastMedia
            ? `[${
                lastMedia.type === 'video'
                  ? 'Video'
                  : lastMedia.type === 'photo'
                  ? 'Photo'
                  : lastMedia.type === 'voice'
                  ? 'Voice'
                  : lastMedia.type === 'sticker'
                  ? 'Sticker'
                  : lastMedia.type === 'gif'
                  ? 'GIF'
                  : 'File'
              }]`
            : '');

        let lastSenderName: string | undefined;
        if (lastMsg) {
          if (lastMsg.out) {
            lastSenderName = 'You';
          } else if (type === 'group' && lastMsg.fromId instanceof Api.PeerUser) {
            const sEnt = peerEntityCache.get(lastMsg.fromId.userId.toString());
            if (sEnt instanceof Api.User) {
              lastSenderName = sEnt.firstName || sEnt.username || undefined;
            }
          }
        }

        const muteUntil = d.dialog?.notifySettings?.muteUntil;
        const isMuted = Boolean(muteUntil && muteUntil > Math.floor(Date.now() / 1000));
        const readOutboxMax = d.dialog instanceof Api.Dialog ? d.dialog.readOutboxMaxId : undefined;
        if (idStr && typeof readOutboxMax === 'number') {
          chatReadOutboxMaxId.set(idStr, readOutboxMax);
        }
        const draftText =
          d.dialog instanceof Api.Dialog && d.dialog.draft instanceof Api.DraftMessage
            ? d.dialog.draft.message || ''
            : '';

        const item: DialogSnapshot = {
          id: idStr,
          type,
          title: type === 'saved' ? 'Saved Messages' : d.title || d.name || 'Telegram Chat',
          username,
          avatarUrl: type === 'saved' || !photoPresent ? '' : `/api/tg/avatar/${encodeURIComponent(idStr)}`,
          unreadCount: d.unreadCount || 0,
          isPinned: Boolean(d.pinned),
          isMuted,
          isArchived: Boolean(
            d.archived ||
              (d.dialog instanceof Api.Dialog && d.dialog.folderId === 1) ||
              (idStr && archivedForceIds.has(idStr))
          ),
          isProtected,
          isVerified,
          isCreator,
          isAdmin,
          canPostMessages,
          canSendMedia,
          sendRestrictionReason: sendRestrictionReason || undefined,
          isForum,
          draftText,
          isDeletedChat: false,
          status,
          memberCount,
          lastMessage: lastMsg
            ? {
                text: lastText,
                timestamp: lastMsg.date ? lastMsg.date * 1000 : Date.now(),
                senderName: lastSenderName,
                isOutgoing: Boolean(lastMsg.out),
                isRead: !lastMsg.out
                  ? !d.unreadCount
                  : type === 'saved'
                  ? true
                  : typeof readOutboxMax === 'number'
                  ? lastMsg.id <= readOutboxMax
                  : false,
              }
            : undefined,
        };

        if (idStr) {
          dialogsSnapshot[idStr] = item;
        }
        return item;
      });

      // Retain previously seen dialogs that were deleted/removed/left when Anti-Delete is enabled
      if (ayuConfig.antiDeleteEnabled && dialogs.length < 80) {
        for (const [prevId, snap] of Object.entries(dialogsSnapshot)) {
          if (!liveChatIds.has(prevId) && snap.type !== 'saved') {
            snap.isDeletedChat = true;
            if (!snap.deletedAt) snap.deletedAt = Date.now();
            chats.push({
              ...snap,
              unreadCount: 0,
              isPinned: false,
            });
          }
        }
      } else {
        // Check already-marked deleted chats too
        for (const [prevId, snap] of Object.entries(dialogsSnapshot)) {
          if (!liveChatIds.has(prevId) && snap.isDeletedChat) {
            chats.push({
              ...snap,
              unreadCount: 0,
              isPinned: false,
            });
          }
        }
      }
      persistDialogsSnapshot();

      return res.json({ chats });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/open-link', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated with Telegram' });
    }
    try {
      const link = String(req.body.link || '').trim();
      const { config } = await resolveTargetGroupByLink(client, link);
      let ent: Api.TypeChat | Api.TypeUser | null = null;
      let isProtected = false;
      let isVerified = false;
      try {
        ent = (await client.getEntity(config.id === 'me' ? 'me' : config.id)) as Api.TypeChat | Api.TypeUser;
        if (ent && (ent instanceof Api.User || ent instanceof Api.Channel || ent instanceof Api.Chat)) {
          peerEntityCache.set(config.id, ent);
        }
        if (ent instanceof Api.Channel) {
          isProtected = Boolean(ent.noforwards);
          isVerified = Boolean(ent.verified);
        } else if (ent instanceof Api.Chat) {
          isProtected = Boolean(ent.noforwards);
        } else if (ent instanceof Api.User) {
          isVerified = Boolean(ent.verified);
        }
      } catch {
        // ignore metadata fallback
      }

      const photoPresent = hasEntityPhoto(ent);
      return res.json({
        chat: {
          id: config.id,
          type: config.type,
          title: config.title,
          username: config.username || '',
          avatarUrl: config.type === 'saved' || !photoPresent ? '' : `/api/tg/avatar/${encodeURIComponent(config.id)}`,
          unreadCount: 0,
          isPinned: false,
          isMuted: false,
          isProtected,
          isVerified,
          memberCount: config.memberCount,
        },
      });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Could not open Telegram link.' });
    }
  });

  // --- Messages History (Merged with Anti-Delete & Vault) ---

  app.get('/api/tg/messages/:chatId', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated with Telegram' });
    }
    try {
      const chatId = req.params.chatId;
      const limit = Math.min(80, Math.max(10, Number(req.query.limit) || 45));
      const offsetId = req.query.offsetId ? Number(req.query.offsetId) : 0;
      const topMsgId = req.query.topMsgId ? Number(req.query.topMsgId) : 0;
      const peer = await resolvePeer(client, chatId);

      // Ensure chatReadOutboxMaxId is populated from Telegram PeerDialog so outgoing ticks are 100% accurate
      if (!chatReadOutboxMaxId.has(chatId) && chatId !== 'me') {
        try {
          const peerDialogs = await client.invoke(
            new Api.messages.GetPeerDialogs({
              peers: [new Api.InputDialogPeer({ peer: peer as unknown as Api.TypeInputPeer })],
            })
          );
          const dlg = peerDialogs.dialogs?.[0];
          if (dlg instanceof Api.Dialog && typeof dlg.readOutboxMaxId === 'number') {
            chatReadOutboxMaxId.set(chatId, dlg.readOutboxMaxId);
          }
        } catch {
          // ignore fallback
        }
      }

      let msgs: Api.Message[];
      if (topMsgId > 0) {
        const resReplies = await client.invoke(
          new Api.messages.GetReplies({
            peer,
            msgId: topMsgId,
            offsetId,
            offsetDate: 0,
            addOffset: 0,
            limit,
            maxId: 0,
            minId: 0,
            hash: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
          })
        );
        msgs = ('messages' in resReplies ? resReplies.messages : []).filter(
          (m): m is Api.Message => m instanceof Api.Message
        );
      } else {
        msgs = (await client.getMessages(peer, {
          limit,
          ...(offsetId > 0 ? { offsetId } : {}),
        })) as Api.Message[];
      }

      const ordered = [...msgs].reverse().filter((m): m is Api.Message => m instanceof Api.Message);
      const liveIds = new Set<number>();

      // Resolve unique uncached senders in parallel batches
      const unresolvedSenders = new Map<string, Api.Message>();
      for (const m of ordered) {
        let sid = '';
        if (m.fromId instanceof Api.PeerUser) sid = m.fromId.userId.toString();
        else if (m.fromId instanceof Api.PeerChannel) sid = `-100${m.fromId.channelId.toString().replace(/^-100/, '')}`;
        else if (m.fromId instanceof Api.PeerChat) sid = `-${m.fromId.chatId.toString().replace(/^-/, '')}`;
        else if (!m.out && m.peerId instanceof Api.PeerUser) sid = m.peerId.userId.toString();

        const embeddedSender = (m as unknown as { _sender?: unknown })._sender;
        if (embeddedSender && sid) {
          extractEntityQuickMeta(embeddedSender, sid);
        }

        if (sid && !peerEntityCache.has(sid) && !unresolvedSenders.has(sid)) {
          unresolvedSenders.set(sid, m);
        }
      }

      if (unresolvedSenders.size > 0) {
        const senderMsgs = Array.from(unresolvedSenders.values()).slice(0, 35);
        for (let i = 0; i < senderMsgs.length; i += 10) {
          await Promise.all(
            senderMsgs.slice(i, i + 10).map(async (m) => {
              try {
                const sender = await m.getSender();
                if (sender) extractEntityQuickMeta(sender, '');
              } catch {
                // ignore
              }
            })
          );
        }
      }

      const result: CachedMessageMeta[] = [];
      const meIdStr = currentMe?.id?.toString();

      for (const m of ordered) {
        liveIds.add(m.id);
        let senderName = m.out ? (currentMe?.firstName || 'You') : m.postAuthor || undefined;
        let senderAvatar: string | undefined;

        let sid = '';
        if (m.fromId instanceof Api.PeerUser) sid = m.fromId.userId.toString();
        else if (m.fromId instanceof Api.PeerChannel) sid = `-100${m.fromId.channelId.toString()}`;
        else if (m.fromId instanceof Api.PeerChat) sid = `-${m.fromId.chatId.toString()}`;
        else if (!m.out && m.peerId instanceof Api.PeerUser) sid = m.peerId.userId.toString();

        const cachedEnt = sid ? peerEntityCache.get(sid) : undefined;
        if (cachedEnt) {
          const quick = extractEntityQuickMeta(cachedEnt, sid);
          if (!senderName) senderName = quick.title;
          senderAvatar = quick.avatar;
        }

        const serialized = serializeMessage(m, chatId, senderName, senderAvatar);
        const readOutboxMax = chatReadOutboxMaxId.get(chatId);
        serialized.isRead = !m.out
          ? true
          : chatId === 'me' || (meIdStr && chatId === meIdStr)
          ? true
          : typeof readOutboxMax === 'number'
          ? m.id <= readOutboxMax
          : false;
        const mediaInfo = detectMediaInfo(m);

        // Background TTL capture so history response never blocks on large media downloads
        if (mediaInfo?.isDisappearing && ayuConfig.saveDisappearingMedia) {
          serialized.isSavedFromTTL = true;
          void cacheMediaToVault(client, chatId, senderName || chatId, m, true, mediaInfo.expireSeconds);
        }

        storeRawMessage(chatId, m);
        storeMessageInCache(chatId, m.id, serialized);
        result.push(serialized);
      }

      // Second pass: resolve replyTo banners from cache or fetch missing parent messages
      const missingReplyIds = new Set<number>();
      const chatCacheAfter = messageCacheByChat.get(chatId);
      for (const item of result) {
        if (!item.replyTo && item.replyToMsgId) {
          const hit = chatCacheAfter?.get(item.replyToMsgId);
          if (hit) {
            item.replyTo = {
              id: String(item.replyToMsgId),
              senderName: hit.senderName || 'Message',
              text:
                hit.text ||
                (hit.media
                  ? hit.media.type === 'photo'
                    ? 'Photo'
                    : hit.media.type === 'video'
                    ? 'Video'
                    : hit.media.type === 'voice'
                    ? 'Voice message'
                    : hit.media.type === 'sticker'
                    ? 'Sticker'
                    : hit.media.fileName || 'Media'
                  : 'Message'),
              mediaType: hit.media?.type,
            };
          } else {
            missingReplyIds.add(item.replyToMsgId);
          }
        }
      }

      if (missingReplyIds.size > 0) {
        try {
          const fetchedReplies = await client.getMessages(peer, {
            ids: Array.from(missingReplyIds).slice(0, 25),
          });
          for (const rm of fetchedReplies) {
            if (rm instanceof Api.Message) {
              let rSenderName = rm.out ? (currentMe?.firstName || 'You') : rm.postAuthor || undefined;
              let rSid = '';
              if (rm.fromId instanceof Api.PeerUser) rSid = rm.fromId.userId.toString();
              else if (rm.fromId instanceof Api.PeerChannel) rSid = `-100${rm.fromId.channelId.toString()}`;
              else if (rm.fromId instanceof Api.PeerChat) rSid = `-${rm.fromId.chatId.toString()}`;
              const rEnt = rSid ? peerEntityCache.get(rSid) : undefined;
              if (rEnt && !rSenderName) {
                rSenderName = extractEntityQuickMeta(rEnt, rSid).title;
              }
              if (!rSenderName) {
                try {
                  const s = await rm.getSender();
                  if (s) rSenderName = extractEntityQuickMeta(s, rSid).title;
                } catch {
                  // ignore
                }
              }
              storeRawMessage(chatId, rm);
              const rSer = serializeMessage(rm, chatId, rSenderName);
              storeMessageInCache(chatId, rm.id, rSer);
            }
          }
          for (const item of result) {
            if (!item.replyTo && item.replyToMsgId) {
              const hit = messageCacheByChat.get(chatId)?.get(item.replyToMsgId);
              if (hit) {
                item.replyTo = {
                  id: String(item.replyToMsgId),
                  senderName: hit.senderName || 'Message',
                  text:
                    hit.text ||
                    (hit.media
                      ? hit.media.type === 'photo'
                        ? 'Photo'
                        : hit.media.type === 'video'
                        ? 'Video'
                        : hit.media.type === 'voice'
                        ? 'Voice message'
                        : hit.media.type === 'sticker'
                        ? 'Sticker'
                        : hit.media.fileName || 'Media'
                      : 'Message'),
                  mediaType: hit.media?.type,
                };
              }
            }
          }
        } catch {
          // ignore parent fetch errors
        }
      }

      // Merge any Anti-Delete preserved messages that are no longer on Telegram servers on initial load
      if (!offsetId && ayuConfig.antiDeleteEnabled) {
        const chatCache = messageCacheByChat.get(chatId);
        if (chatCache) {
          for (const [msgId, cached] of chatCache.entries()) {
            if (!liveIds.has(msgId) && cached.isDeletedBySender) {
              result.push(cached);
            }
          }
        }
        result.sort((a, b) => a.timestamp - b.timestamp);
      }

      return res.json({ messages: result, hasMore: msgs.length >= limit });
    } catch (err) {
      // If chat was deleted on Telegram servers, return any locally preserved cache or snapshot preview
      const chatCache = messageCacheByChat.get(req.params.chatId);
      if (chatCache && chatCache.size > 0) {
        const preserved = Array.from(chatCache.values()).sort((a, b) => a.timestamp - b.timestamp);
        return res.json({ messages: preserved, hasMore: false, isDeletedChat: true });
      }
      const snap = dialogsSnapshot[req.params.chatId];
      if (snap?.isDeletedChat) {
        const preservedSnap = snap.lastMessage
          ? [
              {
                id: 'archived_last',
                chatId: snap.id,
                senderId: snap.id,
                senderName: snap.title,
                text: snap.lastMessage.text || '[Archived conversation]',
                timestamp: snap.lastMessage.timestamp || Date.now(),
                isOutgoing: Boolean(snap.lastMessage.isOutgoing),
                isRead: true,
                isDeletedBySender: true,
                deletedAt: snap.deletedAt || Date.now(),
              },
            ]
          : [];
        return res.json({ messages: preservedSnap, hasMore: false, isDeletedChat: true });
      }
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/chats/:chatId/media', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated with Telegram' });
    }
    try {
      const chatId = req.params.chatId;
      const filterType = String(req.query.filter || 'media');
      const requestedLimit = Math.min(300, Math.max(40, Number(req.query.limit) || 180));
      let currentOffsetId = req.query.offsetId ? Number(req.query.offsetId) : 0;
      const peer = await resolvePeer(client, chatId);

      const filter =
        filterType === 'files'
          ? new Api.InputMessagesFilterDocument()
          : filterType === 'voice'
          ? new Api.InputMessagesFilterRoundVoice()
          : filterType === 'links' ? new Api.InputMessagesFilterUrl()
          : filterType === 'music' ? new Api.InputMessagesFilterMusic()
          : new Api.InputMessagesFilterPhotoVideo();

      const collectedMsgs: Api.Message[] = [];
      const seenMsgIds = new Set<number>();
      const maxPages = 1;
      let lastBatchLen = 0;

      for (let page = 0; page < maxPages && collectedMsgs.length < requestedLimit; page++) {
        const batchLimit = Math.min(100, requestedLimit - collectedMsgs.length);
        const batch = await client.getMessages(peer, {
          limit: batchLimit,
          filter,
          ...(currentOffsetId > 0 ? { offsetId: currentOffsetId } : {}),
        });
        lastBatchLen = batch.length;
        if (batch.length === 0) break;

        let batchMinId = Number.MAX_SAFE_INTEGER;
        for (const m of batch) {
          if (m instanceof Api.Message) {
            if (m.id < batchMinId) batchMinId = m.id;
            if (!seenMsgIds.has(m.id)) {
              seenMsgIds.add(m.id);
              collectedMsgs.push(m);
            }
          }
        }
        if (batchMinId === Number.MAX_SAFE_INTEGER || batch.length < 40) break;
        currentOffsetId = batchMinId;
      }

      // If filterType === 'media', also include any document-wrapped photos/videos/GIFs from recent history
      if (filterType === 'media' && !req.query.offsetId && collectedMsgs.length < 30) {
        const recentAll = await client.getMessages(peer, { limit: 100 });
        for (const m of recentAll) {
          if (m instanceof Api.Message && !seenMsgIds.has(m.id)) {
            const info = detectMediaInfo(m);
            if (info && (info.type === 'photo' || info.type === 'video' || info.type === 'gif')) {
              seenMsgIds.add(m.id);
              collectedMsgs.push(m);
            }
          }
        }
      }

      const rawValid = collectedMsgs
        .filter((m): m is Api.Message => m instanceof Api.Message && (filterType === 'links' || Boolean(detectMediaInfo(m))))
        .sort((a, b) => b.id - a.id);

      const items = rawValid.map((m) => {
        storeRawMessage(chatId, m);
        const ser = serializeMessage(m, chatId);
        storeMessageInCache(chatId, m.id, ser);
        return ser;
      });

      const oldestId = rawValid.length > 0 ? Math.min(...rawValid.map((m) => m.id)) : 0;
      return res.json({
        items,
        hasMore: lastBatchLen >= 40,
        nextOffsetId: oldestId,
      });
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message || 'Could not load shared media' });
    }
  });

  // --- Send Message / Photo / Video / Voice / Disappearing TTL Media ---

  app.post('/api/tg/messages/send', async (req, res) => {
    let activeClient = await ensureConnectedClient();
    if (!activeClient || !activeClient.connected) {
      return res.status(401).json({ error: 'Not authenticated with Telegram' });
    }
    try {
      const chatId = String(req.body.chatId || '').trim();
      const text = String(req.body.text || '');
      const replyToId = parsePositiveInt(req.body.replyToId);
      const topMsgId = parsePositiveInt(req.body.topMsgId);
      const scheduleDate = parsePositiveInt(req.body.scheduleDate);
      const parseFormatting = req.body.parseFormatting !== false;
      const ttlSeconds = parsePositiveInt(req.body.ttlSeconds);
      const fileDataUrl = req.body.fileDataUrl ? String(req.body.fileDataUrl) : undefined;
      const fileName = req.body.fileName ? String(req.body.fileName) : 'media.bin';
      const mediaType = req.body.mediaType as 'photo' | 'video' | 'voice' | 'file' | undefined;
      const silent = Boolean(req.body.silent);

      if (!chatId) {
        return res.status(400).json({ error: 'Target chat is missing.' });
      }
      if (!fileDataUrl && !text.trim()) {
        return res.status(400).json({ error: 'Cannot send an empty message.' });
      }

      const executeSend = async (tg: TelegramClient): Promise<Api.Message | undefined> => {
        const peer = await resolvePeer(tg, chatId);
        let resultMsg: Api.Message | undefined;
        const effectiveReplyTo = replyToId || topMsgId;

        if (fileDataUrl) {
          const base64Part = fileDataUrl.includes(',') ? fileDataUrl.split(',')[1] : fileDataUrl;
          const mimeMatch = fileDataUrl.match(/^data:([^;]+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
          const buffer = Buffer.from(base64Part, 'base64');
          if (buffer.length === 0) {
            throw new Error('Attached media or voice note was empty.');
          }

          if (ttlSeconds && ttlSeconds > 0 && (mediaType === 'photo' || mediaType === 'video')) {
            try {
              const uploaded = await tg.uploadFile({
                file: new CustomFile(fileName, buffer.length, '', buffer),
                workers: 1,
              });

              const inputMedia =
                mediaType === 'photo'
                  ? new Api.InputMediaUploadedPhoto({
                      file: uploaded,
                      ttlSeconds,
                    })
                  : new Api.InputMediaUploadedDocument({
                      file: uploaded,
                      mimeType: mimeType.startsWith('video/') ? mimeType : 'video/mp4',
                      attributes: [
                        new Api.DocumentAttributeVideo({
                          duration: 0,
                          w: 1280,
                          h: 720,
                          supportsStreaming: true,
                        }),
                        new Api.DocumentAttributeFilename({ fileName }),
                      ],
                      ttlSeconds,
                    });

              await tg.invoke(
                new Api.messages.SendMedia({
                  peer,
                  media: inputMedia,
                  message: text,
                  silent,
                  scheduleDate: scheduleDate || undefined,
                  randomId: helpers.generateRandomBigInt(),
                  replyTo: effectiveReplyTo ? new Api.InputReplyToMessage({ replyToMsgId: effectiveReplyTo, topMsgId }) : undefined,
                })
              );

              const latest = await tg.getMessages(peer, { limit: 1 });
              resultMsg = latest[0] as Api.Message | undefined;
            } catch {
              const customFile = new CustomFile(fileName, buffer.length, '', buffer);
              resultMsg = await tg.sendFile(peer, {
                file: customFile,
                caption: text || undefined,
                replyTo: effectiveReplyTo,
                silent,
                scheduleDate: scheduleDate || undefined,
                supportsStreaming: mediaType === 'video',
              });
            }
          } else if (mediaType === 'voice') {
            const requestedDuration = Math.max(1, Math.round(Number(req.body.duration || 1)));
            const inExt =
              buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
                ? 'webm'
                : buffer.subarray(0, 4).toString('ascii') === 'OggS'
                ? 'ogg'
                : buffer.subarray(4, 8).toString('ascii') === 'ftyp'
                ? 'm4a'
                : mimeType.includes('wav')
                ? 'wav'
                : 'webm';

            let voiceSent = false;
            try {
              const converted = await convertBufferToTelegramVoice(buffer, inExt, requestedDuration);
              const uploadedVoice = await tg.uploadFile({
                file: new CustomFile(`voice_${Date.now()}.ogg`, converted.oggBuffer.length, '', converted.oggBuffer),
                workers: 1,
              });
              const updates = await tg.invoke(
                new Api.messages.SendMedia({
                  peer,
                  media: new Api.InputMediaUploadedDocument({
                    file: uploadedVoice,
                    mimeType: 'audio/ogg',
                    attributes: [
                      new Api.DocumentAttributeAudio({
                        voice: true,
                        duration: converted.duration,
                        waveform: converted.waveform,
                      }),
                    ],
                  }),
                  message: text || '',
                  silent,
                  scheduleDate: scheduleDate || undefined,
                  randomId: helpers.generateRandomBigInt(),
                  replyTo: effectiveReplyTo
                    ? new Api.InputReplyToMessage({ replyToMsgId: effectiveReplyTo, topMsgId })
                    : undefined,
                })
              );

              if (updates && 'updates' in updates && Array.isArray((updates as Api.Updates).updates)) {
                for (const u of (updates as Api.Updates).updates) {
                  if (
                    (u instanceof Api.UpdateNewMessage || u instanceof Api.UpdateNewChannelMessage) &&
                    u.message instanceof Api.Message
                  ) {
                    resultMsg = u.message;
                    break;
                  }
                }
              }
              if (!resultMsg && !scheduleDate) {
                const latest = await tg.getMessages(peer, { limit: 1 });
                if (latest && latest[0] instanceof Api.Message && latest[0].out) {
                  resultMsg = latest[0];
                }
              }
              voiceSent = true;
            } catch (voiceErr) {
              console.warn('OGG/Opus voice transcode failed, falling back to direct voice send:', voiceErr);
            }

            if (!voiceSent) {
              const fallbackFile = new CustomFile(`voice_${Date.now()}.${inExt}`, buffer.length, '', buffer);
              resultMsg = await tg.sendFile(peer, {
                file: fallbackFile,
                caption: text || undefined,
                replyTo: effectiveReplyTo,
                silent,
                scheduleDate: scheduleDate || undefined,
                voiceNote: inExt === 'ogg',
                attributes: [
                  new Api.DocumentAttributeAudio({
                    voice: inExt === 'ogg',
                    duration: requestedDuration,
                  }),
                ],
              });
            }
          } else {
            const customFile = new CustomFile(fileName, buffer.length, '', buffer);
            resultMsg = await tg.sendFile(peer, {
              file: customFile,
              caption: text || undefined,
              replyTo: effectiveReplyTo,
              silent,
              scheduleDate: scheduleDate || undefined,
              supportsStreaming: mediaType === 'video',
              forceDocument: mediaType === 'file',
            });
          }
        } else {
          const parsed = parseFormatting ? parseRichMarkdown(text) : { message: text, entities: [] };
          try {
            resultMsg = await tg.sendMessage(peer, {
              message: parsed.message,
              formattingEntities: parsed.entities.length > 0 ? parsed.entities : undefined,
              replyTo: effectiveReplyTo,
              silent,
              schedule: scheduleDate || undefined,
            });
          } catch (fmtErr) {
            const fmtErrStr = getRawTgError(fmtErr);
            if (fmtErrStr.includes('ENTITY_BOUNDS_INVALID') || fmtErrStr.includes('ENTITIES_TOO_LONG')) {
              resultMsg = await tg.sendMessage(peer, {
                message: text,
                replyTo: effectiveReplyTo,
                silent,
                schedule: scheduleDate || undefined,
              });
            } else {
              throw fmtErr;
            }
          }
        }

        if (!resultMsg && !scheduleDate) {
          try {
            const latest = await tg.getMessages(peer, { limit: 1 });
            if (latest && latest[0] instanceof Api.Message && latest[0].out) {
              resultMsg = latest[0];
            }
          } catch {
            // fallback handled below
          }
        }
        return resultMsg;
      };

      let sentMsg: Api.Message | undefined;
      try {
        sentMsg = await executeSend(activeClient);
      } catch (firstErr) {
        if (isTransientConnectionError(firstErr)) {
          const reconnected = await ensureConnectedClient(true);
          if (reconnected) {
            activeClient = reconnected;
            sentMsg = await executeSend(reconnected);
          } else {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }

      if (scheduleDate) {
        return res.json({ scheduled: true, message: sentMsg ? serializeMessage(sentMsg, chatId, currentMe?.firstName || 'You') : null });
      }

      const meIdStr = currentMe?.id?.toString() || 'me';
      if (!sentMsg) {
        return res.json({
          message: {
            id: String(Date.now()),
            chatId,
            senderId: meIdStr,
            senderName: currentMe?.firstName || 'You',
            text,
            timestamp: Date.now(),
            isOutgoing: true,
            isRead: chatId === 'me' || chatId === meIdStr,
          },
        });
      }

      storeRawMessage(chatId, sentMsg);
      const serialized = serializeMessage(sentMsg, chatId, currentMe?.firstName || 'You');
      if (ttlSeconds && ttlSeconds > 0 && serialized.media) {
        serialized.media.isDisappearing = true;
        serialized.media.expireSeconds = ttlSeconds;
      }
      serialized.isRead = chatId === 'me' || Boolean(meIdStr && chatId === meIdStr);
      storeMessageInCache(chatId, sentMsg.id, serialized);
      return res.json({ message: serialized });
    } catch (err) {
      const rawErr = getRawTgError(err);
      const waitMatch = rawErr.match(/SLOWMODE_WAIT_(\d+)/i);
      const floodMatch = rawErr.match(/FLOOD_WAIT_(\d+)/i);
      let friendly = rawErr || 'Could not send message';
      if (waitMatch) {
        friendly = `Slow mode is active in this group — please wait ${waitMatch[1]} seconds before sending another message.`;
      } else if (floodMatch) {
        friendly = `Telegram rate limit active — please wait ${floodMatch[1]} seconds before sending again.`;
      } else if (rawErr.includes('CHAT_WRITE_FORBIDDEN')) {
        friendly = 'You cannot send messages here: posting is restricted by the group or channel administrators.';
      } else if (rawErr.includes('CHAT_SEND_MEDIA_FORBIDDEN') || rawErr.includes('CHAT_SEND_PHOTOS_FORBIDDEN') || rawErr.includes('CHAT_SEND_VIDEOS_FORBIDDEN') || rawErr.includes('CHAT_SEND_DOCS_FORBIDDEN')) {
        friendly = 'Sending photos, videos, or files is restricted by the administrators of this group.';
      } else if (rawErr.includes('CHAT_SEND_STICKERS_FORBIDDEN') || rawErr.includes('CHAT_SEND_GIFS_FORBIDDEN')) {
        friendly = 'Sending stickers and GIFs is restricted in this group.';
      } else if (rawErr.includes('CHAT_SEND_PLAIN_FORBIDDEN')) {
        friendly = 'Sending plain text messages is restricted in this group.';
      } else if (rawErr.includes('USER_BANNED_IN_CHANNEL')) {
        friendly = 'Your account is restricted from posting in this group or channel.';
      } else if (rawErr.includes('CHAT_ADMIN_REQUIRED')) {
        friendly = 'Only channel or group administrators have permission to post here.';
      } else if (rawErr.includes('CHAT_GUEST_SEND_FORBIDDEN')) {
        friendly = 'You must join this group before sending messages.';
      } else if (rawErr.includes('PEER_FLOOD')) {
        friendly = 'Telegram spam limit reached (PEER_FLOOD). You can only message mutual contacts right now.';
      } else if (rawErr.includes('USER_IS_BLOCKED') || rawErr.includes('YOU_BLOCKED_USER')) {
        friendly = rawErr.includes('YOU_BLOCKED_USER')
          ? 'You blocked this user. Unblock them to send messages.'
          : 'You cannot send messages because this user has blocked you.';
      } else if (rawErr.includes('PRIVACY_PREMIUM_REQUIRED')) {
        friendly = 'This user only accepts direct messages from Telegram Premium users.';
      } else if (rawErr.includes('ALLOW_PAYMENT_REQUIRED')) {
        friendly = 'This user requires paid messages (Telegram Stars) for incoming DMs.';
      } else if (rawErr.includes('INPUT_USER_DEACTIVATED')) {
        friendly = 'This Telegram account has been deactivated or deleted.';
      } else if (rawErr.includes('MSG_ID_INVALID') || rawErr.includes('REPLY_MESSAGE_ID_INVALID')) {
        friendly = 'The message you are replying to was deleted or is unavailable.';
      } else if (rawErr.includes('MESSAGE_TOO_LONG')) {
        friendly = 'Message is too long (Telegram limit is 4,096 characters).';
      }
      return res.status(400).json({ error: friendly, code: rawErr });
    }
  });

  app.post('/api/tg/messages/edit', async (req, res) => {
    const activeClient = await ensureConnectedClient();
    if (!activeClient || !activeClient.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = String(req.body.chatId || '');
      const messageId = parsePositiveInt(req.body.messageId);
      const text = String(req.body.text || '');
      if (!messageId) {
        return res.status(400).json({ error: 'Message is still syncing — wait a moment and try editing again.' });
      }
      const peer = await resolvePeer(activeClient, chatId);

      const prev = messageCacheByChat.get(chatId)?.get(messageId);
      const edited = await activeClient.editMessage(peer, { message: messageId, text });
      const serialized = edited
        ? serializeMessage(edited, chatId, prev?.senderName)
        : { ...(prev || { id: String(messageId), chatId, senderId: currentMe?.id?.toString() || 'me', senderName: 'You', timestamp: Date.now(), isOutgoing: true }), text };

      if (ayuConfig.antiEditEnabled && prev) {
        serialized.editHistory = [...(prev.editHistory || []), { text: prev.text, timestamp: Date.now() }];
      }
      (serialized as unknown as { isEdited: boolean }).isEdited = true;
      storeMessageInCache(chatId, messageId, serialized);

      return res.json({ message: serialized });
    } catch (err) {
      return res.status(400).json({ error: getRawTgError(err) || 'Could not edit message.' });
    }
  });

  app.post('/api/tg/messages/delete', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = String(req.body.chatId);
      const messageId = Number(req.body.messageId);
      const revoke = req.body.revoke !== false;
      const peer = await resolvePeer(client, chatId);
      await client.deleteMessages(peer, [messageId], { revoke });
      messageCacheByChat.get(chatId)?.delete(messageId);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/target-group', (_req, res) => {
    return res.json({ targetGroup: savedTargetGroup });
  });

  app.post('/api/tg/target-group/resolve', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Sign in to Telegram first to resolve target group links.' });
    }
    try {
      const link = String(req.body.link || '').trim();
      const { config } = await resolveTargetGroupByLink(client, link);
      savedTargetGroup = config;
      persistTargetGroup();
      return res.json({ targetGroup: config });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Failed to resolve group link.' });
    }
  });

  app.delete('/api/tg/target-group', (_req, res) => {
    savedTargetGroup = null;
    persistTargetGroup();
    return res.json({ ok: true });
  });

  app.post('/api/tg/messages/forward', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const fromChatId = String(req.body.fromChatId);
      const rawTarget = String(req.body.toChatId || 'me');
      const targetLink = req.body.targetLink ? String(req.body.targetLink).trim() : '';
      const messageId = Number(req.body.messageId);
      const hideSenderTag = Boolean(req.body.hideSenderTag ?? ayuConfig.hideForwardTag);

      const fromPeer = await resolvePeer(client, fromChatId);
      let toPeer: Api.TypeEntityLike;
      if (targetLink) {
        const resolved = await resolveTargetGroupByLink(client, targetLink);
        toPeer = resolved.peer as Api.TypeEntityLike;
      } else if (rawTarget === 'target') {
        if (!savedTargetGroup) {
          return res.status(400).json({ error: 'No Target Group set. Set a Target Group link first.' });
        }
        toPeer = await resolvePeer(client, savedTargetGroup.id);
      } else {
        toPeer = await resolvePeer(client, rawTarget);
      }

      const key = getVaultKey(fromChatId, messageId);
      const existingVault = vaultIndex[key] && fs.existsSync(vaultIndex[key].filePath) ? vaultIndex[key] : null;

      try {
        await client.forwardMessages(toPeer, {
          messages: [messageId],
          fromPeer,
          dropAuthor: hideSenderTag,
        });
        return res.json({ ok: true, bypassed: false });
      } catch (fwdErr) {
        if (ayuConfig.bypassContentRestrictions && isForwardRestriction(fwdErr)) {
          if (existingVault) {
            await client.sendFile(toPeer, {
              file: existingVault.filePath,
              caption: messageCacheByChat.get(fromChatId)?.get(messageId)?.text || undefined,
              supportsStreaming: existingVault.mediaType === 'video',
            });
            return res.json({ ok: true, bypassed: true });
          }

          const msgs = await client.getMessages(fromPeer, { ids: [messageId] });
          const target = msgs[0];
          if (!target) throw fwdErr;

          const mediaInfo = detectMediaInfo(target);
          if (mediaInfo) {
            const entry = await cacheMediaToVault(
              client,
              fromChatId,
              fromChatId,
              target,
              Boolean(mediaInfo.isDisappearing),
              mediaInfo.expireSeconds
            );
            if (entry && fs.existsSync(entry.filePath)) {
              await client.sendFile(toPeer, {
                file: entry.filePath,
                caption: target.message || undefined,
                supportsStreaming: entry.mediaType === 'video',
              });
              return res.json({ ok: true, bypassed: true });
            }
          }
          if (target.message) {
            await client.sendMessage(toPeer, { message: target.message });
            return res.json({ ok: true, bypassed: true });
          }
        }
        throw fwdErr;
      }
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/messages/forward-all-media', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const fromChatId = String(req.body.fromChatId || '');
      const targetLink = req.body.targetLink ? String(req.body.targetLink).trim() : '';
      const targetChatIdInput = req.body.targetChatId ? String(req.body.targetChatId).trim() : '';
      const includePhotos = req.body.includePhotos !== false;
      const includeVideos = req.body.includeVideos !== false;
      const maxScan = Math.min(3000, Math.max(200, Number(req.body.limit) || 2000));

      if (!fromChatId) {
        return res.status(400).json({ error: 'Source group or chat is required.' });
      }
      if (!includePhotos && !includeVideos) {
        return res.status(400).json({ error: 'Enable Photos or Videos to forward media.' });
      }

      let toPeer: Api.TypeEntityLike;
      let resolvedTargetChatId = '';
      let targetTitle = 'Target Group';

      if (targetLink) {
        const resolved = await resolveTargetGroupByLink(client, targetLink);
        toPeer = resolved.peer as Api.TypeEntityLike;
        resolvedTargetChatId = resolved.config.id;
        targetTitle = resolved.config.title;
        savedTargetGroup = resolved.config;
        persistTargetGroup();
      } else if (targetChatIdInput) {
        toPeer = await resolvePeer(client, targetChatIdInput);
        resolvedTargetChatId = targetChatIdInput;
        targetTitle = savedTargetGroup?.id === targetChatIdInput ? savedTargetGroup.title : targetChatIdInput;
      } else if (savedTargetGroup) {
        toPeer = await resolvePeer(client, savedTargetGroup.id);
        resolvedTargetChatId = savedTargetGroup.id;
        targetTitle = savedTargetGroup.title;
      } else {
        return res.status(400).json({ error: 'Set a Target Group by link first before forwarding.' });
      }

      if (fromChatId === resolvedTargetChatId) {
        return res.status(400).json({ error: 'Source and Target Group cannot be the same chat.' });
      }

      const jobId = `bulk_${Date.now()}`;
      broadcastWs({
        type: 'BULK_FORWARD_PROGRESS',
        jobId,
        current: 0,
        total: 0,
        forwarded: 0,
        failed: 0,
        skippedDuplicates: 0,
        phase: 'scanning',
        statusText: 'Scanning & rendering all photos and videos in source group...',
        targetTitle,
        done: false,
      });

      const fromPeer = await resolvePeer(client, fromChatId);
      const scannedMsgs: Api.Message[] = [];
      let offsetId = 0;

      // Phase 1: Paginate ALL photos & videos from the group first and populate local cache/render state
      while (scannedMsgs.length < maxScan) {
        const batch = await client.getMessages(fromPeer, {
          limit: 100,
          offsetId,
          filter: new Api.InputMessagesFilterPhotoVideo(),
        });
        const msgsOnly = batch.filter((m): m is Api.Message => m instanceof Api.Message);
        if (msgsOnly.length === 0) break;

        for (const m of msgsOnly) {
          scannedMsgs.push(m);
          storeRawMessage(fromChatId, m);
          const ser = serializeMessage(m, fromChatId, dialogsSnapshot[fromChatId]?.title || 'Member');
          storeMessageInCache(fromChatId, m.id, ser);
        }

        const lowestId = Math.min(...msgsOnly.map((m) => m.id));
        if (!Number.isFinite(lowestId) || lowestId === offsetId || msgsOnly.length < 100) {
          break;
        }
        offsetId = lowestId;

        broadcastWs({
          type: 'BULK_FORWARD_PROGRESS',
          jobId,
          current: 0,
          total: scannedMsgs.length,
          forwarded: 0,
          failed: 0,
          skippedDuplicates: 0,
          phase: 'scanning',
          statusText: `Rendered ${scannedMsgs.length} media items — checking for duplicates...`,
          targetTitle,
          done: false,
        });
      }

      // Phase 2: Hydrate target group's recent media fingerprints so already-sent media is never resent
      await hydrateTargetSentFingerprints(client, resolvedTargetChatId, toPeer, true);

      // Deduplicate within scan + strictly allow Photos & Videos ONLY (no GIFs, no text, no files)
      const seenScanFingerprints = new Set<string>();
      const eligibleQueue: Array<{ msg: Api.Message; info: StrictMediaCandidate }> = [];
      let skippedDuplicates = 0;
      let highestScannedMsgId = 0;

      // Process oldest -> newest so media arrives in chronological order
      const chronological = [...scannedMsgs].sort((a, b) => a.id - b.id);
      for (const msg of chronological) {
        highestScannedMsgId = Math.max(highestScannedMsgId, msg.id);
        const info = extractStrictPhotoOrVideo(msg);
        if (!info) continue;
        if (info.kind === 'photo' && !includePhotos) continue;
        if (info.kind === 'video' && !includeVideos) continue;

        if (seenScanFingerprints.has(info.fingerprint)) {
          skippedDuplicates++;
          continue;
        }
        if (wasAlreadySentToTarget(fromChatId, resolvedTargetChatId, msg.id, info.fingerprint)) {
          skippedDuplicates++;
          continue;
        }

        seenScanFingerprints.add(info.fingerprint);
        eligibleQueue.push({ msg, info });
      }

      const total = eligibleQueue.length;
      let forwarded = 0;
      let failed = 0;

      broadcastWs({
        type: 'BULK_FORWARD_PROGRESS',
        jobId,
        current: 0,
        total,
        forwarded: 0,
        failed: 0,
        skippedDuplicates,
        phase: 'sending',
        statusText:
          total > 0
            ? `Sending ${total} new photos/videos (${skippedDuplicates} already sent skipped)...`
            : `All ${skippedDuplicates} photos/videos were already sent to ${targetTitle}.`,
        targetTitle,
        done: total === 0,
      });

      // Phase 3: Sequentially forward strictly clean Photos & Videos (dropAuthor + dropMediaCaptions)
      for (let i = 0; i < eligibleQueue.length; i++) {
        const { msg, info } = eligibleQueue[i];
        const outcome = await sendStrictMediaOnlyToTarget(
          client,
          fromChatId,
          dialogsSnapshot[fromChatId]?.title || fromChatId,
          fromPeer,
          toPeer,
          resolvedTargetChatId,
          msg,
          info
        );

        if (outcome === 'sent') forwarded++;
        else if (outcome === 'duplicate') skippedDuplicates++;
        else failed++;

        broadcastWs({
          type: 'BULK_FORWARD_PROGRESS',
          jobId,
          current: i + 1,
          total,
          forwarded,
          failed,
          skippedDuplicates,
          phase: 'sending',
          statusText:
            i + 1 === total
              ? `Done! Sent ${forwarded} media (${skippedDuplicates} already sent skipped)`
              : `Sending ${i + 1}/${total} (${info.kind})...`,
          targetTitle,
          done: i + 1 === total,
        });

        await new Promise((r) => setTimeout(r, 420));
      }

      if (highestScannedMsgId > 0 && autoForwardRules[fromChatId]) {
        autoForwardRules[fromChatId].lastMsgId = Math.max(
          autoForwardRules[fromChatId].lastMsgId || 0,
          highestScannedMsgId
        );
        if (forwarded > 0) {
          autoForwardRules[fromChatId].forwardedCount =
            (autoForwardRules[fromChatId].forwardedCount || 0) + forwarded;
          autoForwardRules[fromChatId].lastForwardedAt = Date.now();
        }
        persistAutoForwardRules();
      }

      return res.json({
        ok: true,
        jobId,
        total,
        forwarded,
        failed,
        skippedDuplicates,
        targetTitle,
      });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Bulk media forwarding failed.' });
    }
  });

  app.delete('/api/tg/target-group/sent-history', (req, res) => {
    const fromChatId = req.query.fromChatId ? String(req.query.fromChatId) : '';
    if (fromChatId && savedTargetGroup) {
      delete sentMediaRegistry[getSentPairKey(fromChatId, savedTargetGroup.id)];
    } else if (fromChatId) {
      for (const k of Object.keys(sentMediaRegistry)) {
        if (k.startsWith(`${fromChatId}=>`)) delete sentMediaRegistry[k];
      }
    } else {
      sentMediaRegistry = {};
    }
    targetExistingFingerprintsCache.clear();
    persistSentMediaRegistry();
    return res.json({ ok: true });
  });

  app.post('/api/tg/messages/mark-seen', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = String(req.body.chatId || '');
      const messageId = Number(req.body.messageId);
      if (!chatId || !messageId) {
        return res.status(400).json({ error: 'chatId and messageId are required.' });
      }
      const peer = await resolvePeer(client, chatId);

      try {
        if (peer instanceof Api.InputPeerChannel) {
          await client.invoke(
            new Api.channels.ReadMessageContents({
              channel: peer,
              id: [messageId],
            })
          );
          await client.invoke(
            new Api.channels.ReadHistory({
              channel: peer,
              maxId: messageId,
            })
          );
        } else {
          await client.invoke(
            new Api.messages.ReadMessageContents({
              id: [messageId],
            })
          );
          await client.invoke(
            new Api.messages.ReadHistory({
              peer,
              maxId: messageId,
            })
          );
        }
      } catch {
        // fallback
      }

      try {
        await client.markAsRead(peer, messageId);
      } catch {
        // ignore
      }

      const cachedChat = messageCacheByChat.get(chatId);
      if (cachedChat) {
        const msg = cachedChat.get(messageId);
        if (msg) {
          msg.isRead = true;
          if (msg.media) msg.media.viewed = true;
          cachedChat.set(messageId, msg);
        }
      }
      if (dialogsSnapshot[chatId]) {
        dialogsSnapshot[chatId].unreadCount = 0;
      }

      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Failed to send seen receipt.' });
    }
  });

  // Explicitly Save Photo OR Video (including disappearing/protected) to Vault + Telegram Saved Messages ('me')
  app.post('/api/tg/messages/save-vault', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = String(req.body.chatId);
      const messageId = Number(req.body.messageId);
      const chatTitle = String(req.body.chatTitle || 'Chat');
      const key = getVaultKey(chatId, messageId);

      let entry: VaultEntry | null = vaultIndex[key] && fs.existsSync(vaultIndex[key].filePath) ? vaultIndex[key] : null;
      let textCaption = '';

      if (!entry) {
        const peer = await resolvePeer(client, chatId);
        const msgs = await client.getMessages(peer, { ids: [messageId] });
        const target = msgs[0];
        if (!target) {
          return res.status(404).json({ error: 'Message not found on Telegram or cache.' });
        }
        textCaption = target.message || '';
        entry = await cacheMediaToVault(client, chatId, chatTitle, target, Boolean(detectMediaInfo(target)?.isDisappearing));
      }

      if (entry && fs.existsSync(entry.filePath)) {
        await client.sendFile('me', {
          file: entry.filePath,
          caption: textCaption || `Saved ${entry.mediaType} from ${chatTitle} (Vault)`,
          supportsStreaming: entry.mediaType === 'video',
        });
        return res.json({ ok: true, entry });
      }

      return res.status(400).json({ error: 'Could not extract media bytes for vault.' });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/messages/pin', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, String(req.body.chatId));
      const messageId = Number(req.body.messageId);
      const unpin = Boolean(req.body.unpin);
      if (unpin) {
        await client.unpinMessage(peer, messageId);
      } else {
        await client.pinMessage(peer, messageId, { notify: false });
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/messages/react', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, String(req.body.chatId));
      const msgId = Number(req.body.messageId);
      const emoji = String(req.body.emoji || '');
      const remove = Boolean(req.body.remove);
      await client.invoke(
        new Api.messages.SendReaction({
          peer,
          msgId,
          reaction: remove ? [] : [new Api.ReactionEmoji({ emoticon: emoji })],
        })
      );
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/:chatId/read', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const chatId = String(req.params.chatId || '');
      const peer = await resolvePeer(client, chatId);
      try {
        if (peer instanceof Api.InputPeerChannel) {
          await client.invoke(
            new Api.channels.ReadHistory({
              channel: peer,
              maxId: 0,
            })
          );
        } else {
          await client.invoke(
            new Api.messages.ReadHistory({
              peer,
              maxId: 0,
            })
          );
        }
      } catch {
        // fallback to markAsRead
      }
      try {
        await client.markAsRead(peer);
      } catch {
        // ignore
      }
      if (dialogsSnapshot[chatId]) {
        dialogsSnapshot[chatId].unreadCount = 0;
      }
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: false });
    }
  });

  // --- Real Media & Avatar Streaming (with Video Byte Range & Vault Fallback) ---

  app.get('/api/tg/avatar/:chatId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!currentMe) return res.status(401).end();
    try {
      const chatId = req.params.chatId;
      const resolvedKey = chatId === 'me' && currentMe ? currentMe.id.toString() : chatId;
      const avatarPath = path.join(VAULT_DIR, `avatar_${resolvedKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`);

      if (fs.existsSync(avatarPath)) {
        const stat = fs.statSync(avatarPath);
        if (stat.size > 0) {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Cache-Control', 'private, max-age=86400');
          return fs.createReadStream(avatarPath).pipe(res);
        }
      }

      if (!client?.connected) await ensureConnectedClient();
      if (!client?.connected || !currentMe) return res.status(503).end();
      const negAt = avatarNegCache.get(resolvedKey);
      if (!req.query.r && negAt && Date.now() - negAt < 20_000) {
        return res.status(404).end();
      }

      let pending = avatarInFlight.get(resolvedKey);
      if (!pending) {
        pending = runWithAvatarLimit(async () => {
          if (!client || !client.connected) return null;
          let peerOrEnt: unknown =
            chatId === 'me' && currentMe ? currentMe : peerEntityCache.get(resolvedKey);

          if (!peerOrEnt) {
            try {
              const numId = /^-?\d+$/.test(resolvedKey) ? Number(resolvedKey) : resolvedKey;
              const fetchedEnt = (await client.getEntity(numId)) as Api.TypeUser | Api.TypeChat;
              if (fetchedEnt) {
                extractEntityQuickMeta(fetchedEnt, resolvedKey);
                peerOrEnt = fetchedEnt;
              }
            } catch {
              peerOrEnt = await resolvePeer(client, resolvedKey).catch(() => null);
            }
          }

          if (!peerOrEnt) return null;

          let buf = (await client.downloadProfilePhoto(peerOrEnt as Api.TypeEntityLike, {
            isBig: false,
          })) as Buffer | undefined;
          if (!buf || buf.length === 0) {
            buf = (await client.downloadProfilePhoto(peerOrEnt as Api.TypeEntityLike, {
              isBig: true,
            })) as Buffer | undefined;
          }
          if (!buf || buf.length === 0) {
            if (client && client.connected) {
              avatarNegCache.set(resolvedKey, Date.now());
            }
            return null;
          }
          try {
            fs.writeFileSync(avatarPath, buf);
          } catch {
            // ignore cache write error
          }
          return buf;
        }).finally(() => {
          avatarInFlight.delete(resolvedKey);
        });
        avatarInFlight.set(resolvedKey, pending);
      }

      const buf = await pending;
      if (!buf || buf.length === 0) {
        return res.status(404).end();
      }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.send(buf);
    } catch {
      return res.status(404).end();
    }
  });

  app.get('/api/tg/media/:chatId/:msgId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!currentMe) return res.status(401).end();
    try {
      const chatId = req.params.chatId;
      const msgId = Number(req.params.msgId);
      if (!Number.isSafeInteger(msgId) || msgId <= 0) return res.status(400).end();
      const isThumb = req.query.thumb === '1';
      const key = getVaultKey(chatId, msgId);
      const safeBase = `${chatId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${msgId}`;

      if (isThumb) {
        // Versioned path avoids reusing old stripped/error previews as full thumbnails.
        const thumbPath = path.join(VAULT_DIR, `thumb_v2_${safeBase}.jpg`);
        if (fs.existsSync(thumbPath)) {
          const stat = fs.statSync(thumbPath);
          if (stat.size > 0) {
            const bytes = fs.readFileSync(thumbPath);
            res.setHeader('Content-Type', imageMime(bytes) || 'image/jpeg');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Cache-Control', 'private, max-age=604800');
            return fs.createReadStream(thumbPath).pipe(res);
          }
        }

        const cachedFull = vaultIndex[key] && fs.existsSync(vaultIndex[key].filePath) ? vaultIndex[key] : null;
        if (cachedFull && cachedFull.mediaType === 'photo' && cachedFull.mimeType.startsWith('image/')) {
          const stat = fs.statSync(cachedFull.filePath);
          res.setHeader('Content-Type', cachedFull.mimeType || 'image/jpeg');
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Cache-Control', 'private, max-age=604800');
          return fs.createReadStream(cachedFull.filePath).pipe(res);
        }

        if (!client?.connected) await ensureConnectedClient();
        if (!client?.connected || !currentMe) return res.status(503).end();
        let thumbJob = mediaThumbInFlight.get(key);
        if (!thumbJob) {
          thumbJob = runWithMediaLimit(async () => {
            if (!client || !client.connected) return null;
            let msg = rawMessageCache.get(key);
            if (!msg) {
              const peer = await resolvePeer(client, chatId);
              const msgs = await client.getMessages(peer, { ids: [msgId] });
              msg = msgs[0];
              if (msg) storeRawMessage(chatId, msg);
            }
            if (!msg) return null;

            const tgClient = client;
            const buf = await withFreshMedia(msg, async source => {
              let media: unknown = source.media;
              if (media instanceof Api.MessageMediaWebPage && media.webpage instanceof Api.WebPage) media = media.webpage.document || media.webpage.photo;
              const asset = media instanceof Api.MessageMediaPhoto ? media.photo : media instanceof Api.MessageMediaDocument ? media.document : media;
              const sizes = asset instanceof Api.Photo ? asset.sizes : asset instanceof Api.Document ? asset.thumbs || [] : [];
              const chosen = chooseThumbnail(sizes.filter((s): s is Api.PhotoSize | Api.PhotoSizeProgressive => s instanceof Api.PhotoSize || s instanceof Api.PhotoSizeProgressive));
              if (chosen) return await tgClient.downloadMedia(source, { thumb: chosen }) as Buffer | undefined;
              const info = detectMediaInfo(source);
              // Full video/animated stickers are never downloaded just for a poster.
              if (info?.mimeType.startsWith('image/')) return await tgClient.downloadMedia(source, {}) as Buffer | undefined;
              return undefined;
            }, async () => {
              const peer = await resolvePeer(tgClient, chatId);
              const fresh = (await tgClient.getMessages(peer, { ids: [msgId] }))[0];
              if (fresh) storeRawMessage(chatId, fresh);
              return fresh;
            });

            if (!buf?.length || !imageMime(buf)) return null;
            try {
              fs.writeFileSync(thumbPath, buf);
            } catch {
              // ignore thumb write failure
            }
            return buf;
          }).finally(() => {
            mediaThumbInFlight.delete(key);
          });
          mediaThumbInFlight.set(key, thumbJob);
        }

        const thumbBuf = await thumbJob;
        if (!thumbBuf || thumbBuf.length === 0) {
          return res.status(404).end();
        }
        res.setHeader('Content-Type', imageMime(thumbBuf) || 'image/jpeg');
        res.setHeader('Content-Length', thumbBuf.length);
        res.setHeader('Cache-Control', 'private, max-age=604800');
        return res.send(thumbBuf);
      }

      let entry: VaultEntry | null = vaultIndex[key] && fs.existsSync(vaultIndex[key].filePath) ? vaultIndex[key] : null;

      if (!entry) {
        if (!client?.connected) await ensureConnectedClient();
        if (!client?.connected || !currentMe) return res.status(503).end();
        let msg = rawMessageCache.get(key);
        if (!msg) {
          const peer = await resolvePeer(client, chatId);
          const msgs = await client.getMessages(peer, { ids: [msgId] });
          msg = msgs[0];
          if (msg) storeRawMessage(chatId, msg);
        }
        if (!msg) return res.status(404).send('Media not found');

        const info = detectMediaInfo(msg);
        const rangeHeader = req.headers.range;
        const docMedia =
          msg.media instanceof Api.MessageMediaDocument && msg.media.document instanceof Api.Document
            ? msg.media.document
            : null;
        const docSize = docMedia ? Number(docMedia.size) : 0;

        // Stream document bytes directly; do not download a second full copy during playback.
        if (docMedia && docSize > 512 * 1024 && info && !info.isDisappearing) {
          const downloading = req.query.download === '1';
          const range = rangeHeader
            ? parseByteRange(rangeHeader, docSize, downloading ? Infinity : 2 * 1024 * 1024)
            : { start: 0, end: docSize - 1 };
          if (!range) {
            res.setHeader('Content-Range', 'bytes */' + docSize);
            return res.status(416).end();
          }
          const { start, end } = range;
          const length = end - start + 1;
          const alignedStart = Math.floor(start / 4096) * 4096;
          res.status(rangeHeader ? 206 : 200);
          res.setHeader('Content-Type', info.mimeType || 'application/octet-stream');
          res.setHeader('Accept-Ranges', 'bytes');
          if (rangeHeader) res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + docSize);
          res.setHeader('Content-Length', length);
          res.setHeader('Cache-Control', 'private, max-age=604800');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          if (downloading) res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(info.fileName || 'media'));
          res.flushHeaders();
          let remainingToSkip = start - alignedStart;
          let remainingToSend = length;
          const iter = client.iterDownload({
            file: msg.media as unknown as Api.TypeMessageMedia,
            offset: helpers.readBigIntFromBuffer(helpers.toSignedLittleBuffer(alignedStart, 8), true, false),
            requestSize: 512 * 1024,
            chunkSize: 512 * 1024,
          } as unknown as Parameters<TelegramClient['iterDownload']>[0]);
          for await (const chunk of iter) {
            if (res.writableEnded || res.destroyed) break;
            let buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (remainingToSkip) {
              const skip = Math.min(remainingToSkip, buf.length);
              buf = buf.subarray(skip);
              remainingToSkip -= skip;
            }
            buf = buf.subarray(0, remainingToSend);
            if (buf.length) {
              remainingToSend -= buf.length;
              // Backpressure prevents a slow browser from accumulating the entire file in RAM.
              if (!res.write(buf)) await new Promise<void>(resolve => {
                const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
                res.once('drain', done);
                res.once('close', done);
                if (res.destroyed) done();
              });
            }
            if (remainingToSend <= 0) break;
          }
          if (!res.destroyed) {
            if (remainingToSend > 0) res.destroy(new Error('Media stream ended early'));
            else res.end();
          }
          return;
        }

        entry = await cacheMediaToVault(client, chatId, chatId, msg, Boolean(info?.isDisappearing), info?.expireSeconds);
      }

      if (!entry || !fs.existsSync(entry.filePath)) {
        return res.status(404).send('Media unavailable');
      }

      const stat = fs.statSync(entry.filePath);
      const total = stat.size;
      if (total <= 0) {
        return res.status(404).send('Empty media');
      }

      let resolvedMime = entry.mimeType || 'application/octet-stream';
      if (entry.mediaType === 'voice' || resolvedMime.startsWith('audio/') || resolvedMime === 'application/ogg') {
        try {
          const fd = fs.openSync(entry.filePath, 'r');
          const head = Buffer.alloc(16);
          fs.readSync(fd, head, 0, 16, 0);
          fs.closeSync(fd);
          if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
            resolvedMime = 'audio/webm';
          } else if (head.subarray(0, 4).toString('ascii') === 'OggS') {
            resolvedMime = 'audio/ogg';
          } else if (head.subarray(4, 8).toString('ascii') === 'ftyp') {
            resolvedMime = 'audio/mp4';
          } else if (head.subarray(0, 4).toString('ascii') === 'RIFF') {
            resolvedMime = 'audio/wav';
          } else if (head.subarray(0, 3).toString('ascii') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) {
            resolvedMime = 'audio/mpeg';
          }
        } catch {
          // keep entry mimeType
        }
      }

      res.setHeader('Content-Type', resolvedMime);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', entry.isDisappearing ? 'private, max-age=3600' : 'public, max-age=604800');

      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(entry.fileName || 'media')}"`);
      }

      const range = req.headers.range;
      const pipeFile = (options?: { start: number; end: number }) => {
        const stream = fs.createReadStream(entry!.filePath, options);
        res.once('close', () => stream.destroy());
        stream.once('error', error => res.destroy(error));
        return stream.pipe(res);
      };
      if (range) {
        const parsed = parseByteRange(range, total);
        if (!parsed) {
          res.setHeader('Content-Range', 'bytes */' + total);
          return res.status(416).end();
        }
        res.status(206);
        res.setHeader('Content-Range', 'bytes ' + parsed.start + '-' + parsed.end + '/' + total);
        res.setHeader('Content-Length', parsed.end - parsed.start + 1);
        return pipeFile(parsed);
      }

      res.setHeader('Content-Length', total);
      return pipeFile();
    } catch (err) {
      if (res.headersSent) { res.destroy(err as Error); return; }
      return res.status(500).send((err as Error).message);
    }
  });

  // --- Telegram Global Search, Group & Channel Creation / Editing / Members, Profile & Message Links ---

  registerMessageSearchRoutes(app, { client: () => client, resolvePeer, peerId: getPeerChatIdString, cache: peerEntityCache, serialize: serializeMessage });
  app.get('/api/tg/search', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.json({ results: [] });

      const result = await client.invoke(new Api.contacts.Search({ q, limit: 25 }));
      const out: unknown[] = [];
      const seen = new Set<string>();

      for (const u of result.users || []) {
        if (u instanceof Api.User) {
          const id = u.id.toString();
          if (seen.has(id)) continue;
          seen.add(id);
          peerEntityCache.set(id, u);
          out.push({
            id,
            type: u.bot ? 'bot' : 'user',
            title: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'User',
            username: u.username || '',
            avatarUrl: hasEntityPhoto(u) ? `/api/tg/avatar/${encodeURIComponent(id)}` : '',
            isVerified: Boolean(u.verified),
          });
        }
      }

      for (const c of result.chats || []) {
        if (c instanceof Api.Channel) {
          const id = `-100${c.id.toString().replace(/^-100/, '')}`;
          if (seen.has(id)) continue;
          seen.add(id);
          peerEntityCache.set(id, c);
          out.push({
            id,
            type: c.broadcast ? 'channel' : 'group',
            title: c.title || 'Channel',
            username: c.username || '',
            avatarUrl: hasEntityPhoto(c) ? `/api/tg/avatar/${encodeURIComponent(id)}` : '',
            memberCount: c.participantsCount || undefined,
            isVerified: Boolean(c.verified),
          });
        } else if (c instanceof Api.Chat) {
          const id = `-${c.id.toString().replace(/^-/, '')}`;
          if (seen.has(id)) continue;
          seen.add(id);
          peerEntityCache.set(id, c);
          out.push({
            id,
            type: 'group',
            title: c.title || 'Group',
            avatarUrl: hasEntityPhoto(c) ? `/api/tg/avatar/${encodeURIComponent(id)}` : '',
            memberCount: c.participantsCount || undefined,
          });
        }
      }

      return res.json({ results: out });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/chats/:chatId/check-username', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = req.params.chatId;
      const username = String(req.query.username || '').replace(/^@/, '').trim();
      if (!username || username.length < 4) {
        return res.json({ available: false, reason: 'Username must be at least 4 characters.' });
      }
      if (chatId === 'new' || chatId === 'account') {
        const ok = await client.invoke(new Api.account.CheckUsername({ username }));
        return res.json({ available: Boolean(ok) });
      }
      const peer = await resolvePeer(client, chatId);
      const ok = await client.invoke(new Api.channels.CheckUsername({ channel: peer, username }));
      return res.json({ available: Boolean(ok) });
    } catch (err) {
      return res.json({ available: false, reason: (err as Error).message || 'Username unavailable' });
    }
  });

  app.post('/api/tg/groups/create', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const title = String(req.body.title || '').trim();
      const about = String(req.body.about || '').trim();
      const supergroup = req.body.supergroup !== false;
      const rawMembers = Array.isArray(req.body.members) ? req.body.members.map(String) : [];

      if (!title) {
        return res.status(400).json({ error: 'Group title is required.' });
      }

      const resolvedUsers: Api.TypeInputUser[] = [];
      for (const mId of rawMembers.slice(0, 30)) {
        try {
          const inp = await client.getInputEntity(/^-?\d+$/.test(mId) ? Number(mId) : mId);
          resolvedUsers.push(inp as unknown as Api.TypeInputUser);
        } catch {
          // skip unresolvable member
        }
      }

      let createdEntity: Api.Channel | Api.Chat | null = null;
      if (supergroup) {
        const resUpdates = await client.invoke(
          new Api.channels.CreateChannel({
            title,
            about,
            megagroup: true,
          })
        );
        const chats = (resUpdates as { chats?: (Api.TypeChat)[] }).chats || [];
        if (chats[0] instanceof Api.Channel) {
          createdEntity = chats[0];
          if (resolvedUsers.length > 0) {
            try {
              await client.invoke(
                new Api.channels.InviteToChannel({
                  channel: createdEntity,
                  users: resolvedUsers,
                })
              );
            } catch {
              // ignore individual invite restrictions
            }
          }
        }
      } else {
        const resUpdates = await client.invoke(
          new Api.messages.CreateChat({
            title,
            users: resolvedUsers.length > 0 ? resolvedUsers : [new Api.InputUserSelf()],
          })
        );
        const chats = (resUpdates as { chats?: (Api.TypeChat)[] }).chats || [];
        if (chats[0] instanceof Api.Chat || chats[0] instanceof Api.Channel) {
          createdEntity = chats[0];
        }
      }

      if (!createdEntity) {
        throw new Error('Telegram did not return the created group.');
      }

      const quick = extractEntityQuickMeta(createdEntity, '');
      const chatObj: DialogSnapshot = {
        id: quick.id,
        type: 'group',
        title,
        username: createdEntity instanceof Api.Channel ? createdEntity.username || '' : '',
        avatarUrl: quick.avatar || '',
        unreadCount: 0,
        isCreator: true,
        isAdmin: true,
        canPostMessages: true,
        memberCount: 1 + resolvedUsers.length,
      };
      dialogsSnapshot[chatObj.id] = chatObj;
      persistDialogsSnapshot();
      return res.json({ chat: chatObj });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Could not create group.' });
    }
  });

  app.post('/api/tg/channels/create', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const title = String(req.body.title || '').trim();
      const about = String(req.body.about || '').trim();
      const username = String(req.body.username || '').replace(/^@/, '').trim();

      if (!title) {
        return res.status(400).json({ error: 'Channel name is required.' });
      }

      const resUpdates = await client.invoke(
        new Api.channels.CreateChannel({
          title,
          about,
          broadcast: true,
        })
      );
      const chats = (resUpdates as { chats?: (Api.TypeChat)[] }).chats || [];
      const createdChannel = chats[0] instanceof Api.Channel ? chats[0] : null;
      if (!createdChannel) {
        throw new Error('Telegram did not return the created channel.');
      }

      let finalUsername = '';
      if (username) {
        try {
          await client.invoke(
            new Api.channels.UpdateUsername({
              channel: createdChannel,
              username,
            })
          );
          finalUsername = username;
        } catch (uErr) {
          console.warn('Channel username assignment warning:', (uErr as Error).message);
        }
      }

      const quick = extractEntityQuickMeta(createdChannel, '');
      const chatObj: DialogSnapshot = {
        id: quick.id,
        type: 'channel',
        title,
        username: finalUsername || createdChannel.username || '',
        avatarUrl: quick.avatar || '',
        unreadCount: 0,
        isCreator: true,
        isAdmin: true,
        canPostMessages: true,
        memberCount: 1,
      };
      dialogsSnapshot[chatObj.id] = chatObj;
      persistDialogsSnapshot();
      return res.json({ chat: chatObj });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Could not create channel.' });
    }
  });

  app.get('/api/tg/chats/:chatId/details', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = req.params.chatId;
      const peer = await resolvePeer(client, chatId);
      const ent = (await client.getEntity(peer)) as Api.TypeChat | Api.TypeUser;

      let about = '';
      let inviteLink = '';
      let memberCount = 0;
      let isProtected = false;
      let isCreator = false;
      let isAdmin = false;
      let canEditSettings = false;
      let canPostMessages = true;
      let canSendMedia = true;
      let sendRestrictionReason = '';
      let isForum = false;
      let historyHidden = false;
      let signatures = false;
      let linkedChatId = '';
      let ttlPeriod = 0;
      let reactionsMode: 'all' | 'some' | 'none' = 'all';
      let availableReactions: string[] = [];
      let adminsCount = 0;
      let kickedCount = 0;
      let slowModeSeconds = 0;
      let defaultBannedRights = serializeBannedRights(null);
      let isBlocked = false;
      let botCommands: { command: string; description: string }[] = [];
      let username = '';
      let title = '';

      if (ent instanceof Api.Channel) {
        peerEntityCache.set(chatId, ent);
        title = ent.title || '';
        username = ent.username || '';
        isProtected = Boolean(ent.noforwards);
        isCreator = Boolean(ent.creator);
        isAdmin = Boolean(ent.creator || ent.adminRights);
        isForum = Boolean(ent.forum);
        signatures = Boolean(ent.signatures);
        defaultBannedRights = serializeBannedRights(ent.defaultBannedRights);
        // Strictly restrict Edit / Manage button to Creators & Admins (never regular subscribers in someone else's channel/group)
        canEditSettings = Boolean(
          isCreator ||
            ent.adminRights?.changeInfo ||
            ent.adminRights?.banUsers ||
            ent.adminRights?.addAdmins ||
            ent.adminRights?.postMessages
        );
        if (ent.broadcast) {
          canPostMessages = Boolean(ent.creator || ent.adminRights?.postMessages);
          canSendMedia = canPostMessages;
          if (!canPostMessages) {
            sendRestrictionReason = 'Only channel administrators can post messages in this channel.';
          }
        } else {
          const activeBan = ent.bannedRights && !isBanExpired(ent.bannedRights) ? ent.bannedRights : null;
          if (ent.left) {
            canPostMessages = false;
            canSendMedia = false;
            sendRestrictionReason = 'You must join this group before sending messages.';
          } else if (!isCreator && !isAdmin && activeBan?.sendMessages) {
            canPostMessages = false;
            canSendMedia = false;
            sendRestrictionReason = 'You are restricted from sending messages in this group.';
          } else if (!isCreator && !isAdmin && ent.defaultBannedRights?.sendMessages) {
            canPostMessages = false;
            canSendMedia = false;
            sendRestrictionReason = 'Sending messages is disabled by group administrators.';
          } else if (!isCreator && !isAdmin && (activeBan?.sendMedia || ent.defaultBannedRights?.sendMedia)) {
            canSendMedia = false;
            sendRestrictionReason = 'Sending photos, videos, and files is restricted in this group.';
          }
        }
        try {
          const full = await client.invoke(new Api.channels.GetFullChannel({ channel: peer }));
          if (full.fullChat instanceof Api.ChannelFull) {
            about = full.fullChat.about || '';
            memberCount = full.fullChat.participantsCount || ent.participantsCount || 0;
            slowModeSeconds = full.fullChat.slowmodeSeconds || 0;
            historyHidden = Boolean(full.fullChat.hiddenPrehistory);
            ttlPeriod = full.fullChat.ttlPeriod || 0;
            adminsCount = full.fullChat.adminsCount || 0;
            kickedCount = full.fullChat.kickedCount || 0;
            if (full.fullChat.linkedChatId) {
              linkedChatId = `-100${full.fullChat.linkedChatId.toString().replace(/^-100/, '')}`;
            }
            if (full.fullChat.exportedInvite instanceof Api.ChatInviteExported) {
              inviteLink = full.fullChat.exportedInvite.link || '';
            }
            const avail = full.fullChat.availableReactions;
            if (avail instanceof Api.ChatReactionsNone) {
              reactionsMode = 'none';
            } else if (avail instanceof Api.ChatReactionsSome) {
              reactionsMode = 'some';
              availableReactions = (avail.reactions || [])
                .map((r) => (r instanceof Api.ReactionEmoji ? r.emoticon : ''))
                .filter(Boolean);
            } else {
              reactionsMode = 'all';
            }
          }
        } catch {
          memberCount = ent.participantsCount || 0;
        }
      } else if (ent instanceof Api.Chat) {
        peerEntityCache.set(chatId, ent);
        title = ent.title || '';
        isProtected = Boolean(ent.noforwards);
        isCreator = Boolean(ent.creator);
        isAdmin = Boolean(ent.creator || ent.adminRights);
        defaultBannedRights = serializeBannedRights(ent.defaultBannedRights);
        canEditSettings = Boolean(isCreator || isAdmin);
        if (ent.left || ent.deactivated) {
          canPostMessages = false;
          canSendMedia = false;
          sendRestrictionReason = ent.deactivated
            ? 'This group has been deactivated.'
            : 'You have left this group.';
        } else if (!isCreator && !isAdmin && ent.defaultBannedRights?.sendMessages) {
          canPostMessages = false;
          canSendMedia = false;
          sendRestrictionReason = 'Sending messages is disabled by group administrators.';
        }
        try {
          const full = await client.invoke(new Api.messages.GetFullChat({ chatId: ent.id }));
          if (full.fullChat instanceof Api.ChatFull) {
            about = full.fullChat.about || '';
            ttlPeriod = full.fullChat.ttlPeriod || 0;
            if (full.fullChat.exportedInvite instanceof Api.ChatInviteExported) {
              inviteLink = full.fullChat.exportedInvite.link || '';
            }
            const avail = full.fullChat.availableReactions;
            if (avail instanceof Api.ChatReactionsNone) {
              reactionsMode = 'none';
            } else if (avail instanceof Api.ChatReactionsSome) {
              reactionsMode = 'some';
              availableReactions = (avail.reactions || [])
                .map((r) => (r instanceof Api.ReactionEmoji ? r.emoticon : ''))
                .filter(Boolean);
            } else {
              reactionsMode = 'all';
            }
          }
        } catch {
          // ignore
        }
        memberCount = ent.participantsCount || 0;
      } else if (ent instanceof Api.User) {
        title = `${ent.firstName || ''} ${ent.lastName || ''}`.trim();
        username = ent.username || '';
        try {
          const fullUser = await client.invoke(new Api.users.GetFullUser({ id: peer as unknown as Api.TypeInputUser }));
          if (fullUser.fullUser) {
            about = fullUser.fullUser.about || '';
            isBlocked = Boolean(fullUser.fullUser.blocked);
            if (fullUser.fullUser.botInfo?.commands) {
              botCommands = fullUser.fullUser.botInfo.commands.map((c) => ({
                command: c.command,
                description: c.description,
              }));
            }
          }
        } catch {
          // ignore
        }
      }

      const members: {
        id: string;
        name: string;
        username?: string;
        avatarUrl?: string;
        role: 'creator' | 'admin' | 'member';
        rank?: string;
      }[] = [];
      if (ent instanceof Api.Channel || ent instanceof Api.Chat) {
        try {
          const participants = await client.getParticipants(peer, { limit: 80 });
          for (const p of participants) {
            if (p instanceof Api.User) {
              const pid = p.id.toString();
              peerEntityCache.set(pid, p);
              const part = (p as unknown as { participant?: unknown }).participant;
              const role =
                part instanceof Api.ChannelParticipantCreator || part instanceof Api.ChatParticipantCreator
                  ? 'creator'
                  : part instanceof Api.ChannelParticipantAdmin || part instanceof Api.ChatParticipantAdmin
                  ? 'admin'
                  : 'member';
              const rank =
                (part instanceof Api.ChannelParticipantCreator || part instanceof Api.ChannelParticipantAdmin) &&
                part.rank
                  ? part.rank
                  : undefined;
              members.push({
                id: pid,
                name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.username || 'Member',
                username: p.username || '',
                avatarUrl: hasEntityPhoto(p) ? `/api/tg/avatar/${encodeURIComponent(pid)}` : '',
                role,
                rank,
              });
            }
          }
        } catch {
          // e.g. channel broadcast hides non-admin member list for regular subscribers
        }
      }

      return res.json({
        id: chatId,
        title,
        username,
        about,
        inviteLink,
        memberCount,
        isProtected,
        isCreator,
        isAdmin,
        canEditSettings,
        canPostMessages,
        canSendMedia,
        sendRestrictionReason: sendRestrictionReason || undefined,
        isForum,
        historyHidden,
        signatures,
        linkedChatId,
        ttlPeriod,
        reactionsMode,
        availableReactions,
        adminsCount,
        kickedCount,
        slowModeSeconds,
        defaultBannedRights,
        isBlocked,
        botCommands,
        members,
      });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/users/:userId/profile', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const rawId = req.params.userId.trim();
    const contextChatId = req.query.chatId ? String(req.query.chatId).trim() : '';
    const fallbackName = req.query.fallbackName ? String(req.query.fallbackName).trim() : '';

    const buildFallbackProfile = () => {
      let foundName = fallbackName;
      let foundAvatar = '';
      if (!foundName && dialogsSnapshot[rawId]) {
        foundName = dialogsSnapshot[rawId].title;
        foundAvatar = dialogsSnapshot[rawId].avatarUrl || '';
      }
      if (!foundName) {
        for (const chatMap of messageCacheByChat.values()) {
          for (const m of chatMap.values()) {
            if (m.senderId === rawId && m.senderName && m.senderName !== 'Telegram') {
              foundName = m.senderName;
              const withAva = m as CachedMessageMeta & { senderAvatar?: string };
              if (withAva.senderAvatar) foundAvatar = withAva.senderAvatar;
              break;
            }
          }
          if (foundName) break;
        }
      }
      const finalTitle = foundName || `User ${rawId}`;
      const parts = finalTitle.split(' ');
      return {
        id: rawId,
        firstName: parts[0] || finalTitle,
        lastName: parts.slice(1).join(' '),
        title: finalTitle,
        username: dialogsSnapshot[rawId]?.username || '',
        phone: '',
        about: '',
        avatarUrl: foundAvatar,
        status: 'last seen recently',
        isBot: false,
        isVerified: Boolean(dialogsSnapshot[rawId]?.isVerified),
        isPremium: false,
        isBlocked: false,
        commonChatsCount: 0,
      };
    };

    try {
      const target = rawId === 'me' || rawId === currentMe?.id?.toString() ? 'me' : rawId;
      let ent: Api.TypeUser | Api.TypeChat | undefined =
        target === 'me' && currentMe ? currentMe : peerEntityCache.get(rawId);

      // 1. Check rawMessageCache for a message sent by rawId
      if (!ent) {
        for (const rawMsg of rawMessageCache.values()) {
          const fromUser =
            rawMsg.fromId instanceof Api.PeerUser
              ? rawMsg.fromId.userId.toString()
              : rawMsg.fromId instanceof Api.PeerChannel
              ? `-100${rawMsg.fromId.channelId.toString().replace(/^-100/, '')}`
              : '';
          if (fromUser === rawId) {
            const emb = (rawMsg as unknown as { _sender?: unknown })._sender;
            if (emb && (emb instanceof Api.User || emb instanceof Api.Channel || emb instanceof Api.Chat)) {
              ent = emb;
              extractEntityQuickMeta(emb, rawId);
              break;
            }
            try {
              const sender = await rawMsg.getSender();
              if (sender && (sender instanceof Api.User || sender instanceof Api.Channel || sender instanceof Api.Chat)) {
                ent = sender;
                extractEntityQuickMeta(sender, rawId);
                break;
              }
            } catch {
              // continue
            }
          }
        }
      }

      // 2. If contextChatId is provided, look up participant from that group/channel
      if (!ent && contextChatId && contextChatId !== rawId) {
        try {
          const groupPeer = await resolvePeer(client, contextChatId);
          const participants = await client.getParticipants(groupPeer, { limit: 100 });
          for (const p of participants) {
            if (p instanceof Api.User) {
              const pid = p.id.toString();
              peerEntityCache.set(pid, p);
              if (pid === rawId) {
                ent = p;
              }
            }
          }
        } catch {
          // ignore if participant list is restricted
        }
      }

      // 3. Try standard peer / entity resolution
      if (!ent) {
        try {
          const peer = await resolvePeer(client, target).catch(async () => {
            const clean = rawId.startsWith('@') ? rawId : /^-?\d+$/.test(rawId) ? Number(rawId) : rawId;
            return await client!.getInputEntity(clean);
          });
          ent = (await client.getEntity(peer)) as Api.TypeUser | Api.TypeChat;
        } catch {
          // fallback below
        }
      }

      if (ent instanceof Api.User) {
        const idStr = ent.id.toString();
        peerEntityCache.set(idStr, ent);
        let about = '';
        let isBlocked = false;
        let commonChatsCount = 0;
        try {
          const inputUser = await client.getInputEntity(ent);
          const full = await client.invoke(
            new Api.users.GetFullUser({ id: inputUser as unknown as Api.TypeInputUser })
          );
          if (full.fullUser) {
            about = full.fullUser.about || '';
            isBlocked = Boolean(full.fullUser.blocked);
            commonChatsCount = full.fullUser.commonChatsCount || 0;
          }
        } catch {
          // ignore full user lookup errors
        }

        const photoPresent = hasEntityPhoto(ent);
        const firstName = ent.firstName || ent.username || fallbackName || 'Telegram User';
        const lastName = ent.lastName || '';
        const title = `${firstName} ${lastName}`.trim();
        const status =
          ent.status instanceof Api.UserStatusOnline
            ? 'online'
            : ent.bot
            ? 'bot'
            : 'last seen recently';

        return res.json({
          profile: {
            id: idStr,
            firstName,
            lastName,
            title,
            username: ent.username || '',
            phone: ent.phone ? `+${ent.phone.replace(/^\+/, '')}` : '',
            about,
            avatarUrl: photoPresent ? `/api/tg/avatar/${encodeURIComponent(idStr)}` : '',
            status,
            isBot: Boolean(ent.bot),
            isVerified: Boolean(ent.verified),
            isPremium: Boolean(ent.premium),
            isBlocked,
            commonChatsCount,
          },
        });
      }

      if (ent instanceof Api.Channel || ent instanceof Api.Chat) {
        const quick = extractEntityQuickMeta(ent, rawId);
        return res.json({
          profile: {
            id: quick.id,
            firstName: quick.title,
            lastName: '',
            title: quick.title,
            username: ent instanceof Api.Channel ? ent.username || '' : '',
            phone: '',
            about: '',
            avatarUrl: quick.avatar || '',
            status: ent instanceof Api.Channel && ent.broadcast ? 'channel' : 'group',
            isBot: false,
            isVerified: ent instanceof Api.Channel ? Boolean(ent.verified) : false,
            isPremium: false,
            isBlocked: false,
            commonChatsCount: 0,
          },
        });
      }

      return res.json({ profile: buildFallbackProfile() });
    } catch {
      return res.json({ profile: buildFallbackProfile() });
    }
  });

  app.post('/api/tg/chats/:chatId/edit', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = req.params.chatId;
      const peer = await resolvePeer(client, chatId);
      const ent = (await client.getEntity(peer)) as Api.TypeChat;

      const {
        title,
        about,
        username,
        noforwards,
        avatarDataUrl,
        removeAvatar,
        historyHidden,
        isForum,
        signatures,
        ttlPeriod,
        linkedChatId,
        reactionsMode,
        availableReactions,
      } = req.body as {
        title?: string;
        about?: string;
        username?: string;
        noforwards?: boolean;
        avatarDataUrl?: string;
        removeAvatar?: boolean;
        historyHidden?: boolean;
        isForum?: boolean;
        signatures?: boolean;
        ttlPeriod?: number;
        linkedChatId?: string;
        reactionsMode?: 'all' | 'some' | 'none';
        availableReactions?: string[];
      };

      if (typeof title === 'string' && title.trim() && title.trim() !== (ent as { title?: string }).title) {
        if (ent instanceof Api.Channel) {
          await client.invoke(new Api.channels.EditTitle({ channel: peer, title: title.trim() }));
        } else if (ent instanceof Api.Chat) {
          await client.invoke(new Api.messages.EditChatTitle({ chatId: ent.id, title: title.trim() }));
        }
      }

      if (typeof about === 'string') {
        try {
          await client.invoke(new Api.messages.EditChatAbout({ peer, about }));
        } catch {
          // ignore if unchanged or unsupported on basic chat
        }
      }

      if (typeof username === 'string' && ent instanceof Api.Channel) {
        const cleanUser = username.replace(/^@/, '').trim();
        if (cleanUser !== (ent.username || '')) {
          await client.invoke(new Api.channels.UpdateUsername({ channel: peer, username: cleanUser }));
        }
      }

      if (typeof noforwards === 'boolean' && noforwards !== Boolean((ent as { noforwards?: boolean }).noforwards)) {
        try {
          await client.invoke(new Api.messages.ToggleNoForwards({ peer, enabled: noforwards }));
        } catch {
          // ignore
        }
      }

      if (typeof historyHidden === 'boolean' && ent instanceof Api.Channel) {
        try {
          await client.invoke(
            new Api.channels.TogglePreHistoryHidden({ channel: peer, enabled: historyHidden })
          );
        } catch {
          // ignore if already in that state
        }
      }

      if (typeof isForum === 'boolean' && ent instanceof Api.Channel && isForum !== Boolean(ent.forum)) {
        try {
          await client.invoke(new Api.channels.ToggleForum({ channel: peer, enabled: isForum }));
        } catch {
          // ignore
        }
      }

      if (typeof signatures === 'boolean' && ent instanceof Api.Channel && signatures !== Boolean(ent.signatures)) {
        try {
          await client.invoke(
            new Api.channels.ToggleSignatures({ channel: peer, signaturesEnabled: signatures })
          );
        } catch {
          // ignore
        }
      }

      if (typeof ttlPeriod === 'number') {
        try {
          await client.invoke(new Api.messages.SetHistoryTTL({ peer, period: ttlPeriod }));
        } catch {
          // ignore
        }
      }

      if (typeof linkedChatId === 'string' && ent instanceof Api.Channel && ent.broadcast) {
        try {
          const groupPeer = linkedChatId.trim()
            ? await resolvePeer(client, linkedChatId.trim())
            : new Api.InputChannelEmpty();
          await client.invoke(
            new Api.channels.SetDiscussionGroup({
              broadcast: peer,
              group: groupPeer,
            })
          );
        } catch {
          // ignore
        }
      }

      if (reactionsMode) {
        try {
          const reactionsPayload =
            reactionsMode === 'none'
              ? new Api.ChatReactionsNone()
              : reactionsMode === 'some'
              ? new Api.ChatReactionsSome({
                  reactions: (availableReactions && availableReactions.length > 0
                    ? availableReactions
                    : ['👍', '👎', '❤️', '🔥', '🎉', '👏']
                  ).map((emoticon) => new Api.ReactionEmoji({ emoticon })),
                })
              : new Api.ChatReactionsAll({ allowCustom: true });
          await client.invoke(
            new Api.messages.SetChatAvailableReactions({
              peer,
              availableReactions: reactionsPayload,
            })
          );
        } catch {
          // ignore
        }
      }

      if (removeAvatar) {
        const emptyPhoto = new Api.InputChatPhotoEmpty();
        if (ent instanceof Api.Channel) {
          await client.invoke(new Api.channels.EditPhoto({ channel: peer, photo: emptyPhoto }));
        } else if (ent instanceof Api.Chat) {
          await client.invoke(new Api.messages.EditChatPhoto({ chatId: ent.id, photo: emptyPhoto }));
        }
        const avatarPath = path.join(VAULT_DIR, `avatar_${chatId.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`);
        try {
          if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
        } catch {
          // ignore
        }
      } else if (avatarDataUrl && typeof avatarDataUrl === 'string' && avatarDataUrl.includes('base64,')) {
        const base64Part = avatarDataUrl.split(',')[1];
        const buffer = Buffer.from(base64Part, 'base64');
        const uploaded = await client.uploadFile({
          file: new CustomFile('avatar.jpg', buffer.length, '', buffer),
          workers: 1,
        });
        const uploadedPhoto = new Api.InputChatUploadedPhoto({ file: uploaded });
        if (ent instanceof Api.Channel) {
          await client.invoke(new Api.channels.EditPhoto({ channel: peer, photo: uploadedPhoto }));
        } else if (ent instanceof Api.Chat) {
          await client.invoke(new Api.messages.EditChatPhoto({ chatId: ent.id, photo: uploadedPhoto }));
        }
        const avatarPath = path.join(VAULT_DIR, `avatar_${chatId.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`);
        try {
          if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
        } catch {
          // ignore
        }
      }

      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Could not update chat settings.' });
    }
  });

  app.post('/api/tg/chats/:chatId/invite-link', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = req.params.chatId;
      const peer = await resolvePeer(client, chatId);
      const exported = await client.invoke(
        new Api.messages.ExportChatInvite({
          peer,
          legacyRevokePermanent: Boolean(req.body.revoke),
        })
      );
      const inviteLink =
        exported instanceof Api.ChatInviteExported ? exported.link : '';
      return res.json({ inviteLink });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/:chatId/members/add', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = req.params.chatId;
      const memberQuery = String(req.body.member || '').trim();
      if (!memberQuery) return res.status(400).json({ error: 'Enter username or user ID.' });

      const peer = await resolvePeer(client, chatId);
      const ent = (await client.getEntity(peer)) as Api.TypeChat;
      const clean = /^\d+$/.test(memberQuery) ? Number(memberQuery) : memberQuery;
      const targetUser = (await client.getInputEntity(clean)) as unknown as Api.TypeInputUser;

      if (ent instanceof Api.Channel) {
        await client.invoke(new Api.channels.InviteToChannel({ channel: peer, users: [targetUser] }));
      } else if (ent instanceof Api.Chat) {
        await client.invoke(new Api.messages.AddChatUser({ chatId: ent.id, userId: targetUser, fwdLimit: 50 }));
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/:chatId/members/role', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = req.params.chatId;
      const userId = String(req.body.userId || '').trim();
      const action = String(req.body.action || ''); // 'promote' | 'demote' | 'kick' | 'unban'
      const rank = req.body.rank !== undefined ? String(req.body.rank).trim() : 'Admin';
      const peer = await resolvePeer(client, chatId);
      const ent = (await client.getEntity(peer)) as Api.TypeChat;
      const targetUser = (await client.getInputEntity(/^\d+$/.test(userId) ? Number(userId) : userId)) as unknown as Api.TypeInputUser;

      if (ent instanceof Api.Channel) {
        if (action === 'kick') {
          await client.invoke(
            new Api.channels.EditBanned({
              channel: peer,
              participant: targetUser as unknown as Api.TypeInputPeer,
              bannedRights: new Api.ChatBannedRights({
                untilDate: 0,
                viewMessages: true,
              }),
            })
          );
        } else if (action === 'unban') {
          await client.invoke(
            new Api.channels.EditBanned({
              channel: peer,
              participant: targetUser as unknown as Api.TypeInputPeer,
              bannedRights: new Api.ChatBannedRights({
                untilDate: 0,
                viewMessages: false,
              }),
            })
          );
        } else {
          const isPromote = action === 'promote';
          await client.invoke(
            new Api.channels.EditAdmin({
              channel: peer,
              userId: targetUser,
              adminRights: new Api.ChatAdminRights({
                changeInfo: isPromote,
                postMessages: isPromote,
                editMessages: isPromote,
                deleteMessages: isPromote,
                banUsers: isPromote,
                inviteUsers: isPromote,
                pinMessages: isPromote,
                manageTopics: isPromote,
              }),
              rank: isPromote ? rank || 'Admin' : '',
            })
          );
        }
      } else if (ent instanceof Api.Chat) {
        if (action === 'kick') {
          await client.invoke(new Api.messages.DeleteChatUser({ chatId: ent.id, userId: targetUser }));
        } else {
          await client.invoke(
            new Api.messages.EditChatAdmin({
              chatId: ent.id,
              userId: targetUser,
              isAdmin: action === 'promote',
            })
          );
        }
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/chats/:chatId/banned', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const resKicked = await client.invoke(
        new Api.channels.GetParticipants({
          channel: peer,
          filter: new Api.ChannelParticipantsKicked({ q: '' }),
          offset: 0,
          limit: 50,
          hash: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
        })
      );
      const userMap = new Map<string, Api.User>();
      if ('users' in resKicked) {
        for (const u of resKicked.users || []) {
          if (u instanceof Api.User) {
            userMap.set(u.id.toString(), u);
            peerEntityCache.set(u.id.toString(), u);
          }
        }
      }
      const banned: { id: string; name: string; username?: string; avatarUrl?: string }[] = [];
      if ('participants' in resKicked) {
        for (const p of resKicked.participants || []) {
          if (p instanceof Api.ChannelParticipantBanned && p.peer instanceof Api.PeerUser) {
            const uid = p.peer.userId.toString();
            const u = userMap.get(uid);
            banned.push({
              id: uid,
              name: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'User' : uid,
              username: u?.username || '',
              avatarUrl: u && hasEntityPhoto(u) ? `/api/tg/avatar/${encodeURIComponent(uid)}` : '',
            });
          }
        }
      }
      return res.json({ banned });
    } catch {
      return res.json({ banned: [] });
    }
  });

  app.get('/api/tg/chats/:chatId/admin-log', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const log = await client.invoke(
        new Api.channels.GetAdminLog({
          channel: peer,
          q: '',
          maxId: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
          minId: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
          limit: 40,
        })
      );
      const userMap = new Map<string, Api.User>();
      for (const u of log.users || []) {
        if (u instanceof Api.User) {
          userMap.set(u.id.toString(), u);
        }
      }
      const events = (log.events || []).map((ev) => {
        const uid = ev.userId.toString();
        const u = userMap.get(uid);
        const userName = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'Admin' : uid;
        const act = ev.action?.className?.replace('ChannelAdminLogEventAction', '') || 'AdminAction';
        return {
          id: ev.id.toString(),
          date: ev.date * 1000,
          userId: uid,
          userName,
          action: act,
        };
      });
      return res.json({ events });
    } catch {
      return res.json({ events: [] });
    }
  });

  // Auto-Forward Live Media to Target Group Routes
  app.get('/api/tg/auto-forward', (_req, res) => {
    return res.json({ rules: autoForwardRules });
  });

  app.post('/api/tg/auto-forward/toggle', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = String(req.body.chatId || '');
      const chatTitle = String(req.body.chatTitle || 'Group');
      const enabled = Boolean(req.body.enabled);
      const includePhotos = req.body.includePhotos !== false;
      const includeVideos = req.body.includeVideos !== false;

      if (!chatId) return res.status(400).json({ error: 'chatId is required' });
      if (enabled && !savedTargetGroup) {
        return res.status(400).json({ error: 'Set a Target Group link first before enabling Auto-Forward.' });
      }

      const existing = autoForwardRules[chatId];
      let lastMsgId = existing?.lastMsgId || 0;
      if (enabled) {
        try {
          const peer = await resolvePeer(client, chatId);
          const latest = await client.getMessages(peer, { limit: 1 });
          if (latest[0] instanceof Api.Message) {
            lastMsgId = Math.max(lastMsgId, latest[0].id);
          }
        } catch {
          // fallback
        }
      }

      const updated: AutoForwardRuleServer = {
        chatId,
        chatTitle,
        enabled,
        includePhotos,
        includeVideos,
        includeFiles: false,
        lastMsgId,
        forwardedCount: existing?.forwardedCount || 0,
        lastForwardedAt: existing?.lastForwardedAt,
      };
      autoForwardRules[chatId] = updated;
      persistAutoForwardRules();
      return res.json({ ok: true, rule: updated });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/:chatId/leave', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = req.params.chatId;
      const deleteChannel = Boolean(req.body.deleteChannel);
      const clearHistory = Boolean(req.body.clearHistory);
      const peer = await resolvePeer(client, chatId);

      if (clearHistory) {
        await client.invoke(new Api.messages.DeleteHistory({ peer, maxId: 0, revoke: Boolean(req.body.revoke) }));
      } else {
        const ent = (await client.getEntity(peer)) as Api.TypeChat | Api.TypeUser;
        if (ent instanceof Api.Channel) {
          if (deleteChannel) {
            await client.invoke(new Api.channels.DeleteChannel({ channel: peer }));
          } else {
            await client.invoke(new Api.channels.LeaveChannel({ channel: peer }));
          }
        } else if (ent instanceof Api.Chat && currentMe) {
          await client.invoke(
            new Api.messages.DeleteChatUser({ chatId: ent.id, userId: new Api.InputUserSelf() })
          );
        } else {
          await client.invoke(new Api.messages.DeleteHistory({ peer, maxId: 0, revoke: Boolean(req.body.revoke) }));
        }
      }

      if (ayuConfig.antiDeleteEnabled && dialogsSnapshot[chatId]) {
        dialogsSnapshot[chatId].isDeletedChat = true;
        dialogsSnapshot[chatId].deletedAt = Date.now();
        persistDialogsSnapshot();
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/messages/:chatId/:msgId/link', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = req.params.chatId;
      const msgId = Number(req.params.msgId);
      const peer = await resolvePeer(client, chatId);
      const ent = (await client.getEntity(peer)) as Api.TypeChat | Api.TypeUser;
      if (ent instanceof Api.Channel) {
        try {
          const exported = await client.invoke(
            new Api.channels.ExportMessageLink({
              channel: peer,
              id: msgId,
              grouped: true,
            })
          );
          if (exported?.link) return res.json({ link: exported.link });
        } catch {
          // fallback below
        }
        if (ent.username) {
          return res.json({ link: `https://t.me/${ent.username}/${msgId}` });
        }
        const rawChanId = ent.id.toString().replace(/^-100/, '');
        return res.json({ link: `https://t.me/c/${rawChanId}/${msgId}` });
      }
      return res.status(400).json({ error: 'Message links are available for groups and channels.' });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/profile/edit', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const { firstName, lastName, bio, username } = req.body as {
        firstName?: string;
        lastName?: string;
        bio?: string;
        username?: string;
      };
      if (typeof firstName === 'string' || typeof lastName === 'string' || typeof bio === 'string') {
        await client.invoke(
          new Api.account.UpdateProfile({
            firstName: firstName?.trim() || undefined,
            lastName: lastName !== undefined ? lastName.trim() : undefined,
            about: bio !== undefined ? bio.trim() : undefined,
          })
        );
      }
      if (typeof username === 'string') {
        await client.invoke(
          new Api.account.UpdateUsername({
            username: username.replace(/^@/, '').trim(),
          })
        );
      }
      currentMe = (await client.getMe()) as Api.User;
      return res.json({ user: serializeUser(currentMe) });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Could not update profile.' });
    }
  });

  // --- Official Telegram Feature Parity Endpoints ---

  // Keep delivery progress and Telegram random IDs for safe partial/network retries.
  const forwardJobs = new Map<string, { signature: string; job: ForwardJob; at: number }>();
  app.post('/api/tg/messages/forward-batch', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const request = normalizeForwardRequest(req.body);
      request.toChatIds = [...new Set(request.toChatIds.map(id => {
        if (id !== 'target') return id;
        if (!savedTargetGroup) throw new Error('No Target Group set. Set a Target Group link first.');
        return savedTargetGroup.id;
      }))];
      const requestId = String(req.body.requestId || helpers.generateRandomLong(true));
      if (requestId.length > 100) throw new Error('Invalid forwarding request.');
      const signature = JSON.stringify(request);
      let entry = forwardJobs.get(requestId);
      if (entry && entry.signature !== signature) throw new Error('Forward options changed. Start a new forward.');
      if (!entry) {
        for (const [id, old] of forwardJobs) if (!old.job.running && (Date.now() - old.at > 3600000 || forwardJobs.size >= 100)) forwardJobs.delete(id);
        if (forwardJobs.size >= 100) throw new Error('Too many forwards in progress. Try again shortly.');
        entry = { signature, job: createForwardJob(request), at: Date.now() }; forwardJobs.set(requestId, entry);
      }
      const result = await runForwardJob(entry.job, client, id => resolvePeer(client!, id),
        ayuConfig.bypassContentRestrictions ? async (toPeer, id, options, randomId) => {
          const fromPeer = await resolvePeer(client!, options.fromChatId);
          const messages = await client!.getMessages(fromPeer, { ids: [id] });
          const message = messages[0];
          if (!(message instanceof Api.Message)) throw new Error('Original message is no longer available.');
          const info = detectMediaInfo(message);
          if (info) {
            const cached = await cacheMediaToVault(client!, options.fromChatId, options.fromChatId, message, Boolean(info.isDisappearing));
            if (!cached || !fs.existsSync(cached.filePath)) throw new Error('Could not load this media for forwarding.');
            const uploaded = await client!.uploadFile({ file: new CustomFile(path.basename(cached.filePath), fs.statSync(cached.filePath).size, cached.filePath), workers: 1 });
            const media = info.type === 'photo'
              ? new Api.InputMediaUploadedPhoto({ file: uploaded })
              : new Api.InputMediaUploadedDocument({ file: uploaded, mimeType: cached.mimeType || 'application/octet-stream',
                  attributes: message.media instanceof Api.MessageMediaDocument && message.media.document instanceof Api.Document ? message.media.document.attributes : [new Api.DocumentAttributeFilename({ fileName: cached.fileName })] });
            await client!.invoke(new Api.messages.SendMedia({ peer: toPeer, media, randomId,
              message: options.hideCaptions ? '' : message.message || '', entities: options.hideCaptions ? undefined : message.entities,
              silent: options.silent, scheduleDate: options.scheduleDate }));
          } else if (message.message) {
            await client!.invoke(new Api.messages.SendMessage({ peer: toPeer, randomId, message: message.message,
              entities: message.entities, silent: options.silent, scheduleDate: options.scheduleDate }));
          } else throw new Error('This message cannot be copied.');
        } : undefined);
      return res.json(result);
    } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
  });

  // 2. Native Polls & Quizzes + Live Voting
  app.post('/api/tg/messages/send-poll', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const chatId = String(req.body.chatId || '');
      const question = String(req.body.question || '').trim();
      const rawOptions = Array.isArray(req.body.options) ? (req.body.options as string[]).map((o) => String(o).trim()).filter(Boolean) : [];
      const multipleChoice = Boolean(req.body.multipleChoice);
      const quiz = Boolean(req.body.quiz);
      const publicVoters = Boolean(req.body.publicVoters);
      const correctIndex = typeof req.body.correctOptionIndex === 'number' ? req.body.correctOptionIndex : 0;
      const solution = req.body.solution ? String(req.body.solution).trim() : undefined;
      const topMsgId = req.body.topMsgId ? Number(req.body.topMsgId) : undefined;
      const scheduleDate = req.body.scheduleDate ? Number(req.body.scheduleDate) : undefined;

      if (!question || rawOptions.length < 2) {
        return res.status(400).json({ error: 'Poll question and at least 2 options are required.' });
      }

      const peer = await resolvePeer(client, chatId);
      const answers = rawOptions.slice(0, 10).map(
        (optText, idx) =>
          new Api.PollAnswer({
            text: new Api.TextWithEntities({ text: optText, entities: [] }),
            option: Buffer.from(String(idx)),
          })
      );

      const poll = new Api.Poll({
        id: helpers.generateRandomBigInt(),
        question: new Api.TextWithEntities({ text: question, entities: [] }),
        answers,
        multipleChoice: quiz ? false : multipleChoice,
        quiz,
        publicVoters,
      });

      const inputMedia = new Api.InputMediaPoll({
        poll,
        correctAnswers: quiz ? [Buffer.from(String(Math.max(0, Math.min(answers.length - 1, correctIndex))))] : undefined,
        solution: quiz && solution ? solution : undefined,
        solutionEntities: quiz && solution ? [] : undefined,
      });

      await client.invoke(
        new Api.messages.SendMedia({
          peer,
          media: inputMedia,
          message: '',
          scheduleDate: scheduleDate || undefined,
          randomId: helpers.generateRandomBigInt(),
          replyTo: topMsgId ? new Api.InputReplyToMessage({ replyToMsgId: topMsgId, topMsgId }) : undefined,
        })
      );

      const latest = await client.getMessages(peer, { limit: 1 });
      const sentMsg = latest[0] as Api.Message | undefined;
      if (sentMsg && !scheduleDate) {
        storeRawMessage(chatId, sentMsg);
        const serialized = serializeMessage(sentMsg, chatId, currentMe?.firstName || 'You');
        storeMessageInCache(chatId, sentMsg.id, serialized);
        return res.json({ message: serialized });
      }
      return res.json({ ok: true, scheduled: Boolean(scheduleDate) });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/messages/vote', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const chatId = String(req.body.chatId || '');
      const msgId = Number(req.body.messageId);
      const optionHexes = Array.isArray(req.body.optionHexes) ? (req.body.optionHexes as string[]) : [];
      const peer = await resolvePeer(client, chatId);

      await client.invoke(
        new Api.messages.SendVote({
          peer,
          msgId,
          options: optionHexes.map((hex) => Buffer.from(hex, 'hex')),
        })
      );

      const updatedMsgs = await client.getMessages(peer, { ids: [msgId] });
      const updated = updatedMsgs[0];
      if (updated instanceof Api.Message) {
        storeRawMessage(chatId, updated);
        const serialized = serializeMessage(updated, chatId);
        storeMessageInCache(chatId, updated.id, serialized);
        return res.json({ message: serialized });
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // 3. Scheduled Messages Queue
  app.get('/api/tg/scheduled/:chatId', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const chatId = req.params.chatId;
      const peer = await resolvePeer(client, chatId);
      const result = await client.invoke(
        new Api.messages.GetScheduledHistory({
          peer,
          hash: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
        })
      );
      const rawMsgs = 'messages' in result ? result.messages : [];
      const messages = rawMsgs
        .filter((m): m is Api.Message => m instanceof Api.Message)
        .map((m) => serializeMessage(m, chatId, currentMe?.firstName || 'You'));
      return res.json({ messages });
    } catch {
      return res.json({ messages: [] });
    }
  });

  app.post('/api/tg/scheduled/:chatId/send', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const ids = Array.isArray(req.body.ids) ? (req.body.ids as number[]).map(Number) : [];
      await client.invoke(new Api.messages.SendScheduledMessages({ peer, id: ids }));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/scheduled/:chatId/delete', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const ids = Array.isArray(req.body.ids) ? (req.body.ids as number[]).map(Number) : [];
      await client.invoke(new Api.messages.DeleteScheduledMessages({ peer, id: ids }));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // 4. Drafts Sync & Pinned Messages Cycling
  app.post('/api/tg/chats/:chatId/draft', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const message = String(req.body.text || '');
      const replyToId = req.body.replyToId ? Number(req.body.replyToId) : undefined;
      await client.invoke(
        new Api.messages.SaveDraft({
          peer,
          message,
          replyTo: replyToId ? new Api.InputReplyToMessage({ replyToMsgId: replyToId }) : undefined,
        })
      );
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: false });
    }
  });

  app.get('/api/tg/chats/:chatId/pins', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const chatId = req.params.chatId;
      const peer = await resolvePeer(client, chatId);
      const msgs = await client.getMessages(peer, {
        filter: new Api.InputMessagesFilterPinned(),
        limit: 25,
      });
      const pins = msgs
        .filter((m): m is Api.Message => m instanceof Api.Message)
        .map((m) => serializeMessage(m, chatId));
      return res.json({ pins });
    } catch {
      return res.json({ pins: [] });
    }
  });

  // 5. Archive / Unarchive, Pin, Mute, Mark-Unread & Server-Synced Cloud Folders
  app.post('/api/tg/chats/:chatId/archive', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await client.getInputEntity(await resolvePeer(client, req.params.chatId));
      const archived = Boolean(req.body.archived);
      await client.invoke(
        new Api.folders.EditPeerFolders({
          folderPeers: [
            new Api.InputFolderPeer({
              peer,
              folderId: archived ? 1 : 0,
            }),
          ],
        })
      );
      if (dialogsSnapshot[req.params.chatId]) {
        dialogsSnapshot[req.params.chatId].isArchived = archived;
        persistDialogsSnapshot();
      }
      broadcastWs({ type: 'CHAT_UPDATED', chatId: req.params.chatId, isArchived: archived });
      return res.json({ ok: true, archived });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/archive/mark-all-read', async (_req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const archivedDialogs = await client.getDialogs({ limit: 100, archived: true });
      await Promise.allSettled(
        archivedDialogs
          .filter((d) => (d.unreadCount || 0) > 0 && d.inputEntity)
          .map((d) => client!.markAsRead(d.inputEntity))
      );
      for (const snap of Object.values(dialogsSnapshot)) {
        if (snap.isArchived) {
          snap.unreadCount = 0;
        }
      }
      persistDialogsSnapshot();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/:chatId/pin', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await client.getInputEntity(await resolvePeer(client, req.params.chatId));
      const pinned = Boolean(req.body.pinned);
      await client.invoke(
        new Api.messages.ToggleDialogPin({
          peer: new Api.InputDialogPeer({ peer }),
          pinned,
        })
      );
      if (dialogsSnapshot[req.params.chatId]) {
        dialogsSnapshot[req.params.chatId].isPinned = pinned;
        persistDialogsSnapshot();
      }
      broadcastWs({ type: 'CHAT_UPDATED', chatId: req.params.chatId, isPinned: pinned });
      return res.json({ ok: true, pinned });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/:chatId/mute', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await client.getInputEntity(await resolvePeer(client, req.params.chatId));
      const muted = Boolean(req.body.muted);
      await client.invoke(
        new Api.account.UpdateNotifySettings({
          peer: new Api.InputNotifyPeer({ peer }),
          settings: new Api.InputPeerNotifySettings({
            muteUntil: muted ? 2147483647 : 0,
            silent: muted,
          }),
        })
      );
      if (dialogsSnapshot[req.params.chatId]) {
        dialogsSnapshot[req.params.chatId].isMuted = muted;
        persistDialogsSnapshot();
      }
      broadcastWs({ type: 'CHAT_UPDATED', chatId: req.params.chatId, isMuted: muted });
      return res.json({ ok: true, muted });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/:chatId/unread', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await client.getInputEntity(await resolvePeer(client, req.params.chatId));
      const unread = Boolean(req.body.unread);
      if (unread) {
        await client.invoke(
          new Api.messages.MarkDialogUnread({
            peer: new Api.InputDialogPeer({ peer }),
            unread: true,
          })
        );
      } else {
        await client.markAsRead(peer);
      }
      return res.json({ ok: true, unread });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/folders', async (_req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const resp = await client.invoke(new Api.messages.GetDialogFilters());
      const rawFilters = Array.isArray(resp) ? resp : 'filters' in resp ? resp.filters : [];
      const folders = [];
      for (const f of rawFilters) {
        if (f instanceof Api.DialogFilter) {
          const resolvePeerIds = (peers: Api.TypeInputPeer[]) =>
            peers
              .map((ip) => {
                if (ip instanceof Api.InputPeerUser) return ip.userId.toString();
                if (ip instanceof Api.InputPeerChat) return `-${ip.chatId.toString()}`;
                if (ip instanceof Api.InputPeerChannel) return `-100${ip.channelId.toString()}`;
                return '';
              })
              .filter(Boolean);

          folders.push({
            id: `tg_${f.id}`,
            telegramFilterId: f.id,
            name: extractTextWithEntitiesStr(f.title),
            iconName: 'folder',
            filter: 'custom',
            isCloud: true,
            includeChatIds: resolvePeerIds(f.includePeers || []),
            excludeChatIds: resolvePeerIds(f.excludePeers || []),
            includeContacts: Boolean(f.contacts),
            includeNonContacts: Boolean(f.nonContacts),
            includeGroups: Boolean(f.groups),
            includeBroadcasts: Boolean(f.broadcasts),
            includeBots: Boolean(f.bots),
            excludeMuted: Boolean(f.excludeMuted),
            excludeArchived: Boolean(f.excludeArchived),
          });
        }
      }
      return res.json({ folders });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/folders', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const id = Number(req.body.telegramFilterId) || Math.floor(2 + Math.random() * 200);
      const name = String(req.body.name || '').trim() || 'Folder';
      const includeChatIds = Array.isArray(req.body.includeChatIds) ? (req.body.includeChatIds as string[]) : [];
      const includePeers: Api.TypeInputPeer[] = [];
      for (const cid of includeChatIds) {
        try {
          includePeers.push(await client.getInputEntity(await resolvePeer(client, cid)));
        } catch {
          // ignore
        }
      }

      const filter = new Api.DialogFilter({
        id,
        title: new Api.TextWithEntities({ text: name, entities: [] }),
        pinnedPeers: [],
        includePeers,
        excludePeers: [],
        contacts: Boolean(req.body.includeContacts),
        nonContacts: Boolean(req.body.includeNonContacts),
        groups: Boolean(req.body.includeGroups),
        broadcasts: Boolean(req.body.includeBroadcasts),
        bots: Boolean(req.body.includeBots),
        excludeMuted: Boolean(req.body.excludeMuted),
        excludeArchived: Boolean(req.body.excludeArchived),
      });

      await client.invoke(new Api.messages.UpdateDialogFilter({ id, filter }));
      return res.json({ ok: true, id });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/tg/folders/:filterId', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const id = Number(req.params.filterId);
      await client.invoke(new Api.messages.UpdateDialogFilter({ id, filter: undefined }));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // 6. Forum Topics & Channel Post Discussion Comments
  app.get('/api/tg/chats/:chatId/topics', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const resTopics = await client.invoke(
        new Api.channels.GetForumTopics({
          channel: peer,
          offsetDate: 0,
          offsetId: 0,
          offsetTopic: 0,
          limit: 40,
        })
      );
      const topics = (resTopics.topics || [])
        .filter((t): t is Api.ForumTopic => t instanceof Api.ForumTopic)
        .map((t) => ({
          id: t.id,
          title: t.title,
          iconColor: t.iconColor,
          topMessage: t.topMessage,
          unreadCount: t.unreadCount,
          closed: Boolean(t.closed),
          pinned: Boolean(t.pinned),
        }));
      return res.json({ topics });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/:chatId/topics', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const title = String(req.body.title || '').trim();
      if (!title) return res.status(400).json({ error: 'Topic title is required.' });
      await client.invoke(
        new Api.channels.CreateForumTopic({
          channel: peer,
          title,
          randomId: helpers.generateRandomBigInt(),
        })
      );
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/messages/:chatId/:msgId/comments', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const chatId = req.params.chatId;
      const peer = await resolvePeer(client, chatId);
      const msgId = Number(req.params.msgId);

      let discussionChatId = chatId;
      let discussionMsgId = msgId;
      let discPeer = peer;

      try {
        const disc = await client.invoke(
          new Api.messages.GetDiscussionMessage({ peer, msgId })
        );
        for (const ch of disc.chats || []) extractEntityQuickMeta(ch, '');
        for (const u of disc.users || []) extractEntityQuickMeta(u, '');
        const rootMsg = disc.messages.find((m): m is Api.Message => m instanceof Api.Message);
        if (rootMsg) {
          discussionChatId = getPeerChatIdString(rootMsg.peerId) || chatId;
          discussionMsgId = rootMsg.id;
          discPeer = await resolvePeer(client, discussionChatId);
        }
      } catch {
        // Fallback: direct message replies thread in the same group/chat
        discussionChatId = chatId;
        discussionMsgId = msgId;
        discPeer = peer;
      }

      let rawComments: Api.Message[] = [];
      try {
        const replies = await client.invoke(
          new Api.messages.GetReplies({
            peer: discPeer,
            msgId: discussionMsgId,
            offsetId: 0,
            offsetDate: 0,
            addOffset: 0,
            limit: 60,
            maxId: 0,
            minId: 0,
            hash: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
          })
        );
        if ('users' in replies && Array.isArray(replies.users)) {
          for (const u of replies.users) extractEntityQuickMeta(u, '');
        }
        rawComments = ('messages' in replies ? replies.messages : []).filter(
          (m): m is Api.Message => m instanceof Api.Message
        );
      } catch {
        // Fallback for basic groups where GetReplies isn't supported: filter cached messages replying to msgId
      }

      const serialized = [...rawComments].reverse().map((m) => {
        let sName: string | undefined;
        let sAva: string | undefined;
        const sid =
          m.fromId instanceof Api.PeerUser
            ? m.fromId.userId.toString()
            : m.fromId instanceof Api.PeerChannel
            ? `-100${m.fromId.channelId.toString()}`
            : '';
        const cached = sid ? peerEntityCache.get(sid) : undefined;
        if (cached) {
          const q = extractEntityQuickMeta(cached, sid);
          sName = q.title;
          sAva = q.avatar;
        }
        return serializeMessage(m, discussionChatId, sName, sAva);
      });

      // Also merge any locally cached replies in the chat if serialized is empty
      if (serialized.length === 0) {
        const chatCache = messageCacheByChat.get(chatId);
        if (chatCache) {
          for (const cached of chatCache.values()) {
            if (cached.replyToMsgId === msgId || cached.replyTo?.id === String(msgId)) {
              serialized.push(cached);
            }
          }
          serialized.sort((a, b) => a.timestamp - b.timestamp);
        }
      }

      return res.json({
        discussionChatId,
        discussionMsgId,
        messages: serialized,
      });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || 'Comments unavailable for this post.' });
    }
  });

  app.post('/api/tg/messages/:chatId/:msgId/comments', async (req, res) => {
    const activeClient = await ensureConnectedClient();
    if (!activeClient || !activeClient.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const chatId = req.params.chatId;
      const peer = await resolvePeer(activeClient, chatId);
      const msgId = parsePositiveInt(req.params.msgId);
      if (!msgId) return res.status(400).json({ error: 'Invalid post identifier.' });
      const text = String(req.body.text || '').trim();
      if (!text) return res.status(400).json({ error: 'Comment text required.' });

      let discussionChatId = chatId;
      let replyTargetId = msgId;
      let discPeer = peer;

      try {
        const disc = await activeClient.invoke(new Api.messages.GetDiscussionMessage({ peer, msgId }));
        for (const ch of disc.chats || []) extractEntityQuickMeta(ch, '');
        const rootMsg = disc.messages.find((m): m is Api.Message => m instanceof Api.Message);
        if (rootMsg) {
          discussionChatId = getPeerChatIdString(rootMsg.peerId) || chatId;
          replyTargetId = rootMsg.id;
          discPeer = await resolvePeer(activeClient, discussionChatId);
        }
      } catch {
        // Fallback: reply directly in the group/channel
        discussionChatId = chatId;
        replyTargetId = msgId;
        discPeer = peer;
      }

      let sent = await activeClient.sendMessage(discPeer, {
        message: text,
        replyTo: replyTargetId,
      });
      if (!sent) {
        const latest = await activeClient.getMessages(discPeer, { limit: 1 });
        sent = latest?.[0] as Api.Message;
      }
      if (!sent) {
        return res.json({
          message: {
            id: String(Date.now()),
            chatId: discussionChatId,
            senderId: currentMe?.id?.toString() || 'me',
            senderName: currentMe?.firstName || 'You',
            text,
            timestamp: Date.now(),
            isOutgoing: true,
          },
        });
      }
      const serialized = serializeMessage(sent, discussionChatId, currentMe?.firstName || 'You');
      storeRawMessage(discussionChatId, sent);
      storeMessageInCache(discussionChatId, sent.id, serialized);
      return res.json({
        message: serialized,
      });
    } catch (err) {
      return res.status(400).json({ error: getRawTgError(err) || 'Could not post comment.' });
    }
  });

  // 7. Slow Mode, Default Permissions & Join Requests
  app.post('/api/tg/chats/:chatId/slow-mode', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const seconds = Math.max(0, Number(req.body.seconds) || 0);
      await client.invoke(new Api.channels.ToggleSlowMode({ channel: peer, seconds }));
      return res.json({ ok: true, seconds });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/chats/:chatId/permissions', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const r = req.body.rights || {};
      const bannedRights = new Api.ChatBannedRights({
        untilDate: 0,
        sendMessages: r.sendMessages === false,
        sendMedia: r.sendMedia === false,
        sendStickers: r.sendStickers === false,
        sendGifs: r.sendStickers === false,
        sendGames: r.sendStickers === false,
        sendInline: r.sendStickers === false,
        embedLinks: r.embedLinks === false,
        sendPolls: r.sendPolls === false,
        inviteUsers: r.inviteUsers === false,
        pinMessages: r.pinMessages === false,
        changeInfo: r.changeInfo === false,
      });
      await client.invoke(new Api.messages.EditChatDefaultBannedRights({ peer, bannedRights }));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/chats/:chatId/join-requests', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const result = await client.invoke(
        new Api.messages.GetChatInviteImporters({
          peer,
          requested: true,
          offsetDate: 0,
          offsetUser: new Api.InputUserEmpty(),
          limit: 40,
        })
      );
      const userMap = new Map<string, Api.User>();
      for (const u of result.users || []) {
        if (u instanceof Api.User) {
          userMap.set(u.id.toString(), u);
          peerEntityCache.set(u.id.toString(), u);
        }
      }
      const requests = (result.importers || []).map((imp) => {
        const uid = imp.userId.toString();
        const u = userMap.get(uid);
        return {
          userId: uid,
          name: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'User' : uid,
          username: u?.username || '',
          about: imp.about || '',
          date: imp.date * 1000,
          avatarUrl: u && hasEntityPhoto(u) ? `/api/tg/avatar/${encodeURIComponent(uid)}` : '',
        };
      });
      return res.json({ requests });
    } catch {
      return res.json({ requests: [] });
    }
  });

  app.post('/api/tg/chats/:chatId/join-requests/decide', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const userId = String(req.body.userId || '');
      const approved = Boolean(req.body.approved);
      const targetUser = (await client.getInputEntity(/^\d+$/.test(userId) ? Number(userId) : userId)) as unknown as Api.TypeInputUser;
      await client.invoke(
        new Api.messages.HideChatJoinRequest({
          peer,
          userId: targetUser,
          approved,
        })
      );
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // 8. Stickers, GIFs, Document Asset Streaming & Bot Callbacks
  app.get('/api/tg/stickers', async (_req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const sets: Array<{
        id: string;
        shortName: string;
        title: string;
        count: number;
        stickers: Array<{
          docId: string;
          mimeType: string;
          url: string;
          thumbnailUrl: string;
          isAnimated: boolean;
          isVideo: boolean;
        }>;
      }> = [];

      const mapStickerDoc = (doc: Api.Document) => {
        const docId = doc.id.toString();
        stickerDocCache.set(docId, doc);
        const mime = doc.mimeType || 'image/webp';
        const isAnimated = mime.includes('tgsticker');
        const isVideo = mime.includes('webm');
        const hasValidRasterThumb = Array.isArray(doc.thumbs)
          ? doc.thumbs.some((t) => t instanceof Api.PhotoSize || t instanceof Api.PhotoCachedSize)
          : false;
        return {
          docId,
          mimeType: mime,
          url: `/api/tg/doc/${docId}`,
          thumbnailUrl:
            mime === 'image/webp' || !hasValidRasterThumb
              ? `/api/tg/doc/${docId}`
              : `/api/tg/doc/${docId}?thumb=1`,
          isAnimated,
          isVideo,
        };
      };

      // 1. Recent Stickers
      try {
        const recent = await client.invoke(
          new Api.messages.GetRecentStickers({
            hash: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
            attached: false,
          })
        );
        if (recent instanceof Api.messages.RecentStickers && recent.stickers.length > 0) {
          const recentDocs = recent.stickers
            .filter((d): d is Api.Document => d instanceof Api.Document)
            .slice(0, 24)
            .map(mapStickerDoc);
          if (recentDocs.length > 0) {
            sets.push({
              id: 'recent_stickers',
              shortName: 'recent',
              title: 'Recent',
              count: recentDocs.length,
              stickers: recentDocs,
            });
          }
        }
      } catch {
        // ignore
      }

      // 2. Installed Sticker Sets
      try {
        const all = await client.invoke(
          new Api.messages.GetAllStickers({
            hash: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
          })
        );
        if (all instanceof Api.messages.AllStickers) {
          const setsMeta = all.sets.slice(0, 8);
          for (const s of setsMeta) {
            try {
              const full = await client.invoke(
                new Api.messages.GetStickerSet({
                  stickerset: new Api.InputStickerSetID({ id: s.id, accessHash: s.accessHash }),
                  hash: 0,
                })
              );
              if (full instanceof Api.messages.StickerSet) {
                const stickers = full.documents
                  .filter((d): d is Api.Document => d instanceof Api.Document)
                  .slice(0, 24)
                  .map(mapStickerDoc);
                if (stickers.length > 0) {
                  sets.push({
                    id: s.id.toString(),
                    shortName: s.shortName,
                    title: s.title,
                    count: s.count,
                    stickers,
                  });
                }
              }
            } catch {
              // ignore individual pack error
            }
          }
        }
      } catch {
        // ignore
      }

      // 3. Featured Sticker Sets fallback if user has few/no installed sticker packs
      if (sets.length < 2) {
        try {
          const featured = await client.invoke(
            new Api.messages.GetFeaturedStickers({
              hash: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
            })
          );
          if (featured instanceof Api.messages.FeaturedStickers) {
            for (const cov of featured.sets.slice(0, 4)) {
              const setInfo = cov.set;
              if (!setInfo) continue;
              try {
                const full = await client.invoke(
                  new Api.messages.GetStickerSet({
                    stickerset: new Api.InputStickerSetID({ id: setInfo.id, accessHash: setInfo.accessHash }),
                    hash: 0,
                  })
                );
                if (full instanceof Api.messages.StickerSet) {
                  const stickers = full.documents
                    .filter((d): d is Api.Document => d instanceof Api.Document)
                    .slice(0, 24)
                    .map(mapStickerDoc);
                  if (stickers.length > 0) {
                    sets.push({
                      id: setInfo.id.toString(),
                      shortName: setInfo.shortName,
                      title: setInfo.title,
                      count: setInfo.count,
                      stickers,
                    });
                  }
                }
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }
      }

      return res.json({ sets });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/gifs', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const q = String(req.query.q || '').trim();
      const gifs: Array<{
        docId: string;
        url: string;
        thumbnailUrl: string;
        mimeType: string;
      }> = [];
      const seenDocIds = new Set<string>();

      const pushGifDoc = (doc: Api.Document) => {
        const docId = doc.id.toString();
        if (seenDocIds.has(docId)) return;
        seenDocIds.add(docId);
        stickerDocCache.set(docId, doc);
        gifs.push({
          docId,
          url: `/api/tg/doc/${docId}`,
          thumbnailUrl: `/api/tg/doc/${docId}?thumb=1`,
          mimeType: doc.mimeType || 'video/mp4',
        });
      };

      if (!q) {
        try {
          const saved = await client.invoke(
            new Api.messages.GetSavedGifs({
              hash: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false),
            })
          );
          if (saved instanceof Api.messages.SavedGifs) {
            for (const doc of saved.gifs || []) {
              if (doc instanceof Api.Document) {
                pushGifDoc(doc);
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (q || gifs.length < 8) {
        try {
          const gifBot = await client.getInputEntity('gif');
          const inlineRes = await client.invoke(
            new Api.messages.GetInlineBotResults({
              bot: gifBot as unknown as Api.TypeInputUser,
              peer: new Api.InputPeerSelf(),
              query: q || 'funny',
              offset: '',
            })
          );
          for (const r of inlineRes.results || []) {
            if (r instanceof Api.BotInlineMediaResult && r.document instanceof Api.Document) {
              pushGifDoc(r.document);
            }
          }
        } catch {
          // ignore inline @gif bot error
        }
      }

      return res.json({ gifs: gifs.slice(0, 36) });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/doc/:docId', async (req, res) => {
    if (!client || !client.connected) return res.status(503).end();
    try {
      const docId = req.params.docId.replace(/[^0-9-]/g, '');
      const doc = stickerDocCache.get(docId);
      if (!doc) return res.status(404).end();

      const mime = doc.mimeType || 'application/octet-stream';
      // For static WebP stickers, always download the full WebP image rather than an outline thumb
      const isThumb = req.query.thumb === '1' && mime !== 'image/webp';
      const cacheKey = `${docId}_${isThumb ? 'thumb' : 'full'}`;
      const ext = isThumb
        ? 'jpg'
        : mime.includes('webm')
        ? 'webm'
        : mime.includes('mp4')
        ? 'mp4'
        : mime.includes('webp')
        ? 'webp'
        : 'bin';
      const filePath = path.join(VAULT_DIR, `doc_${docId}${isThumb ? '_thumb' : ''}.${ext}`);

      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.size > 0) {
          res.setHeader('Content-Type', isThumb ? 'image/jpeg' : mime);
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Cache-Control', 'public, max-age=604800');
          return fs.createReadStream(filePath).pipe(res);
        }
      }

      let job = docDownloadInFlight.get(cacheKey);
      if (!job) {
        job = runWithAvatarLimit(async () => {
          if (!client || !client.connected) return null;
          const docMedia = new Api.MessageMediaDocument({ document: doc });
          let buf: Buffer | undefined;

          if (isThumb) {
            // Find an actual raster thumbnail (PhotoSize or PhotoCachedSize), NEVER PhotoPathSize (which is SVG outline bytes)
            const rasterThumb = Array.isArray(doc.thumbs)
              ? [...doc.thumbs]
                  .reverse()
                  .find((t) => t instanceof Api.PhotoSize || t instanceof Api.PhotoCachedSize)
              : undefined;
            if (rasterThumb instanceof Api.PhotoCachedSize && rasterThumb.bytes) {
              buf = Buffer.from(rasterThumb.bytes);
            } else if (rasterThumb) {
              buf = (await client
                .downloadMedia(docMedia, { thumb: rasterThumb })
                .catch(() => undefined)) as Buffer | undefined;
            }
          } else {
            buf = (await client.downloadMedia(docMedia, {}).catch(() => undefined)) as Buffer | undefined;
          }

          if (!buf || buf.length === 0) {
            // If full download is a .tgs animated sticker or thumb wasn't found, try raster thumb fallback
            const rasterFallback = Array.isArray(doc.thumbs)
              ? [...doc.thumbs]
                  .reverse()
                  .find((t) => t instanceof Api.PhotoSize || t instanceof Api.PhotoCachedSize)
              : undefined;
            if (rasterFallback instanceof Api.PhotoCachedSize && rasterFallback.bytes) {
              buf = Buffer.from(rasterFallback.bytes);
            } else if (rasterFallback) {
              buf = (await client
                .downloadMedia(docMedia, { thumb: rasterFallback })
                .catch(() => undefined)) as Buffer | undefined;
            }
          }

          if (buf && buf.length > 0) {
            try {
              fs.writeFileSync(filePath, buf);
            } catch {
              // ignore
            }
            return buf;
          }
          return null;
        }).finally(() => docDownloadInFlight.delete(cacheKey));
        docDownloadInFlight.set(cacheKey, job);
      }
      const buf = await job;
      if (!buf || buf.length === 0) return res.status(404).end();
      const isWebp = buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
      const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
      const contentType = isWebp
        ? 'image/webp'
        : isJpeg || isThumb
        ? 'image/jpeg'
        : mime;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', 'public, max-age=604800');
      return res.send(buf);
    } catch {
      return res.status(404).end();
    }
  });

  app.post('/api/tg/messages/send-doc', async (req, res) => {
    const activeClient = await ensureConnectedClient();
    if (!activeClient || !activeClient.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const chatId = String(req.body.chatId || '');
      const docId = String(req.body.docId || '');
      const replyToId = parsePositiveInt(req.body.replyToId);
      const topMsgId = parsePositiveInt(req.body.topMsgId);
      const scheduleDate = parsePositiveInt(req.body.scheduleDate);
      const doc = stickerDocCache.get(docId);
      if (!doc) return res.status(404).json({ error: 'Sticker/GIF expired, refresh picker.' });

      const peer = await resolvePeer(activeClient, chatId);
      const effectiveReplyTo = replyToId || topMsgId;
      await activeClient.invoke(
        new Api.messages.SendMedia({
          peer,
          media: new Api.InputMediaDocument({
            id: new Api.InputDocument({
              id: doc.id,
              accessHash: doc.accessHash,
              fileReference: doc.fileReference,
            }),
          }),
          message: '',
          scheduleDate: scheduleDate || undefined,
          randomId: helpers.generateRandomBigInt(),
          replyTo: effectiveReplyTo ? new Api.InputReplyToMessage({ replyToMsgId: effectiveReplyTo, topMsgId }) : undefined,
        })
      );
      if (scheduleDate) return res.json({ scheduled: true });
      const latest = await activeClient.getMessages(peer, { limit: 1 });
      const sentMsg = latest[0] as Api.Message | undefined;
      if (sentMsg) {
        storeRawMessage(chatId, sentMsg);
        const serialized = serializeMessage(sentMsg, chatId, currentMe?.firstName || 'You');
        storeMessageInCache(chatId, sentMsg.id, serialized);
        return res.json({ message: serialized });
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: getRawTgError(err) || 'Could not send sticker or GIF.' });
    }
  });

  app.post('/api/tg/messages/bot-callback', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, String(req.body.chatId));
      const msgId = Number(req.body.messageId);
      const dataHex = String(req.body.dataHex || '');
      const ans = await client.invoke(
        new Api.messages.GetBotCallbackAnswer({
          peer,
          msgId,
          data: Buffer.from(dataHex, 'hex'),
        })
      );
      return res.json({ message: ans.message || '', alert: Boolean(ans.alert), url: ans.url || '' });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // 9. Active Devices / Sessions, Blocked Users & Cloud Privacy Settings
  app.get('/api/tg/account/sessions', async (_req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const auths = await client.invoke(new Api.account.GetAuthorizations());
      const sessions = (auths.authorizations || []).map((a) => ({
        hash: a.hash.toString(),
        deviceModel: a.deviceModel,
        platform: a.platform,
        systemVersion: a.systemVersion,
        appName: a.appName,
        appVersion: a.appVersion,
        dateActive: a.dateActive * 1000,
        ip: a.ip,
        country: a.country,
        current: Boolean(a.current),
      }));
      return res.json({ sessions });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/account/sessions/terminate', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const hashStr = String(req.body.hash || '');
      if (hashStr === 'all_other') {
        await client.invoke(new Api.auth.ResetAuthorizations());
      } else {
        const hashVal = helpers.readBigIntFromBuffer(
          Buffer.from(BigInt(hashStr).toString(16).padStart(16, '0'), 'hex'),
          false,
          true
        );
        await client.invoke(new Api.account.ResetAuthorization({ hash: hashVal }));
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/tg/account/blocked', async (_req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const blocked = await client.invoke(new Api.contacts.GetBlocked({ offset: 0, limit: 60 }));
      const users = (blocked.users || [])
        .filter((u): u is Api.User => u instanceof Api.User)
        .map((u) => {
          const uid = u.id.toString();
          peerEntityCache.set(uid, u);
          return {
            id: uid,
            name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'User',
            username: u.username || '',
            avatarUrl: hasEntityPhoto(u) ? `/api/tg/avatar/${encodeURIComponent(uid)}` : '',
          };
        });
      return res.json({ users });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  registerContactRoutes(app, { client: () => client, cache: peerEntityCache });

  app.post('/api/tg/contacts/:chatId/block', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const peer = await resolvePeer(client, req.params.chatId);
      const blocked = Boolean(req.body.blocked);
      if (blocked) {
        await client.invoke(new Api.contacts.Block({ id: peer }));
      } else {
        await client.invoke(new Api.contacts.Unblock({ id: peer }));
      }
      return res.json({ ok: true, blocked });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  const privacyKeyFactories: Record<string, () => Api.TypeInputPrivacyKey> = {
    statusTimestamp: () => new Api.InputPrivacyKeyStatusTimestamp(),
    profilePhoto: () => new Api.InputPrivacyKeyProfilePhoto(),
    phoneNumber: () => new Api.InputPrivacyKeyPhoneNumber(),
    phoneCall: () => new Api.InputPrivacyKeyPhoneCall(),
    chatInvite: () => new Api.InputPrivacyKeyChatInvite(),
  };

  const privacyLabels: Record<string, string> = {
    statusTimestamp: 'Last Seen & Online',
    profilePhoto: 'Profile Photos',
    phoneNumber: 'Phone Number',
    phoneCall: 'Voice & Video Calls',
    chatInvite: 'Group & Channel Invites',
  };

  app.get('/api/tg/account/privacy', async (_req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const items = [];
      for (const [key, makeKey] of Object.entries(privacyKeyFactories)) {
        try {
          const resp = await client.invoke(new Api.account.GetPrivacy({ key: makeKey() }));
          const hasAllowAll = resp.rules.some((r) => r instanceof Api.PrivacyValueAllowAll);
          const hasAllowContacts = resp.rules.some((r) => r instanceof Api.PrivacyValueAllowContacts);
          const level = hasAllowAll ? 'everybody' : hasAllowContacts ? 'contacts' : 'nobody';
          items.push({ key, label: privacyLabels[key], level });
        } catch {
          items.push({ key, label: privacyLabels[key], level: 'contacts' });
        }
      }
      return res.json({ privacy: items });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/account/privacy', async (req, res) => {
    if (!client || !client.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const key = String(req.body.key || '');
      const level = String(req.body.level || 'contacts');
      const makeKey = privacyKeyFactories[key];
      if (!makeKey) return res.status(400).json({ error: 'Invalid privacy key' });
      const rule =
        level === 'everybody'
          ? new Api.InputPrivacyValueAllowAll()
          : level === 'contacts'
          ? new Api.InputPrivacyValueAllowContacts()
          : new Api.InputPrivacyValueDisallowAll();
      await client.invoke(new Api.account.SetPrivacy({ key: makeKey(), rules: [rule] }));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/tg/ayugram/sync', async (req, res) => {
    ayuConfig = { ...ayuConfig, ...req.body };
    if (client && client.connected && ayuConfig.ghostModeActive && !ayuConfig.sendOnlineStatus) {
      try {
        await client.invoke(new Api.account.UpdateStatus({ offline: true }));
      } catch {
        // ignore
      }
    }
    return res.json({ ok: true, ayuConfig });
  });

  app.get('/api/tg/vault', (_req, res) => {
    return res.json({
      items: Object.values(vaultIndex).sort((a, b) => b.savedAt - a.savedAt),
      deletedLogs,
    });
  });

  app.delete('/api/tg/vault/deleted-chats/:chatId', (req, res) => {
    const cid = req.params.chatId;
    if (dialogsSnapshot[cid]) {
      delete dialogsSnapshot[cid];
      persistDialogsSnapshot();
    }
    return res.json({ ok: true });
  });

  app.post('/api/tg/vault/clear-deleted', (_req, res) => {
    deletedLogs = [];
    persistDeletedLogs();
    return res.json({ ok: true });
  });

  registerCallRecordingRoutes(app, VAULT_DIR, () => ({ client, accountId: currentMe?.id.toString() || '' }));

  app.get('/api/tg/calls/capabilities', (_req, res) => {
    res.json({ nativeCalls: true, nativeGroupCalls: false, reason: 'Group call media is not supported in this build. Private calls use the Telegram Web A transport.' });
  });

  registerNativeCallRoutes(app, { client: () => client, resolvePeer });

  // Telegram calls require a negotiated DH key and the native media transport.
  // Local-tab SDP relays cannot substitute for that handshake.
  app.post('/api/tg/calls/start', (_req, res) => {
    res.status(501).json({ ok: false, error: 'Telegram call audio is not available in this build. Open Telegram to call.' });
  });

  app.post('/api/tg/calls/discard', async (req, res) => {
    if (!client || !client.connected) return res.json({ ok: true });
    try {
      const callId = String(req.body.callId || '');
      const accessHash = String(req.body.accessHash || '0');
      const duration = Math.max(0, Math.round(Number(req.body.duration || 0)));
      const isVideo = Boolean(req.body.isVideo);
      if (/^\d+$/.test(callId) && /^-?\d+$/.test(accessHash)) {
        await client.invoke(
          new Api.phone.DiscardCall({
            video: isVideo,
            peer: new Api.InputPhoneCall({
              id: helpers.returnBigInt(callId),
              accessHash: helpers.returnBigInt(accessHash),
            }),
            duration,
            reason:
              duration > 0
                ? new Api.PhoneCallDiscardReasonHangup()
                : new Api.PhoneCallDiscardReasonMissed(),
            connectionId: helpers.returnBigInt('0'),
          })
        );
      }
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post('/api/tg/calls/group/info', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = String(req.body.chatId || '');
      const peer = await resolvePeer(client, chatId);
      let inputGroupCall: Api.TypeInputGroupCall | undefined;

      if (chatId.startsWith('-100')) {
        const full = await client.invoke(new Api.channels.GetFullChannel({ channel: peer }));
        const fullChat = full.fullChat as Api.ChannelFull;
        inputGroupCall = fullChat.call;
      } else {
        const numId = Math.abs(Number(chatId));
        const full = await client.invoke(new Api.messages.GetFullChat({ chatId: helpers.returnBigInt(numId) }));
        const fullChat = full.fullChat as Api.ChatFull;
        inputGroupCall = fullChat.call;
      }

      if (!inputGroupCall || !(inputGroupCall instanceof Api.InputGroupCall)) {
        return res.json({ hasActiveCall: false, participants: [] });
      }

      const groupCallRes = await client.invoke(
        new Api.phone.GetGroupCall({ call: inputGroupCall, limit: 30 })
      );
      const usersById = new Map<string, Api.User>();
      for (const u of groupCallRes.users || []) {
        if (u instanceof Api.User) usersById.set(u.id.toString(), u);
      }
      const participants = (groupCallRes.participants || []).map((p) => {
        const pid =
          p.peer instanceof Api.PeerUser
            ? p.peer.userId.toString()
            : p.peer instanceof Api.PeerChannel
            ? `-100${p.peer.channelId.toString()}`
            : p.peer instanceof Api.PeerChat
            ? `-${p.peer.chatId.toString()}`
            : '';
        const u = usersById.get(pid);
        const name = u
          ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || `User ${pid}`
          : `Participant ${pid}`;
        return {
          id: pid,
          name,
          avatarUrl: pid ? `/api/tg/avatar/${encodeURIComponent(pid)}` : undefined,
          muted: Boolean(p.muted),
          raiseHandRating: p.raiseHandRating ? Number(p.raiseHandRating) : 0,
        };
      });

      if (!(groupCallRes.call instanceof Api.GroupCall)) return res.json({ hasActiveCall: false, participants: [] });
      const callObj = groupCallRes.call;
      return res.json({
        hasActiveCall: true,
        callId: callObj.id.toString(),
        accessHash: callObj.accessHash.toString(),
        title: callObj.title || 'Voice Chat',
        scheduledStart: callObj.scheduleDate ? callObj.scheduleDate * 1000 : undefined,
        participantsCount: callObj.participantsCount || participants.length,
        participants,
      });
    } catch {
      return res.json({ hasActiveCall: false, participants: [] });
    }
  });

  app.post('/api/tg/calls/group/create', async (req, res) => {
    if (!client || !client.connected) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const chatId = String(req.body.chatId || '');
      const title = req.body.title ? String(req.body.title) : undefined;
      const peer = await resolvePeer(client, chatId);
      const randomId = Math.floor(Math.random() * 0x7ffffffe) + 1;
      await client.invoke(
        new Api.phone.CreateGroupCall({
          peer,
          randomId,
          title,
        })
      );
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/health', (_req, res) => {
    return res.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      isConnected: Boolean(client && client.connected && currentMe),
      storageDir: DATA_DIR,
    });
  });

  // --- Vite / Static Frontend Serving ---

  if (process.env.TG_PROFILE_WORKER === '1') {
    // The gateway serves frontend assets once for all isolated browser backends.
  } else if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(distDir, { maxAge: 0 }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  void initClientFromSavedSession();

  // Keep Telegram connection alive and auto-recover transparently if network flickers
  setInterval(() => {
    if (loadSessionFile() && (!client || !client.connected)) {
      void ensureConnectedClient().catch(() => {});
    }
  }, 25_000);

  server.listen(PORT, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address !== 'string') process.send?.({ type: 'PROFILE_READY', port: address.port });
  });
}

process.once('disconnect', () => process.exit(0));
main().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

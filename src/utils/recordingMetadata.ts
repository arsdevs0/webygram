export function recordingFileName(name: string, startedAt: number, mimeType: string) {
  const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Voice chat';
  const date = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
  const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  return `${safeName} — ${date}.${extension}`;
}

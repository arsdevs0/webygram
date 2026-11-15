export interface ParsedTextToken {
  type: 'text' | 'url' | 'telegram' | 'mention' | 'hashtag';
  raw: string;
  href?: string;
  tgTarget?: string;
}

const TOKEN_REGEX =
  /((?:https?:\/\/|tg:\/\/)[^\s<>"']+|(?:t\.me|telegram\.me|telegram\.dog)\/[^\s<>"']+|www\.[^\s<>"']+|@[a-zA-Z0-9_]{3,}|#[a-zA-Z0-9_]{2,}|\b[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:com|org|net|io|co|in|me|app|dev|tv|gg|ly|be|ai|xyz)(?:\/[^\s<>"']*)?)/gi;

function splitTrailingPunctuation(token: string): { core: string; trailing: string } {
  let core = token;
  let trailing = '';
  while (core.length > 1 && /[.,!?;:'")\]}>]$/.test(core)) {
    const last = core[core.length - 1];
    // Preserve balanced closing paren when URL contains '('
    if (last === ')' && core.includes('(')) break;
    trailing = last + trailing;
    core = core.slice(0, -1);
  }
  return { core, trailing };
}

export function isTelegramUrl(url: string): boolean {
  return /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\//i.test(url) || url.startsWith('tg://');
}

export function normalizeHref(raw: string): string {
  if (/^(https?:\/\/|tg:\/\/)/i.test(raw)) return raw;
  return `https://${raw}`;
}

export function parseFormattedTokens(text: string): ParsedTextToken[] {
  if (!text) return [];
  const tokens: ParsedTextToken[] = [];
  let lastIndex = 0;

  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      tokens.push({ type: 'text', raw: text.slice(lastIndex, start) });
    }

    const { core, trailing } = splitTrailingPunctuation(match[0]);

    if (core.startsWith('@')) {
      const username = core.slice(1);
      tokens.push({
        type: 'mention',
        raw: core,
        href: `https://t.me/${username}`,
        tgTarget: core,
      });
    } else if (core.startsWith('#')) {
      tokens.push({
        type: 'hashtag',
        raw: core,
      });
    } else if (isTelegramUrl(core)) {
      tokens.push({
        type: 'telegram',
        raw: core,
        href: normalizeHref(core),
        tgTarget: core,
      });
    } else {
      tokens.push({
        type: 'url',
        raw: core,
        href: normalizeHref(core),
      });
    }

    if (trailing) {
      tokens.push({ type: 'text', raw: trailing });
    }

    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', raw: text.slice(lastIndex) });
  }

  return tokens;
}

export function extractLinksFromText(text: string): { raw: string; href: string; isTelegram: boolean }[] {
  const tokens = parseFormattedTokens(text);
  const links: { raw: string; href: string; isTelegram: boolean }[] = [];
  for (const t of tokens) {
    if ((t.type === 'url' || t.type === 'telegram' || t.type === 'mention') && t.href) {
      links.push({
        raw: t.raw,
        href: t.href,
        isTelegram: t.type === 'telegram' || t.type === 'mention',
      });
    }
  }
  return links;
}

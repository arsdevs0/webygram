import React, { useState, useSyncExternalStore } from 'react';
import { ExternalLink, MessageSquare, Forward, Copy, Check } from 'lucide-react';
import { parseFormattedTokens } from '../../utils/links';
import { telegramService } from '../../services/telegramService';
import { modSettingsStore } from '../../services/modSettingsStore';
import { MessageEntityItem } from '../../types/telegram';

const subscribeModSettings = (cb: () => void) => modSettingsStore.subscribe(() => cb());
const getModSettingsSnapshot = () => modSettingsStore.getSettings();

interface Props {
  text: string;
  entities?: MessageEntityItem[];
  isOutgoing?: boolean;
  isDarkBubble?: boolean;
  onOpenChatByLink?: (link: string) => void;
  onNotify?: (msg: string) => void;
  highlightQuery?: string;
}

function renderHighlighted(text: string, query?: string): React.ReactNode {
  if (!query || !query.trim()) return text;
  const q = query.trim();
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-300/80 text-ink rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {renderHighlighted(text.slice(idx + q.length), q)}
    </>
  );
}

export const FormattedText: React.FC<Props> = React.memo(({
  text,
  entities,
  isOutgoing = false,
  isDarkBubble,
  onOpenChatByLink,
  onNotify,
  highlightQuery,
}) => {
  const [selectedTgToken, setSelectedTgToken] = useState<{
    tgTarget: string;
    href: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [busyAction, setBusyAction] = useState<'open' | 'target' | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());
  const modSettings = useSyncExternalStore(subscribeModSettings, getModSettingsSnapshot);

  const palette = modSettingsStore.getActivePaletteTokens();
  const effectiveDarkOutgoing =
    isDarkBubble !== undefined
      ? isDarkBubble
      : isOutgoing && (!palette.isLight || modSettings.bubbleStyle === 'ios');

  const linkClass = effectiveDarkOutgoing
    ? 'text-white underline decoration-white/80 underline-offset-2 font-medium hover:decoration-white break-all'
    : 'text-primary underline underline-offset-2 font-medium break-all';

  const handleOpenInApp = async (e: React.MouseEvent, target: string) => {
    e.stopPropagation();
    setBusyAction('open');
    try {
      if (onOpenChatByLink) {
        onOpenChatByLink(target);
      } else {
        await telegramService.openChatByLink(target);
      }
      setSelectedTgToken(null);
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not open Telegram link');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSetTarget = async (e: React.MouseEvent, target: string) => {
    e.stopPropagation();
    setBusyAction('target');
    try {
      const resolved = await telegramService.resolveTargetGroupByLink(target);
      onNotify?.(`Target group set: ${resolved.title}`);
      setSelectedTgToken(null);
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not set target group');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopy = (e: React.MouseEvent, value: string) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(value);
    setCopiedLink(true);
    onNotify?.('Link copied');
    setTimeout(() => setCopiedLink(false), 1800);
  };

  const renderPlainWithLinks = (chunk: string, keyPrefix: string): React.ReactNode => {
    const tokens = parseFormattedTokens(chunk);
    return tokens.map((tok, idx) => {
      const key = `${keyPrefix}_${idx}`;
      if (tok.type === 'text') {
        return <React.Fragment key={key}>{renderHighlighted(tok.raw, highlightQuery)}</React.Fragment>;
      }

      if (tok.type === 'hashtag') {
        return (
          <span
            key={key}
            className={
              effectiveDarkOutgoing
                ? 'text-white/95 font-medium'
                : 'text-primary-hover dark:text-muted font-medium'
            }
          >
            {renderHighlighted(tok.raw, highlightQuery)}
          </span>
        );
      }

      if (tok.type === 'url' && tok.href) {
        return (
          <a
            key={key}
            href={tok.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={linkClass}
            title={`Open ${tok.href}`}
          >
            {renderHighlighted(tok.raw, highlightQuery)}
          </a>
        );
      }

      if ((tok.type === 'telegram' || tok.type === 'mention') && tok.href && tok.tgTarget) {
        const isSelected = selectedTgToken?.tgTarget === tok.tgTarget;
        return (
          <span key={key} className="inline">
            <a
              href={tok.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedTgToken(
                  isSelected ? null : { tgTarget: tok.tgTarget!, href: tok.href! }
                );
              }}
              className={`${linkClass} cursor-pointer`}
              title="Click for Telegram link options (Open in app, Target Group, or Browser)"
            >
              {renderHighlighted(tok.raw, highlightQuery)}
            </a>
          </span>
        );
      }

      return <React.Fragment key={key}>{tok.raw}</React.Fragment>;
    });
  };

  const renderEntitiesContent = (): React.ReactNode => {
    if (!entities || entities.length === 0) {
      return renderPlainWithLinks(text, 'plain');
    }

    const valid = [...entities]
      .filter((e) => e.offset >= 0 && e.length > 0 && e.offset < text.length)
      .sort((a, b) => a.offset - b.offset || b.length - a.length);

    if (valid.length === 0) {
      return renderPlainWithLinks(text, 'plain');
    }

    const out: React.ReactNode[] = [];
    let cursor = 0;

    valid.forEach((ent, i) => {
      if (ent.offset < cursor) return; // skip nested overlap cleanly
      if (ent.offset > cursor) {
        out.push(
          <React.Fragment key={`gap_${i}`}>
            {renderPlainWithLinks(text.slice(cursor, ent.offset), `g_${i}`)}
          </React.Fragment>
        );
      }

      const end = Math.min(text.length, ent.offset + ent.length);
      const slice = text.slice(ent.offset, end);

      if (ent.type === 'bold') {
        out.push(
          <strong key={`ent_${i}`} className="font-bold">
            {renderPlainWithLinks(slice, `b_${i}`)}
          </strong>
        );
      } else if (ent.type === 'italic') {
        out.push(
          <em key={`ent_${i}`} className="italic">
            {renderPlainWithLinks(slice, `i_${i}`)}
          </em>
        );
      } else if (ent.type === 'code') {
        out.push(
          <code
            key={`ent_${i}`}
            className={`px-1 py-0.5 rounded font-mono text-[12px] ${
              effectiveDarkOutgoing
                ? 'bg-white/20 text-white'
                : isOutgoing
                ? 'bg-black/[0.06] text-ink'
                : 'bg-elevated dark:bg-elevated text-primary dark:text-muted'
            }`}
          >
            {renderHighlighted(slice, highlightQuery)}
          </code>
        );
      } else if (ent.type === 'pre') {
        out.push(
          <pre
            key={`ent_${i}`}
            className={`my-1.5 p-2.5 rounded-lg font-mono text-[12px] overflow-x-auto leading-snug ${
              effectiveDarkOutgoing
                ? 'bg-black/25 text-white'
                : isOutgoing
                ? 'bg-black/[0.06] text-ink border border-outline'
                : 'bg-elevated dark:bg-elevated text-ink dark:text-ink border border-outline dark:border-outline'
            }`}
          >
            <code>{slice}</code>
          </pre>
        );
      } else if (ent.type === 'spoiler') {
        const isRevealed = revealedSpoilers.has(i);
        out.push(
          <span
            key={`ent_${i}`}
            onClick={(e) => {
              e.stopPropagation();
              setRevealedSpoilers((prev) => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
              });
            }}
            title={isRevealed ? 'Spoiler revealed' : 'Click to reveal spoiler'}
            className={`cursor-pointer rounded px-1 transition-all duration-150 ${
              isRevealed
                ? effectiveDarkOutgoing
                  ? 'bg-white/15'
                  : 'bg-black/[0.06] dark:bg-elevated'
                : 'blur-[5px] opacity-60 bg-surface/35 select-none'
            }`}
          >
            {renderHighlighted(slice, highlightQuery)}
          </span>
        );
      } else if (ent.type === 'blockquote') {
        out.push(
          <blockquote
            key={`ent_${i}`}
            className={`my-1 pl-2.5 border-l-2 italic ${
              effectiveDarkOutgoing
                ? 'border-white/75 text-white/95'
                : isOutgoing
                ? 'border-outline text-ink'
                : 'border-primary text-ink dark:text-muted'
            }`}
          >
            {renderPlainWithLinks(slice, `q_${i}`)}
          </blockquote>
        );
      } else if (ent.type === 'textUrl' && ent.url) {
        out.push(
          <a
            key={`ent_${i}`}
            href={ent.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={linkClass}
            title={ent.url}
          >
            {renderHighlighted(slice, highlightQuery)}
          </a>
        );
      } else {
        out.push(
          <React.Fragment key={`ent_${i}`}>
            {renderPlainWithLinks(slice, `u_${i}`)}
          </React.Fragment>
        );
      }

      cursor = end;
    });

    if (cursor < text.length) {
      out.push(
        <React.Fragment key="tail">
          {renderPlainWithLinks(text.slice(cursor), 'tail')}
        </React.Fragment>
      );
    }

    return out;
  };

  return (
    <div className="inline">
      {renderEntitiesContent()}

      {selectedTgToken && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2 p-2 rounded-xl bg-surface/95 text-white border border-white/15 flex flex-wrap items-center gap-1.5 text-[11px] shadow-lg"
        >
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={(e) => void handleOpenInApp(e, selectedTgToken.tgTarget)}
            className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-1 cursor-pointer"
          >
            <MessageSquare className="w-3 h-3" />
            <span>{busyAction === 'open' ? 'Opening...' : 'Open in App'}</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={(e) => void handleSetTarget(e, selectedTgToken.tgTarget)}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium flex items-center gap-1 cursor-pointer"
          >
            <Forward className="w-3 h-3 text-primary" />
            <span>{busyAction === 'target' ? 'Setting...' : 'Set Target'}</span>
          </button>

          <a
            href={selectedTgToken.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open t.me</span>
          </a>

          <button
            type="button"
            onClick={(e) => handleCopy(e, selectedTgToken.href)}
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 cursor-pointer"
          >
            {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedLink ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      )}
    </div>
  );
});

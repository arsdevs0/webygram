import React, { useState } from 'react';
import { X, BarChart2, Plus, Trash2, Loader2, Check } from 'lucide-react';
import { telegramService } from '../../services/telegramService';
import { preparePollDraft } from '../../utils/pollDraft';
import { useEscapeDismiss } from '../common/useEscapeDismiss';

interface Props {
  isOpen: boolean;
  chatId: string;
  topMsgId?: number;
  onClose: () => void;
  onCreated?: (scheduled: boolean) => void;
  onNotify?: (msg: string) => void;
}

export const PollComposerModal: React.FC<Props> = ({
  isOpen,
  chatId,
  topMsgId,
  onClose,
  onCreated,
  onNotify,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [isQuiz, setIsQuiz] = useState(false);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [anonymousVoting, setAnonymousVoting] = useState(true);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [solution, setSolution] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeDismiss(isOpen && !submitting, onClose);

  if (!isOpen) return null;

  const validOptions = options.map((o) => o.trim()).filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!question.trim() || validOptions.length < 2) {
      setError('Enter a question and at least 2 answer options.');
      return;
    }

    setSubmitting(true);
    try {
      const draft = preparePollDraft(options, isQuiz, correctIndex, scheduleEnabled, scheduleDateTime);
      await telegramService.sendPoll({
        chatId,
        question: question.trim(),
        options: draft.options,
        quiz: isQuiz,
        multipleChoice: isQuiz ? false : multipleChoice,
        publicVoters: !anonymousVoting,
        correctOptionIndex: draft.correctOptionIndex,
        solution: isQuiz && solution.trim() ? solution.trim() : undefined,
        topMsgId,
        scheduleDate: draft.scheduleDate,
      });
      setQuestion('');
      setOptions(['', '']);
      setSolution('');
      setScheduleEnabled(false);
      onCreated?.(Boolean(draft.scheduleDate));
      onClose();
    } catch (err) {
      const msg = (err as Error).message || 'Could not create poll.';
      setError(msg);
      onNotify?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={() => { if (!submitting) onClose(); }}
      role="dialog" aria-modal="true" aria-label="Create poll" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md max-h-[88vh] rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline shadow-2xl flex flex-col overflow-hidden text-ink dark:text-ink"
      >
        <div className="px-4 py-3 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Create Poll</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-muted hover:text-ink dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted dark:text-muted block">
              Poll Question
            </label>
            <input
              type="text"
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              className="w-full px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-muted dark:text-muted">
                Answer Options ({options.length}/10)
              </label>
              {isQuiz && (
                <span className="text-[10.5px] text-primary font-medium">
                  Select correct answer
                </span>
              )}
            </div>

            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {isQuiz && (
                  <button
                    type="button"
                    onClick={() => setCorrectIndex(idx)}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
                      correctIndex === idx
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-outline dark:border-outline'
                    }`}
                    title="Mark as correct option"
                  >
                    {correctIndex === idx && <Check className="w-3 h-3" />}
                  </button>
                )}
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const copy = [...options];
                    copy[idx] = e.target.value;
                    setOptions(copy);
                  }}
                  placeholder={`Option ${idx + 1}`}
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline focus:outline-none focus:border-primary"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOptions(options.filter((_, i) => i !== idx));
                      setCorrectIndex(current => current === idx ? 0 : current > idx ? current - 1 : current);
                    }}
                    className="p-1.5 text-muted hover:text-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}

            {options.length < 10 && (
              <button
                type="button"
                onClick={() => setOptions([...options, ''])}
                className="w-full py-2 rounded-xl border border-dashed border-outline dark:border-outline text-primary font-medium flex items-center justify-center gap-1.5 hover:bg-hover dark:hover:bg-hover cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Option</span>
              </button>
            )}
          </div>

          <div className="rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline divide-y divide-outline dark:divide-outline">
            <label className="px-3 py-2.5 flex items-center justify-between cursor-pointer">
              <span>Anonymous Voting</span>
              <input
                type="checkbox"
                checked={anonymousVoting}
                onChange={(e) => setAnonymousVoting(e.target.checked)}
                className="accent-primary"
              />
            </label>
            <label className="px-3 py-2.5 flex items-center justify-between cursor-pointer">
              <span>Multiple Answers</span>
              <input
                type="checkbox"
                checked={isQuiz ? false : multipleChoice}
                disabled={isQuiz}
                onChange={(e) => setMultipleChoice(e.target.checked)}
                className="accent-primary"
              />
            </label>
            <label className="px-3 py-2.5 flex items-center justify-between cursor-pointer">
              <span>Quiz Mode (1 right answer)</span>
              <input
                type="checkbox"
                checked={isQuiz}
                onChange={(e) => {
                  setIsQuiz(e.target.checked);
                  if (e.target.checked) setMultipleChoice(false);
                }}
                className="accent-primary"
              />
            </label>
          </div>

          {isQuiz && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted dark:text-muted block">
                Quiz Explanation (optional)
              </label>
              <textarea
                rows={2}
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                placeholder="Shown when someone picks an option..."
                className="w-full px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline focus:outline-none focus:border-primary resize-none"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="accent-primary"
              />
              <span>Schedule Poll for later</span>
            </label>
            {scheduleEnabled && (
              <input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline text-xs"
              />
            )}
          </div>

          {error && <p className="text-[11px] text-rose-500">{error}</p>}
        </div>

        <div className="p-3 border-t border-outline dark:border-outline bg-surface-low dark:bg-canvas flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3.5 py-2 rounded-xl bg-surface dark:bg-elevated border border-outline dark:border-outline text-xs font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !question.trim() || validOptions.length < 2}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{scheduleEnabled ? 'Schedule Poll' : 'Create Poll'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

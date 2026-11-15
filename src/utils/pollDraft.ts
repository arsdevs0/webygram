export function preparePollDraft(options: string[], quiz: boolean, correctIndex: number, scheduleEnabled: boolean, date: string, now = Date.now()) {
  const entries = options.map((text, index) => ({ text: text.trim(), index })).filter(option => option.text);
  if (entries.length < 2) throw new Error('Enter at least 2 answer options.');
  const correctOptionIndex = entries.findIndex(option => option.index === correctIndex);
  if (quiz && correctOptionIndex < 0) throw new Error('Select a non-empty correct answer.');
  let scheduleDate: number | undefined;
  if (scheduleEnabled) {
    const timestamp = Date.parse(date);
    if (!Number.isFinite(timestamp) || timestamp <= now) throw new Error('Choose a future date and time for this poll.');
    scheduleDate = Math.floor(timestamp / 1000);
  }
  return { options: entries.map(option => option.text), correctOptionIndex: quiz ? correctOptionIndex : undefined, scheduleDate };
}

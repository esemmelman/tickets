import * as chrono from 'chrono-node';
import type { Draft, Priority, Status } from './types';
// Recognize explicit metadata phrases; do not turn "high school" or "open door" into metadata.
export function parseVoice(input: string, reference = new Date(), defaults?: Draft): Draft {
  const date = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, '0')}-${String(reference.getDate()).padStart(2, '0')}`;
  let title = input.trim().replace(/^(?:add|create)\s+(?:a\s+)?(?:new\s+)?ticket\s*(?:called|titled|for)?\s*/i, '').replace(/^title\s+/i, '');
  let priority: Priority | null = defaults ? defaults.priority : 'Medium';
  let status: Status | null = defaults ? defaults.status : 'Open';
  title = title.replace(/\b(?:(?:set\s+)?priority\s*(?:to|is)?\s*(low|medium|normal|high|urgent|critical)|(low|medium|normal|high|urgent|critical)\s+priority)\b/gi, (_, a, b) => {
    const p = (a || b).toLowerCase();
    priority = ({ low: 'Low', medium: 'Medium', normal: 'Medium', high: 'High', urgent: 'Urgent', critical: 'Urgent' } as const)[p as 'low'];
    return '';
  });
  title = title.replace(/\b(?:status\s*(?:is|to)?|mark\s+(?:it\s+)?(?:as\s+)?)\s*(in progress|in-progress|working|waiting|on hold|pending|done|completed|complete|closed|cancelled|canceled|open)\b/gi, (_, s: string) => {
    status = /progress|working/i.test(s) ? 'In progress' : /waiting|hold|pending/i.test(s) ? 'Waiting' : /done|complet|closed/i.test(s) ? 'Done' : /cancel/i.test(s) ? 'Cancelled' : 'Open';
    return '';
  });
  let due_date = defaults ? defaults.due_date : date;
  const dates = chrono.parse(title, reference, { forwardDate: true });
  if (dates.length) {
    const match = dates[0];
    const d = match.start.date();
    due_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const before = title.slice(0, match.index).replace(/\b(?:due(?:\s+date)?(?:\s+(?:is|on|by))?|on|by|for)\s*$/i, '');
    title = before + title.slice(match.index + match.text.length);
  }
  title = title.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();
  title = title.replace(/\p{L}/u, letter => letter.toLocaleUpperCase());
  return { title, due_date, priority, status, description: '' };
}

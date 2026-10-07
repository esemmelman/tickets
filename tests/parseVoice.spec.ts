import { test, expect } from '@playwright/test';
import { parseVoice } from '../src/parseVoice';
const today = new Date(2026, 8, 26, 12);
test('extracts title, relative date, priority, and status', () => {
  expect(parseVoice('Call the plumber due tomorrow high priority status in progress', today)).toEqual({ title: 'Call the plumber', due_date: '2026-09-27', priority: 'High', status: 'In progress', description: '' });
});
test('defaults to local today and medium, preserves ordinary words', () => {
  expect(parseVoice('Open the high school door', today)).toMatchObject({ title: 'Open the high school door', due_date: '2026-09-26', priority: 'Medium', status: 'Open' });
});
test('recognizes absolute dates and alternate status words', () => {
  expect(parseVoice('Add a ticket called Renew insurance due October 15 priority urgent mark it as completed', today)).toMatchObject({ title: 'Renew insurance', due_date: '2026-10-15', priority: 'Urgent', status: 'Done' });
});
test('empty metadata-only utterance does not invent a title', () => {
  expect(parseVoice('due tomorrow high priority status open', today).title).toBe('');
});

test('voice uses Aubree for the recognized name Aubrey', () => {
  expect(parseVoice("call aubrey about Aubrey's appointment", today).title).toBe("Call Aubree about Aubree's appointment");
  expect(parseVoice('Call Aubreys office', today).title).toBe('Call Aubreys office');
});


test('trailing no date clears the due date and is removed from the title', () => {
  expect(parseVoice('Call plumber no date', today)).toMatchObject({ title: 'Call plumber', due_date: null });
  expect(parseVoice('Call plumber high priority NO DATE.', today)).toMatchObject({ title: 'Call plumber', due_date: null, priority: 'High' });
  expect(parseVoice('Call plumber due tomorrow no date!', today)).toMatchObject({ title: 'Call plumber', due_date: null });
  expect(parseVoice('Call plumber no date', today, { title: '', description: '', due_date: '2026-10-15', priority: 'Low', status: 'Waiting' })).toMatchObject({ title: 'Call plumber', due_date: null, priority: 'Low', status: 'Waiting' });
  expect(parseVoice('No date', today)).toMatchObject({ title: '', due_date: null });
  expect(parseVoice('Check why there is no date on the form', today)).toMatchObject({ title: 'Check why there is no date on the form', due_date: '2026-09-26' });
});

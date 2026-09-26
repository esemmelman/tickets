import { test, expect, type Page } from '@playwright/test';
const userId = 'bdfe3c81-3e96-4928-aa91-dc4ebabb7e87';
async function mockApp(page: Page, ageDays = 0) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = `e30.${Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, amr: [{ method: 'password', timestamp: now - ageDays * 86400 }] })).toString('base64url')}.mock`;
  await page.addInitScript(({ jwt, now, userId }) => { localStorage.setItem('personal-tickets-auth-v1', JSON.stringify({ access_token: jwt, refresh_token: 'mock-refresh', token_type: 'bearer', expires_at: now + 3600, expires_in: 3600, user: { id: userId, email: 'owner@example.com', app_metadata: {}, user_metadata: {} } })); }, { jwt, now, userId });
  let tickets: any[] = [];
  let comments: any[] = [];
  let attachments: any[] = [];
  await page.route('https://fgomaujsdblpzxhnnqrg.supabase.co/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const table = url.pathname.split('/').pop(); const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 200 });
    if (!url.pathname.includes('/rest/v1/')) return route.fulfill({ json: {} });
    let records = table === 'personal_tickets' ? tickets : table === 'personal_ticket_comments' ? comments : attachments;
    let result: any = records;
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const ticketId = url.searchParams.get('ticket_id')?.replace('eq.', '');
    if (method === 'POST') { const data = req.postDataJSON(); const item = { ...data, id: table === 'personal_tickets' ? 1001 + tickets.length : crypto.randomUUID(), user_id: userId, archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; records.push(item); result = item; }
    else if (method === 'PATCH') { const item = records.find(t => String(t.id) === id); Object.assign(item, req.postDataJSON()); result = item; }
    else if (method === 'DELETE') { records = records.filter(t => String(t.id) !== id); if (table === 'personal_tickets') tickets = records; else if (table === 'personal_ticket_comments') comments = records; else attachments = records; result = null; }
    else if (ticketId) result = records.filter(t => String(t.ticket_id) === ticketId);
    return route.fulfill({ json: result, headers: { 'content-range': `0-${records.length}/${records.length}` } });
  });
  return { getTickets: () => tickets };
}
test('CRUD, comments, find, archive, restore, delete', async ({ page }) => {
  await mockApp(page); await page.goto('./');
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).fill('Fix kitchen faucet');
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: /#1001 Fix kitchen faucet/ })).toBeVisible();
  await page.getByRole('button', { name: /#1001 Fix kitchen faucet/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ticket title').fill('Fix bathroom faucet');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await dialog.getByRole('textbox', { name: 'Comment', exact: true }).fill('Call the plumber');
  await dialog.getByRole('button', { name: 'Add comment' }).click();
  await expect(dialog.getByText('Call the plumber', { exact: true })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Comment', exact: true }).fill('Parts ordered');
  await dialog.getByRole('button', { name: 'Add comment' }).click();
  await expect(dialog.locator('.comment')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Edit comment', exact: true }).first().click();
  await dialog.getByRole('textbox', { name: 'Comment', exact: true }).fill('Plumber scheduled');
  await dialog.getByRole('button', { name: 'Save comment' }).click();
  await expect(dialog.getByText('Plumber scheduled', { exact: true })).toBeVisible();
  page.once('dialog', d => d.accept());
  await dialog.getByRole('button', { name: 'Delete comment', exact: true }).last().click();
  await expect(dialog.locator('.comment')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close ticket' }).click();
  await page.getByRole('button', { name: /^Archive 1/ }).click();
  await page.getByRole('textbox', { name: 'Find tickets' }).fill('bathroom');
  await page.getByRole('button', { name: /#1001 Fix bathroom faucet/ }).click();
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete ticket', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /#1001/ })).toHaveCount(0);
});
test('90-day session expires even when token expiry is in the future', async ({ page }) => {
  await mockApp(page, 91); await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Please sign in again to start a new 90-day session.')).toBeVisible();
});
test('mobile layout and empty title validation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockApp(page); await page.goto('./');
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).fill('   ');
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
async function mockVoice(page: Page) {
  await page.addInitScript(() => {
    class MockRecognition {
      onresult: any; onend: any; onerror: any;
      constructor() { (window as any).recognition = this; }
      start() {} stop() { this.onend?.(); } abort() {}
    }
    (window as any).SpeechRecognition = MockRecognition;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => ({ getTracks: () => [{ stop() {} }] }) });
    (window as any).AudioContext = class { async resume() {} async close() {} createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(data: Float32Array) { data.fill(0); } }; } createMediaStreamSource() { return { connect() {} }; } };
  });
}
test('voice saves once after 3 seconds of silence with parsed fields', async ({ page }) => {
  const state = await mockApp(page); await mockVoice(page); await page.goto('./');
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).recognition);
  await page.evaluate(() => (window as any).recognition.onresult({ results: [[{ transcript: 'Call plumber tomorrow high priority status waiting' }]] }));
  await expect(page.getByRole('button', { name: /#1001 Call plumber/ })).toBeVisible({ timeout: 6000 });
  expect(state.getTickets()).toHaveLength(1);
  expect(state.getTickets()[0]).toMatchObject({ priority: 'High', status: 'Waiting' });
});
test('second voice tap preserves draft without saving', async ({ page }) => {
  const state = await mockApp(page); await mockVoice(page); await page.goto('./');
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).recognition);
  await page.evaluate(() => (window as any).recognition.onresult({ results: [[{ transcript: 'Order printer ink' }]] }));
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ticket title', exact: true })).toHaveValue('Order printer ink');
  await page.waitForTimeout(3300);
  expect(state.getTickets()).toHaveLength(0);
});
test('failed save keeps the draft', async ({ page }) => {
  await mockApp(page); await page.route('**/rest/v1/personal_tickets*', async route => { if (route.request().method() === 'POST') await route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } }); else await route.fallback(); });
  await page.goto('./'); await page.getByRole('textbox', { name: 'Ticket title', exact: true }).fill('Keep my ticket');
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  await expect(page.getByRole('textbox', { name: 'Ticket title', exact: true })).toHaveValue('Keep my ticket');
});
test('upload, download, and remove a ticket attachment', async ({ page }) => {
  await mockApp(page); await page.goto('./');
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).fill('Invoice');
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).press('Enter');
  await page.getByRole('button', { name: /#1001 Invoice/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Upload files').setInputFiles({ name: 'receipt.txt', mimeType: 'text/plain', buffer: Buffer.from('Receipt contents') });
  await expect(dialog.getByText('receipt.txt', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download receipt.txt', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('receipt.txt');
  page.once('dialog', d => d.accept());
  await dialog.getByRole('button', { name: 'Delete receipt.txt', exact: true }).click();
  await expect(dialog.getByText('receipt.txt', { exact: true })).toHaveCount(0);
});
test('desktop and mobile display populated ticket details without overflow', async ({ page }) => {
  await mockApp(page); await page.goto('./');
  for (const title of ['Schedule car service', 'Renew home insurance', 'Replace kitchen tap']) {
    await page.getByRole('textbox', { name: 'Ticket title', exact: true }).fill(title);
    await page.getByRole('textbox', { name: 'Ticket title', exact: true }).press('Enter');
    await expect(page.getByRole('textbox', { name: 'Ticket title', exact: true })).toHaveValue('');
  }
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /#1001 Schedule car service/ }).click();
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-detail.png', fullPage: true });
});
test('typed content waits for Enter and rejects whitespace', async ({ page }) => {
  const state = await mockApp(page); await page.goto('./');
  const input = page.getByRole('textbox', { name: 'Ticket title', exact: true });
  await expect(input).not.toHaveAttribute('placeholder');
  await input.fill('   '); await input.press('Enter');
  await page.waitForTimeout(3200);
  expect(state.getTickets()).toHaveLength(0);
  await input.fill('Typed title');
  await page.waitForTimeout(3300);
  expect(state.getTickets()).toHaveLength(0);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: /#1001 Typed title/ })).toBeVisible();
  expect(state.getTickets()).toHaveLength(1);
});
test('Enter while recording saves once and cancels the silence timer', async ({ page }) => {
  const state = await mockApp(page); await mockVoice(page); await page.goto('./');
  const input = page.getByRole('textbox', { name: 'Ticket title', exact: true });
  await input.click();
  await page.waitForFunction(() => !!(window as any).recognition);
  await page.evaluate(() => (window as any).recognition.onresult({ results: [[{ transcript: 'Order new keyboard' }]] }));
  await input.press('Enter');
  await expect(page.getByRole('button', { name: /#1001 Order new keyboard/ })).toBeVisible();
  await page.waitForTimeout(3300);
  expect(state.getTickets()).toHaveLength(1);
});
test('inline controls save without opening details; only the title opens them', async ({ page }) => {
  const state = await mockApp(page); await page.goto('./');
  const input = page.getByRole('textbox', { name: 'Ticket title', exact: true });
  await input.fill('Inline editing'); await input.press('Enter');
  await page.getByLabel('Status for ticket 1001').selectOption('Waiting');
  await expect(page.getByLabel('Status for ticket 1001')).toHaveValue('Waiting');
  await page.getByLabel('Priority for ticket 1001').selectOption('Urgent');
  await expect(page.getByLabel('Priority for ticket 1001')).toHaveValue('Urgent');
  await page.getByLabel('Due date for ticket 1001').fill('2026-12-15');
  await expect(page.getByLabel('Due date for ticket 1001')).toHaveValue('2026-12-15');
  await page.locator('.ticket-row .number').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.getTickets()[0]).toMatchObject({ status: 'Waiting', priority: 'Urgent', due_date: '2026-12-15' });
  await page.getByRole('button', { name: /#1001 Inline editing/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
test('failed inline update keeps the saved value and reports an error', async ({ page }) => {
  await mockApp(page); await page.goto('./');
  const input = page.getByRole('textbox', { name: 'Ticket title', exact: true });
  await input.fill('Retry update'); await input.press('Enter');
  await page.route('**/rest/v1/personal_tickets*', async route => { if (route.request().method() === 'PATCH') await route.fulfill({ status: 503, json: { message: 'Update unavailable' } }); else await route.fallback(); });
  await page.getByLabel('Status for ticket 1001').selectOption('Done');
  await expect(page.getByRole('alert')).toContainText('Update unavailable');
  await expect(page.getByLabel('Status for ticket 1001')).toHaveValue('Open');
});
test('empty microphone stops after three seconds without a banner or ticket', async ({ page }) => {
  const state = await mockApp(page); await mockVoice(page); await page.goto('./');
  await page.getByRole('textbox', { name: 'Ticket title', exact: true }).click();
  await expect(page.locator('.composer')).toHaveClass(/is-listening/);
  await expect(page.locator('.composer')).not.toHaveClass(/is-listening/, { timeout: 4500 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(state.getTickets()).toHaveLength(0);
});
test('typing during recording cancels auto-save and keeps cursor clicks in typing mode', async ({ page }) => {
  const state = await mockApp(page); await mockVoice(page); await page.goto('./');
  const input = page.getByRole('textbox', { name: 'Ticket title', exact: true });
  await input.click();
  await page.waitForFunction(() => !!(window as any).recognition);
  await page.evaluate(() => (window as any).recognition.onresult({ results: [[{ transcript: 'Spoken draft' }]] }));
  await input.fill('Edited draft');
  await input.click();
  await expect(page.locator('.composer')).not.toHaveClass(/is-listening/);
  await page.waitForTimeout(3500);
  expect(state.getTickets()).toHaveLength(0);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: /#1001 Edited draft/ })).toBeVisible();
});
test('compact rows sort by date then title ascending with undated tickets last', async ({ page }) => {
  await mockApp(page); await page.goto('./');
  const input = page.getByRole('textbox', { name: 'Ticket title', exact: true });
  for (const title of ['Zulu', 'Alpha', 'Earlier', 'Undated']) {
    await input.fill(title); await input.press('Enter'); await expect(input).toHaveValue('');
  }
  await page.getByLabel('Due date for ticket 1001').fill('2026-12-15');
  await expect(page.getByLabel('Due date for ticket 1001')).toBeEnabled();
  await page.getByLabel('Due date for ticket 1002').fill('2026-12-15');
  await expect(page.getByLabel('Due date for ticket 1002')).toBeEnabled();
  await page.getByLabel('Due date for ticket 1003').fill('2026-12-14');
  await expect(page.getByLabel('Due date for ticket 1003')).toBeEnabled();
  await page.getByLabel('Due date for ticket 1004').fill('');
  await expect(page.locator('.ticket-title-button')).toHaveText(['Earlier', 'Alpha', 'Zulu', 'Undated']);
  const row = await page.locator('.ticket-row').first().boundingBox();
  expect(row!.height).toBeLessThanOrEqual(48);
});

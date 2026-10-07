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
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => ({ getTracks: () => [{ stop() {} }] }) });
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


test('composer metadata is saved with a typed title', async ({ page }) => {
  const state = await mockApp(page); await page.goto('./');
  const composer = page.getByRole('region', { name: 'Add ticket', exact: true });
  await composer.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Waiting');
  await composer.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('Urgent');
  await composer.getByLabel('Due date', { exact: true }).fill('2026-12-15');
  await composer.getByLabel('Ticket title', { exact: true }).fill('Selected fields');
  await composer.getByLabel('Ticket title', { exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: /#1001 Selected fields/ })).toBeVisible();
  expect(state.getTickets()[0]).toMatchObject({ status: 'Waiting', priority: 'Urgent', due_date: '2026-12-15' });
});

test('Android voice uses recognition without a second microphone and keeps default metadata', async ({ page }) => {
  const state = await mockApp(page); await mockVoice(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Android Chrome' });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new Error('Second microphone must not be opened'); } });
  });
  await page.goto('./');
  const composer = page.getByRole('region', { name: 'Add ticket', exact: true });
  await expect(composer.getByRole('combobox')).toHaveCount(0);
  await composer.getByLabel('Ticket title', { exact: true }).click();
  await page.evaluate(() => {
    const recognition = (window as any).recognition;
    recognition.onstart();
    recognition.onresult({ results: [[{ transcript: 'Call mechanic' }]] });
    recognition.onend();
  });
  await expect(page.getByRole('button', { name: /#1001 Call mechanic/ })).toBeVisible({ timeout: 6000 });
  expect(state.getTickets()).toHaveLength(1);
  expect(state.getTickets()[0].priority).toBe('Medium');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('microphone permission errors are visible and preserve the draft', async ({ page }) => {
  const state = await mockApp(page); await mockVoice(page); await page.goto('./');
  await page.getByLabel('Ticket title', { exact: true }).click();
  await page.waitForFunction(() => !!(window as any).recognition);
  await page.evaluate(() => {
    const recognition = (window as any).recognition;
    recognition.onresult({ results: [[{ transcript: 'Keep spoken title' }]] });
    recognition.onerror({ error: 'not-allowed' });
  });
  await expect(page.getByRole('alert')).toContainText('Microphone access was denied');
  await expect(page.getByLabel('Ticket title', { exact: true })).toHaveValue('Keep spoken title');
  expect(state.getTickets()).toHaveLength(0);
});


test('default view excludes Done and Cancelled but explicit status filters can show them', async ({ page }) => {
  await mockApp(page); await page.goto('./');
  const input = page.getByLabel('Ticket title', { exact: true });
  for (const title of ['Open task', 'Finished task', 'Cancelled task', 'No status task']) {
    await input.fill(title); await input.press('Enter'); await expect(input).toHaveValue('');
  }
  await page.getByLabel('Status for ticket 1002').selectOption('Done');
  await expect(page.getByLabel('Status for ticket 1002')).toHaveCount(0);
  await page.getByLabel('Status for ticket 1003').selectOption('Cancelled');
  await expect(page.getByLabel('Status for ticket 1003')).toHaveCount(0);
  await page.getByLabel('Status for ticket 1004').selectOption('');
  await expect(page.getByLabel('Status for ticket 1004')).toBeEnabled();
  await page.reload();
  await expect(page.locator('.ticket-title-button')).toHaveText(['No status task', 'Open task']);
  await expect(page.getByRole('button', { name: 'Active 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive 0', exact: true })).toBeVisible();
  await page.getByLabel('Filter status').selectOption('Done');
  await expect(page.locator('.ticket-title-button')).toHaveText(['Finished task']);
  await page.getByLabel('Filter status').selectOption('Cancelled');
  await expect(page.locator('.ticket-title-button')).toHaveText(['Cancelled task']);
  await page.getByLabel('Filter status').selectOption('all');
  await expect(page.locator('.ticket-title-button')).toHaveCount(4);
});

 test('Android long press reveals editable fields, tap opens details, and scrolling cancels the hold', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Android Chrome' }));
  const state = await mockApp(page); await page.goto('./');
  const composer = page.getByRole('region', { name: 'Add ticket', exact: true });
  await expect(composer.getByLabel('Due date', { exact: true })).toHaveCount(0);
  await expect(composer.getByRole('combobox')).toHaveCount(0);
  const input = composer.getByLabel('Ticket title', { exact: true });
  await input.fill('Android task'); await input.press('Enter');
  const row = page.locator('.ticket-row');
  await expect(row).toBeVisible();
  const status = page.getByLabel('Status for ticket 1001');
  await expect(status).toBeHidden();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + 12, box.y + 15);
  await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
  await expect(status).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await status.selectOption('Waiting');
  await expect(status).toBeEnabled();
  await page.getByLabel('Priority for ticket 1001').selectOption('Urgent');
  await expect(page.getByLabel('Priority for ticket 1001')).toBeEnabled();
  await page.getByLabel('Due date for ticket 1001').fill('2026-12-15');
  await expect(page.getByLabel('Due date for ticket 1001')).toBeEnabled();
  expect(state.getTickets()[0]).toMatchObject({ status: 'Waiting', priority: 'Urgent', due_date: '2026-12-15' });
  await page.getByRole('button', { name: 'Hide fields' }).click();
  await expect(status).toBeHidden();
  await row.dispatchEvent('pointerdown', { isPrimary: true, button: 0, clientX: 25, clientY: 25 });
  await row.dispatchEvent('pointermove', { clientX: 25, clientY: 65 });
  await row.dispatchEvent('pointercancel');
  await page.waitForTimeout(600);
  await expect(status).toBeHidden();
  await row.locator('.number').click();
  await expect(page.getByRole('dialog')).toBeVisible();
 });


test('Android search is revealed by holding the composer and Archive is selected through status', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Android Chrome' }));
  await mockApp(page); await mockVoice(page); await page.goto('./');
  const input = page.getByLabel('Ticket title', { exact: true });
  await expect(page.getByLabel('Find tickets')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Ticket views' })).toHaveCount(0);
  await input.fill('Archived task'); await input.press('Enter');
  const title = page.getByRole('button', { name: '#1001 Archived task' });
  await expect(title).toBeVisible();
  expect(await page.locator('.ticket-row .number').textContent()).toBe('#1001  ');
  await expect(page.locator('.ticket-row .status-icon')).toBeHidden();
  await title.click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Close ticket' }).click();
  await expect(title).toHaveCount(0);
  await page.getByLabel('Filter status').selectOption('archive');
  await expect(title).toBeVisible();
  const box = (await input.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 15);
  await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
  const search = page.getByLabel('Find tickets');
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();
  await expect(page.locator('.composer')).not.toHaveClass(/is-listening/);
  await search.fill('absent'); await expect(title).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide search' }).click();
  await expect(search).toHaveCount(0); await expect(title).toBeVisible();
  await page.getByLabel('Filter status').selectOption('');
  await expect(title).toHaveCount(0);
  await page.getByLabel('Filter status').selectOption('archive');
  await title.click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('button', { name: 'Close ticket' }).click();
  await page.getByLabel('Filter status').selectOption('');
  await expect(title).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/android-compact.png', fullPage: true });
});

for (const android of [false, true]) {
  test(`D marks a ticket Done without opening details (${android ? 'Android' : 'desktop'})`, async ({ page }) => {
    if (android) {
      await page.setViewportSize({ width: 393, height: 851 });
      await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Android Chrome' }));
    }
    const state = await mockApp(page);
    await page.goto('./');
    const input = page.getByRole('textbox', { name: 'Ticket title', exact: true });
    await input.fill('Complete this task');
    await input.press('Enter');
    await page.getByRole('button', { name: 'Mark ticket 1001 Done', exact: true }).click();
    await expect(page.locator('.ticket-row')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.getTickets()[0].status).toBe('Done');
    await page.getByLabel('Filter status').selectOption('Done');
    await expect(page.getByRole('button', { name: 'Mark ticket 1001 Done', exact: true })).toBeDisabled();
  });
}

test('Android titles flow across lines and keep the date with D', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Android Chrome' }));
  await mockApp(page); await page.goto('./');
  const input = page.getByLabel('Ticket title', { exact: true });
  for (const title of ['Fix the kitchen clock', 'Do swim reimbursement', 'Make appt for Aubree at UCI for 3 to 4 mos. with Dr. Cro']) {
    await input.fill(title); await input.press('Enter');
    await expect(page.locator('.ticket-title-button').filter({ hasText: title })).toBeVisible();
  }
  await page.evaluate(() => document.fonts.ready);
  const clock = page.getByRole('button', { name: '#1001 Fix the kitchen clock', exact: true });
  expect(await clock.evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length; })).toBe(1);
  for (const width of [393, 360]) {
    await page.setViewportSize({ width, height: 851 });
    for (const row of await page.locator('.ticket-row').all()) {
      const date = (await row.locator('time').boundingBox())!;
      const done = (await row.locator('.ticket-done').boundingBox())!;
      expect(Math.abs(date.y + date.height / 2 - done.y - done.height / 2)).toBeLessThan(5);
      expect(done.x).toBeGreaterThan(date.x + date.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/android-date-done.png', fullPage: true });
  await clock.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
});


test('No date persists when creating and editing tickets', async ({ page }) => {
  const state = await mockApp(page); await page.goto('./');
  const composer = page.locator('.composer');
  await composer.getByRole('button', { name: 'No date', exact: true }).click();
  await composer.getByRole('textbox', { name: 'Ticket title', exact: true }).fill('Undated task');
  await composer.getByRole('textbox', { name: 'Ticket title', exact: true }).press('Enter');
  const row = page.locator('.ticket-row').first();
  const date = row.getByLabel('Due date for ticket 1001', { exact: true });
  await expect(date).toHaveValue('');
  expect(state.getTickets()[0].due_date).toBeNull();
  await date.fill('2027-01-10');
  await expect.poll(() => state.getTickets()[0].due_date).toBe('2027-01-10');
  await row.getByRole('button', { name: 'No date for ticket 1001', exact: true }).click();
  await expect.poll(() => state.getTickets()[0].due_date).toBeNull();
  await date.fill('2027-01-11');
  await expect.poll(() => state.getTickets()[0].due_date).toBe('2027-01-11');
  await page.getByRole('button', { name: '#1001 Undated task', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'No date', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => state.getTickets()[0].due_date).toBeNull();
  await dialog.getByRole('button', { name: 'Close ticket' }).click();
  await page.reload();
  await expect(page.getByLabel('Due date for ticket 1001', { exact: true })).toHaveValue('');
});

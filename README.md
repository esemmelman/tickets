# Tickets · v1.0.16

Personal tickets at https://esemmelman.github.io/tickets/ with the existing **bnaimitzvah** Supabase backend. Sign in with your existing Supabase Auth email and password (not a database or dashboard password).

- Opens in the Active view by default, excluding Done and Cancelled tickets. Choose All statuses or a specific status to see completed or cancelled tickets.
- Add, edit, permanently delete, archive, restore, search, filter, and sort tickets. Compact rows default to due date ascending, then title ascending; undated tickets appear last.
- IDs start at 1001 and increment by one. Deleted IDs are never reused; PostgreSQL can leave gaps after failed insertions.
- Press lowercase d one space after a ticket’s date to mark it Done directly from the list. Android titles wrap naturally, with the date and d kept together and ticket numbers aligned to the first line.
- Tickets due today use a medium red row background, based on the device's local date.
- Only title is required. Defaults: today's local date, Medium priority, Open status. Date, priority, and status can be cleared.
- Multiple editable comments and private file attachments (25 MB each).
- On Android, a compact title input sits at the top of the workspace without summary counts. Archive is available in the status dropdown instead of a separate tabs row. Long press the title input to reveal search; Hide search clears and collapses it. Ticket rows have no leading status icon and titles align in a consistent column after their IDs, followed by the due date (or No date). Tap a saved ticket to open its full details; long press it to reveal status, priority, and due date controls that save directly. Use Hide fields to collapse them. New tickets keep the usual defaults. On desktop, metadata remains editable in the input bar and ticket rows.
- Tap the blank input to dictate in Android Chrome, allowing microphone access. Three seconds of silence stops recording silently and saves only when a title was captured. Tap again to stop and keep the draft without saving. Type in the same input to use the keyboard; typing cancels recording and auto-save for that draft; press Enter to save. Enter saves immediately, including while recording. On desktop, clicking a saved ticket title opens its details. Status and priority dropdowns and a date picker save changes directly in the list.
- Voice titles automatically capitalize their first letter and correct the recognized name Aubrey to Aubree.
- Example: “Call the plumber due tomorrow high priority status in progress.” Date extraction uses chrono-node; metadata uses explicit priority/status phrases to avoid removing ordinary title words. This is deterministic natural-language parsing, not a generative AI service.
- Voice uses browser speech recognition, with Web Audio silence detection on desktop and recognition event timers on Android. Android lets the recognition service own the microphone; microphone errors are shown above the list. Browser recognition may send audio to its provider and needs an internet connection. Test the microphone on your physical Android device; automated tests simulate browser audio events.
- Password sessions persist on the device and ticket/file RLS rejects password authentication older than 90 days. Changing passwords, signing out, clearing browser storage, or existing project session settings can require earlier sign-in. Other project applications and their auth configuration are unchanged.

## Development

```sh
npm ci
npm run dev
npm run build
npx playwright install chromium
npm test
```

The browser contains only the project's publishable key. There are no database passwords, service-role keys, or user passwords in the repository. RLS isolates tickets by authenticated user, including attachments and comments. Storage downloads require a current authenticated request, without public or long-lived signed URLs.

SQL migrations are in `supabase/migrations/`. Tables are prefixed `personal_ticket`; bucket is `personal-ticket-files`. Do not reset this shared Supabase project or push unrelated migrations. New backend changes should be reviewed and applied as targeted migrations.

## Updating the app

After a release deploys, reload https://esemmelman.github.io/tickets/ on your phone. If using a home-screen shortcut, close and reopen it, or open the URL in Chrome and reload. Check the version beside Tickets. The app does not register a service worker.

## Releases

Run `npm run version:patch`, update this README's version, test, commit, and push to `main`. GitHub Actions builds, tests, and deploys every push to GitHub Pages. The displayed version comes from package.json. Never commit `.env` files or credentials.

Supabase Auth sessions: https://supabase.com/docs/guides/auth/sessions

Browser voice API: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

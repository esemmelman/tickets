# Tickets · v1.0.3

Personal tickets at https://esemmelman.github.io/tickets/ with the existing **bnaimitzvah** Supabase backend. Sign in with your existing Supabase Auth email and password (not a database or dashboard password).

- Add, edit, permanently delete, archive, restore, search, filter, and sort tickets. Compact rows default to due date ascending, then title ascending; undated tickets appear last.
- IDs start at 1001 and increment by one. Deleted IDs are never reused; PostgreSQL can leave gaps after failed insertions.
- Only title is required. Defaults: today's local date, Medium priority, Open status. Date, priority, and status can be cleared.
- Multiple editable comments and private file attachments (25 MB each).
- Tap the blank input to dictate in Android Chrome, allowing microphone access. Three seconds of silence stops recording silently and saves only when a title was captured. Tap again to stop and keep the draft without saving. Type in the same input to use the keyboard; typing cancels recording and auto-save for that draft; press Enter to save. Enter saves immediately, including while recording. Only clicking a saved ticket title opens its details. Status and priority dropdowns and a date picker save changes directly in the list.
- Example: “Call the plumber due tomorrow high priority status in progress.” Date extraction uses chrono-node; metadata uses explicit priority/status phrases to avoid removing ordinary title words. This is deterministic natural-language parsing, not a generative AI service.
- Voice uses browser speech recognition and Web Audio silence detection. Browser recognition may send audio to its provider and needs an internet connection. Test the microphone on your physical Android device; automated tests simulate browser audio events.
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

## Releases

Run `npm run version:patch`, update this README's version, test, commit, and push to `main`. GitHub Actions builds, tests, and deploys every push to GitHub Pages. The displayed version comes from package.json. Never commit `.env` files or credentials.

Supabase Auth sessions: https://supabase.com/docs/guides/auth/sessions

Browser voice API: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

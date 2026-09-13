# CodeCraftHub

**by Rafael Susano**

A learning dashboard that helps you plan courses, track progress, and get AI study suggestions — built as a portfolio app for IBM’s **Generative AI: Elevate your Software Development Career** (Course 14).

**Live demo:** [https://codecrafthub.vercel.app](https://codecrafthub.vercel.app)

---

## What it does

CodeCraftHub started as a simple course tracker and grew into a full learning workspace:

| Area | What you get |
|------|----------------|
| **Courses** | Create and manage learning paths with notes, tags, due dates, priority, and status |
| **Progress** | Outline modules with checkboxes — progress % comes from what you actually check off |
| **AI planning** | Suggest description, outline, resources, or a full plan in one click |
| **Ask AI** | Chat coach for study questions (with live web grounding when Gemini Search is available) |
| **Guest mode** | Works with no account — data stays in your browser |
| **Sign in** | Google, email/password, magic link, and password reset — syncs courses + chat to the cloud |
| **Fair use** | AI rate limits so free keys stay usable (guests lower, signed-in users higher) |

---

## Try it in 30 seconds

1. Open the [live demo](https://codecrafthub.vercel.app)
2. Add a course (or use **Generate full plan**)
3. Optional: top-right **Sign in** with Google or email to save across devices

---

## Features (detail)

### Learning tracker
- Full CRUD for courses (name, description, target date, status, priority, notes, tags)
- Learning outline with module checkboxes and live progress
- “Where to learn” resources (YouTube, freeCodeCamp, Coursera, docs, books)
- Filters: status, overdue, due soon
- Search + sort (updated, due date, priority, progress, name)
- Stats strip and JSON export/import backup
- Compact list + detail modal for a cleaner dashboard

### Authentication & sync
- Top-right **Sign in** modal
- **Continue with Google**
- Email + password (sign up / sign in)
- Forgot password → reset email → set a new password
- Magic link option
- Guests keep using the app without logging in
- Signed-in users sync **courses + chat** through Supabase (`user_workspace`)

### AI
- Suggest description / outline / resources / full plan
- Learning Assistant chat (multi-turn, markdown, clickable links)
- Working-link sanitizer so invented deep URLs don’t ship
- Gemini by default (Groq / OpenAI also supported)
- Falls back to local templates if no AI key is set
- Rate limits: **5** AI calls / 2h for guests, **25** / 2h when signed in

---

## Stack

- **Next.js** (App Router) + **TypeScript** + **React**
- **Tailwind CSS**
- Browser **localStorage** for guest courses and chat
- **Supabase** Auth + Postgres for optional cloud sync
- **Gemini** for live AI
- Deployed on **Vercel**

---

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` → `.env.local` and fill what you need (see below).

---

## Environment setup

### 1) Live AI (recommended)

```env
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.6-flash
```

Without a key, the app still runs using local templates.

On Vercel: **Settings → Environment Variables** → add the same keys → **Redeploy**.

### 2) Sign-in + cloud save (optional)

1. Create a free [Supabase](https://supabase.com) project  
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor  
3. **Authentication → Providers**
   - Enable **Email** (password + magic link)
   - Enable **Google** (paste Client ID + Secret from Google Cloud OAuth)
4. **Authentication → URL Configuration**
   - Site URL: `https://codecrafthub.vercel.app` (use `http://localhost:3000` while developing)
   - Redirect URLs:
     - `https://codecrafthub.vercel.app/auth/callback`
     - `http://localhost:3000/auth/callback`
5. Google Cloud OAuth **Authorized redirect URI**:
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
6. Add to `.env.local` and Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

`.env*` files are gitignored — never commit secrets.

---

## API overview

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/suggest` | AI helpers (`description`, `outline`, `resources`, `full`) |
| POST | `/api/chat` | Learning Assistant (multi-turn) |
| GET | `/api/ai-quota` | Remaining AI quota for guest / signed-in |
| GET | `/auth/callback` | Supabase OAuth / magic-link callback |
| — | `/auth/reset` | Set a new password after reset email |

Course data lives in the browser (guest) or Supabase (signed in), not a shared public course list.

---

## Privacy

- **Guest:** courses and chat stay in **this browser only**. Other visitors can’t see them.
- **Signed in:** your workspace syncs to your account so you can continue on another device.
- AI requests go through the app’s API routes; rate limits protect free-tier keys.

---

## Course context

Portfolio build for **Course 14 — Generative AI**. Coursera mark for the course is separate; this repo is the expanded full-stack demo.

---

## License

MIT © Rafael Susano — see [LICENSE](./LICENSE)

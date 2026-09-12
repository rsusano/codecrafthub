# CodeCraftHub

**by Rafael Susano**

Learning management dashboard from **IBM Generative AI: Elevate your Software Development Career**, rebuilt as a stronger Next.js portfolio project.

## Live demo

**https://codecrafthub.vercel.app**

## Privacy model

- **Guest (default):** courses and AI chat are saved in **this browser only** (`localStorage`). Other visitors cannot see or delete your data.
- **Signed in (optional):** email magic-link login via Supabase syncs courses + chat to your account so you can restore them on another device.

## Features

### Core learning tracker
- Create, list, edit, and remove courses (per-browser by default)
- Fields: name, description, target date, status, priority, notes, tags
- Learning outline modules with checkboxes + progress %
- Status / overdue / due-soon filters
- Search + sort (updated, due date, priority, progress, name)
- Stats strip (totals, overdue, average progress)
- Export / import JSON backup
- Optional email sign-in to cloud-save courses & chat

### AI-powered planning
- **Suggest description**
- **Suggest outline** (modules)
- **Suggest where to learn** (YouTube, freeCodeCamp, Coursera certificates, docs, books)
- **Generate full plan** (description + outline + resources in one click)
- **Learning Assistant chat** (always-on AI coach with Google Search grounding when available — ask anything about study plans and where to learn; links are clickable)
- Uses Gemini by default (Groq/OpenAI supported); local templates if no key

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Browser `localStorage` for guest courses/chat
- Optional Supabase Auth + `user_workspace` table for cloud sync
- Route Handlers for AI suggest/chat

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Optional: live AI

Create `.env.local`:

```env
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.6-flash
```

Gemini keys: https://aistudio.google.com/apikey

`.env.local` is gitignored and will never be committed.

On Vercel, add `GEMINI_API_KEY` under Project → Settings → Environment Variables, then redeploy.

## Optional: email login + cloud save

1. Create a free [Supabase](https://supabase.com) project
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor
3. Auth → Providers → Email enabled (magic link)
4. Auth → URL Configuration:
   - Site URL: `https://codecrafthub.vercel.app` (and `http://localhost:3000` for local)
   - Redirect URLs include `/auth/callback` for both origins
5. Add to `.env.local` / Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Without these, the app still works in guest mode (browser-only save).

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/suggest` | AI helpers (`mode`: `description` \| `outline` \| `resources` \| `full`) |
| POST | `/api/chat` | Learning assistant chat (multi-turn) |
| GET | `/auth/callback` | Supabase magic-link callback |

Course CRUD is client-side (localStorage / synced account), not a shared public server list.

## Course context

Part of Course 14 final project (**CodeCraftHub**). Coursera Mark is separate and already completed. This repo is the full portfolio app.

## Deploy notes

Live site: **https://codecrafthub.vercel.app**

Guest data stays in each visitor’s browser. Signed-in users sync through Supabase.

## License

MIT © Rafael Susano — see [LICENSE](./LICENSE)

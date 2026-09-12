# CodeCraftHub

**by Rafael Susano**

Learning management dashboard from **IBM Generative AI: Elevate your Software Development Career**, rebuilt as a stronger Next.js portfolio project.

## Live demo

**https://codecrafthub.vercel.app**

You can honestly say this project:

- was built for an IBM GenAI course, **and**
- **includes AI features** (description, outline, and where-to-learn suggestions)

## Features

### Core learning tracker
- Create, list, edit, and remove courses
- Fields: name, description, target date, status, priority, notes, tags
- Learning outline modules with checkboxes + progress %
- Status / overdue / due-soon filters
- Search + sort (updated, due date, priority, progress, name)
- Stats strip (totals, overdue, average progress)
- Export / import JSON backup

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
- Route Handlers for CRUD + AI suggest
- JSON file persistence (`data/courses.json`; on Vercel uses `/tmp` so create/update/delete work)

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

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/courses` | List courses |
| POST | `/api/courses` | Create course |
| POST | `/api/courses` `{ "import": true, "courses": [...] }` | Replace/import |
| GET | `/api/courses/:id` | Get one course |
| PUT | `/api/courses/:id` | Update course |
| DELETE | `/api/courses/:id` | Remove course |
| POST | `/api/suggest` | AI helpers (`mode`: `description` \| `outline` \| `resources` \| `full`) |
| POST | `/api/chat` | Learning assistant chat (multi-turn) |

## Course context

Part of Course 14 final project (**CodeCraftHub**). Coursera Mark is separate and already completed. This repo is the full portfolio app.

## Deploy notes

Live site: **https://codecrafthub.vercel.app**

Course data on Vercel is stored in `/tmp` (writable on serverless). It can reset when the serverless instance recycles — use **Export JSON** for backups.

## License

MIT © Rafael Susano — see [LICENSE](./LICENSE)

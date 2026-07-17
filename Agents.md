# PokeLike — Claude Code Reference

## Tech Stack
- **React + Vite** — frontend framework and dev server
- **Tailwind CSS** — utility-first styling; no custom CSS unless Tailwind can't do it
- **Supabase** — auth (email/password) + PostgreSQL; use the JS client, not raw SQL
- **Framer Motion** — animations only (attack projectiles, transitions); don't import it elsewhere
- **Vercel** — deployment target; keep env vars in `.env.local`, never committed

## Dev Commands
```bash
npm run dev      # start dev server
npm run build    # production build
npm run preview  # preview production build locally
```

## Project Conventions
- Components live in `src/components/`, game logic in `src/game/`, Supabase calls in `src/lib/`
- No class components — function components + hooks only
- Tailwind for all layout and styling; avoid inline `style=` props
- Game logic (damage calc, type matchups, speed order) must be pure functions — no side effects, no Supabase calls
- Pokémon images served from PokéAPI (`https://pokeapi.co/api/v2/`) — don't bundle sprites locally
- Type matchup table is the authoritative source for effectiveness; don't hardcode multipliers inline

## Supabase
- Auth: email/password via `supabase.auth`
- Tables: `runs` (active/completed runs), `run_history` (stats per completed run)
- Never expose the service role key on the client — use the anon key with RLS enabled
- All DB reads/writes go through `src/lib/supabase.js`

## Working Style
- This is an iterative process — make only the changes asked for, nothing more
- Do not refactor, clean up, or expand scope beyond the specific request
- Ask clarifying questions before implementing if requirements are ambiguous — don't guess and build the wrong thing

## What Not To Do
- No sprite animations or tile graphics — text + images only
- Don't add dependencies without a clear reason; the stack is intentional
- Don't put game rules or data (Pokémon pools, move lists, type charts) in React components — keep them in `src/game/`
- Mobile layout is a top priority — design mobile-first, then scale up to desktop

## Important Stuff
IMPORTANT: if you're asking me to do follow up steps, please print out some type of large banner with # saying "YOUR ATTENTION IS REQUIRED SIR" with cool emoji output


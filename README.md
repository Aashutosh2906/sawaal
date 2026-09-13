# Sawaal Better

Deployment guide for the hosted version with saving, resume, and a facilitator dashboard.

## 1. Create the Supabase project

1. Go to supabase.com, sign up free, create a new project.
2. Open **SQL Editor > New query**, paste the contents of `schema.sql`, run it.
3. Go to **Project Settings > API**. Copy the **Project URL** and the **anon public key**.

## 2. Fill in your keys

Open `supabase-client.js` and `dashboard.html`, replace:
- `SUPABASE_URL` with your Project URL
- `SUPABASE_ANON_KEY` with your anon public key

In `dashboard.html`, also set `FACILITATOR_PASSCODE` to something only you and your teachers know.
This is a convenience gate, not real security — the anon key and data are technically reachable by
anyone who has the URL, since there's no per-student login enforced by Supabase Auth. Fine for a
pilot; if this scales up, move to Supabase Auth (anonymous sign-in + a custom claim) instead of the
PIN system, and lock the dashboard behind real auth too.

## 3. Push to GitHub

```bash
cd sawaal-better
git init
git add .
git commit -m "Sawaal Better — hosted version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/sawaal-better.git
git push -u origin main
```

## 4. Turn on GitHub Pages

Repo → **Settings > Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → Save.
Your course will be live at `https://YOUR-USERNAME.github.io/sawaal-better/` within a minute or two.
The dashboard is at the same address plus `/dashboard.html`.

## 5. Test it

- Open the course, skip the save-progress screen, confirm it still works fully anonymously (this
  should never break — it's the fallback if Supabase is down or a school blocks it).
- Open it again, this time fill in the save-progress screen, answer a few questions, close the tab.
- Reopen the course URL, re-enter the same name/school/class + PIN — it should resume where you left off.
- Open `dashboard.html`, enter your passcode, confirm the student shows up and "Export all answers"
  produces a CSV.

## What's still worth doing before a real rollout

- The facilitator passcode is client-side only — anyone who views source gets it. Fine for a small
  pilot; swap for real Supabase Auth if you're handing the dashboard to multiple schools.
- No rate limiting on the PIN check — a student could brute-force a 4-digit PIN against a known
  name/school/class. Low stakes here (there's no sensitive data behind it), but worth knowing.
- The dashboard shows completion status and raw answers only; it doesn't yet compute `hunt_score`,
  `light_score` etc. server-side — those are easiest to derive with a spreadsheet pivot on `item_id`
  from the exported CSV, same as the original design, or I can add that scoring logic into the
  dashboard directly if you want it visible without leaving the browser.

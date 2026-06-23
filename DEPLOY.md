# Deploying free (step by step)

This guide gets your app online with a public URL, for free, with no credit
card. It assumes you've never deployed before.

We'll use **GitHub** (to store the code) + **Cloudflare Pages** (to host it).
Both are free and Cloudflare allows commercial/work use, which matters since
this is a work tool.

---

## Part 1 — Get the code onto GitHub

### 1a. Make a GitHub account
Go to https://github.com and sign up (free). Verify your email.

### 1b. Install Git (if you don't have it)
Check in a terminal:
```bash
git --version
```
No version? Download from https://git-scm.com and install with defaults.

### 1c. Create a repository
On GitHub, click the **+** (top right) → **New repository**.
- Name it something like `xyi-timesheeter`
- Set it to **Private** (it's a work tool — keep it private)
- Do NOT tick "Add a README" (we already have one)
- Click **Create repository**

GitHub now shows you a page with commands. Ignore them; use the ones below.

### 1d. Push your code
In a terminal, navigate into THIS folder (the one with package.json), then run
these lines one at a time. Replace `YOUR-USERNAME` with your GitHub username.

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/xyi-timesheeter.git
git push -u origin main
```

The first time you push, GitHub asks you to log in. Follow the browser prompt.

Refresh your GitHub repo page — your files should now be there.

---

## Part 2 — Connect Cloudflare Pages

### 2a. Make a Cloudflare account
Go to https://dash.cloudflare.com/sign-up and sign up (free, no card).

### 2b. Create a Pages project
- In the dashboard sidebar, find **Workers & Pages** → **Create** → **Pages**
- Click **Connect to Git** and authorise GitHub
- Pick your `xyi-timesheeter` repository

### 2c. Set the build settings
Cloudflare will ask how to build the project. Enter exactly:

| Setting              | Value           |
| -------------------- | --------------- |
| Framework preset     | `Vite`          |
| Build command        | `npm run build` |
| Build output directory | `dist`        |

(If you pick the Vite preset, the last two often fill in automatically.)

### 2d. Deploy
Click **Save and Deploy**. Cloudflare installs everything and builds your app
(takes 1–2 minutes). When it finishes you get a public URL like
`https://xyi-timesheeter.pages.dev`.

Done — that's your live app.

---

## Updating the app later

Any time you change the code, just push again:

```bash
git add .
git commit -m "describe what you changed"
git push
```

Cloudflare detects the push and redeploys automatically within a couple of
minutes. You never touch the dashboard again.

---

## Notes

- Your timesheet data is stored in the browser's localStorage, so it stays on
  whatever device/browser you use — it is not shared between people or devices.
- The Wrike token is also stored in the browser locally. Because the repo is
  private and the token never goes into the code, this is fine for personal use.
- Free tiers change over time. If anything below looks different from what the
  site shows you, trust the site — follow its current on-screen instructions.

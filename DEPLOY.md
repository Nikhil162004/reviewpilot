# Deploying ReviewPilot live on Render

Two services, both on the free tier:

| Service | Type | URL (default names) |
| --- | --- | --- |
| `reviewpilot-api` | Python web service (FastAPI) | `https://reviewpilot-api-njpa.onrender.com` |
| `reviewpilot-web` | Static site (React) | `https://reviewpilot-web-qxjw.onrender.com` |

The frontend calls `/api/...` on its own origin; a Render rewrite in
`render.yaml` forwards those calls to the API service, so there are no
CORS issues and no API URL baked into the JavaScript bundle.

## Step 1 — Put the code on GitHub

From the project folder:

```bash
git remote add origin https://github.com/<your-username>/reviewpilot.git
git push -u origin master
```

(Create the empty repository on github.com first — no README, no .gitignore.)

## Step 2 — Create the Blueprint on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**.
2. Connect the GitHub repository from Step 1. Render reads `render.yaml`
   automatically and shows both services.
3. Click **Apply**. `APP_SECRET` is generated for you — there is nothing
   else you must type. The first build takes a few minutes.

## Step 3 — Open it

Live now: https://reviewpilot-web-qxjw.onrender.com
API health: https://reviewpilot-api-njpa.onrender.com/api/health

## Things to know

- **Free tier sleeps.** After ~15 minutes idle the API spins down; the
  first request then takes 30–60 seconds while it wakes. Normal for free.
- **History resets on redeploy.** Free services have ephemeral disks, so
  the SQLite database (reviews, accounts) is wiped on each deploy/restart.
  For permanent storage, upgrade the API to a paid plan, attach a disk
  mounted at `/var/data`, and set `DATABASE_PATH=/var/data/reviews.db`
  in the service's Environment tab (the code already supports it).
- **If you rename the services**, update the `/api/*` rewrite destination
  in `render.yaml` to your API's real URL and redeploy the static site.
- **Custom domain**: Render → `reviewpilot-web` → Settings → Custom Domains.
- **GitHub PR features** (browse PRs, post comments, webhook) work as-is:
  public repos need no key; posting comments asks the user for their own
  token in the browser, exactly like locally.

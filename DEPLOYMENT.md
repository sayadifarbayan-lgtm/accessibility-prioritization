# Deploying to Railway

This guide puts the dashboard on a permanent public HTTPS URL on [Railway](https://railway.com) so
it keeps running when your laptop is off. Everything here was tested locally with the same Docker
image Railway will build (see "What was tested").

Nothing in this repository creates, buys or deploys anything by itself. You perform the Railway
steps below, in your own account.

---

## 1. What gets deployed

```
 Professor's browser ──HTTPS──▶  Railway edge  ──▶  [ app service ]  ──private network──▶  [ MongoDB service ]
                                                    Pa11y Dashboard                          database "pa11y"
                                                    + embedded Pa11y Webservice              (persistent volume)
                                                    + Chromium (for scans)
```

* **Two Railway services only:** the app (this repository's `Dockerfile`) and a Railway MongoDB.
* The Pa11y Webservice is **embedded** in the app process (`index.js` starts both). It listens only
  on `127.0.0.1` inside the container, so it is never reachable from the internet or from other
  Railway services. There is no third service to run.
* All custom features (prioritisation, remediation, manual overrides, scan comparison) are part of
  the same code and need no extra services.

## 2. Choose an access mode (important)

The upstream dashboard has **no login**. Anyone who finds a public URL could run scans, delete
tasks and edit overrides. The app therefore **refuses to start** in this image unless you pick one:

| Mode | Settings | Professor can | Choose when |
|---|---|---|---|
| **A. Password (recommended)** | `BASIC_AUTH_USER` + `BASIC_AUTH_PASSWORD` | Do everything: browse, compare, **create/remove overrides**, run scans | You want the professor to try every custom feature |
| **B. Public view-only** | `READONLY=true` | Browse results, priorities, remediation, comparison. **Cannot** create overrides, scan, edit or delete | You want a link anyone can open, with nothing that can be changed |

Notes:
* In mode A the whole site (including CSS/JS) asks for the password. Only `/health` is open (it just
  returns `{"status":"ok"}`).
* In mode B the existing overrides are still displayed, but nobody can add new ones. If you want to
  show override creation live, use mode A, or demo it on your own laptop.
* You can switch modes any time by editing the variables and redeploying.

## 3. Prerequisites

* A Railway account and this repository on GitHub (branch `deploy/railway`).
* Docker Desktop running with your local `accessibility-mongo` container (for the data migration).
* Railway is usage-based. **Check which plan you are on and what it includes before creating
  resources, and keep it active for as long as your professor needs access.** (If credits run out
  the project is stopped and the URL stops working.)

## 4. Steps in Railway

### Step 1 – Push the branch (on your laptop)

Review and commit the deployment changes yourself, then:

```powershell
git push -u origin deploy/railway
```

### Step 2 – Create the project and the MongoDB service

1. Railway dashboard → **New Project** → **Empty Project**.
2. On the project canvas click **+ New** → **Database** → **Add MongoDB**.
3. Leave its name as **MongoDB** (the variables below refer to that exact name). Wait until it is
   "Active".
4. Open the MongoDB service → **Settings → Networking**. You need a **TCP Proxy / Public Access**
   for the one-time data copy in Step 3. If none exists, add one. Note the variable
   `MONGO_PUBLIC_URL` on the **Variables** tab.

### Step 3 – Copy your existing data (do this before the app goes live)

Your scans (including the 3 November scan, 41 errors / 65 warnings / 143 notices) live in the local
database `pa11y` in the Docker container `accessibility-mongo`. The script
`deploy\mongo-migrate.ps1` copies it. **It only reads your local database.** It never starts, stops
or changes containers, never writes to the local database, and never uses `--drop`.

```powershell
cd C:\Users\bayan\Documents\accessibility-project

# 1) Read-only backup of the local data (creates backups\pa11y-<time>.archive.gz + a .counts.json)
.\deploy\mongo-migrate.ps1 -Action Dump

# 2) Give the script the Railway URL without putting the password in your history.
#    Paste the value of MONGO_PUBLIC_URL when asked.
$env:RAILWAY_MONGO_PUBLIC_URL = Read-Host 'Paste MONGO_PUBLIC_URL'

# 3) Dry run: checks Railway is reachable and the target is empty. Writes nothing.
$archive = (Get-ChildItem .\backups\*.archive.gz | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
.\deploy\mongo-migrate.ps1 -Action Restore -ArchivePath $archive

# 4) Real restore. Refuses if the target already contains tasks/results.
.\deploy\mongo-migrate.ps1 -Action Restore -ArchivePath $archive -Execute

# 5) Independent check (the restore already verifies; this re-reads Railway)
.\deploy\mongo-migrate.ps1 -Action Verify -ArchivePath $archive

# 6) Forget the URL
Remove-Item Env:RAILWAY_MONGO_PUBLIC_URL
```

You are looking for this at the end of step 4 and 5:

```
  results      2
  tasks        2
  result ...  2026-11-03T19:04:54.083Z  errors=41 warnings=65 notices=143 total=249  findings stored=249
  result ...  2026-11-03T23:09:57.730Z  errors=41 warnings=65 notices=143 total=249  findings stored=249
VERIFIED: target matches the local snapshot exactly.
```

Keep the `backups\` folder: it is your safety copy. It is git-ignored.

> The Railway TCP proxy is plain TCP (not TLS). The password and data cross the internet
> unencrypted during this copy. That is acceptable for a one-off copy of public-site scan results,
> but **remove the TCP proxy afterwards** (Step 6) so the database is private again.

### Step 4 – Add the app service

1. On the canvas: **+ New** → **GitHub Repo** → choose your repository.
2. Open the new service → **Settings → Source** and set the branch to **`deploy/railway`**
   (so Railway deploys this branch, not `main`).
3. Railway detects the `Dockerfile` in the repository root and builds with it automatically.
   (Railway's `railway.json` "config as code" is being retired, so none is used. Everything is set in
   the dashboard.)

### Step 5 – Set the variables

Service → **Variables** → **Raw Editor**. Paste this block, replacing the two `<...>` values
(mode A). If the editor complains about anything, add the three variables one by one instead.

```
WEBSERVICE_DATABASE=${{MongoDB.MONGO_URL}}/pa11y?authSource=admin
BASIC_AUTH_USER=<USERNAME>
BASIC_AUTH_PASSWORD=<LONG-RANDOM-PASSWORD>
```

* For mode B replace the last two lines with `READONLY=true`.
* `/pa11y` (the database name) and `?authSource=admin` are **required**. Without the database name
  the app silently uses a database called `test` and your scans will look missing.
* Generate a strong password on your laptop (24+ characters; the app rejects fewer than 12):

  ```powershell
  [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)) -replace '[+/=]',''
  ```

* Do **not** set `PORT`; Railway injects it and the app uses it.
* `deploy/railway.env.example` explains every variable, including the optional ones.

### Step 6 – Service settings

On the app service → **Settings**:

1. **Networking → Public Networking → Generate Domain.** This is your permanent
   `https://<name>.up.railway.app` URL. (Railway provides the HTTPS certificate.)
2. **Deploy → Healthcheck Path:** `/health`. (Railway then waits for the new version to answer before
   switching traffic.)
3. **Replicas:** leave at **1**. Never run more than one replica of this service (see "Scheduled
   scans").
4. Leave **Serverless / App Sleeping off** so the demo is always ready.

Optional but recommended: **keep manual overrides across redeploys.** Overrides are stored in a file,
not in MongoDB. Without a volume they are lost whenever the service is redeployed.

1. Canvas → right-click the app service → **Attach Volume** → mount path **`/data`**.
2. Add variable **`RAILWAY_RUN_UID=0`**. Railway mounts volumes as root; without this the app (which
   runs as an unprivileged user) cannot write to it and **saving an override will fail** (the page
   still works and the log shows `Could not save priority override: EACCES`).

Then back on the **MongoDB** service → **Settings → Networking**: **remove the TCP Proxy / Public
Access** you added for the migration. The app reaches the database over Railway's private network
and does not need it.

### Step 7 – Check it

Open the generated URL. The browser asks for the username/password (mode A). Then:

* [ ] Home page lists **W3C Accessibility Test** and **Example**.
* [ ] W3C task → the 3 November results are listed; opening one shows **Errors (41)**,
      **Warnings (65)**, **Notices (143)**.
* [ ] Rules show **High / Medium / Low** badges, "estimated impact" and confidence labels.
* [ ] **Sort by priority** button re-orders the rules.
* [ ] Open "details" on a rule → **How to fix** shows numbered steps, one per line, and a code example.
* [ ] **Compare two scans** (the two 3 November scans) → **249 persistent**, 0 likely resolved, 0 new.
* [ ] (Mode A) **Set priority override** on a rule → it shows as an override with your reason → **Remove**
      works.
* [ ] (Optional, mode A) **Run** the *Example* task. After about a minute a new result appears. This
      proves Chromium works on Railway.

In the service's **Deployments → View Logs** you should see lines like `Pa11y Dashboard started`,
`database: mongodb://mongo:***@...` (the password is hidden) and
`cron:     scheduled scans DISABLED`.

## 5. Suggested demo for your professor

1. Open the URL, sign in. Open **W3C Accessibility Test** → the 3 November result.
2. Errors tab → point out the priority badges, the heuristic impact label and the confidence label.
   Warnings/Notices carry the "not a confirmed failure" wording.
3. Click **Sort by priority**. Open **details** on one rule → numbered **How to fix** steps and example.
4. **Set priority override** (mode A) on one rule with a reason → it appears marked as an override.
   **Remove override**.
5. Back on the task page → **Compare two scans** → 19:04 vs 23:09 → 249 persistent.

Send the password through a different channel than the URL, and change it after grading
(edit `BASIC_AUTH_PASSWORD` → the service redeploys).

## 6. Scheduled scans

The embedded Pa11y Webservice **always** schedules a scan of **every** task every night at 00:30
(server time, UTC) and has no setting to turn that off. Left alone, an unattended public demo would
re-scan your tasks every night, adding new results, and every running instance would do it. To keep
you in control, this image **disables scheduled scans by default** (`DISABLE_SCHEDULED_SCANS=true`).
Manual runs from the dashboard still work in mode A.

If you really want nightly scans: set `DISABLE_SCHEDULED_SCANS=false` (optionally `WEBSERVICE_CRON`),
and keep **exactly one replica**. Running two would scan twice. With a volume attached, Railway
never runs two instances at once during a redeploy (brief downtime instead), which also prevents
overlap.

## 7. Security notes and limits

* HTTPS is provided by Railway. Basic Auth credentials are protected in transit by that HTTPS.
* Basic Auth is one shared password with no lockout. Use a long generated password and share it only
  with the people who need it.
* **Anyone who has the password can make the server load any URL** (that is what a scan does),
  including addresses on Railway's private network. Treat the password as privileged. After the
  grading period, switch to `READONLY=true` (mode B) or delete the project.
* There is no audit log of who created or removed an override.
* No secrets are stored in Git or in the image. The database password exists only in Railway
  variables, and the app hides it in logs.
* Scans use memory. If a scan crashes with an out-of-memory message, raise the service's memory
  limit in Railway or stay in mode B.

## 8. Updating and backups

* **Update:** commit and push to `deploy/railway`. Railway rebuilds and redeploys.
* **Back up Railway's database:** use Railway's backups for the MongoDB service if your plan offers
  them. Your original data also remains in your local container and in `backups\`.
* **Your local setup is unchanged.** `npm start`, the local Docker MongoDB and your scans work as
  before. The new variables only matter when set.

## 9. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Deploy fails the healthcheck | Check the logs. The most common cause is the "Refusing to start" message: set `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` or `READONLY=true`. `/health` itself never needs a password. |
| "Application failed to respond" | The app must listen on Railway's `PORT`. Do not hard-code or override `PORT`. If you removed it manually, delete your `PORT` variable. |
| `BASIC_AUTH_USER and BASIC_AUTH_PASSWORD must be set together` | Set both, or neither. |
| `BASIC_AUTH_PASSWORD must be at least 12 characters long` | Use the generator command in Step 5. |
| Site loads but there are no tasks | `WEBSERVICE_DATABASE` is missing `/pa11y`, so the app used database `test`. Or the migration was not run. |
| `Authentication failed` in logs | `?authSource=admin` is missing, or the service is not named `MongoDB`. Re-pick the reference with `${{`. |
| Saving an override shows "A non-empty reason and a valid priority level are required" but the form is filled in | The volume is not writable. Add `RAILWAY_RUN_UID=0` (log shows `EACCES`). |
| Overrides disappear after a redeploy | No volume at `/data`. See Step 6. |
| Scan from the dashboard fails | Look at the logs for Chromium errors. Check memory. Check the URL is reachable from the public internet. |
| Browser keeps asking for a password | Wrong username/password (they are case-sensitive). |

## 10. What was tested

On a local machine, using the exact image built from this `Dockerfile` and a throwaway MongoDB
with authentication (like Railway's), populated by this migration script from your real data:

* Build, start, health check, `PORT` handling, loopback-only webservice.
* Refuses to start with anonymous write access, or with a weak password.
* Password protection (401 without/with wrong password; `/health` open; static files protected).
* Your real data: 2 tasks, 2 results, 41 / 65 / 143 findings (249) displayed correctly.
* Prioritisation, remediation (one numbered step per line), sorting assets, scan comparison
  (249 persistent), override create/remove, override survives a container restart on a volume.
* Read-only mode: anonymous browsing and comparison work; every write route returns 404.
* A real Chromium scan inside the container completed and stored a result.
* Migration script: dump, dry run, restore, verify, renamed-database restore, and refusal to restore
  into a non-empty target.

Not tested (needs your Railway account): the Railway build itself, Railway's variable references,
the TCP proxy path to a real Railway database, and a volume mounted by Railway.

## 11. Running the image locally

```powershell
docker build -t pa11y-dashboard-railway:local .
docker run --rm -p 4000:4000 `
  -e WEBSERVICE_DATABASE="mongodb://host.docker.internal:27018/pa11y" `
  -e READONLY=true `
  pa11y-dashboard-railway:local
```

(This reads your local MongoDB. Use `READONLY=true` so nothing can be changed. Do not point a test at
your real data with write access.)
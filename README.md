# IronLog

An offline-first gym tracker in the mould of Strong — routines, set-by-set logging,
rest timer, history and personal records — with every feature free.

It is a **PWA** (progressive web app): a website that installs to your phone's home
screen and then behaves like a native app. That choice is deliberate. Publishing a
real native app costs $99/year for iOS plus $25 once for Android, and building for
iOS requires a Mac. A PWA installs on both platforms from a single URL, runs with no
internet connection, and hosts free forever on GitHub Pages.

## Running it on your computer

```bash
npm install
npm run dev
```

Then open the printed `http://localhost:5173/` address.

To try it on your phone while both devices are on the same Wi-Fi, open the
**Network** address that `npm run dev` prints (e.g. `http://192.168.1.20:5173/`).

## Putting it on your phone for real

1. Create a GitHub account and a new **public** repository.
2. Push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "IronLog"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. In the repository, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
4. The included workflow builds and publishes on every push. After a minute your app
   is live at `https://<you>.github.io/<repo>/`.
5. Open that URL on your phone:
   - **iPhone** (must be Safari): Share → *Add to Home Screen*.
   - **Android** (Chrome): menu → *Install app*.

It now has its own icon, opens without browser chrome, and works in aeroplane mode.

## What it does

**Logging** — start an empty session or launch a routine. Each set records weight and
reps (or duration, distance, or bodyweight ± added load, depending on the exercise).
Tick a set complete and the rest timer starts itself. The previous session's numbers
sit greyed out beside each row, so a session you're repeating is one tap per set.

**Set types** — tap any set number to mark it a warm-up, drop set or set to failure.
Warm-ups are excluded from volume, the way lifters actually count.

**Personal records** — beat your heaviest weight, estimated 1RM, best set volume or
rep count and the set is badged `PR` as you log it. Only the best set of a session
is badged, so repeating a PR weight three times doesn't badge three rows, and past
sessions are judged against what came before them rather than against later
progress.

**RPE and plate maths** — tap any set number to record effort on the 6–10 RPE scale,
or open the plate calculator, which tells you what to hang on each side given your
bar weight and the plates your gym actually stocks.

**Routines and folders** — build a routine once with target weights and reps, group
routines into folders, reorder exercises, superset them, and set per-exercise rest.
Any finished workout can be saved back as a routine or repeated outright.

**Exercise library** — around 200 built-in exercises across every muscle group, plus
your own. Each exercise has a detail page with personal records, a progression chart
(heaviest weight / estimated 1RM / session volume / total reps, over 3M–all time)
and its full history.

**Stats** — training-activity heatmap, weekly volume, week streaks, and a muscle
balance breakdown by working sets. Every chart has a table view, so no value is
locked behind a hover.

**Body measurements** — bodyweight, body fat and thirteen circumferences, each with
its own trend chart. Logging bodyweight also teaches the app to score pull-ups, dips
and other bodyweight movements.

**Editing** — fix a past session's name, notes, date, start time, duration, sets or
exercises; totals and records recalculate on save.

**Units** — kilograms or pounds, kilometres or miles, centimetres or inches,
switchable at any time. Everything is stored in kilograms, metres and centimetres
internally, so switching never rewrites your history.

## Where your data lives

In your browser's IndexedDB, on your device only. There is no server, no account and
nothing is uploaded anywhere.

The trade-off is that **clearing your browser data or deleting the app erases your
history**. Use **Settings → Export backup** now and then; it saves a `.json` file you
can re-import on any device.

## Known limits of the PWA approach

- No Apple Health or Google Fit integration.
- On iOS the rest-timer chime only sounds while the app is open; iOS does not allow
  background notifications for home-screen web apps. Android is unrestricted.
- Vibration on timer completion works on Android only.

## Project layout

```
src/
  db/                  Dexie (IndexedDB) schema, types, seeded exercise library
  lib/                 Units, time, workout maths, stats, records, plates, backup
  state/               Active-workout and rest-timer React contexts
  components/          Reusable UI: set rows, sheets, pickers, nav
  components/charts/   SVG line/column/bar/heatmap primitives, each with a table twin
  pages/               One file per screen
scripts/               Icon generator (no image dependencies)
```

Weights are stored in kilograms, durations in seconds, distances in metres and
timestamps in epoch milliseconds — conversion happens only at the UI edge.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built app locally |
| `npm run typecheck` | Type-check only |
| `npm run icons` | Regenerate the app icons |

### A note for WSL

This project sits on a Windows drive (`/mnt/c`), which WSL mounts without permission
metadata. Two consequences:

- Install with `npm install --no-bin-links`. Plain `npm install` fails with `EPERM`
  while linking binaries. The `package.json` scripts invoke tools by path so they
  work either way.
- The mount delivers no file-change events, so `vite.config.ts` turns on polling for
  paths under `/mnt/`. Without it hot reload silently does nothing and you are left
  looking at stale code.
- `npm run build` fails at the final file-copy step for the same reason. `npm run dev`
  is unaffected, and GitHub Actions builds on Linux without any of this. To build
  locally anyway, target the Linux filesystem:
  ```bash
  npm run build -- --outDir ~/ironlog-dist --emptyOutDir
  ```

The permanent fix is to add the following to `/etc/wsl.conf` and run
`wsl --shutdown` from Windows:

```ini
[automount]
options = "metadata"
```

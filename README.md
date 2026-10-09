# Trana

**A free, no-nonsense gym tracker that lives on your phone.** Log every set in a
couple of taps, see your lifts climb, and know what to train next. No account, no
subscription, no paywalled features, and it works with no signal in the basement gym.

**[Open Trana → darshil2626.github.io/workout-app](https://darshil2626.github.io/workout-app/)**

## Get it on your phone (30 seconds)

There is nothing to download from an app store and **no account to make**. Just open
the link above on your phone and install it from the browser:

- **iPhone** (use Safari): tap Share → _Add to Home Screen_.
- **Android** (Chrome): tap the menu → _Install app_.

It gets its own icon, opens full-screen without browser chrome, and keeps working in
aeroplane mode. Updates arrive automatically; the app offers a reload when a new
version is ready, never mid-set.

## Why you'll like it

- **Fast where it counts.** Last session's numbers sit beside every set, so repeating a
  workout is one tap per set. Finish a set and the rest timer starts itself.
- **Everything is free.** Routines, folders, supersets, PRs, charts, measurements,
  backups. Nothing is held back.
- **Private by default.** Your history lives on your device, not on someone's server.
- **Works offline.** Fully functional with no connection after the first load.
- **Smart suggestions.** Home recommends the routine whose muscles are most rested.

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

In your browser's IndexedDB, on your device only. There is no server and no account,
and your workouts are never uploaded. The app does send anonymous usage analytics
(which screens get opened, no workout data) to help improve it; switch it off any
time in **Settings**.

The trade-off is that **clearing your browser data or deleting the app erases your
history**. Use **Settings → Export backup** now and then; it saves a `.json` file you
can re-import on any device. You can also bring your history over from another workout
app by importing its CSV export.

## Known limits of the PWA approach

- No Apple Health or Google Fit integration.
- On iOS the rest-timer chime only sounds while the app is open; iOS does not allow
  background notifications for home-screen web apps. Android is unrestricted.
- Vibration on timer completion works on Android only.

---

# For developers

Trana is a React + TypeScript + Vite **PWA** with Dexie (IndexedDB) storage, deployed
to GitHub Pages by the included Actions workflow. A PWA installs on iOS and Android
from a single URL, with no $99/year Apple fee and no Mac required.

## Running it locally

```bash
npm install
npm run dev
```

Then open the printed `http://localhost:5173/` address. To try it on a phone on the
same Wi-Fi, open the **Network** address that `npm run dev` prints.

## Hosting your own copy

Fork the repo, then in **Settings → Pages** set **Source** to **GitHub Actions**.
Every push to `main` builds, tests and publishes to `https://<you>.github.io/<repo>/`.
(Only people who want their own copy need a GitHub account; users of the app don't.)

## Project layout

```
src/
  db/                  Dexie (IndexedDB) schema, types, seeded exercise library
  lib/                 Units, time, workout maths, stats, records, plates, backup
  state/               Active-workout and rest-timer React contexts
  components/          Reusable UI: set rows, sheets, pickers, nav
  components/charts/   SVG line/column/bar/heatmap primitives, each with a table twin
  pages/               One file per screen
public/exercise-art/   Exercise illustrations, three frames each (CC BY-SA 4.0)
scripts/               Icon generator (no image dependencies), illustration matcher
```

Weights are stored in kilograms, durations in seconds, distances in metres and
timestamps in epoch milliseconds — conversion happens only at the UI edge.

## Commands

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                                      |
| `npm run build`     | Type-check and build to `dist/`                                 |
| `npm run preview`   | Serve the built app locally                                     |
| `npm run typecheck` | Type-check only                                                 |
| `npm run test:unit` | Unit tests (Vitest)                                             |
| `npm run test:e2e`  | End-to-end tests (Playwright)                                   |
| `npm run icons`     | Regenerate the app icons                                        |
| `npm run art`       | Re-match exercises to illustrations and download any new frames |

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
  npm run build -- --outDir ~/trana-dist --emptyOutDir
  ```

The permanent fix is to add the following to `/etc/wsl.conf` and run
`wsl --shutdown` from Windows:

```ini
[automount]
options = "metadata"
```

# Privacy

Trana keeps your training history **on your device**. There is no account and no
server that stores your workouts.

## What stays on your device

Workouts, routines, exercises, measurements and settings are stored in your
browser's IndexedDB. They are never uploaded. Clearing your browser data or
deleting the app erases them, so use **Settings → Export backup** now and then.
A backup is a file you save yourself; nothing sends it anywhere.

## What is sent: anonymous usage analytics, only if you say yes

The first time you open the app it asks whether you are happy to share anonymous
usage data with [PostHog](https://posthog.com) (its US cloud), so I can see which
features get used. **The answer starts as "no".** Until you tap Share, PostHog is
not started, nothing is sent, and nothing is stored in your browser for it.

You can change your mind at any time in **Settings → Privacy**. Switching it off
stops sending immediately and discards the random identifier described below.
The answer belongs to the device: restoring a backup from another phone does not
change it.

Events are about the app, not your training:

| Event                                                                                                                         | Detail sent                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `app_opened`                                                                                                                  | whether it is installed, platform (ios / android / desktop), whether it is the first open |
| `$pageview`                                                                                                                   | the screen, with ids replaced: `/history/:id`, `/exercises/:id`, never the real one       |
| `workout_started`                                                                                                             | whether it came from a routine                                                            |
| `workout_completed`                                                                                                           | duration and set count as ranges (for example "30-45 min"), not exact values              |
| `routine_created`                                                                                                             | how many exercises it has                                                                 |
| `theme_changed`                                                                                                               | which theme was chosen                                                                    |
| `backup_exported`, `backup_imported`, `backup_restore_undone`, `csv_import_used`, `history_cleanup_run`, `exercise_match_run` | that it happened, and which app a CSV came from                                           |
| `pwa_install_prompt_shown`                                                                                                    | none                                                                                      |
| `render_error`, `unhandled_error`                                                                                             | that something failed, and its kind. No message, stack or content                         |
| `storage_persist`                                                                                                             | whether the browser agreed to keep your data                                              |

Never sent: exercise names, weights, reps, routine names, measurements, notes, ids
of anything you logged, or the contents of any backup. Session recording and
autocapture are turned off. Before each event leaves, the page address PostHog
attaches by default is scrubbed of ids as well.

PostHog also records the usual details a web request carries: browser, operating
system, screen size, language and time zone.

If you say yes, PostHog assigns a random identifier, kept in your browser's local storage, to
group your events together. It is not linked to your name or email. Like any web
service, PostHog sees the IP address a request comes from.

## Debug info

**Settings → Help → Copy debug info** puts a short report on your clipboard: app and
database versions, how many workouts and routines you have, your browser, how much storage
is used, and the names of the last few failures (such as `TypeError`, never the message).
It is built on your device and goes nowhere until you choose to paste it into a message. The
list of recent failures is kept in your browser's local storage and is never sent by the app.

## Hosting

The app is served by GitHub Pages, which keeps its own ordinary access logs.

## Changes

If this changes, it will change here, and any new kind of data collection will
be opt-in or announced in the app.

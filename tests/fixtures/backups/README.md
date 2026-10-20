# Backup fixtures

Real-shaped backup files from each era of the app. They exist so that a backup someone
took months ago still restores into whatever build is live, and still drives every
screen. They are never edited to "catch up": the point is that they stay old.

| File                                | Written by                            | What is different about it                                                            |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `01-ironlog-first-release.json`     | the first release (named IronLog)     | backup version 1: no `measurements`, only the original settings, no effort or feeling |
| `02-ironlog-with-measurements.json` | IronLog after measurements arrived    | backup version 2, measurements, a folder, a workout left running, lb units            |
| `03-trana-current.json`             | Trana as of this directory's creation | every field today's build writes, including effort, feeling and the analytics consent |

They are consumed by `tests/integration/backupHistory.test.ts` (restore and calculations)
and `tests/e2e/restore-old-backups.spec.ts` (through the real Import screen).

## When a test here fails after you change something

Changing the stored shape (a new settings field, a new workout field, a bump to
`BACKUP_VERSION`) makes `the newest fixture has exactly the settings fields...` fail. That
is the prompt to add a fixture, not to edit one:

1. Export a backup from a build that has the change, or copy `03-...` and add the new
   fields by hand.
2. Save it as the next number, e.g. `04-trana-<what changed>.json`, and update the list in
   `backupHistory.test.ts`.
3. Leave the older files exactly as they are.

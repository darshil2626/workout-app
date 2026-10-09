# Security

## Reporting a problem

Please report a vulnerability privately rather than in a public issue: use
**Security → Report a vulnerability** on this repository's GitHub page.

Include what you found, how to reproduce it, and what you think the impact is. I
will acknowledge a report within a few days and tell you what I plan to do.

## What is in scope

Trana is a static web app. There is no server, no account and no stored
credentials, so the interesting surface is small:

- Handling of imported files (Trana backups, Strong and Hevy CSV exports), which
  are parsed in the browser.
- The service worker and what it caches.
- Anything that could expose workout data held in the browser's IndexedDB.
- The anonymous analytics path (see [PRIVACY.md](PRIVACY.md)).

## Supported versions

Only the version deployed from `main`. The app updates itself, so there are no
older supported releases.

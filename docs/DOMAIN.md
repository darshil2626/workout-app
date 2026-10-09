# Moving to a custom domain

**Do this before other people install the app.** Browser storage belongs to an origin
(scheme, host and port), not to a path or to the app. Everyone's workouts live under
`https://darshil2626.github.io`. A custom domain is a different origin, so a device
that installed from the old address cannot see its data from the new one, and GitHub
Pages redirects the old address to the new domain once one is attached, which leaves the
old data unreachable until someone visits the old origin directly.

With one install (yours), the move is a one-minute export and import. With strangers'
installs it is a support problem. Choose the permanent address now.

## What to choose

- Something you will keep for years; installs cannot follow it if it changes.
- A domain you own, not a subdomain of a service you might leave.
- Check the name is clear first: search the UK register (
  [gov.uk trade mark search](https://www.gov.uk/search-for-trademark)), EUIPO and USPTO
  for "Trana" in software and fitness classes (9, 41, 42, 44). A web search found no fitness
  app of that name, which is not the same as clearance.

  **Search done 9 October 2026** (TMview, which aggregates EUIPO, UKIPO and USPTO; not an official
  register and not legal advice). Names containing "trana" gave 67 records. Only one is
  identical to **TRANA**: US application 99478975, filed 4 Nov 2025, **class 3 (cosmetics)**,
  status "Filed", applicant Hugo Alberto Ornelas Gutierrez. Nothing identical in the EU or UK
  registers, and nothing identical in software (9, 42), fitness or training services (41) or
  medical and health services (44). Closest in software: METRANA (UK, classes 9 and 42,
  registered Jan 2026), CENTRANA (US, 9 and 42, filed 2025) and VOLTRANA (UK, class 9, filed
  2026): different words, but worth a look from a trade mark attorney if you plan to
  register. The UK IPO's own search sat behind a bot check, so run that one yourself
  at <https://trademarks.ipo.gov.uk/ipo-tmtext>.

## Steps

1. **Export a backup from your phone** (Settings → Export backup) and keep the file.
2. Buy the domain. In GitHub: **Settings → Pages → Custom domain**, add it, and follow
   the DNS instructions (a `CNAME` record for a subdomain, or `A` records for an apex).
   Tick **Enforce HTTPS** once it is available.
3. Set the repository variable **`SITE_BASE_PATH`** to `/` (Settings → Secrets and
   variables → Actions → Variables). A domain serves from the root; the project-site
   path `/workout-app/` would break every asset URL. The deploy workflow reads it.
4. Re-run the deploy (push to `main`, or run the workflow by hand).
5. On your phone: open the new address, **Add to Home Screen**, then Settings → Import
   backup with the file from step 1. Delete the old home-screen icon.
6. Update the "Open Trana" link in the README to the new address.

## Afterwards

The service worker, manifest `start_url`/`scope` and the install prompt all follow the
base path automatically. The old origin keeps whatever it stored, but no longer serves
the app.

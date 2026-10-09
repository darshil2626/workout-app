# Operating Trana

There is no server to watch. What can go wrong happens on people's devices, so what you
can observe is limited to three things: anonymous analytics (opt-in), reports people send
you, and GitHub's own signals.

## What you can and cannot see

- **Analytics (PostHog)** only covers people who tapped **Share**. Treat every number as a
  floor, not a count of all users. Someone who said no is invisible to it, by design.
- **Errors** are reported as a kind and a class name (`unhandled_error`, `render_error`),
  never a message or stack, so you can see _that_ something is failing and roughly how
  often, not _why_. The why comes from a user's **Copy debug info**.
- **GitHub** shows deploy failures, CI, Dependabot and CodeQL alerts.

## Set up once in PostHog (needs your login)

Create these as insights on one dashboard called "Trana health":

| Insight                    | Built from                                                                  | Why                                           |
| -------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| Active people, weekly      | unique users of `app_opened`                                                | Whether anyone is using it                    |
| Workouts completed, weekly | `workout_completed` count                                                   | The real unit of value                        |
| Failure rate               | (`unhandled_error` + `render_error`) ÷ unique users of `app_opened`, weekly | Spots a bad release                           |
| Storage persistence        | `storage_persist` split by `granted`                                        | How many devices can lose data under pressure |
| Install funnel             | `pwa_install_prompt_shown` → `pwa_install_accepted`                         | Whether the install nudge works               |
| Backups                    | `backup_exported` unique users ÷ active people                              | Whether people are protecting their data      |
| Platform split             | `app_opened` broken down by `platform` and `is_pwa`                         | Which platforms to test on first              |

Then add **one alert**: failure rate above, say, 5% of active people in a day. After each
release, glance at the failure insight the next morning.

## When someone reports a problem

1. Ask them to use **Settings → Help → Copy debug info** and paste it. It shows the build,
   database version, counts, platform, storage figures and recent failure names.
2. Match the build against a recent deploy. The build string carries the commit.
3. If it looks like data loss, the first question is whether they have a backup; the
   second is whether they use the app from the Home Screen or a browser tab (on iPhone,
   Safari can clear a tab's storage).
4. Label the GitHub issue (`bug`, `data-loss`). Data loss outranks everything else.

## Things to check periodically

- Dependabot pull requests (weekly) and CodeQL results (weekly).
- That an old backup still restores into the current build.
- The `audit` job in CI, which lists known-vulnerable production dependencies.
- That `PRIVACY.md` still matches what `src/lib/analytics.ts` sends.

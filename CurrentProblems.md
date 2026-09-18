A list of problems found as and when the app is used. Move into fixed list below when fixed.

### Problems

1. Need a kickass homepage bucause currently they all like tabs - also one thing I don't like about strong and hevy

### Fixed
1. Measurement entries only have one unit as an option. For example bodyweight is only kg instead of being able to choose between kg and lbs
   — Bodyweight now has its own unit (`measurementWeightUnit`), togglable from the entry sheet and from Settings → Units, so you can lift in kg and weigh in lb. Circumferences already had `lengthUnit`; that toggle is now reachable from the entry sheet too.
2. Headline stats formatting, total kg is in the millions so it doesn't fit into the box well. Overall more appealing headline stats section.
   — Added `formatVolumeCompact` (exact under 10k, then `12.4k` / `125k` / `1.23M`) and rebuilt the Stats header as hero → three headline figures → three smaller counts. Stat values now shrink with `clamp()` instead of overflowing, and the exact total is on hover and in every table view.
3. Reverse activity colour bar - darker means more vol
   — Kept brighter = more volume (reversing it would sink the heaviest days into the dark background) and fixed readability instead: the ramp no longer reaches near-white, the lowest bin is 2.2:1 against a rest day, cells are 15px, and rest days carry a hairline so the calendar grid reads.
4. Session volume chart formatting - too much scrolling to set time range so maybe two rows of scrolling or something better, the x axis on the chart doesn't show time properly as it can range up to years but only day and month is shown so maybe its a linear x axis and have a scatter plot or something better.
   — Time ranges moved to their own full-width row below the metric chips, so all four are one tap away; metric chips shortened. `LineChart` gained an `xAxis="time"` mode that positions points by real date, picks 3–5 calendar-aligned ticks from the span, formats them by span width (day+month → month → month+year → year), and draws a marker per session. Used on the exercise progress chart and the measurements chart.
5. The way PRs are calculated is different to hevy - check how it is done
   — Checked against Hevy's docs. 1RM already matched (Epley). Fixed four divergences: added best session volume; restricted assisted and pure-bodyweight exercises to reps records (they were awarding weight/1RM/volume PRs off your bodyweight, so a weigh-in could set a "PR"); weighted bodyweight now scores heaviest weight on the added load while volume still uses bodyweight + added; and warm-up inclusion is now a setting (Settings → Lifting, off by default) that re-totals stored history when flipped. Exercise-page records now come from the same helper as the in-workout badges, so they can't disagree. Also added Hevy's Set Records table (heaviest weight at each rep count).
6. No option to delete sets mid workout
   — It existed but was invisible: the set-number badge was a button styled as plain text. It now has a surface and border so the set menu (RPE, set type, plate calculator, delete) gets found, and a trash button beside "Add set" removes the last set directly.
7. Need to navigate back to home pages mid workout without pressing 'back' button on browser
   — Added a minimise chevron at the left of the workout header that returns to the tabs with the session still running; the existing active-workout banner brings you back. Discard stays in the header as requested.
8. Option to do a set that is held for a certain amount of time for things like planks
   — Duration sets now have an inline stopwatch. Tap the timer icon and the duration cell counts up in place; tap it again to record the hold, tick the set complete and start rest. If the set already carries a target it counts down instead, chimes at zero and records itself. One timer at a time, kept in localStorage against a start timestamp so a backgrounded tab returns with the right elapsed time.
9. No option to replace exercise
   — "Replace exercise" in the exercise menu, reusing the existing single-select `ExercisePicker`. The block keeps its id and its sets, so swapping a machine mid-set loses nothing. Swapping to an exercise logged differently (weight×reps → duration) warns first, since the columns change; the numbers are kept, not deleted.
10. No option to reorder all exercises, have to move up and down multiple times
   — Drag handles on each exercise header, via a hand-rolled `useSortable` pointer-events hook (no DnD dependency). Rows shift live to show where the drop lands. Move up/down stay in the menu as the keyboard-reachable fallback.
11. PR didn't work once
   — Three real causes, all in how the exercise and its baseline reached the PR check, not in the maths. The exercise library defaulted to `[]` while loading, so for a tick every exercise looked unknown — which silently skipped PR detection entirely and showed weight×reps columns for everything; it now holds the page until loaded. Baselines defaulted to an empty map, so a not-yet-loaded baseline was indistinguishable from "no history" and got compared against zeros; badging now waits for the real baseline. And the baseline query keyed off the library's *size*, so a rename or merge left it computing from a stale map. Separately, `mergeExercises` could rewrite a live session and delete an exercise out from under it, permanently breaking PRs for that exercise — it now refuses inside the transaction rather than relying on a check made before the confirm tap. Added a note in the set menu that warm-up sets don't count towards records, since a routine can carry a set in as a warm-up.
12. Ask to rate overall effort/feelings rating after finishing working
   — Finishing now asks once: effort (Easy → Max) and how it felt (5 emoji), both optional with an equally prominent Skip, over a summary of duration, volume and PRs. Stored on the workout as 1–5 and shown on the session page; the feeling emoji also rides along in the history list.
13. Previous weight X reps should be clickable which populates current set to be the same as previous
   — The Previous cell is a button when there is something to copy. It fills whichever fields the exercise actually uses, overwriting what's typed, since the tap is explicit. No unit conversion is involved — previous values are already in storage units — so duration, distance and bodyweight variants work the same way.

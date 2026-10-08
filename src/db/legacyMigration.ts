import Dexie from 'dexie'

/**
 * One-time carry-over from the app's previous name.
 *
 * Browser storage is keyed by name, so renaming the database and the
 * localStorage keys on their own would make an installed copy open empty while
 * every workout sat untouched under the old name. This moves it all across.
 *
 * Both steps are safe to run on every launch and to interrupt:
 *  - The database copy is a single transaction, so it either lands whole or not
 *    at all, and the old database is only deleted after it has committed. A
 *    failed run leaves the old data in place and simply tries again next launch.
 *  - A flag is committed *with* the copy. Without it, an old database that could
 *    not be deleted would be merged over newer edits on the next launch.
 *
 * REMOVE THIS FILE, and its two calls in main.tsx, once every install has
 * opened a build that contains it. It is the only place the old name remains.
 */

const OLD_DB = 'ironlog'
const DONE_FLAG = 'legacyMigrated'

const OLD_TO_NEW_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['ironlog.restTimer', 'trana.restTimer'],
  ['ironlog.setTimer', 'trana.setTimer'],
  ['ironlog_opened', 'trana_opened'],
  ['ironlog_expanded_folders', 'trana_expanded_folders'],
]

/** Synchronous, so it can run before anything reads a key. */
export function migrateLegacyStorage(): void {
  try {
    for (const [from, to] of OLD_TO_NEW_KEYS) {
      const value = localStorage.getItem(from)
      if (value === null) continue
      // A value already under the new key is the newer one; never overwrite it.
      if (localStorage.getItem(to) === null) localStorage.setItem(to, value)
      localStorage.removeItem(from)
    }
  } catch {
    // Storage blocked (private mode): nothing was persisted there to carry over.
  }
}

/** Resolves once there is nothing left to migrate, or rejects with the old data intact. */
export async function migrateLegacyDatabase(target: Dexie): Promise<void> {
  if (!(await Dexie.exists(OLD_DB))) return

  const alreadyCopied = (await target.table('meta').get(DONE_FLAG))?.value === 1
  if (!alreadyCopied) {
    // Opened with no declared schema, so Dexie reads whatever the device has.
    const old = new Dexie(OLD_DB)
    try {
      await old.open()
      const shared = new Set(target.tables.map((t) => t.name))
      const copies = await Promise.all(
        old.tables.filter((t) => shared.has(t.name)).map(async (t) => [t.name, await t.toArray()] as const),
      )

      await target.transaction('rw', target.tables, async () => {
        // Old rows win: they are the user's real data, and anything already in
        // the new database is a first-run seed with the same ids.
        for (const [name, rows] of copies) {
          if (rows.length > 0) await target.table(name).bulkPut(rows)
        }
        await target.table('meta').put({ key: DONE_FLAG, value: 1 })
      })
    } finally {
      old.close()
    }
  }

  // Best-effort: another open tab can hold the old database and make this wait,
  // and the app must not wait with it. The flag above makes a later retry harmless.
  await Promise.race([Dexie.delete(OLD_DB), new Promise<void>((resolve) => setTimeout(resolve, 3000))])
}

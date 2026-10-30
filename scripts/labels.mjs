// Creates or updates the GitHub labels the agent pipeline relies on (docs/AGENTS.md).
// Safe to rerun: existing labels are updated in place, nothing is deleted.
// Needs the GitHub CLI, signed in with access to this repository.
import { spawnSync } from 'node:child_process'

const labels = [
  ['triage', 'New, not yet looked at', 'fbca04'],
  ['agent-ready', 'Approved by a person for the builder agent', '0e8a16'],
  ['needs-human', 'Waiting on a decision or information from a person', 'd93f0b'],
  ['data-risk', 'Touches stored data, schema, backups or import', 'b60205'],
  ['data-loss', 'Someone lost data; outranks everything', '000000'],
  ['by-agent', 'Written by an agent', 'c5def5'],
  ['synthetic', 'Found by a scripted persona walkthrough, not a real person', 'd4c5f9'],
  ['flaky-test', 'Fails and passes on the same code', 'f9d0c4'],
  ['priority:high', 'Do next', 'e11d21'],
]

let failed = 0
for (const [name, description, color] of labels) {
  const result = spawnSync('gh', ['label', 'create', name, '--description', description, '--color', color, '--force'], {
    stdio: 'inherit',
  })
  if (result.status !== 0) failed++
}
process.exit(failed ? 1 : 0)

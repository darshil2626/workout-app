// PreToolUse hook: refuses shell commands that add the `agent-ready` label. That label
// is the trust boundary between public issue text and an agent that writes code, so only
// a person applies it, on GitHub (see docs/AGENTS.md). Best effort: it reads the command
// text, so it catches the usual `gh` forms, not every conceivable one.
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8'))
const command = String(input.tool_input?.command ?? '')
  // Removing the label is fine.
  .replace(/--remove-label[= ]+("[^"]*"|'[^']*'|\S+)/g, '')

const segments = command.split(/[;&|\n]+/)
const addsLabel = segments.some(
  (s) =>
    (/\bgh\s+(issue|pr)\s+(edit|create)\b/.test(s) && /(--add-label|--label|\s-l)\b[^]*agent-ready/.test(s)) ||
    (/\bgh\s+api\b/.test(s) && /labels/.test(s) && /agent-ready/.test(s)),
)

if (addsLabel) {
  process.stderr.write(
    'Blocked: only a person applies the agent-ready label, on GitHub. ' +
      'Comment on the issue suggesting it instead (CLAUDE.md rule 7).\n',
  )
  process.exit(2)
}

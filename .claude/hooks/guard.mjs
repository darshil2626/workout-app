// PreToolUse hook for the agent guardrails in docs/AGENTS.md. Refuses:
// - adding the `agent-ready` label, the trust boundary between public issue text and an
//   agent that writes code, so only a person applies it, on GitHub;
// - approving a pull request, which is a person's call;
// - merging through the GitHub tools or REST API, which cloud agents have. `gh pr merge`
//   stays allowed so a person can ask for a merge in an interactive session.
// Best effort: it reads command text and tool arguments, so it catches the usual forms,
// not every conceivable one.
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8'))
const tool = String(input.tool_name ?? '')
const args = input.tool_input ?? {}

function block(reason) {
  process.stderr.write(`Blocked: ${reason} (docs/AGENTS.md guardrails).\n`)
  process.exit(2)
}

const LABEL = 'only a person applies the agent-ready label, on GitHub. Comment suggesting it instead'
const APPROVE = 'approving a pull request is a person’s call; post a comment or request changes'
const MERGE = 'agents never merge; a person merges on GitHub'

if (tool.startsWith('mcp__github__')) {
  const name = tool.slice('mcp__github__'.length)
  // Reads may name the label as a filter.
  const reads = /^(list|search|get)_|_read$/.test(name)
  if (/merge/.test(name) && !reads) block(MERGE)
  if (/review/.test(name) && /"event"\s*:\s*"APPROVE"/i.test(JSON.stringify(args))) block(APPROVE)
  if (!reads && /"labels?"\s*:\s*(\[[^\]]*)?"[^"]*agent-ready/.test(JSON.stringify(args))) block(LABEL)
  process.exit(0)
}

const command = String(args.command ?? '')
  // Removing the label is fine.
  .replace(/--remove-label[= ]+("[^"]*"|'[^']*'|\S+)/g, '')

for (const s of command.split(/[;&|\n]+/)) {
  if (/\bgh\s+(issue|pr)\s+(edit|create)\b/.test(s) && /(--add-label|--label|\s-l)\b[^]*agent-ready/.test(s))
    block(LABEL)
  if (/\bgh\s+api\b/.test(s) && /labels/.test(s) && /agent-ready/.test(s)) block(LABEL)
  if (/\bgh\s+pr\s+review\b/.test(s) && /(--approve|\s-a)\b/.test(s)) block(APPROVE)
  if (/\bgh\s+api\b/.test(s) && /\/pulls\/\d+\/merge\b/.test(s)) block(MERGE)
  if (/\bgh\s+api\b/.test(s) && /\/pulls\/\d+\/reviews\b/.test(s) && /APPROVE/.test(s)) block(APPROVE)
}

// Guard for the scheduled (fallback) run of .github/workflows/hunter-print-refresh.yml.
//
// The on-time refresh comes from Supabase pg_cron calling workflow_dispatch at UTC 10:50 (JST 19:50).
// GitHub's own schedule for the same time can start hours late, so it only acts as a fallback.
//
// Target slot: the latest UTC 10:50 at or before now. Its JST date is the "update date" being covered,
// so a fallback that starts after midnight JST still refers to the previous day's 19:50 slot.
// The fallback is skipped only when a real refresh (not a dry run, any trigger) finished successfully
// and had started at or after that slot. A manual refresh in the morning therefore does not count
// for the evening slot, and a failed (or partially failed: the refresh script exits 1) run never counts.
// If the GitHub API cannot be read, the fallback runs (a duplicate refresh is harmless; a missing one is not).
import { appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const REAL_TITLE = 'Daily hunter print refresh'
const SLOT_UTC_HOUR = 10
const SLOT_UTC_MINUTE = 50

export function targetSlot(now = new Date()) {
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SLOT_UTC_HOUR, SLOT_UTC_MINUTE))
  if (slot > now) slot.setUTCDate(slot.getUTCDate() - 1)
  const jst = new Date(slot.getTime() + 9 * 3600 * 1000)
  return { slot, slotIso: slot.toISOString().replace('.000Z', 'Z'), targetDateJst: jst.toISOString().slice(0, 10) }
}

// runs: workflow_runs from the GitHub API (any event). Returns the runs that cover the slot.
export function coveringRuns(runs, slot, currentRunId) {
  return runs.filter(r =>
    String(r.id) !== String(currentRunId) &&
    r.status === 'completed' &&
    r.conclusion === 'success' &&
    r.display_title === REAL_TITLE &&
    r.run_started_at &&
    new Date(r.run_started_at) >= slot)
}

async function main() {
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, GITHUB_RUN_ID: runId, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env
  const { slot, slotIso, targetDateJst } = targetSlot()
  const lines = [`Target update date (JST): ${targetDateJst} (slot ${slotIso})`]
  let skip = false
  try {
    const since = new Date(slot.getTime() - 24 * 3600 * 1000).toISOString().replace('.000Z', 'Z')
    const url = `https://api.github.com/repos/${repo}/actions/workflows/hunter-print-refresh.yml/runs?status=success&per_page=100&created=%3E%3D${since}`
    const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const covering = coveringRuns((await res.json()).workflow_runs || [], slot, runId)
    skip = covering.length > 0
    lines.push(skip
      ? `Scheduled fallback skipped: run ${covering[0].id} (${covering[0].event}) refreshed all cards after the slot.`
      : 'No successful refresh after the slot. The fallback refreshes now (the pg_cron dispatch did not run, failed, or is missing).')
    if (!skip) console.log(`::warning::Hunter print fallback is refreshing for ${targetDateJst}: no successful refresh started after ${slotIso}.`)
  } catch (error) {
    lines.push(`Could not read previous runs (${error.message}). The fallback refreshes now.`)
    console.log(`::warning::Hunter print guard could not read previous runs: ${error.message}`)
  }
  console.log(lines.join('\n'))
  if (GITHUB_STEP_SUMMARY) await appendFile(GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
  if (GITHUB_OUTPUT) await appendFile(GITHUB_OUTPUT, `skip=${skip}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main()

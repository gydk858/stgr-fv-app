// Unit tests for tools/hunter-refresh-guard.mjs (no network). Run: node --test tools/tests/hunter-refresh-guard.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { targetSlot, coveringRuns, REAL_TITLE } from '../hunter-refresh-guard.mjs'

const at = s => new Date(s)

test('slot: on-time fallback refers to the same JST evening', () => {
  const t = targetSlot(at('2026-11-15T10:50:30Z'))
  assert.equal(t.slotIso, '2026-11-15T10:50:00Z')
  assert.equal(t.targetDateJst, '2026-11-15')
})

test('slot: fallback delayed past JST midnight still refers to the previous evening', () => {
  const t = targetSlot(at('2026-11-15T20:30:00Z')) // 2026-11-16 05:30 JST
  assert.equal(t.slotIso, '2026-11-15T10:50:00Z')
  assert.equal(t.targetDateJst, '2026-11-15')
})

test('slot: before UTC 10:50 refers to the previous day', () => {
  const t = targetSlot(at('2026-11-16T09:00:00Z')) // 18:00 JST on 11-16
  assert.equal(t.slotIso, '2026-11-15T10:50:00Z')
  assert.equal(t.targetDateJst, '2026-11-15')
})

const slot = at('2026-11-15T10:50:00Z')
const run = (o) => ({ id: 1, status: 'completed', conclusion: 'success', display_title: REAL_TITLE, event: 'workflow_dispatch', run_started_at: '2026-11-15T10:50:05Z', ...o })

test('covered: pg_cron dispatch that started after the slot', () => {
  assert.equal(coveringRuns([run()], slot, 99).length, 1)
})

test('not covered: manual refresh in the morning (before the slot)', () => {
  assert.equal(coveringRuns([run({ run_started_at: '2026-11-15T00:30:00Z' })], slot, 99).length, 0)
})

test('not covered: dry run, failed run, in-progress run, or the current run itself', () => {
  assert.equal(coveringRuns([
    run({ display_title: 'Dry run (dispatch check)' }),
    run({ conclusion: 'failure' }),
    run({ status: 'in_progress', conclusion: null }),
    run({ id: 99 }),
  ], slot, 99).length, 0)
})

test('covered: a late scheduled run or a manual run after the slot also counts', () => {
  assert.equal(coveringRuns([run({ event: 'schedule', run_started_at: '2026-11-15T18:00:00Z' })], slot, 99).length, 1)
  assert.equal(coveringRuns([run({ event: 'workflow_dispatch', run_started_at: '2026-11-15T12:00:00Z' })], slot, 99).length, 1)
})

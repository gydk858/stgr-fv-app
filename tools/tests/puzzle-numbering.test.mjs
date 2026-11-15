// lib/puzzle-geometry.js の swapPuzzlePieces（問題番号とピースの対応の入れ替え）の単体テスト。
// Run: node --test tools/tests/puzzle-numbering.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { puzzleLayout, validPuzzleMesh, swapPuzzlePieces } from '../../lib/puzzle-geometry.js'

let seed = 1
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const base = () => { seed = 7; const l = puzzleLayout(13, random); return { ...l, slots: l.slots.map((s, i) => ({ ...s, label: `問題文${i + 1}` })) } }
const shapeOf = s => JSON.stringify(s.points)
const area = (layout, s) => { let a = 0; const p = s.points.map(i => layout.vertices[i]); for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1] } return a / 2 }

test('3 と 4 の交換：ピースの形だけが入れ替わり、id・お題・並び（番号）は変わらない', () => {
  const l = base(), r = swapPuzzlePieces(l, 2, 3)
  assert.equal(shapeOf(r.slots[2]), shapeOf(l.slots[3]))
  assert.equal(shapeOf(r.slots[3]), shapeOf(l.slots[2]))
  assert.deepEqual(r.slots.map(s => s.id), l.slots.map(s => s.id))
  assert.deepEqual(r.slots.map(s => s.label), l.slots.map(s => s.label))
  assert.deepEqual(r.vertices, l.vertices)
  assert.equal(validPuzzleMesh(r), true)
})

test('達成記録（問題の id）は維持され、表示は新しく割り当てたピースに追従する', () => {
  const l = base(), marked = [l.slots[2].id]          // 問題3 を達成済み
  const r = swapPuzzlePieces(l, 2, 3)
  const opened = r.slots.filter(s => marked.includes(s.id))
  assert.equal(opened.length, 1)
  assert.equal(opened[0].label, '問題文3')                 // 開くのは問題3
  assert.equal(shapeOf(opened[0]), shapeOf(l.slots[3]))   // その形は元の「4」のピース
})

test('複数回の交換：重複・欠番なく、全ピースの形と面積の合計を保つ', () => {
  let r = base(); const l = base()
  for (const [a, b] of [[2, 3], [0, 12], [3, 7], [7, 2], [5, 5]]) r = swapPuzzlePieces(r, a, b)
  assert.deepEqual(new Set(r.slots.map(shapeOf)), new Set(l.slots.map(shapeOf)))
  assert.equal(r.slots.length, 13)
  assert.ok(Math.abs(r.slots.reduce((t, s) => t + area(r, s), 0) - 10000) < 0.05)
  assert.equal(validPuzzleMesh(r), true)
})

test('同じ交換を2回で元に戻る（保存・再読込しても JSON のまま同じ対応）', () => {
  const l = base(), r = swapPuzzlePieces(swapPuzzlePieces(l, 2, 3), 2, 3)
  assert.deepEqual(r, l)
  const saved = JSON.parse(JSON.stringify(swapPuzzlePieces(l, 2, 3)))
  assert.deepEqual(saved, swapPuzzlePieces(l, 2, 3))
})

test('ZIP 取り込み（asset_id）のピースも交換できる', () => {
  const l = { puzzle: true, puzzle_mode: 'import', slots: [{ id: 'a', label: 'A', asset_id: 'x1' }, { id: 'b', label: 'B', asset_id: 'x2' }] }
  const r = swapPuzzlePieces(l, 0, 1)
  assert.deepEqual(r.slots, [{ id: 'a', label: 'A', asset_id: 'x2' }, { id: 'b', label: 'B', asset_id: 'x1' }])
})

test('範囲外・同じ番号・未設定のレイアウトは変更しない（既存イベントの互換）', () => {
  const l = base()
  assert.equal(swapPuzzlePieces(l, 2, 2), l)
  assert.equal(swapPuzzlePieces(l, -1, 2), l)
  assert.equal(swapPuzzlePieces(l, 2, 13), l)
  assert.equal(swapPuzzlePieces({}, 0, 1).slots, undefined)
})

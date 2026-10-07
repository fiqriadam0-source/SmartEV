import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const addItemPage = fs.readFileSync(path.join(repoRoot, 'src/pages/AddItemPage.jsx'), 'utf8')
const backend = fs.readFileSync(path.join(repoRoot, 'backend/stock.gs'), 'utf8')

test('Add-item page is enabled', () => {
  assert.match(addItemPage, /const ADD_ITEM_ENABLED = true/)
})

test('Apps Script backend has addItem handler', () => {
  assert.match(backend, /if\s*\(\s*type\s*===\s*["']addItem["']\s*\)/)
})

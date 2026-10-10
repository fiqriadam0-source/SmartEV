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

test('Specification-aware flow is present in frontend pages', () => {
  assert.match(addItemPage, /spesifikasi|spec/gi)
  assert.match(fs.readFileSync(path.join(repoRoot, 'src/pages/RestockPage.jsx'), 'utf8'), /spesifikasi|spec/gi)
  assert.match(fs.readFileSync(path.join(repoRoot, 'src/pages/UsagePage.jsx'), 'utf8'), /spesifikasi|spec/gi)
})

test('Apps Script backend supports specification lookups', () => {
  assert.match(backend, /getSpecsByMaterial|spesifikasi/gi)
})

test('Restock logic prioritises the exact specification before the blank-spec fallback', () => {
  assert.match(
    fs.readFileSync(path.join(repoRoot, 'backend/stock.gs'), 'utf8'),
    /if\s*\(\s*spesifikasi\s*\)\s*\{[\s\S]*rowSpec\.toLowerCase\(\)\s*===\s*spesifikasi\.toLowerCase\(\)/m,
  )
})

test('Material labels with size suffix are normalized before spec and size matching', () => {
  const backendText = fs.readFileSync(path.join(repoRoot, 'backend/stock.gs'), 'utf8')
  assert.match(backendText, /splitMaterialLabel\(material\)|materialInfo\.material\s*\|\|\s*material/i)
  assert.match(backendText, /sameSpec\s*=\s*.*rowSpec.*spesifikasi|sameSize\s*=\s*.*rowSize.*targetSize/i)
})

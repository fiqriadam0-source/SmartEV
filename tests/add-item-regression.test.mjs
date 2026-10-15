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
  assert.match(backendText, /splitMaterialLabel\(material\)|splitMaterialLabel\(rowMaterial\)|materialInfo\.material\s*\|\|\s*material/i)
  assert.match(backendText, /sameSpec\s*=\s*.*rowSpec.*spesifikasi|sameSize\s*=\s*.*rowSize.*targetSize/i)
})

test('Stock material rows with size suffix still match the base material during restock spec lookup', () => {
  const backendText = fs.readFileSync(path.join(repoRoot, 'backend/stock.gs'), 'utf8')
  assert.match(
    backendText,
    /rowMaterial\s*=\s*String\(data\[i\]\[0\]\s*\|\|\s*""\)\.trim\(\);\s*var\s*rowMaterialInfo\s*=\s*splitMaterialLabel\(rowMaterial\);\s*var\s*rowMaterialName\s*=\s*\(rowMaterialInfo\.material\s*\|\|\s*rowMaterial\)\.trim\(\);/m,
  )
})

test('Material matching ignores uppercase spelling and repeated spaces', () => {
  const backendText = fs.readFileSync(path.join(repoRoot, 'backend/stock.gs'), 'utf8')
  assert.match(backendText, /normalizeText\(value\)|normalizeText\(rowMaterialName\) === normalizeText\(materialName\)/)
})

test('Restock page uses separate request counters for spec and size lookups', () => {
  const restockPage = fs.readFileSync(path.join(repoRoot, 'src/pages/RestockPage.jsx'), 'utf8')
  assert.match(restockPage, /const\s+specRequestRef\s*=\s*useRef\(0\)/)
  assert.match(restockPage, /const\s+sizeRequestRef\s*=\s*useRef\(0\)/)
  assert.match(restockPage, /requestId\s*=\s*\+\+specRequestRef\.current/)
  assert.match(restockPage, /requestId\s*=\s*\+\+sizeRequestRef\.current/)
})

test('Telegram announcements use the updated wording and support new-user alerts', () => {
  const backendText = fs.readFileSync(path.join(repoRoot, 'backend/stock.gs'), 'utf8')
  assert.match(backendText, /PERMOHONAN PENGELUARAN BARANG/i)
  assert.match(backendText, /PENAMBAHAN STOK BERJAYA|penambahan stok berjaya/i)
  assert.match(backendText, /sendTelegramNewUser|PENDAFTARAN PENGGUNA BARU|new user/i)
})

test('Usage request history includes specification details and keeps items distinct by specification', () => {
  const telegramPage = fs.readFileSync(path.join(repoRoot, 'src/pages/TelegramPage.jsx'), 'utf8')
  assert.match(telegramPage, /spesifikasi|Spesifikasi/i)
  assert.match(telegramPage, /itemKey.*spesifikasi|row\.spesifikasi|row\[7\]|item\.spesifikasi/i)
})

test('Staff cannot access inventory and request-record pages', () => {
  const permissions = fs.readFileSync(path.join(repoRoot, 'src/auth/permissions.js'), 'utf8')
  assert.match(permissions, /stock:\s*['"]storekeeper['"]/)
  assert.match(permissions, /telegram:\s*['"]storekeeper['"]/)
  assert.match(permissions, /usage:\s*['"]staff['"]/)
  assert.match(permissions, /return\s+profile\.role\s*===\s*['"]staff['\"]\s*\|\|\s*profile\.role\s*===\s*['"]admin['\"]/)
})

test('Backend notifies low stock below minimum and out-of-stock cases', () => {
  const backendText = fs.readFileSync(path.join(repoRoot, 'backend/stock.gs'), 'utf8')
  assert.match(backendText, /baki\s*<=\s*minimum|baki\s*>\s*0\s*&&\s*baki\s*<=\s*stockMinimum|stok\s*rendah.*minimum/i)
  assert.match(backendText, /sendTelegramOutOfStock|STOK HABIS|❌ STOCK HABIS/i)
  assert.match(backendText, /sendTelegramAlert\s*\([\s\S]*minimum[\s\S]*baki|baki[\s\S]*minimum[\s\S]*sendTelegramAlert/i)
})

test('Usage flow sends out-of-stock notification after the final stock decrement hits zero', () => {
  const backendText = fs.readFileSync(path.join(repoRoot, 'backend/stock.gs'), 'utf8')
  assert.match(backendText, /stokDigunakan\s*\+=\s*kuantiti;[\s\S]*baki\s*=\s*stokAwal\s*-\s*stokDigunakan;[\s\S]*if\s*\(\s*baki\s*<=\s*0\s*\)/m)
})

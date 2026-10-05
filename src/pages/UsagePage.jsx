import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet, apiPost, cleanList, extractMaterialParts, fetchUsageHistory } from '../api.js'
import MaterialCombobox from '../components/MaterialCombobox.jsx'
import StatusMessage from '../components/StatusMessage.jsx'
import { useRemoteData } from '../hooks/useRemoteData.js'

const UNIT_OPTIONS = ['', '', 'PCS', 'UNIT', '', 'BEG', '', '', '', '', '', '', '']

const LOOKUP_DELAY_MS = 360

let rowCounter = 0

function createEmptyItem() {
  rowCounter += 1
  return {
    id: rowCounter,
    material: '',
    kuantiti: '',
    unit: '',
    saiz: '',
    availableSizes: [],
    balance: null,
    balanceUnit: '',
    balanceStatus: 'idle', // idle | loading | ok | error
  }
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const num = Number(value.replace(',', '.').trim())
    return Number.isFinite(num) ? num : null
  }
  return null
}

function parseBalancePayload(payload) {
  if (typeof payload === 'number' || typeof payload === 'string') {
    return { balance: toNumber(payload), balanceUnit: '', saiz: '' }
  }
  if (payload && typeof payload === 'object') {
    return {
      balance: toNumber(
        payload.balance ?? payload.baki ?? payload.stok ?? payload.stock ?? payload.quantity ?? payload.kuantiti,
      ),
      balanceUnit: String(payload.unit ?? '').trim(),
      saiz: String(payload.saiz ?? '').trim(),
    }
  }
  return { balance: null, balanceUnit: '', saiz: '' }
}

function normalizeHistoryRows(payload) {
  return payload
    .map((row) => {
      if (Array.isArray(row)) {
        return {
          date: String(row[0] ?? '').trim(),
          name: String(row[1] ?? '').trim(),
          material: String(row[2] ?? '').trim(),
          qty: String(row[3] ?? '').trim(),
          unit: String(row[4] ?? '').trim(),
          saiz: String(row[6] ?? '').trim(),
          tujuan: String(row[5] ?? '').trim(),
        }
      }
      if (row && typeof row === 'object') {
        return {
          date: String(row.tarikh ?? row.date ?? row.timestamp ?? '').trim(),
          name: String(row.nama ?? row.name ?? '').trim(),
          material: String(row.material ?? row.item ?? '').trim(),
          qty: String(row.kuantiti ?? row.quantity ?? row.qty ?? '').trim(),
          unit: String(row.unit ?? '').trim(),
          saiz: String(row.saiz ?? row.size ?? row.saiz_material ?? '').trim(),
          tujuan: String(row.tujuan ?? row.purpose ?? '').trim(),
        }
      }
      return null
    })
    .filter((row) => row && (row.material || row.name || row.qty))
    .slice(0, 40)
}

function UsagePage({ theme, materials, isLoadingMaterials, onSubmitted, defaultNama }) {
  const [nama, setNama] = useState(defaultNama || '')
  const [tujuan, setTujuan] = useState('')
  const [items, setItems] = useState(() => [createEmptyItem()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState({ type: 'idle', message: '' })
  const history = useRemoteData(fetchUsageHistory, [])
  const usageHistory = useMemo(() => normalizeHistoryRows(history.data), [history.data])

  const lookupTimersRef = useRef({})
  // Per-row request counters: a response is applied only if no newer lookup started since.
  const requestSeqRef = useRef({})

  useEffect(() => {
    const timers = lookupTimersRef.current
    return () => Object.values(timers).forEach(clearTimeout)
  }, [])

  const nextSeq = (key) => {
    requestSeqRef.current[key] = (requestSeqRef.current[key] || 0) + 1
    return requestSeqRef.current[key]
  }
  const isLatest = (key, seq) => requestSeqRef.current[key] === seq

  const updateItemById = (itemId, patch) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item,
      ),
    )
  }

  const fetchSizes = async (itemId, materialName) => {
    const key = `sizes:${itemId}`
    const seq = nextSeq(key)
    const lookupName = extractMaterialParts(materialName).material || materialName

    let sizes = []
    try {
      sizes = cleanList(await apiGet('getSizesByMaterial', { material: lookupName }))
    } catch (error) {
      console.error('Gagal load saiz:', error)
    }
    if (isLatest(key, seq)) updateItemById(itemId, { availableSizes: sizes })
  }

  const fetchBalance = async (itemId, materialName, sizeName) => {
    const key = `balance:${itemId}`
    const seq = nextSeq(key)

    updateItemById(itemId, { balance: null, balanceUnit: '', saiz: sizeName, balanceStatus: 'loading' })

    try {
      const payload = await apiGet('getBalanceByMaterial', { material: materialName, saiz: sizeName })
      const { balance, balanceUnit, saiz } = parseBalancePayload(payload)
      if (!Number.isFinite(balance)) throw new Error('Balance format not supported')
      if (isLatest(key, seq)) {
        updateItemById(itemId, (item) => ({ balance, balanceUnit, saiz: saiz || sizeName || item.saiz, balanceStatus: 'ok' }))
      }
    } catch {
      if (isLatest(key, seq)) {
        updateItemById(itemId, (item) => ({ balance: null, balanceUnit: '', saiz: sizeName || item.saiz, balanceStatus: 'error' }))
      }
    }
  }

  const cancelLookups = (itemId) => {
    clearTimeout(lookupTimersRef.current[itemId])
    delete lookupTimersRef.current[itemId]
    nextSeq(`sizes:${itemId}`)
    nextSeq(`balance:${itemId}`)
  }

  const scheduleLookup = (itemId, run, delay = LOOKUP_DELAY_MS) => {
    clearTimeout(lookupTimersRef.current[itemId])
    lookupTimersRef.current[itemId] = setTimeout(run, delay)
  }

  const changeMaterial = (itemId, value, { immediate = false } = {}) => {
    cancelLookups(itemId)
    updateItemById(itemId, {
      material: value,
      saiz: '',
      availableSizes: [],
      balance: null,
      balanceUnit: '',
      balanceStatus: 'idle',
    })

    const materialName = value.trim()
    if (!materialName) return
    scheduleLookup(
      itemId,
      () => {
        fetchSizes(itemId, materialName)
        fetchBalance(itemId, materialName, '')
      },
      immediate ? 0 : LOOKUP_DELAY_MS,
    )
  }

  const changeSize = (item, nextSize) => {
    updateItemById(item.id, { saiz: nextSize })
    const materialName = item.material.trim()
    if (materialName) scheduleLookup(item.id, () => fetchBalance(item.id, materialName, nextSize))
  }

  const addRow = () => setItems((prev) => [...prev, createEmptyItem()])

  const removeRow = (itemId) => {
    if (items.length === 1) {
      setStatus({ type: 'error', message: 'Sekurang-kurangnya satu material perlu disenaraikan.' })
      return
    }
    cancelLookups(itemId)
    setItems((prev) => prev.filter((item) => item.id !== itemId))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!nama.trim() || !tujuan.trim()) {
      setStatus({ type: 'error', message: 'Sila lengkapkan nama pengguna dan tujuan penggunaan.' })
      return
    }

    const validItems = items
      .map((item) => ({
        material: item.material.trim(),
        kuantiti: Number(item.kuantiti),
        unit: item.unit.trim(),
        saiz: item.saiz.trim(),
      }))
      .filter((item) => item.material && item.kuantiti > 0)

    if (validItems.length === 0) {
      setStatus({ type: 'error', message: 'Sila isi sekurang-kurangnya satu material dengan kuantiti yang sah.' })
      return
    }

    if (items.some((item) => item.material.trim() && item.balanceStatus === 'loading')) {
      setStatus({ type: 'idle', message: 'Sila tunggu semakan baki material selesai sebelum hantar rekod.' })
      return
    }

    const exceededItem = items.find((item) => {
      const requestedQty = Number(item.kuantiti)
      return (
        item.material.trim() &&
        requestedQty > 0 &&
        item.balanceStatus === 'ok' &&
        Number.isFinite(item.balance) &&
        requestedQty > item.balance
      )
    })

    if (exceededItem) {
      const unitLabel = exceededItem.balanceUnit || exceededItem.unit || 'unit'
      setStatus({
        type: 'error',
        message: `Kuantiti melebihi baki untuk ${exceededItem.material}. Baki semasa: ${exceededItem.balance} ${unitLabel}.`,
      })
      return
    }

    setIsSubmitting(true)
    setStatus({ type: 'idle', message: 'Permohonan sedang dihantar. Sila tunggu sebentar...' })

    try {
      const result = await apiPost({
        nama: nama.trim(),
        tujuan: tujuan.trim(),
        items: JSON.stringify(validItems),
      })

      if (result.includes('Berjaya') || result.includes('Success')) {
        setStatus({ type: 'success', message: result || 'Rekod penggunaan material berjaya dihantar.' })
        setNama('')
        setTujuan('')
        items.forEach((item) => cancelLookups(item.id))
        setItems([createEmptyItem()])
        history.reload()
        onSubmitted()
      } else {
        setStatus({ type: 'error', message: result || 'Permohonan tidak berjaya diproses.' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Ralat sambungan. Sila semak capaian internet dan cuba lagi.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass = `w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${theme.inputFocus}`
  const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700'

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <form
        onSubmit={handleSubmit}
        className="reveal reveal-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/10 sm:p-8"
      >
        <div className="mb-6">
          <h2 className={`font-display text-2xl text-slate-900 ${theme.heading}`}>Borang Pemohonan Bahan Guna Habis</h2>
          <p className="mt-1 text-sm font-medium uppercase tracking-wide text-slate-500">Sistem rekod bahan kerja</p>
        </div>

        <div className="mb-8 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="nama" className={labelClass}>Nama Pemohon</label>
            <input
              id="nama"
              type="text"
              placeholder="Contoh: Ahmad Bin Salleh"
              value={nama}
              onChange={(event) => setNama(event.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="tujuan" className={labelClass}>Tujuan Permohonan</label>
            <input
              id="tujuan"
              type="text"
              placeholder="Contoh: Penyelenggaraan Site A"
              value={tujuan}
              onChange={(event) => setTujuan(event.target.value)}
              className={inputClass}
              required
            />
          </div>
        </div>

        <p className="text-sm font-bold uppercase tracking-wide text-slate-800">Bahan yang diperlukan</p>
        <p className="mb-4 text-sm text-slate-500">Lengkapkan maklumat bahan diperlukan untuk permohonan ini.</p>

        <div className="mb-2 hidden gap-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <div>Material</div>
          <div>Kuantiti &amp; Saiz</div>
          <div>Unit</div>
          <div className="w-20 text-right">Tindakan</div>
        </div>

        <div className="space-y-3">
          {items.map((item) => {
            const hasMaterial = Boolean(item.material.trim())
            const isOverBalance = item.balanceStatus === 'ok' && Number(item.kuantiti || 0) > item.balance
            return (
              <div
                key={item.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-start"
              >
                <div>
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 md:hidden">Material</span>
                  <MaterialCombobox
                    value={item.material}
                    options={materials}
                    onChange={(value) => changeMaterial(item.id, value)}
                    onSelect={(value) => changeMaterial(item.id, value, { immediate: true })}
                    placeholder={isLoadingMaterials ? 'Memuat material...' : 'Pilih atau taip nama bahan'}
                    disabled={isSubmitting}
                    inputFocus={theme.inputFocus}
                  />
                </div>

                <div className="space-y-2">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 md:hidden">Kuantiti &amp; Saiz</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Kuantiti"
                    value={item.kuantiti}
                    onChange={(event) => updateItemById(item.id, { kuantiti: event.target.value })}
                    className={inputClass}
                    disabled={isSubmitting}
                    required
                  />
                  <select
                    value={item.saiz}
                    onChange={(event) => changeSize(item, event.target.value)}
                    disabled={isSubmitting || !hasMaterial || item.availableSizes.length === 0}
                    className={inputClass}
                  >
                    <option value="">
                      {!hasMaterial ? 'Pilih bahan dulu' : item.availableSizes.length === 0 ? 'Tiada saiz' : 'Pilih saiz'}
                    </option>
                    {item.availableSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>

                  {hasMaterial && item.balanceStatus === 'loading' && (
                    <p className="text-xs font-medium text-slate-500">Menyemak baki semasa...</p>
                  )}
                  {hasMaterial && item.balanceStatus === 'ok' && (
                    <p className={`text-xs font-bold ${isOverBalance ? 'text-rose-700' : 'text-emerald-700'}`}>
                      Baki tersedia: {item.balance} {item.balanceUnit || item.unit}
                      {item.saiz && <span className="font-medium text-slate-500"> · Saiz: {item.saiz}</span>}
                    </p>
                  )}
                  {hasMaterial && item.balanceStatus === 'error' && (
                    <p className="text-xs font-medium text-amber-700">Baki tidak dapat disemak secara masa nyata.</p>
                  )}
                </div>

                <div>
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 md:hidden">Unit</span>
                  <select
                    value={item.unit}
                    onChange={(event) => updateItemById(item.id, { unit: event.target.value })}
                    className={inputClass}
                    disabled={isSubmitting}
                  >
                    <option value="">Pilih unit</option>
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => removeRow(item.id)}
                  disabled={isSubmitting}
                  className="rounded-xl border border-rose-200 bg-white px-3 py-3 text-xs font-bold uppercase tracking-wide text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 md:w-20"
                >
                  Buang
                </button>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={isSubmitting}
          className="mt-4 rounded-xl border border-dashed border-slate-400 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-700 transition hover:border-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          + Tambah Bahan
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`mt-7 w-full rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition disabled:cursor-not-allowed disabled:bg-slate-400 ${theme.accent}`}
        >
          {isSubmitting ? 'Sedang Dihantar...' : 'Hantar Rekod'}
        </button>

        <StatusMessage status={status} className="mt-5" />

        <p className="mt-4 text-xs text-slate-500">Pastikan semua maklumat yang dihantar adalah tepat untuk tujuan rekod stor.</p>
      </form>

      <aside
        aria-label="Rekod penggunaan terkini"
        className={`reveal reveal-3 self-start rounded-3xl border p-6 shadow-xl shadow-slate-900/30 ${theme.sidePanel}`}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className={`font-display text-xl leading-tight ${theme.heading}`}>Usage History</h3>
          <button
            type="button"
            onClick={history.reload}
            disabled={history.isLoading}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-50"
          >
            {history.isLoading ? 'Memuat...' : 'Refresh'}
          </button>
        </div>
        <p className="mb-4 text-xs opacity-70">Rekod penggunaan terkini untuk rujukan pantas.</p>

        {history.error ? (
          <p className="text-sm text-rose-300">Gagal memuatkan usage history.</p>
        ) : usageHistory.length === 0 ? (
          <p className="text-sm opacity-70">
            {history.isLoading ? 'Sedang memuatkan usage history...' : 'Tiada data usage history.'}
          </p>
        ) : (
          <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {usageHistory.map((row, index) => (
              <div
                key={`${row.date}-${row.name}-${row.material}-${index}`}
                className={`rounded-xl border p-3 text-sm ${index === 0 ? 'border-emerald-300 bg-emerald-50/80' : theme.sideItem}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold leading-tight">{row.material || '-'}</p>
                      {index === 0 && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Terbaharu
                        </span>
                      )}
                    </div>
                    {row.saiz && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Saiz: {row.saiz}</p>}
                  </div>
                  <span className="shrink-0 font-bold">
                    {row.qty || '-'} {row.unit}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-70">
                  {row.name || '-'} · {row.date || '-'}
                </p>
                {row.tujuan && <p className="mt-1 text-[11px] opacity-70">Tujuan: {row.tujuan}</p>}
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}

export default UsagePage

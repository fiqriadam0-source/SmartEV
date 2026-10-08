import { useMemo } from 'react'
import { fetchUsageHistory } from '../api.js'
import { useRemoteData } from '../hooks/useRemoteData.js'

function normalizeHistoryRows(payload) {
  const rows = payload
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

  const grouped = []
  const requestIndex = new Map()

  rows.forEach((row) => {
    const requestKey = `${row.date || 'unknown'}|${row.name || ''}|${row.tujuan || ''}`
    const existing = requestIndex.get(requestKey)

    if (!existing) {
      const newGroup = {
        date: row.date,
        name: row.name,
        tujuan: row.tujuan,
        items: [
          {
            material: row.material,
            qty: row.qty,
            unit: row.unit,
            saiz: row.saiz,
          },
        ],
      }
      requestIndex.set(requestKey, newGroup)
      grouped.push(newGroup)
      return
    }

    const itemKey = `${(row.material || '').toLowerCase()}|${(row.saiz || '').toLowerCase()}`
    const currentItem = existing.items.find((item) => {
      const key = `${(item.material || '').toLowerCase()}|${(item.saiz || '').toLowerCase()}`
      return key === itemKey
    })

    if (currentItem) {
      const mergedQty = Number(currentItem.qty || 0) + Number(row.qty || 0)
      currentItem.qty = Number.isFinite(mergedQty) ? String(mergedQty) : `${currentItem.qty || 0}${row.qty ? ` + ${row.qty}` : ''}`
      return
    }

    existing.items.push({
      material: row.material,
      qty: row.qty,
      unit: row.unit,
      saiz: row.saiz,
    })
  })

  return grouped.slice(0, 20)
}

function TelegramPage({ theme }) {
  const history = useRemoteData(fetchUsageHistory, [])
  const usageHistory = useMemo(() => normalizeHistoryRows(history.data), [history.data])

  return (
    <div className="mx-auto max-w-5xl">
      <div className={`rounded-3xl border p-6 shadow-2xl backdrop-blur-lg sm:p-8 ${theme.panel}`}>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className={`font-display text-3xl text-slate-900 ${theme.heading}`}>History Usage</h2>
            <p className="mt-2 text-sm text-slate-500">Senarai penggunaan bahan terkini termasuk saiz dan rekod terbaharu.</p>
          </div>

          <button
            type="button"
            onClick={history.reload}
            disabled={history.isLoading}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {history.isLoading ? 'Memuat...' : 'Refresh'}
          </button>
        </div>

        {history.error ? (
          <p className="text-sm text-rose-600">Gagal memuatkan history usage.</p>
        ) : usageHistory.length === 0 ? (
          <p className="text-sm text-slate-500">
            {history.isLoading ? 'Sedang memuatkan history usage...' : 'Tiada data history usage.'}
          </p>
        ) : (
          <div className="space-y-3">
            {usageHistory.map((row, index) => (
              <div
                key={`${row.date}-${row.name}-${row.tujuan}-${index}`}
                className={`rounded-2xl border p-4 ${index === 0 ? 'border-emerald-300 bg-emerald-50/80' : 'border-slate-200 bg-white/70'}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold leading-tight text-slate-900">{row.name || '-'}</p>
                      {index === 0 && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Terbaharu
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{row.date || '-'}</p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Permohonan</p>
                    <p className="text-sm text-slate-700">{row.items.length} item</p>
                  </div>
                </div>

                <div className="mt-3 space-y-2 rounded-xl bg-slate-50/80 p-3">
                  {row.items.map((item, itemIndex) => (
                    <div key={`${row.date}-${item.material}-${item.saiz}-${itemIndex}`} className="flex flex-col gap-1 border-b border-slate-200 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{item.material || '-'}</p>
                        {item.saiz && <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Saiz: {item.saiz}</p>}
                      </div>
                      <p className="font-bold text-slate-700">
                        {item.qty || '-'} {item.unit || ''}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    <span className="font-semibold text-slate-800">Pemohon:</span> {row.name || '-'}
                  </p>
                  {row.tujuan && <p className="text-xs text-slate-500">Tujuan: {row.tujuan}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TelegramPage

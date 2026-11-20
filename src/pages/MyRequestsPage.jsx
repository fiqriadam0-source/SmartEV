import { useMemo } from 'react'
import { fetchMyRequests } from '../api.js'
import { useRemoteData } from '../hooks/useRemoteData.js'

function formatRequestTimestamp(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('ms-MY')
}

function MyRequestsPage({ theme }) {
  const requests = useRemoteData(fetchMyRequests, [])

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const row of requests.data) {
      if (!groups.has(row.request_id)) {
        groups.set(row.request_id, { ...row, items: [] })
      }
      groups.get(row.request_id).items.push(row)
    }
    return [...groups.values()]
  }, [requests.data])

  const statusStyle = (status) => ({
    pending: 'border-amber-300 bg-amber-50 text-amber-800',
    approved: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    rejected: 'border-rose-300 bg-rose-50 text-rose-800',
  }[status] || 'border-slate-300 bg-slate-50 text-slate-700')

  const statusLabel = (status) => ({ pending: 'Menunggu', approved: 'Diluluskan', rejected: 'Ditolak' }[status] || status)

  return (
    <div className="mx-auto max-w-5xl">
      <div className={`rounded-3xl border p-6 shadow-2xl backdrop-blur-lg sm:p-8 ${theme.panel}`}>
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 className={`font-display text-3xl text-slate-900 ${theme.heading}`}>PERMOHONAN SAYA</h2>
            <p className="mt-2 text-sm text-slate-500">Status permohonan barang terkini.</p>
          </div>
          <button type="button" onClick={requests.reload} disabled={requests.isLoading} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60">
            {requests.isLoading ? 'Memuat...' : 'Refresh'}
          </button>
        </div>

        {requests.error && <p className="text-sm text-rose-600">Gagal memuat permohonan.</p>}
        {!requests.error && grouped.length === 0 && <p className="text-sm text-slate-500">Tiada permohonan.</p>}

        <div className="space-y-3">
          {grouped.map((request) => (
            <div key={request.request_id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{request.request_id}</p>
                  <p className="mt-1 text-sm text-slate-600">{formatRequestTimestamp(request.timestamp)}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyle(request.status)}`}>
                  {statusLabel(request.status)}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600"><span className="font-bold text-slate-800">Tujuan:</span> {request.purpose || '-'}</p>
              <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                {request.items.map((item, index) => (
                  <div key={`${item.request_id}-${index}`} className="flex justify-between gap-3 text-sm">
                    <p className="font-semibold text-slate-900">{item.material}{item.saiz ? ` · ${item.saiz}` : ''}{item.spesifikasi ? ` · ${item.spesifikasi}` : ''}</p>
                    <p className="shrink-0 font-bold text-slate-700">{item.kuantiti} {item.unit}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MyRequestsPage

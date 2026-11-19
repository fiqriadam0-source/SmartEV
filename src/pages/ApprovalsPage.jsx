import { useMemo, useState } from 'react'
import { approveUsageRequest, fetchPendingRequests, rejectUsageRequest } from '../api.js'
import { useRemoteData } from '../hooks/useRemoteData.js'
import StatusMessage from '../components/StatusMessage.jsx'

function ApprovalsPage({ theme }) {
  const requests = useRemoteData(fetchPendingRequests, [])
  const [busyId, setBusyId] = useState('')
  const [status, setStatus] = useState({ type: 'idle', message: '' })

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const row of requests.data) {
      if (!groups.has(row.request_id)) groups.set(row.request_id, { ...row, items: [] })
      groups.get(row.request_id).items.push(row)
    }
    return [...groups.values()]
  }, [requests.data])

  const processRequest = async (requestId, action) => {
    setBusyId(requestId)
    setStatus({ type: 'idle', message: 'Memproses permohonan...' })
    try {
      const result = action === 'approve'
        ? await approveUsageRequest(requestId)
        : await rejectUsageRequest(requestId)
      setStatus({ type: result.includes('Error') ? 'error' : 'success', message: result })
      requests.reload()
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Permohonan gagal diproses.' })
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className={`rounded-3xl border p-6 shadow-2xl backdrop-blur-lg sm:p-8 ${theme.panel}`}>
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 className={`font-display text-3xl text-slate-900 ${theme.heading}`}>KELULUSAN BARANG</h2>
            <p className="mt-2 text-sm text-slate-500">Permohonan menunggu keputusan admin.</p>
          </div>
          <button type="button" onClick={requests.reload} disabled={requests.isLoading} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60">
            {requests.isLoading ? 'Memuat...' : 'Refresh'}
          </button>
        </div>

        <StatusMessage status={status} className="mb-4" />
        {requests.error && <p className="text-sm text-rose-600">Gagal memuat permohonan.</p>}
        {!requests.error && grouped.length === 0 && <p className="text-sm text-slate-500">{requests.isLoading ? 'Sedang memuat...' : 'Tiada permohonan menunggu kelulusan.'}</p>}

        <div className="space-y-3">
          {grouped.map((request) => (
            <div key={request.request_id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{request.request_id}</p>
                  <p className="mt-1 font-bold text-slate-900">{request.applicant_name || '-'}</p>
                  <p className="text-xs text-slate-500">{request.applicant_email || '-'}</p>
                </div>
                <p className="text-xs text-slate-500">{request.timestamp ? new Date(request.timestamp).toLocaleString('ms-MY') : '-'}</p>
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
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={busyId === request.request_id} onClick={() => processRequest(request.request_id, 'approve')} className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Lulus</button>
                <button type="button" disabled={busyId === request.request_id} onClick={() => processRequest(request.request_id, 'reject')} className="flex-1 rounded-xl bg-rose-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Tolak</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ApprovalsPage

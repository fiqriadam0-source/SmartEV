import { useState } from 'react'
import { apiPost } from '../api.js'
import StatusMessage from '../components/StatusMessage.jsx'

const ADD_ITEM_ENABLED = true

function AddItemPage({ theme, stockState }) {
  const [material, setMaterial] = useState('')
  const [saiz, setSaiz] = useState('')
  const [stokAwal, setStokAwal] = useState('')
  const [minimum, setMinimum] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState({ type: 'idle', message: '' })

  const handleSubmit = async (event) => {
    event.preventDefault()

    const materialName = material.trim()
    if (!materialName) {
      setStatus({ type: 'error', message: 'Nama bahan wajib diisi.' })
      return
    }

    const stokAwalValue = Number(stokAwal)
    if (!Number.isFinite(stokAwalValue) || stokAwalValue < 0) {
      setStatus({ type: 'error', message: 'Stok awal mesti nombor yang sah dan tidak negatif.' })
      return
    }

    const minimumValue = Number(minimum)
    if (!Number.isFinite(minimumValue) || minimumValue < 0) {
      setStatus({ type: 'error', message: 'Nilai minimum mesti nombor yang sah dan tidak negatif.' })
      return
    }

    setIsSubmitting(true)
    setStatus({ type: 'idle', message: 'Menyimpan item baru...' })

    try {
      const resultText = await apiPost({
        type: 'addItem',
        material: materialName,
        saiz: saiz.trim(),
        stokAwal: String(stokAwalValue),
        minimum: String(minimumValue),
      })

      if (resultText.includes('Error')) {
        setStatus({ type: 'error', message: resultText })
        return
      }

      setStatus({ type: 'success', message: resultText || 'Item baru berjaya ditambah ke sheet.' })
      setMaterial('')
      setSaiz('')
      setStokAwal('')
      setMinimum('')
      stockState.reload()
    } catch {
      setStatus({ type: 'error', message: 'Tidak dapat menghubungi server. Semak talian internet.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <form
        onSubmit={handleSubmit}
        className="reveal reveal-2 lift-card rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/10 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className={`font-display text-2xl text-slate-900 ${theme.heading}`}>Tambah Item Baru</h2>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            Admin
          </span>
        </div>

        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">Nama Bahan</label>
        <input
          type="text"
          value={material}
          onChange={(event) => setMaterial(event.target.value)}
          placeholder="Contoh: Paip PVC"
          className={`mb-6 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`}
          disabled={isSubmitting}
          required
        />

        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">Saiz</label>
        <input
          type="text"
          value={saiz}
          onChange={(event) => setSaiz(event.target.value)}
          placeholder="Contoh: 1/2, 1, 4mm"
          className={`mb-6 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`}
          disabled={isSubmitting}
        />

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">Stok Awal</label>
            <input
              type="number"
              min="0"
              step="1"
              value={stokAwal}
              onChange={(event) => setStokAwal(event.target.value)}
              placeholder="0"
              className={`w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`}
              disabled={isSubmitting || !ADD_ITEM_ENABLED}
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">Minimum</label>
            <input
              type="number"
              min="0"
              step="1"
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
              placeholder="0"
              className={`w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`}
              disabled={isSubmitting || !ADD_ITEM_ENABLED}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`mt-7 w-full rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition disabled:cursor-not-allowed disabled:bg-slate-400 ${theme.accent}`}
        >
          {isSubmitting ? 'Menyimpan...' : 'Tambah Item'}
        </button>

        <StatusMessage status={status} className="mt-5" />
      </form>

      <aside className={`reveal reveal-3 lift-card rounded-3xl border p-6 shadow-xl shadow-slate-900/30 sm:p-8 ${theme.sidePanel}`}>
        <h3 className={`font-display text-2xl leading-tight ${theme.heading}`}>Panduan</h3>
        <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
          <li>• Data baru akan ditambah terus ke lembaran Stock.</li>
          <li>• Stok awal akan dipaparkan sebagai baki semasa item tersebut ditambah.</li>
          <li>• Saiz boleh dikosongkan jika bahan hanya ada satu saiz.</li>
          <li>• Hanya akaun Admin yang boleh mengakses halaman ini.</li>
        </ul>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
          <p className="font-bold uppercase tracking-wide text-slate-700">Kolum sheet</p>
          <p className="mt-2">A = Bahan, B = Stok Awal, C = Digunakan, D = Baki, E = Minimum, F = Saiz</p>
        </div>
      </aside>
    </div>
  )
}

export default AddItemPage

import { useEffect, useMemo, useState } from 'react'
import { apiGet, cleanList } from '../api.js'
import StockList from '../components/StockList.jsx'

function StockPage({ theme, stockState }) {
  const [selectedCategory, setSelectedCategory] = useState('')
  const [categoryOptions, setCategoryOptions] = useState([])

  useEffect(() => {
    let isMounted = true
    apiGet('getCategories')
      .then((result) => {
        if (!isMounted) return
        setCategoryOptions(cleanList(result))
      })
      .catch((error) => {
        console.error('Gagal memuat kategori:', error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const filteredStock = useMemo(() => {
    if (!selectedCategory) return []

    return (stockState.stock || []).filter((item) => {
      const itemCategory = String(item.kategori || '').trim()
      return itemCategory.toLowerCase() === selectedCategory.toLowerCase()
    })
  }, [selectedCategory, stockState.stock])

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className={`rounded-3xl border p-4 shadow-xl sm:p-6 lg:p-8 ${theme.sidePanel}`}>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className={`font-display text-2xl sm:text-3xl ${theme.heading}`}>Senarai Barang</h2>
          <button
            type="button"
            onClick={stockState.reload}
            disabled={stockState.isLoading}
            className="w-full rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-50 sm:w-auto"
          >
            {stockState.isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">Kategori</label>
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className={`w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`}
          >
            <option value="">Pilih kategori</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        {!selectedCategory ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
            Pilih kategori untuk melihat senarai bahan.
          </div>
        ) : (
          <StockList
            stock={filteredStock}
            isLoading={stockState.isLoading}
            error={stockState.error}
            theme={theme}
            variant="grid"
          />
        )}
      </div>
    </div>
  )
}

export default StockPage

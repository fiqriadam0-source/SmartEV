// Stock rows from ?action=getStock: { material, spesifikasi, saiz, baki, minimum }.
function StockList({ stock, isLoading, error, theme, variant = 'compact' }) {
  if (isLoading) return <p className="text-sm opacity-70">Sedang memuatkan stock...</p>
  if (error) return <p className="text-sm text-rose-300">{error}</p>

  const normalizedStock = Array.isArray(stock)
    ? stock.reduce((accumulator, item) => {
        const materialName = String(item.material || '').trim()
        const sizeName = String(item.saiz || '').trim()
        const specificationName = String(item.spesifikasi || '').trim()
        if (!materialName) return accumulator

        const key = `${materialName.toLowerCase()}::${sizeName.toLowerCase()}::${specificationName.toLowerCase()}`
        const nextItem = {
          material: materialName,
          spesifikasi: specificationName,
          saiz: sizeName,
          baki: Number(item.baki) || 0,
          minimum: Number(item.minimum) || 0,
        }

        if (!accumulator[key]) {
          accumulator[key] = nextItem
          return accumulator
        }

        if (nextItem.baki > accumulator[key].baki) {
          accumulator[key].baki = nextItem.baki
        }
        if (nextItem.minimum > accumulator[key].minimum) {
          accumulator[key].minimum = nextItem.minimum
        }
        return accumulator
      }, {})
    : {}

  const rows = Object.values(normalizedStock)
  if (rows.length === 0) return <p className="text-sm opacity-70">Tiada data stock.</p>

  const isGrid = variant === 'grid'

  return (
    <div className={isGrid ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'max-h-96 space-y-3 overflow-y-auto pr-1'}>
      {rows.map((item, index) => {
        const isLow = Number(item.baki) <= Number(item.minimum)
        return (
          <div
            key={`${item.material}-${item.saiz ?? ''}-${index}`}
            className={`border ${isGrid ? 'rounded-2xl p-5' : 'rounded-xl p-4 text-sm'} ${theme.sideItem}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`font-bold leading-tight ${isGrid ? 'text-lg' : ''}`}>{item.material}</p>
              <span
                className={`shrink-0 rounded-full font-bold ${isGrid ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'} ${
                  isLow ? 'bg-red-500/25 text-red-300' : 'bg-emerald-500/25 text-emerald-300'
                }`}
              >
                {item.baki}
              </span>
            </div>
            {item.spesifikasi && <p className={`mt-1 opacity-80 ${isGrid ? 'text-sm' : 'text-xs'}`}>Spesifikasi: {item.spesifikasi}</p>}
            {item.saiz && <p className={`mt-1 opacity-80 ${isGrid ? 'text-sm' : 'text-xs'}`}>Saiz: {item.saiz}</p>}
            <p className={`mt-1 opacity-70 ${isGrid ? 'text-sm' : 'text-xs'}`}>Minimum: {item.minimum}</p>
          </div>
        )
      })}
    </div>
  )
}

export default StockList

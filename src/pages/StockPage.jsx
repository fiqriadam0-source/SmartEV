import StockList from '../components/StockList.jsx'

function StockPage({ theme, stockState }) {
  return (
    <div className={`rounded-3xl border p-6 shadow-xl sm:p-8 ${theme.sidePanel}`}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className={`font-display text-3xl ${theme.heading}`}>Senarai Barang</h2>
        <button
          type="button"
          onClick={stockState.reload}
          disabled={stockState.isLoading}
          className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-50"
        >
          {stockState.isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <StockList
        stock={stockState.stock}
        isLoading={stockState.isLoading}
        error={stockState.error}
        theme={theme}
        variant="grid"
      />
    </div>
  )
}

export default StockPage

import { useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, cleanList, extractMaterialParts } from '../api.js'
import MaterialCombobox from '../components/MaterialCombobox.jsx'
import StatusMessage from '../components/StatusMessage.jsx'
import StockList from '../components/StockList.jsx'

function RestockPage({ theme, materials, isLoadingMaterials, stockState }) {
  const [kategori, setKategori] = useState('')
  const [material, setMaterial] = useState('')
  const [spesifikasi, setSpesifikasi] = useState('')
  const [saiz, setSaiz] = useState('')
  const [availableSpecs, setAvailableSpecs] = useState([])
  const [availableSizes, setAvailableSizes] = useState([])
  const [categoryOptions, setCategoryOptions] = useState([])
  const [materialOptionsByCategory, setMaterialOptionsByCategory] = useState({})
  const [kuantiti, setKuantiti] = useState('')
  const [isLoadingSizes, setIsLoadingSizes] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState({ type: 'idle', message: '' })
  const specRequestRef = useRef(0)
  const sizeRequestRef = useRef(0)

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

  const normalizeMaterial = (value) => {
    const raw = String(value || '').trim().replace(/\s+/g, ' ')
    const materialPart = extractMaterialParts(raw).material || raw
    return materialPart.trim().replace(/\s+/g, ' ')
  }

  const loadMaterialsForCategory = async (selectedCategory) => {
    const cleanCategory = String(selectedCategory || '').trim()
    if (!cleanCategory) {
      return []
    }

    try {
      const materialsForCategory = cleanList(
        await apiGet('getMaterialsByCategory', { kategori: cleanCategory }),
      )
      setMaterialOptionsByCategory((prev) => ({ ...prev, [cleanCategory]: materialsForCategory }))
      return materialsForCategory
    } catch (error) {
      console.error('Gagal load bahan mengikut kategori:', error)
      setMaterialOptionsByCategory((prev) => ({ ...prev, [cleanCategory]: [] }))
      return []
    }
  }

  const fetchSpecsForMaterial = async (selectedMaterial, selectedCategory = '') => {
    const cleanMaterial = String(selectedMaterial || '').trim()
    const normalizedMaterial = normalizeMaterial(cleanMaterial)
    const requestId = ++specRequestRef.current

    setSpesifikasi('')
    setAvailableSpecs([])
    if (!normalizedMaterial) return

    try {
      const specs = cleanList(
        await apiGet('getSpecsByMaterial', { material: normalizedMaterial, kategori: selectedCategory }),
      )
      if (requestId !== specRequestRef.current) return
      setAvailableSpecs(specs)
      if (specs.length === 1) {
        setSpesifikasi(specs[0])
        await fetchSizesForMaterial(cleanMaterial, specs[0], selectedCategory)
      }
    } catch {
      if (requestId === specRequestRef.current) setAvailableSpecs([])
    }
  }

  const fetchSizesForMaterial = async (selectedMaterial, selectedSpec = '', selectedCategory = '') => {
    const cleanMaterial = String(selectedMaterial || '').trim()
    const normalizedMaterial = normalizeMaterial(cleanMaterial)
    const requestId = ++sizeRequestRef.current

    setSaiz('')
    setAvailableSizes([])
    if (!normalizedMaterial) return

    setIsLoadingSizes(true)
    try {
      const sizes = cleanList(
        await apiGet('getSizesByMaterial', {
          material: normalizedMaterial,
          spesifikasi: selectedSpec,
          kategori: selectedCategory,
        }),
      )
      if (requestId !== sizeRequestRef.current) return
      setAvailableSizes(sizes)
      if (sizes.length === 1) setSaiz(sizes[0])
    } catch {
      if (requestId === sizeRequestRef.current) setAvailableSizes([])
    } finally {
      if (requestId === sizeRequestRef.current) setIsLoadingSizes(false)
    }
  }

  const handleCategoryChange = (nextCategory) => {
    const cleanCategory = String(nextCategory || '').trim()
    setKategori(cleanCategory)
    setMaterial('')
    setSpesifikasi('')
    setSaiz('')
    setAvailableSpecs([])
    setAvailableSizes([])

    if (!cleanCategory) return
    loadMaterialsForCategory(cleanCategory)
  }

  const handleMaterialChange = (nextMaterial) => {
    const cleanMaterial = String(nextMaterial || '').trim()
    setMaterial(cleanMaterial)
    setSpesifikasi('')
    setSaiz('')
    setAvailableSpecs([])
    setAvailableSizes([])

    if (!cleanMaterial) return
    fetchSpecsForMaterial(cleanMaterial, kategori)
    fetchSizesForMaterial(cleanMaterial, '', kategori)
  }

  const handleSpecChange = (nextSpec) => {
    const cleanSpec = String(nextSpec || '').trim()
    setSpesifikasi(cleanSpec)
    setSaiz('')
    setAvailableSizes([])

    if (material.trim()) {
      fetchSizesForMaterial(material, cleanSpec, kategori)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!kategori.trim()) {
      setStatus({ type: 'error', message: 'Kategori bahan wajib dipilih.' })
      return
    }

    if (!material.trim()) {
      setStatus({ type: 'error', message: 'Material wajib diisi.' })
      return
    }

    if (availableSpecs.length > 0 && !spesifikasi.trim()) {
      setStatus({ type: 'error', message: 'Sila pilih spesifikasi bahan sebelum hantar restok.' })
      return
    }

    if (availableSizes.length > 0 && !saiz.trim()) {
      setStatus({ type: 'error', message: 'Sila pilih saiz bahan sebelum hantar restok.' })
      return
    }

    const jumlah = Number(kuantiti)
    if (!jumlah || jumlah < 1) {
      setStatus({ type: 'error', message: 'Kuantiti mesti sekurang-kurangnya 1.' })
      return
    }

    setIsSubmitting(true)
    setStatus({ type: 'idle', message: 'Menghantar restok...' })

    try {
      const resultText = await apiPost({
        kategori: kategori.trim(),
        material: material.trim(),
        spesifikasi: spesifikasi.trim(),
        saiz: saiz.trim(),
        kuantiti: String(jumlah),
        type: 'restock',
      })

      if (resultText.includes('Restock Success')) {
        setStatus({ type: 'success', message: 'Restock berjaya direkod.' })
        setKuantiti('')
        stockState.reload()
      } else if (resultText.includes('Error')) {
        setStatus({ type: 'error', message: resultText })
      } else {
        setStatus({ type: 'success', message: resultText })
      }
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
        <div className="mb-6 flex items-center justify-between">
          <h2 className={`font-display text-2xl text-slate-900 ${theme.heading}`}>Borang Restok</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-600">
            Live
          </span>
        </div>

        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">KATEGORI</label>
        <select
          value={kategori}
          onChange={(event) => handleCategoryChange(event.target.value)}
          disabled={isSubmitting}
          className={`mb-6 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`}
        >
          <option value="">Pilih kategori</option>
          {categoryOptions.map((categoryOption) => (
            <option key={categoryOption} value={categoryOption}>{categoryOption}</option>
          ))}
        </select>

        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">BARANG</label>
        <div className="mb-6">
          <MaterialCombobox
            value={material}
            options={materialOptionsByCategory[kategori] || materials}
            onChange={(text) => {
              handleMaterialChange(text)
            }}
            onSelect={(item) => {
              handleMaterialChange(item)
            }}
            onBlur={() => {
              if (material.trim()) {
                handleMaterialChange(material)
              }
            }}
            placeholder={isLoadingMaterials ? 'Memuat Barang...' : kategori ? 'Taip atau pilih barang dalam kategori ini' : 'Pilih kategori dahulu'}
            disabled={isLoadingMaterials || isSubmitting || !kategori}
            inputFocus={theme.inputFocus}
          />
        </div>

        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">Spesifikasi</label>
        <select
          value={spesifikasi}
          onChange={(event) => {
            handleSpecChange(event.target.value)
          }}
          disabled={isLoadingSizes || isSubmitting || !material.trim() || availableSpecs.length === 0}
          className={`mb-6 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`}
        >
          <option value="">
            {!material.trim()
              ? 'Pilih Barang Dahulu'
              : isLoadingSizes
                ? 'Memuat spesifikasi...'
                : availableSpecs.length === 0
                  ? 'Tiada spesifikasi (boleh teruskan)'
                  : 'Pilih spesifikasi'}
          </option>
          {availableSpecs.map((specOption) => (
            <option key={specOption} value={specOption}>
              {specOption}
            </option>
          ))}
        </select>

        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">Saiz</label>
        <select
          value={saiz}
          onChange={(event) => setSaiz(event.target.value)}
          disabled={isLoadingSizes || isSubmitting || !material.trim() || availableSizes.length === 0}
          className={`mb-6 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`}
        >
          <option value="">
            {!material.trim()
              ? 'Pilih Barang Dahulu'
              : isLoadingSizes
                ? 'Memuat saiz...'
                : availableSizes.length === 0
                  ? 'Tiada saiz untuk Barang ini'
                  : 'Pilih saiz'}
          </option>
          {availableSizes.map((sizeOption) => (
            <option key={sizeOption} value={sizeOption}>
              {sizeOption}
            </option>
          ))}
        </select>

        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700">Kuantiti</label>
        <input
          type="number"
          min="1"
          value={kuantiti}
          onChange={(event) => setKuantiti(event.target.value)}
          placeholder="Masukkan jumlah"
          className={`mb-7 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`}
          disabled={isSubmitting}
          required
        />

        <button
          type="submit"
          disabled={isSubmitting || isLoadingMaterials}
          className={`w-full rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition disabled:cursor-not-allowed disabled:bg-slate-400 ${theme.accent}`}
        >
          {isSubmitting ? 'Menghantar...' : 'Hantar Restok'}
        </button>

        <StatusMessage status={status} className="mt-5" />
      </form>

      <aside className={`reveal reveal-3 lift-card rounded-3xl border p-6 shadow-xl shadow-slate-900/30 sm:p-8 ${theme.sidePanel}`}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className={`font-display text-2xl leading-tight ${theme.heading}`}>Senarai Barang</h3>
          <button
            type="button"
            onClick={stockState.reload}
            disabled={stockState.isLoading}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-50"
          >
            {stockState.isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <StockList stock={stockState.stock} isLoading={stockState.isLoading} error={stockState.error} theme={theme} />
      </aside>
    </div>
  )
}

export default RestockPage

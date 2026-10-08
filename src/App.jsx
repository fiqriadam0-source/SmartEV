import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchMaterials, fetchStock } from './api.js'
import { canAccessPage, hasRole, PAGE_ROLES } from './auth/permissions.js'
import useAuth from './auth/useAuth.js'
import { useInstallPrompt } from './hooks/useInstallPrompt.js'
import { useRemoteData } from './hooks/useRemoteData.js'
import LoginPage from './pages/auth/LoginPage.jsx'
import PendingApprovalPage from './pages/auth/PendingApprovalPage.jsx'
import SignUpPage from './pages/auth/SignUpPage.jsx'
import AddItemPage from './pages/AddItemPage.jsx'
import RestockPage from './pages/RestockPage.jsx'
import StockPage from './pages/StockPage.jsx'
import TelegramPage from './pages/TelegramPage.jsx'
import UsagePage from './pages/UsagePage.jsx'
import UsersPage from './pages/UsersPage.jsx'
import { THEMES } from './themes.js'

const PAGES = [
  { id: 'usage', label: 'PERMOHONAN BARANG', icon: '🧰' },
  { id: 'restock', label: 'RESTOK BARANG', icon: '📦' },
  { id: 'newitem', label: 'TAMBAH BARANG', icon: '➕' },
  { id: 'stock', label: 'INVENTORI BARANG', icon: '📋' },
  { id: 'telegram', label: 'REKOD PERMOHONAN', icon: '🕘' },
  { id: 'users', label: 'PENGURUSAN PENGGUNA', icon: '👤' },
]

const ROLE_LABEL = { staff: 'Staff', storekeeper: 'Storekeeper', admin: 'Admin' }

// The page lives in the URL hash (#usage, #restock, ...) so each page can be linked directly.
function pageFromHash() {
  const id = window.location.hash.replace('#', '')
  return PAGES.some((page) => page.id === id) ? id : PAGES[0].id
}

function setHash(pageId) {
  window.location.hash = pageId
}

function App() {
  const { session, profile, loading: authLoading, signOut } = useAuth()
  const [currentPage, setCurrentPage] = useState(pageFromHash)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [themeId, setThemeId] = useState('corporate')
  const [authView, setAuthView] = useState('login')
  const menuRef = useRef(null)

  const materials = useRemoteData(fetchMaterials, [])
  const stock = useRemoteData(fetchStock, [])
  const installPrompt = useInstallPrompt()

  const visiblePages = useMemo(
    () => PAGES.filter((page) => canAccessPage(profile, page.id)),
    [profile],
  )

  const stockState = {
    stock: stock.data,
    isLoading: stock.isLoading,
    error: stock.error ? 'Gagal memuat maklumat stock.' : null,
    reload: stock.reload,
  }

  const activeTheme = useMemo(() => THEMES.find((theme) => theme.id === themeId) ?? THEMES[0], [themeId])

  useEffect(() => {
    const onHashChange = () => setCurrentPage(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Close the menu when clicking outside it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  // If a role change (or the hash) points at a page this account can't open, fall back to the first allowed one.
  useEffect(() => {
    if (visiblePages.length === 0) return
    if (visiblePages.some((page) => page.id === currentPage)) return
    const t = setTimeout(() => {
      setHash(visiblePages[0].id)
      setCurrentPage(visiblePages[0].id)
    }, 0)
    return () => clearTimeout(t)
  }, [visiblePages, currentPage])

  const changePage = (pageId) => {
    setHash(pageId)
    setCurrentPage(pageId)
    setIsMenuOpen(false)
  }

  const activePage = visiblePages.find((page) => page.id === currentPage) ?? visiblePages[0]

  if (authLoading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${activeTheme.shell}`}>
        <p className="text-sm font-semibold text-slate-500">Memuat...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className={`relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 ${activeTheme.shell}`}>
        <div className={`absolute -left-24 top-10 h-72 w-72 rounded-full blur-3xl ${activeTheme.orbA}`} />
        <div className={`absolute right-0 top-0 h-80 w-80 rounded-full blur-3xl ${activeTheme.orbB}`} />
        <div className="relative w-full">
          {authView === 'login' ? (
            <LoginPage theme={activeTheme} onSwitchToSignUp={() => setAuthView('signup')} />
          ) : (
            <SignUpPage theme={activeTheme} onSwitchToLogin={() => setAuthView('login')} />
          )}
        </div>
      </main>
    )
  }

  if (!profile || profile.status !== 'active') {
    return (
      <main className={`relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 ${activeTheme.shell}`}>
        <div className={`absolute -left-24 top-10 h-72 w-72 rounded-full blur-3xl ${activeTheme.orbA}`} />
        <div className={`absolute right-0 top-0 h-80 w-80 rounded-full blur-3xl ${activeTheme.orbB}`} />
        <div className="relative w-full">
          <PendingApprovalPage theme={activeTheme} />
        </div>
      </main>
    )
  }

  return (
    <main className={`relative min-h-screen overflow-hidden px-4 py-6 sm:px-8 sm:py-10 ${activeTheme.shell}`}>
      {/* Background orbs */}
      <div className={`absolute -left-24 top-10 h-72 w-72 rounded-full blur-3xl ${activeTheme.orbA}`} />
      <div className={`absolute right-0 top-0 h-80 w-80 rounded-full blur-3xl ${activeTheme.orbB}`} />
      <div className={`absolute bottom-0 left-1/3 h-96 w-96 rounded-full blur-3xl ${activeTheme.orbC}`} />

      <section className="relative mx-auto w-full max-w-6xl">
        {/* ===== HEADER + HAMBURGER MENU ===== */}
        <div className={`relative z-50 mb-6 flex items-center justify-between rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-lg sm:px-6 ${activeTheme.panel}`}>
          <div className="flex items-center gap-3">
            <div className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${activeTheme.badge}`}>
              SMART INVENTORY MANAGEMENT SYSTEM
            </div>
            <span className="hidden text-sm font-medium text-slate-600 sm:inline">{activePage.label}</span>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex h-10 w-10 flex-col items-center justify-center gap-[5px] rounded-xl bg-slate-900/90 text-white transition hover:bg-slate-800"
              aria-label="Menu"
              aria-expanded={isMenuOpen}
            >
              <span className={`block h-[2px] w-5 rounded-full bg-white transition ${isMenuOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
              <span className={`block h-[2px] w-5 rounded-full bg-white transition ${isMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-[2px] w-5 rounded-full bg-white transition ${isMenuOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
            </button>

            {isMenuOpen && (
              <nav className="absolute right-0 top-12 z-[100] w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-bold text-slate-900">{profile.full_name || profile.email}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ROLE_LABEL[profile.role] ?? profile.role}</p>
                </div>
                {visiblePages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => changePage(page.id)}
                    aria-current={currentPage === page.id ? 'page' : undefined}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-semibold transition hover:bg-slate-50 ${
                      currentPage === page.id ? 'bg-slate-100 text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    <span className="text-lg">{page.icon}</span>
                    {page.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={signOut}
                  className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                >
                  <span className="text-lg">🚪</span>
                  Log Keluar
                </button>
              </nav>
            )}
          </div>
        </div>

        {installPrompt.canInstall && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="min-w-[14rem] flex-1">
              <span className="font-bold">Akses pantas seperti aplikasi. </span>
              {installPrompt.isIosDevice && !installPrompt.hasNativePrompt
                ? 'Di Safari, tekan Share kemudian pilih "Add to Home Screen".'
                : 'Tambah ke Home Screen supaya sistem ini terbuka seperti aplikasi penuh.'}
            </p>
            {installPrompt.hasNativePrompt && (
              <button
                type="button"
                onClick={installPrompt.install}
                className="rounded-full bg-amber-900 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-amber-800"
              >
                Tambah ke Home Screen
              </button>
            )}
            <button
              type="button"
              onClick={installPrompt.dismiss}
              className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-900 transition hover:bg-amber-100"
            >
              Tutup
            </button>
          </div>
        )}

        {materials.error && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-rose-400/50 bg-rose-100 px-4 py-3 text-sm font-medium text-rose-800">
            <p className="flex-1">Gagal memuat senarai material. Sila cuba lagi.</p>
            <button
              type="button"
              onClick={materials.reload}
              className="rounded-full bg-rose-800 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-rose-700"
            >
              Cuba lagi
            </button>
          </div>
        )}

        {/* Pages stay mounted so a half-filled form survives switching pages. */}
        <div hidden={currentPage !== 'usage'}>
          <UsagePage
            theme={activeTheme}
            materials={materials.data}
            isLoadingMaterials={materials.isLoading}
            onSubmitted={stock.reload}
            defaultNama={profile.full_name}
          />
        </div>
        <div hidden={currentPage !== 'restock'}>
          <RestockPage
            theme={activeTheme}
            materials={materials.data}
            isLoadingMaterials={materials.isLoading}
            stockState={stockState}
          />
        </div>
        <div hidden={currentPage !== 'newitem'}>
          <AddItemPage theme={activeTheme} stockState={stockState} />
        </div>
        <div hidden={currentPage !== 'stock'}>
          <StockPage theme={activeTheme} stockState={stockState} />
        </div>
        <div hidden={currentPage !== 'telegram'}>
          <TelegramPage theme={activeTheme} />
        </div>
        {hasRole(profile, PAGE_ROLES.users) && (
          <div hidden={currentPage !== 'users'}>
            <UsersPage theme={activeTheme} />
          </div>
        )}

        {/* Theme switcher */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => setThemeId(theme.id)}
              className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide transition ${
                themeId === theme.id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white/80 text-slate-700 hover:border-slate-500'
              }`}
            >
              {theme.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Developer:{' '}
          <a
            href="https://github.com/fiqriadam0-source"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-slate-700 underline-offset-2 hover:underline"
          >
            fiqriadam0-source
          </a>
        </p>
      </section>
    </main>
  )
}

export default App

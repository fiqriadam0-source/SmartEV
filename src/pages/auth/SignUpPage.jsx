import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import StatusMessage from '../../components/StatusMessage.jsx'

function SignUpPage({ theme, onSwitchToLogin }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState({ type: 'idle', message: '' })

  const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700'
  const inputClass = `w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`

  async function handleSubmit(event) {
    event.preventDefault()
    if (!fullName.trim() || !email.trim() || !password) {
      setStatus({ type: 'error', message: 'Sila lengkapkan semua ruangan.' })
      return
    }
    if (password.length < 6) {
      setStatus({ type: 'error', message: 'Kata laluan mesti sekurang-kurangnya 6 aksara.' })
      return
    }

    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
    })
    if (error) {
      setStatus({ type: 'error', message: error.message })
    } else if (data.session) {
      // "Confirm email" is off: signUp already returns a session, App.jsx will switch to the pending-approval screen.
      setStatus({ type: 'success', message: 'Pendaftaran berjaya. Menunggu kelulusan admin.' })
    } else {
      setStatus({ type: 'success', message: 'Semak emel untuk pengesahan, kemudian log masuk.' })
    }
    setIsSubmitting(false)
  }

  return (
    <div className="mx-auto max-w-md">
      <div className={`rounded-3xl border p-6 shadow-2xl backdrop-blur-lg sm:p-8 ${theme.panel}`}>
        <div className="mb-6 text-center">
          <h2 className={`font-display text-3xl text-slate-900 ${theme.heading}`}>Daftar Akaun</h2>
          <p className="mt-2 text-sm text-slate-500">Akaun baru menunggu kelulusan admin sebelum boleh digunakan.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="signup-name" className={labelClass}>Nama Penuh</label>
            <input
              id="signup-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="signup-email" className={labelClass}>Emel</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="signup-password" className={labelClass}>Kata Laluan</label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full rounded-xl px-5 py-3.5 text-sm font-bold uppercase tracking-[0.16em] text-white transition disabled:cursor-not-allowed disabled:bg-slate-400 ${theme.accent}`}
          >
            {isSubmitting ? 'Sedang daftar...' : 'Daftar'}
          </button>

          <StatusMessage status={status} className="text-center" />
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Sudah ada akaun?{' '}
          <button type="button" onClick={onSwitchToLogin} className="font-bold text-slate-700 underline-offset-2 hover:underline">
            Log masuk
          </button>
        </p>
      </div>
    </div>
  )
}

export default SignUpPage

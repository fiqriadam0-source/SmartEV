import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import StatusMessage from '../../components/StatusMessage.jsx'

function LoginPage({ theme, onSwitchToSignUp }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState({ type: 'idle', message: '' })

  const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-wide text-slate-700'
  const inputClass = `w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white focus:ring-4 ${theme.inputFocus}`

  async function handleSubmit(event) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setStatus({ type: 'error', message: 'Sila isi emel dan kata laluan.' })
      return
    }

    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setStatus({ type: 'error', message: error.message })
    setIsSubmitting(false)
  }

  return (
    <div className="mx-auto max-w-md">
      <div className={`rounded-3xl border p-6 shadow-2xl backdrop-blur-lg sm:p-8 ${theme.panel}`}>
        <div className="mb-6 text-center">
          <h2 className={`font-display text-3xl text-slate-900 ${theme.heading}`}>Log Masuk</h2>
          <p className="mt-2 text-sm text-slate-500">SIMS&mdash; .</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="login-email" className={labelClass}>Emel</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="login-password" className={labelClass}>Kata Laluan</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
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
            {isSubmitting ? 'Sedang log masuk...' : 'Log Masuk'}
          </button>

          <StatusMessage status={status} className="text-center" />
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Belum ada akaun?{' '}
          <button type="button" onClick={onSwitchToSignUp} className="font-bold text-slate-700 underline-offset-2 hover:underline">
            Daftar di sini
          </button>
        </p>
      </div>
    </div>
  )
}

export default LoginPage

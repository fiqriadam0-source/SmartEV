// Google Apps Script web app (backend/stock.gs), set at build time from VITE_API_URL.
// It ends up in the browser bundle, so it must never hold a secret.
import { supabase } from './lib/supabase.js'

const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  console.error('VITE_API_URL is not set. Copy .env.example to .env.local, or set it in the hosting dashboard.')
}

function getApiUrl() {
  if (!API_URL) throw new Error('VITE_API_URL is not set')
  return API_URL
}

// GET ?action=...; returns parsed JSON, or the raw text if the response is not JSON.
export async function apiGet(action, params = {}) {
  const url = new URL(getApiUrl())
  url.searchParams.set('action', action)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }

  const response = await fetch(url)
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// POST as form data (read by e.parameter in doPost); returns the plain-text reply.
// access_token travels as a form field (not a header) since Apps Script can't answer CORS preflight.
export async function apiPost(fields) {
  const { data } = await supabase.auth.getSession()
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value)
  }
  if (data.session?.access_token) body.append('access_token', data.session.access_token)

  const response = await fetch(getApiUrl(), { method: 'POST', body })
  return response.text()
}

async function getArray(action, errorMessage) {
  const data = await apiGet(action)
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && data.error) {
    throw new Error(String(data.error))
  }
  throw new Error(errorMessage)
}

export const fetchMaterials = async () => cleanList(await getArray('getMaterials', 'Format material tidak sah'))
export const fetchStock = () => getArray('getStock', 'Format stock tidak sah')
export const fetchUsageHistory = () => getArray('getUsageHistory', 'Format usage history tidak sah')

export function cleanList(data) {
  return Array.isArray(data)
    ? [...new Set(data.map((item) => String(item || '').trim()).filter(Boolean))]
    : []
}

export function normalizeSpecification(value) {
  return String(value ?? '').trim()
}

// Material labels may carry the size after a marker, e.g. "Paip PVC | 1/2".
export function extractMaterialParts(label) {
  const raw = String(label || '').trim()
  const markers = [' | ', ' - ', ' / ', ' :: ']
  for (const marker of markers) {
    const index = raw.indexOf(marker)
    if (index > -1) {
      return {
        material: raw.slice(0, index).trim(),
        size: raw.slice(index + marker.length).trim(),
      }
    }
  }
  return { material: raw, size: '' }
}

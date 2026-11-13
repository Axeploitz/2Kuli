import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// null kalau env belum diisi, supaya halaman Home tetap jalan saat dev awal
export const supabase = url && key ? createClient(url, key) : null

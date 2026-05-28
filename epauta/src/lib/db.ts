// This file is deprecated. Supabase has been replaced with Cloudflare R2 for storage.
// If you need storage functionality, use src/lib/storage.ts instead.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.SUPABASE_URL
const supabaseKey = import.meta.env.SUPABASE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

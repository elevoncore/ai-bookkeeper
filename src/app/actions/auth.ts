'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSupabaseServerClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (e) {
            console.error("Failed to set auth cookies:", e)
          }
        },
      },
    }
  )
}

export async function signUpWithEmail(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
      data: {
        full_name: fullName
      }
    }
  })
  
  if (error) return { error: error.message }

  if (data?.user) {
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email,
      created_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (upsertError) {
      console.error("Failed to upsert user profile:", upsertError);
    }
    
    // Seed default chart of accounts
    await supabase.rpc('initialize_default_accounts', { p_user_id: data.user.id });
  }

  const requiresVerification = data?.user ? true : false;

  return { success: true, requiresVerification, email }
}

export async function signInWithEmail(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  if (data?.user) {
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email,
      created_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (upsertError) {
      console.error("Failed to sync user profile on signin:", upsertError);
    }

    // Ensure chart of accounts is seeded
    await supabase.rpc('initialize_default_accounts', { p_user_id: data.user.id });
  }

  return { success: true }
}
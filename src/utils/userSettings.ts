export interface UserSettings {
  user_id?: string;
  currency: string;
  timezone: string;
  accounting_basis: 'accrual' | 'cash';
  fiscal_year_start: string;
  ai_require_manual_verification: boolean;
  ai_strict_cogs_realization: boolean;
  ai_ambiguity_strictness: 'strict' | 'balanced' | 'permissive';
  created_at?: string;
  updated_at?: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  accounting_basis: 'accrual',
  fiscal_year_start: 'July',
  ai_require_manual_verification: true,
  ai_strict_cogs_realization: true,
  ai_ambiguity_strictness: 'strict'
};

// Global memory cache attached to globalThis to survive Next.js module reloads & route workers
const globalSettingsCache: Map<string, UserSettings> = 
  (globalThis as any).__inscribe_user_settings_cache || 
  ((globalThis as any).__inscribe_user_settings_cache = new Map<string, UserSettings>());

export async function fetchUserSettings(userId: string, supabase: any): Promise<UserSettings> {
  // 1. Try fetching from Supabase table
  try {
    const { data: dbSettings, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (dbSettings && !error) {
      const merged: UserSettings = {
        ...DEFAULT_USER_SETTINGS,
        ...dbSettings,
        user_id: userId
      };
      globalSettingsCache.set(userId, merged);
      return merged;
    }
  } catch (err) {
    // Suppress schema cache errors gracefully
  }

  // 2. Check in-memory cache
  const cached = globalSettingsCache.get(userId);
  if (cached) {
    return cached;
  }

  // 3. Return default settings
  const defaultForUser: UserSettings = {
    ...DEFAULT_USER_SETTINGS,
    user_id: userId
  };
  globalSettingsCache.set(userId, defaultForUser);
  return defaultForUser;
}

export async function updateUserSettings(userId: string, updates: Partial<UserSettings>, supabase: any): Promise<UserSettings> {
  const current = await fetchUserSettings(userId, supabase);
  const updated: UserSettings = {
    ...current,
    ...updates,
    user_id: userId,
    updated_at: new Date().toISOString()
  };

  globalSettingsCache.set(userId, updated);

  try {
    await supabase
      .from('user_settings')
      .upsert(updated);
  } catch (err) {
    // Database notice
  }

  return updated;
}

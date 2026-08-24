import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchUserSettings, updateUserSettings } from "@/utils/userSettings";

export async function getAuthenticatedUser(request: Request) {
  const cookieStore = await cookies();
  let supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  let user = null;
  const { data: cookieAuthData } = await supabase.auth.getUser();
  user = cookieAuthData?.user;

  // Fallback for Bearer token in Authorization header
  if (!user) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: { Authorization: authHeader }
          },
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll() {}
          }
        }
      );
      const { data: tokenAuthData } = await supabase.auth.getUser();
      user = tokenAuthData?.user;
    }
  }

  return { user, supabase };
}

export async function GET(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await fetchUserSettings(user.id, supabase);
    return NextResponse.json({ settings }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/settings error:", err);
    return NextResponse.json({ error: err.message || "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const updatedSettings = await updateUserSettings(user.id, {
      currency: typeof body.currency === 'string' ? body.currency : undefined,
      timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
      accounting_basis: body.accounting_basis === 'cash' ? 'cash' : (body.accounting_basis === 'accrual' ? 'accrual' : undefined),
      fiscal_year_start: typeof body.fiscal_year_start === 'string' ? body.fiscal_year_start : undefined,
      ai_require_manual_verification: typeof body.ai_require_manual_verification === 'boolean' 
        ? body.ai_require_manual_verification 
        : undefined,
      ai_strict_cogs_realization: typeof body.ai_strict_cogs_realization === 'boolean' 
        ? body.ai_strict_cogs_realization 
        : undefined,
      ai_ambiguity_strictness: ['strict', 'balanced', 'permissive'].includes(body.ai_ambiguity_strictness)
        ? body.ai_ambiguity_strictness
        : undefined
    }, supabase);

    return NextResponse.json({ 
      success: true, 
      message: "Settings updated successfully", 
      settings: updatedSettings 
    }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/settings error:", err);
    return NextResponse.json({ error: err.message || "Failed to update settings" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  return POST(request);
}

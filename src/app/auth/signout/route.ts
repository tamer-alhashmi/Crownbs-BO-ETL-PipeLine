import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.signOut();
  if (error) {
    return NextResponse.redirect(new URL("/?authError=signout", request.url), 303);
  }

  return NextResponse.redirect(new URL("/", request.url), 303);
}

import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function isDevelopmentDemoMode() {
  return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";
}

export async function middleware(request: NextRequest) {
  // Nunca permita bypass de autenticação em produção.
  if (isDevelopmentDemoMode()) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const redirect = (destination: URL) => {
    const result = NextResponse.redirect(destination);
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return redirect(login);
  }

  const { data: profile, error } = await supabase.from("profiles")
    .select("active,must_change_password,role").eq("id", user.id).maybeSingle();
  if (error || !profile?.active) return redirect(new URL("/login?error=access", request.url));
  if (profile.must_change_password && request.nextUrl.pathname !== "/trocar-senha") {
    return redirect(new URL("/trocar-senha", request.url));
  }

  if (profile.role === "driver" && !profile.must_change_password) {
    const { data: accepted, error: termsError } = await supabase.rpc("has_driver_authorization");
    if ((termsError || accepted !== true) && request.nextUrl.pathname !== "/autorizacao-motoboy") {
      return redirect(new URL("/autorizacao-motoboy", request.url));
    }
    if (!termsError && accepted === true && (request.nextUrl.pathname === "/painel" || request.nextUrl.pathname === "/autorizacao-motoboy")) {
      return redirect(new URL("/painel/motoboy", request.url));
    }
  } else if (request.nextUrl.pathname === "/autorizacao-motoboy" && profile.role !== "driver") {
    return redirect(new URL("/painel", request.url));
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/painel/:path*", "/garcom/:path*", "/trocar-senha", "/autorizacao-motoboy"],
};

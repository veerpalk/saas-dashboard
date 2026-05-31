import { NextRequest, NextResponse } from "next/server";

// Routes that don't need authentication
const PUBLIC_ROUTES = ["/login", "/register", "/api/auth/register"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes through
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  if (isPublic) return NextResponse.next();

  // Check for Firebase session cookie (set on login, cleared on logout)
  const session = req.cookies.get("session")?.value;

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/products/:path*"],
};

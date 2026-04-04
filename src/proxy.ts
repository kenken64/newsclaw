import { type NextRequest, NextResponse } from "next/server";
import { getUserAuto } from "@workspace/auth/server";

const PUBLIC_PATHS = [
  "/",
  "/api/health",
];

const PUBLIC_PREFIXES = [
  "/auth/",
  "/_next/",
];

const STATIC_EXTENSIONS = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/u;

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (STATIC_EXTENSIONS.test(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const user = await getUserAuto(request);

  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", `${request.nextUrl.basePath}${pathname}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css)$).*)",
  ],
};

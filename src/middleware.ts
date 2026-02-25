import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

const roleHome = {
  ADMIN: "/admin",
  EMPLEADO: "/empleado",
  CLIENTE: "/cliente",
} as const;

const authPages = ["/login", "/register"];

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const pathname = nextUrl.pathname;
  const role = session?.user?.role;

  if (authPages.includes(pathname) && role) {
    return NextResponse.redirect(new URL(roleHome[role], nextUrl));
  }

  if (pathname.startsWith("/profile") && !session?.user) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (pathname.startsWith("/admin")) {
    if (role !== "ADMIN") {
      return NextResponse.redirect(new URL("/unauthorized", nextUrl));
    }
  }

  if (pathname.startsWith("/empleado")) {
    if (!role || !["ADMIN", "EMPLEADO"].includes(role)) {
      return NextResponse.redirect(new URL("/unauthorized", nextUrl));
    }
  }

  if (pathname.startsWith("/cliente")) {
    if (!role || !["ADMIN", "CLIENTE"].includes(role)) {
      return NextResponse.redirect(new URL("/unauthorized", nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

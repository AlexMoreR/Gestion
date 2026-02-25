import type { NextAuthConfig } from "next-auth";

const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;
      const role = auth?.user?.role;

      if (pathname === "/login" || pathname === "/register") {
        return true;
      }

      if (pathname.startsWith("/profile")) {
        return !!auth?.user;
      }

      if (pathname.startsWith("/admin")) {
        return role === "ADMIN";
      }

      if (pathname.startsWith("/empleado")) {
        return !!role && ["ADMIN", "EMPLEADO"].includes(role);
      }

      if (pathname.startsWith("/cliente")) {
        return !!role && ["ADMIN", "CLIENTE"].includes(role);
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) token.role = user.role;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

export default authConfig;

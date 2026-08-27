import { withAuth } from "next-auth/middleware";

// Gate every app route behind a valid JWT. Unauthenticated requests are sent
// to /login. Fine-grained role checks live in the layouts and API guards; this
// is the coarse "must be signed in" perimeter.
export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    /*
     * Protect everything except:
     *  - /login
     *  - /api/auth/*  (NextAuth's own endpoints)
     *  - Next internals and static assets
     *  - the favicon / manifest
     *  - /brand/*  (logo and login artwork — these render ON the login page,
     *    so gating them behind auth makes them 307 to /login and the sign-in
     *    screen loses its branding entirely)
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons|brand).*)",
  ],
};

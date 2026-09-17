import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "bcryptjs"],

  /**
   * FORCE HTTPS — from the application, because nothing in front of it can.
   *
   * cPanel's "Force HTTPS Redirect" is switched on for this domain and does
   * nothing: Passenger claims the vhost with `PassengerBaseURI "/"`, so the
   * request reaches this process before LiteSpeed's redirect would run. The
   * toggle is left on anyway — it costs nothing and is right if the app ever
   * moves off Passenger.
   *
   * This matters beyond the padlock. Sign-in posts a Staff ID that is also the
   * passcode, and the session cookie is what a whole eight-desk audit trail
   * rests on. Over http both cross the network in the clear, and the cookie is
   * issued without a `secure` flag.
   *
   * LOOP SAFETY, because a redirect loop here takes the whole site down: the
   * rule fires only when `x-forwarded-proto` is exactly "http", the header
   * LiteSpeed sets on the proxied request. A TLS request carries "https" and
   * does not match; a request carrying no such header does not match either.
   * The only way to loop is a proxy that reports "http" for a TLS connection,
   * which is why this is a `has` condition on a specific value rather than a
   * blanket redirect. The deploy's health check polls https and fails the job
   * if this ever does start looping.
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "header", key: "x-forwarded-proto", value: "http" }],
        destination: "https://resale.cv-acimotors.com/:path*",
        permanent: true,
      },
    ];
  },

  /**
   * Tell the browser never to try http again.
   *
   * The redirect above fixes the request that has already been made in the
   * clear; this stops there being a next one. After a single https response
   * the browser upgrades every later request to this host itself, so a typed
   * bare domain or an old bookmark never touches http again.
   *
   * Two years, and `includeSubDomains` is deliberately ABSENT: this is one
   * subdomain of cv-acimotors.com, and asserting a policy over siblings that
   * may not have certificates would take them offline. No `preload` for the
   * same reason — that is a commitment to the whole parent domain.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
          // The app renders no third-party frames and is never framed itself.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Vehicle photographs and customer names should not travel to other
          // origins in a Referer header.
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },

  images: {
    /**
     * NO SERVER-SIDE IMAGE OPTIMISATION.
     *
     * The optimiser runs on `sharp`, which is a native binary, and this
     * release is BUILT ON WINDOWS AND RUN ON LINUX. The file tracer copies the
     * sharp that was installed here — `@img/sharp-win32-x64` — which the host
     * cannot load, and the wasm fallback beside it is traced without its own
     * `@emnapi/runtime` dependency. The result was an `unhandledRejection` on
     * every boot and a 500 from `/_next/image`, which on this product means
     * the sign-in screen loses its branding and every top bar loses its mark.
     *
     * The optimiser is not worth a native dependency on a shared host here:
     * there are exactly two images in the chrome and they are now shipped at
     * the size they are drawn at (see components/brand/BrandMark.tsx). Vehicle
     * photographs never went through it at all — they are served by
     * `/api/files/[name]`, because they are access-controlled evidence rather
     * than public assets.
     *
     * If this is ever deployed somewhere that can run sharp natively, drop
     * this flag and the marks get resized per device again.
     */
    unoptimized: true,
  },
};

export default nextConfig;

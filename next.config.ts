import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

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

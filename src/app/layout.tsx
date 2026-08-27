import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Barlow_Condensed, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { themeInitScript } from "@/components/theme/ThemeProvider";

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Resale Intel",
  description: "Commercial vehicle recovery and resale pipeline — ACI Motors.",
  applicationName: "Resale Intel",
  manifest: "/manifest.webmanifest",
  icons: {
    // The ACI badge is a circular mark, so it survives being scaled to a
    // 16px tab favicon. The supplied vehicle render could not — a wide, dark,
    // detailed scene is an unreadable smudge at that size.
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Matches --paper so the mobile browser chrome blends with the page rather
  // than capping it with a dark petrol bar. ThemeProvider rewrites this at
  // runtime when the resolved theme changes.
  themeColor: "#f4f4f9",
  // Deliberately not pinned to "light" any more — the theme is resolved by the
  // inline script below and stamped on <html data-theme>. The error boundaries
  // stay light-locked on their own so a failed page can never render as a
  // dark void (see app/global-error.tsx).
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  // Deliberately no maximumScale / user-scalable: capping zoom locks out
  // low-vision users, and the field teams work on small phones outdoors.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/*
          Stamps <html data-theme> before the rest of the page paints, so a dark
          session never flashes white. beforeInteractive is the supported way
          to inline a blocking script from the root layout — a bare <script>
          element rendered by a component is not executed on the client.
        */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

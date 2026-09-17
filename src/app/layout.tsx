import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

/**
 * The non-Apple stand-in for San Francisco.
 *
 * SF Pro itself cannot ship here: Apple licenses it for building Apple-platform
 * software, not for serving off a web server, and it is on no CDN. The stack in
 * globals.css asks the operating system for SF first — `-apple-system` resolves
 * to the real thing on macOS and iOS at no cost and with no licence problem —
 * and lands here on everything else. Inter was drawn as an open counterpart to
 * SF: same humanist-grotesque skeleton, near-identical x-height and aperture,
 * so the two are hard to tell apart at UI sizes and the layout does not shift
 * between them.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

/**
 * The field panel's display face.
 *
 * Deliberately scoped: `--font-jakarta` is only consumed by
 * `--font-display-field`, which only the ARO panel and the mobile dock use.
 * The desk consoles keep the system/Inter stack, because a supervisor
 * comparing thirty rows under office light wants the data to be the only
 * distinctive thing on screen — the field panel is the surface that is
 * allowed a voice, exactly as its louder palette already is.
 *
 * Four weights, not the full range. It costs a font download on a phone that
 * may be on mobile data in a yard, which is a real price; `display: swap`
 * means the panel renders in SF or Inter first and never blocks on it.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Resale Intel",
  description: "Commercial vehicle recovery and resale pipeline for ACI Motors.",
  applicationName: "Resale Intel",
  manifest: "/manifest.webmanifest",
  icons: {
    // The Resale Intel badge. Circular and high-contrast at the rim, which is
    // what carries it down to a 16px tab: the truck inside is lost at that
    // size, but the blue-to-green ring stays recognisable, and that is the
    // part doing the identifying.
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Matches --paper so the mobile browser chrome blends with the page rather
  // than capping it with a bar in an unrelated colour.
  themeColor: "#f4f4f9",
  // Pinned to light. The app ships a single light theme, and leaving this
  // unpinned lets a dark-mode browser render the built-in error page and any
  // unstyled form control dark against a light app.
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  // Deliberately no maximumScale / user-scalable: capping zoom locks out
  // low-vision users, and the field teams work on small phones outdoors.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable} ${jakarta.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

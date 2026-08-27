import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIDEO-Engine",
  description: "Single-shot Veo 3.1 generation API and PI/UGC campaign console",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VIDEO-Engine",
  },
  formatDetection: {
    telephone: false,
  },
};

// Mobile-first viewport. We let the device pick its natural width (so the layout
// doesn't get clipped on Android Chrome which can ignore a fixed width hint), but
// we disable user zoom so pinch-zoom doesn't re-flow the layout. The design is
// built to look right between 360-430px; the MobileFrame component then puts the
// app in a 430px window when viewed on a real desktop browser.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

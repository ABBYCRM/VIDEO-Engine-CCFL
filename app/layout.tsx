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

// Mobile-first viewport. We pin the design to ~430px so the app behaves like a
// phone-sized window even on a desktop browser. user-scalable=no prevents
// the iOS Safari pinch-zoom that would re-flow the layout.
export const viewport: Viewport = {
  width: 430,
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

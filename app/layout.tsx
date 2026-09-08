import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claw",
  description: "Claw + Composio + Steel + NVIDIA operator console",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Claw"
  },
  formatDetection: {
    telephone: false
  }
};

// Keep the mobile-first viewport while allowing browser/user zoom. Preventing
// zoom is an accessibility regression for low-vision users and is unnecessary
// for the responsive 360–430px layout.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <body>{children}</body>
    </html>
  );
}

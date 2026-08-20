import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIDEO-Engine",
  description: "Single-shot Veo 3.1 generation API and PI/UGC campaign console"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

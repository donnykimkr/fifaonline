import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Futbahl",
  description: "Futbahl is a 3D arcade football game with responsive controls and AI teammates.",
  icons: {
    icon: "/futbahl-ball.svg",
    shortcut: "/futbahl-ball.svg",
    apple: "/futbahl-ball.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#07110c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

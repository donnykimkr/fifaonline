import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Futbol",
  description: "A 3D arcade soccer browser game with AI teammates and anonymous gameplay analytics.",
  icons: {
    icon: "/futbol-ball.svg",
    shortcut: "/futbol-ball.svg",
    apple: "/futbol-ball.svg",
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

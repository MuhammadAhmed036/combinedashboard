import type { Metadata } from "next";
import Script from "next/script";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Intellivision Command Center",
  description: "Enterprise AI-powered city surveillance and alerting command center.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-surface-1 text-foreground">
        <Providers>{children}</Providers>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("theme");if(t==="light")document.documentElement.classList.remove("dark")}catch(e){}})()',
          }}
        />
      </body>
    </html>
  );
}

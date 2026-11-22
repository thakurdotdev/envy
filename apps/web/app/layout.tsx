import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "Envy",
  description: "Share .env secrets with your team. Encrypted on your device.",
  // Invite links carry their token in the address, so never send it on.
  referrer: "no-referrer",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      {/* Each half of the site sets its own Content-Security-Policy in its layout. */}
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          {/* At the top, so toasts never cover the save bar at the bottom of the editor. */}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}

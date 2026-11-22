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

const apiOrigin = new URL(process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000").origin;

// Part of every page, so the site is protected even when the host adds no
// headers. Scripts may only talk to this site and the API, so injected code
// could not send decrypted secrets anywhere else. 'wasm-unsafe-eval' lets
// libsodium run as WebAssembly. Only in builds: `next dev` needs eval.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `connect-src 'self' ${apiOrigin}`,
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "object-src 'none'",
  "base-uri 'none'",
  `form-action 'self' ${apiOrigin}`,
].join("; ");

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <head>
        {process.env.NODE_ENV === "production" ? (
          <meta httpEquiv="Content-Security-Policy" content={CONTENT_SECURITY_POLICY} />
        ) : null}
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

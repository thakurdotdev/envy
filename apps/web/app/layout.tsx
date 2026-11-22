import type { ReactNode } from "react";

export const metadata = {
  title: "Envy",
  description: "Share .env secrets with your team. Encrypted on your device.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

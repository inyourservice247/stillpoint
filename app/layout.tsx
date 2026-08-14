import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stillpoint — Local RSVP Reader",
  description: "Read TXT books one word at a time with a fixed optimal recognition point. Files never leave your browser.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090b0c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

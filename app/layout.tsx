import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TSJ Play",
  description: "A 10-foot TV video library with air-mouse remote and voice control (English & Sinhala).",
};

export const viewport: Viewport = {
  themeColor: "#0f0f0f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#0f0f0f] text-white min-h-screen antialiased">{children}</body>
    </html>
  );
}

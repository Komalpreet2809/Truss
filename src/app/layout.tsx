import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRUSS — AI Safety Verification",
  description:
    "TRUSS is an AI safety verification layer that synthesizes formal constraints before outputs are accepted or executed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

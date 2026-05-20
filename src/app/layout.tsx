import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRUSS — AI Safety Verification",
  description:
    "TRUSS is an AI safety verification layer that synthesizes formal constraints before outputs are accepted or executed.",
  icons: {
    icon: "/truss-mark.svg",
    shortcut: "/truss-mark.svg",
    apple: "/truss-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

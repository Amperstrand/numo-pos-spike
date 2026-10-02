import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Numo POS · Spike",
  description:
    "Cashu-powered restaurant POS demo. Browse menu, accept Numo Cashu payment, and submit orders to the kitchen in real-time.",
  keywords: [
    "Numo",
    "Cashu",
    "ChaPay",
    "POS",
    "restaurant",
    "Bitcoin",
    "Lightning",
    "hackathon",
  ],
  authors: [{ name: "Numo Spike" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}

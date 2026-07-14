import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Footer from "./footer";
import Header from "./header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TapOwner — Know who owns it, before you knock",
  description:
    "Tap any property in Texas and see the owner of record, free. Unlock verified phone and email for 29¢, draft AI outreach, and reverse-prospect a whole neighborhood. The $9.99 alternative to $99+/mo prospecting tools.",
  openGraph: {
    title: "TapOwner — Know who owns it, before you knock",
    description:
      "Tap any Texas property → owner free → phone/email for 29¢ → AI outreach → reverse-prospect a whole neighborhood.",
    images: ["/logo-mark.png"],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}

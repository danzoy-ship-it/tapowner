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
  title: "TapOwner — Owner data, farming & outreach for Texas agents",
  description:
    "See any Texas owner of record free. Unlock verified phone & email for 29¢, draft AI outreach, farm whole neighborhoods, and export 500-home direct-mail lists — all from your phone, from $9.99/mo.",
  openGraph: {
    title: "TapOwner — Owner data, farming & outreach for Texas agents",
    description:
      "Tap any Texas property → owner free → phone/email 29¢ → AI outreach → farm a neighborhood → export a 500-home mailing list. From $9.99/mo.",
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

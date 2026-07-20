import 'app/globals.css';
import type { Metadata } from 'next';
import { EB_Garamond } from 'next/font/google';
import Image from "next/image";
import CIILogo from "@/components/images/CII_Logo.png";
import IMELogo from "@/components/images/IME_Logo.webp";

function LogoLeft() {
  return (
    <div className="h-10 w-24 flex items-center justify-center">
      <Image
        src={CIILogo}
        alt="CII Logo"
        className="object-contain"
      />
    </div>
  );
}

function LogoRight() {
  return (
    <div className="h-10 w-24 flex items-center justify-center">
      <Image
        src={IMELogo}
        alt="IME Logo"
        className="object-contain"
      />
    </div>
  );
}

const garamond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-garamond',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Gujarat Manufacturing Barometer',
  description: 'Gujarat State Manufacturing Barometer — Employer & Employee Surveys',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={garamond.variable}>
      <body className="font-garamond">{children}</body>
    </html>
  );
}
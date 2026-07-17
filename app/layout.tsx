import 'app/globals.css';
import type { Metadata } from 'next';
import { EB_Garamond } from 'next/font/google';

const garamond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-garamond',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Gujarat Manufacturing Barometer',
  description: 'Gujarat State Manufacturing Barometer — Employer & Worker Surveys',
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
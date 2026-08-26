import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Million Dollar Creator — The YouTube Wealth Blueprint',
  description: 'A practical four-phase roadmap for building your first million-dollar YouTube business.',
  openGraph: {
    title: 'Million Dollar Creator',
    description: 'The YouTube Wealth Blueprint',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Million Dollar Creator',
    description: 'The YouTube Wealth Blueprint',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

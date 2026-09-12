import type { Metadata } from 'next';
import './globals.css';
import './game.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'HumBird — Speak Up. Fly Higher.',
  description: 'A cheerful voice-controlled sky arcade where louder speech gives a tiny bird more lift.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'HumBird — Speak Up. Fly Higher.',
    description: 'Speak, sing, or shout to fly through a bright, musical sky.',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HumBird — Speak Up. Fly Higher.',
    description: 'Speak, sing, or shout to fly through a bright, musical sky.',
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

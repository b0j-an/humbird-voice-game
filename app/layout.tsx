import type { Metadata } from 'next';
import './globals.css';
import './game.css';

export const metadata: Metadata = {
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

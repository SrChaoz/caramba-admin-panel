import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Caramba Control',
  description: 'Panel de administración interno de CARAMBA',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

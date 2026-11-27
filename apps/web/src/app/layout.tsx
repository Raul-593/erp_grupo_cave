import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Next.js descarga la fuente al compilar y la sirve desde la propia aplicación (R-D1).
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'CAVE ERP', template: '%s · CAVE ERP' },
  description: 'ERP de proyectos — Operación › Requerimiento',
  robots: { index: false, follow: false },
};

// Aplica el tema guardado antes de pintar para evitar un parpadeo.
const THEME_SCRIPT = `try{var t=localStorage.getItem('erp-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" data-theme="light" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

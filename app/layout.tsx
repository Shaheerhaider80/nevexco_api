import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Novexco API Explorer',
  description:
    'Storefront prototype and developer explorer for the Novexco Ordering API.',
};

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/explorer', label: 'API Explorer' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          className="sticky top-0 z-10 border-b"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight">
              Novexco <span className="dim font-normal">API</span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 rounded-lg text-[13px] hover:opacity-70"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="chip ml-auto">QA environment</span>
          </div>
        </header>
        <main className="max-w-[1400px] mx-auto px-5 py-6">{children}</main>
      </body>
    </html>
  );
}

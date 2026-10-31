import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GuardianStream',
  description: 'Open-source content filtering for streaming video. Community-powered, AI-generated filters.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="min-h-screen bg-[#0f1117] text-[#e4e7ec]">
          <nav className="border-b border-[#2a2e3b] px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">
                G
              </div>
              <span className="text-lg font-bold">GuardianStream</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-[#8b90a0]">
              <a href="/" className="hover:text-white transition-colors">Browse</a>
              <a href="/taxonomy" className="hover:text-white transition-colors">Categories</a>
              <a href="/community" className="hover:text-white transition-colors">Community</a>
            </div>
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}

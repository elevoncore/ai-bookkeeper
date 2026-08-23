import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/components/ThemeProvider';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  fallback: ["sans-serif"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  fallback: ["monospace"]
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  fallback: ["sans-serif"]
});

export const metadata: Metadata = {
  title: "i4nscribe | Autonomous AI Bookkeeper & ERP Engine",
  description: "Production-ready double-entry AI bookkeeping, automated COGS, WAC inventory, and real-time financial reporting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#f8fafc] text-slate-900 dark:bg-[#090d16] dark:text-slate-50 transition-colors duration-300">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster 
            position="bottom-right" 
            toastOptions={{
              className: 'dark:bg-slate-900 dark:text-slate-100 dark:border dark:border-slate-800 shadow-xl rounded-2xl text-xs font-semibold',
              duration: 4000,
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from 'react-hot-toast';

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
 title: "InscribeAI | Autonomous AI Bookkeeper & ERP Engine",
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
 className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
 >
 <body className="min-h-full flex flex-col bg-[#f8fafc] text-slate-900 selection:bg-blue-100 selection:text-blue-900 font-sans">
 {children}
 <Toaster 
 position="bottom-right" 
 toastOptions={{
 className: 'bg-white text-slate-900 border border-slate-200 shadow-xl rounded-2xl text-xs font-bold',
 duration: 4000,
 }}
 />
 </body>
 </html>
 );
}

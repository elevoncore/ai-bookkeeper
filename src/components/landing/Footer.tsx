import Link from 'next/link';
import { BookOpen, Mail, Globe } from 'lucide-react';

export default function Footer() {
 return (
 <footer className="text-slate-900 py-16 border-t border-slate-100 transition-colors duration-300">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
 
 <div className="flex flex-col gap-4">
 <div className="flex items-center gap-2">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg">
 <BookOpen className="w-6 h-6" />
 </div>
 <span className="text-2xl font-bold text-slate-900 tracking-tight">
 Inscribe AI
 </span>
 </div>
 <p className="text-sm text-slate-600 max-w-sm leading-relaxed">
 The next generation of AI-powered double-entry bookkeeping, bringing unparalleled precision and efficiency to your financial workflows.
 </p>
 </div>

 <div className="flex flex-col w-full md:w-auto">
 <h3 className="text-lg font-bold text-slate-900 mb-4">Contact Us</h3>
 <div className="flex items-center gap-4">
 <a 
 href="mailto:elevoncore@gmail.com"
 className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
 title="elevoncore@gmail.com"
 aria-label="Send email to Elevon Core support"
 >
 <Mail className="w-5 h-5" />
 </a>
 <a 
 href="https://elevon-core.vercel.app/"
 target="_blank"
 rel="noopener noreferrer"
 className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-purple-500"
 title="Elevon Core Website"
 aria-label="Visit Elevon Core Website"
 >
 <Globe className="w-5 h-5" />
 </a>
 </div>
 </div>
 
 </div>

 <div className="mt-16 pt-8 border-t border-slate-100 flex justify-center items-center">
 <div className="text-sm text-slate-500 font-medium">
 &copy; {new Date().getFullYear()} Inscribe AI by Elevon Core. All rights reserved.
 </div>
 </div>
 </div>
 </footer>
 );
}

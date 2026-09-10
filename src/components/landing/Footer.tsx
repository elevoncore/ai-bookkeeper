import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="text-slate-900 py-16 border-t border-slate-100 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
        
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
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
            <div className="flex flex-col gap-2">
              <a 
                href="mailto:elevoncore@gmail.com"
                className="text-sm font-semibold text-blue-600 hover:underline"
              >
                elevoncore@gmail.com
              </a>
              <a 
                href="https://elevon-core.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-slate-700 hover:underline"
              >
                Elevon Core Website
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

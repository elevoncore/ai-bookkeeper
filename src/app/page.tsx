import Navbar from '@/components/landing/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import FeatureGrid from '@/components/landing/FeatureGrid';
import WorkflowSection from '@/components/landing/WorkflowSection';
import DeepDiveSection from '@/components/landing/DeepDiveSection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="relative min-h-screen bg-[#FAFAFA] dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-50 transition-colors duration-300 scroll-smooth selection:bg-purple-100 selection:text-purple-900">
      
      {/* Light Mode Pastel Gradient Mesh / Diffused Blur Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Soft Light Lilac / Purple Orb */}
        <div 
          className="absolute -top-[12%] -left-[8%] w-[55vw] h-[55vw] max-w-[850px] max-h-[850px] rounded-full bg-purple-200/50 dark:bg-purple-900/20 blur-[130px] lg:blur-[170px] animate-pulse" 
          style={{ animationDuration: '11s' }} 
        />
        {/* Soft Mint Green / Ice Blue Orb */}
        <div 
          className="absolute top-[30%] -right-[12%] w-[45vw] h-[45vw] max-w-[700px] max-h-[700px] rounded-full bg-emerald-100/60 dark:bg-emerald-950/20 blur-[130px] lg:blur-[170px] animate-pulse" 
          style={{ animationDuration: '15s', animationDelay: '2s' }} 
        />
        {/* Soft Ice Blue / Cyan Orb */}
        <div 
          className="absolute -bottom-[15%] left-[25%] w-[60vw] h-[60vw] max-w-[950px] max-h-[950px] rounded-full bg-cyan-100/50 dark:bg-indigo-950/20 blur-[130px] lg:blur-[170px] animate-pulse" 
          style={{ animationDuration: '18s', animationDelay: '4s' }} 
        />
      </div>

      {/* Main Content Wrapper */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />
        <HeroSection />
        <FeatureGrid />
        <WorkflowSection />
        <DeepDiveSection />
        <Footer />
      </div>
    </main>
  );
}
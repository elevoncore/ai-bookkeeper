import Navbar from '@/components/landing/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import FeatureGrid from '@/components/landing/FeatureGrid';
import WorkflowSection from '@/components/landing/WorkflowSection';
import DeepDiveSection from '@/components/landing/DeepDiveSection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="relative min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-50 transition-colors duration-300 scroll-smooth">
      
      {/* Global Evolving Background Glows (Dark Purple / Neon Mixture) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] max-w-[800px] max-h-[800px] rounded-full bg-purple-500/20 dark:bg-purple-600/20 blur-[120px] lg:blur-[160px] animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute top-[40%] -right-[10%] w-[40vw] h-[40vw] max-w-[600px] max-h-[600px] rounded-full bg-fuchsia-500/20 dark:bg-fuchsia-600/20 blur-[120px] lg:blur-[160px] animate-pulse" style={{ animationDuration: '14s', animationDelay: '2s' }} />
        <div className="absolute -bottom-[20%] left-[20%] w-[60vw] h-[60vw] max-w-[900px] max-h-[900px] rounded-full bg-indigo-500/10 dark:bg-indigo-700/20 blur-[120px] lg:blur-[160px] animate-pulse" style={{ animationDuration: '18s', animationDelay: '4s' }} />
      </div>

      {/* Main Content Wrapper (Above the glows) */}
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
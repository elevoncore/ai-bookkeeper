import Navbar from '@/components/landing/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import FeatureGrid from '@/components/landing/FeatureGrid';
import WorkflowSection from '@/components/landing/WorkflowSection';
import DeepDiveSection from '@/components/landing/DeepDiveSection';
import Footer from '@/components/landing/Footer';

export default function Home() {
 return (
 <main className="relative min-h-screen bg-[#FAFAFA] font-sans text-slate-900 scroll-smooth selection:bg-purple-100 selection:text-purple-900">
      {/* 3D Animated Background Effects (Global) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center bg-[#FAFAFA]">
        {/* Glowing 3D Orbs */}
        <div className="absolute top-[10%] left-[10%] w-[40vw] h-[40vw] max-w-[600px] max-h-[600px] bg-purple-500/15 rounded-full blur-[100px] mix-blend-multiply animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-[40%] right-[10%] w-[35vw] h-[35vw] max-w-[500px] max-h-[500px] bg-blue-500/15 rounded-full blur-[90px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute bottom-[10%] left-[20%] w-[45vw] h-[45vw] max-w-[700px] max-h-[700px] bg-pink-500/15 rounded-full blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '12s', animationDelay: '4s' }} />
        
        {/* 3D Perspective Grid Floor (Holodeck effect) */}
        <div className="absolute bottom-0 left-[-50%] right-[-50%] h-[50vh] bg-[linear-gradient(to_right,#80808020_1px,transparent_1px),linear-gradient(to_bottom,#80808020_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] transform perspective(1000px) rotateX(75deg) origin-bottom opacity-60" />
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
import { SpottedLogo } from '@/components/SpottedLogo';

export function SplashScreen() {
  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#1a0f2e] to-[#0a0118] flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <SpottedLogo className="w-20 h-20" />
        <h1 className="text-2xl font-bold text-white">Spotted</h1>
      </div>
    </div>
  );
}

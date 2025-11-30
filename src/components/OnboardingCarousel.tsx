import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Users, Sparkles, Camera, ChevronRight, X } from 'lucide-react';

interface OnboardingCarouselProps {
  onComplete: () => void;
}

const slides = [
  {
    icon: Sparkles,
    title: 'Welcome to Spotted 🎉',
    description: 'Your nightlife companion. See where friends are going, discover trending venues, and share your night — all before 5am.',
    color: '#d4ff00',
  },
  {
    icon: MapPin,
    title: 'See Your Friends',
    description: 'View where your friends are out tonight on the live map. Share your location only with people you trust.',
    color: '#a855f7',
  },
  {
    icon: Users,
    title: 'Send Meet Ups',
    description: 'Tap to send a quick "Meet Up" request. Your friends get notified instantly — no planning required.',
    color: '#d4ff00',
  },
  {
    icon: Camera,
    title: 'Share Your Night',
    description: 'Post stories and updates that disappear by 5am. Capture the moment without the permanence.',
    color: '#a855f7',
  },
];

export function OnboardingCarousel({ onComplete }: OnboardingCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const slide = slides[currentSlide];
  const Icon = slide.icon;
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center">
      {/* iPhone frame container */}
      <div className="w-full max-w-[430px] h-full flex flex-col">
        {/* Skip Button */}
        <div className="flex justify-end p-6">
          <button
            onClick={handleSkip}
            className="text-white/60 hover:text-white transition-colors flex items-center gap-1"
          >
            Skip
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          {/* Icon */}
          <div 
            className="w-24 h-24 rounded-full flex items-center justify-center mb-8"
            style={{ 
              backgroundColor: `${slide.color}20`,
              boxShadow: `0 0 60px ${slide.color}40`,
            }}
          >
            <Icon 
              className="h-12 w-12"
              style={{ color: slide.color }}
            />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-white mb-4">
            {slide.title}
          </h1>

          {/* Description */}
          <p className="text-white/70 text-lg leading-relaxed max-w-sm">
            {slide.description}
          </p>
        </div>

        {/* Bottom Section */}
        <div className="p-8 space-y-6">
          {/* Progress Dots */}
          <div className="flex justify-center gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentSlide
                    ? 'w-6 bg-[#d4ff00]'
                    : 'bg-white/30 hover:bg-white/50'
                }`}
              />
            ))}
          </div>

          {/* Next/Get Started Button */}
          <Button
            onClick={handleNext}
            className="w-full bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold text-lg py-6 rounded-full"
          >
            {isLastSlide ? (
              "Let's Go!"
            ) : (
              <>
                Next
                <ChevronRight className="h-5 w-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

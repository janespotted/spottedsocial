import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Users, Sparkles, Camera, ChevronRight, X } from 'lucide-react';
import { FindFriendsOnboarding } from '@/components/FindFriendsOnboarding';

interface OnboardingCarouselProps {
  onComplete: () => void;
}

const slides = [
  {
    icon: Sparkles,
    title: 'Welcome to Spotted',
    description: 'See which friends are out right now, what venues they\'re at, and what looks buzzing — instantly.',
    color: '#d4ff00',
  },
  {
    icon: MapPin,
    title: 'Share Your Location',
    description: 'Share your live location with close friends, friends, or mutuals so they can link up with you fast — and you\'re always in control of who sees you.',
    color: '#a855f7',
  },
  {
    icon: Users,
    title: 'Send Meet Ups',
    description: 'Make plans in one tap. Send a meet-up request and your friends get notified instantly — no messy group chats.',
    color: '#d4ff00',
  },
  {
    icon: Camera,
    title: 'Share Your Night',
    description: 'Post quick updates and stories that disappear by 5am — fun for the night, gone by sunrise.',
    color: '#a855f7',
  },
];

export function OnboardingCarousel({ onComplete }: OnboardingCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showFindFriends, setShowFindFriends] = useState(false);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      // Show Find Friends step after last carousel slide
      setShowFindFriends(true);
    }
  };

  const handleSkip = () => {
    // Skip to Find Friends step (or complete if already there)
    if (!showFindFriends) {
      setShowFindFriends(true);
    } else {
      onComplete();
    }
  };

  // Show Find Friends onboarding after carousel
  if (showFindFriends) {
    return (
      <FindFriendsOnboarding 
        onComplete={onComplete} 
        onSkip={onComplete}
      />
    );
  }

  const slide = slides[currentSlide];
  const Icon = slide.icon;
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) handleSkip(); }}
    >
      <div className="w-full max-w-[430px] h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Spacer replacing removed skip button */}
        <div className="h-16" />

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

          {/* Skip link */}
          <button
            onClick={handleSkip}
            className="w-full text-center text-white/40 hover:text-white/60 text-sm transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

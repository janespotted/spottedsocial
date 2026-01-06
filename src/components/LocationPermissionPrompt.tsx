import { Dialog, DialogContent, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Settings, X } from 'lucide-react';

interface LocationPermissionPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorType: 'permission_denied' | 'position_unavailable' | 'timeout' | 'not_supported';
  onRetry?: () => void;
}

export function LocationPermissionPrompt({
  open,
  onOpenChange,
  errorType,
  onRetry,
}: LocationPermissionPromptProps) {
  const getContent = () => {
    switch (errorType) {
      case 'permission_denied':
        return {
          title: 'Location Access Needed',
          description: 'Spotted needs your location to detect when you arrive at venues and show you nearby spots.',
          instructions: [
            'Open your browser settings',
            'Find Site Settings or Permissions',
            'Enable Location for this site',
            'Refresh and try again',
          ],
          showSettings: true,
        };
      case 'position_unavailable':
        return {
          title: 'Location Unavailable',
          description: "We couldn't get your location. Make sure location services are enabled on your device.",
          instructions: [
            'Check that GPS is enabled',
            'Make sure you have a signal',
            'Try moving to an open area',
          ],
          showSettings: false,
        };
      case 'timeout':
        return {
          title: 'Location Timeout',
          description: 'Getting your location took too long. This can happen with weak GPS signal.',
          instructions: [
            'Move away from buildings',
            'Wait for GPS to stabilize',
            'Try again in a few seconds',
          ],
          showSettings: false,
        };
      case 'not_supported':
        return {
          title: 'Location Not Supported',
          description: 'Your browser does not support location services.',
          instructions: [
            'Try using a different browser',
            'Use Chrome, Safari, or Firefox',
          ],
          showSettings: false,
        };
    }
  };

  const content = getContent();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="bg-black/80 backdrop-blur-sm z-[500]" />
      <DialogContent className="max-w-[380px] bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] border-2 border-[#a855f7]/40 rounded-3xl p-0 overflow-hidden z-[500]">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 text-white/60 hover:text-white transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 pt-8 text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
            <MapPin className="h-8 w-8 text-red-400" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-white mb-2">{content.title}</h2>

          {/* Description */}
          <p className="text-white/70 text-sm mb-4">{content.description}</p>

          {/* Instructions */}
          <div className="bg-white/5 rounded-xl p-4 mb-6 text-left">
            <p className="text-white/80 text-sm font-medium mb-2">How to fix:</p>
            <ol className="space-y-2">
              {content.instructions.map((instruction, i) => (
                <li key={i} className="text-white/60 text-sm flex gap-2">
                  <span className="text-[#a855f7] font-medium">{i + 1}.</span>
                  {instruction}
                </li>
              ))}
            </ol>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {onRetry && errorType !== 'not_supported' && (
              <Button
                onClick={onRetry}
                className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-[#a855f7] to-[#9333ea] text-white hover:opacity-90"
              >
                Try Again
              </Button>
            )}

            {content.showSettings && (
              <Button
                variant="outline"
                onClick={() => {
                  // Open a guide - can't directly open settings programmatically
                  window.open('https://support.google.com/chrome/answer/142065', '_blank');
                }}
                className="w-full h-12 text-base font-medium rounded-xl border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
              >
                <Settings className="h-4 w-4 mr-2" />
                How to Enable Location
              </Button>
            )}

            <button
              onClick={() => onOpenChange(false)}
              className="text-white/50 hover:text-white/80 text-sm transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

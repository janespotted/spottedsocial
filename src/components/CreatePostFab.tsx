import { memo } from 'react';
import { Plus } from 'lucide-react';
import { useKeyboardAware } from '@/hooks/useKeyboardAware';

interface CreatePostFabProps {
  visible: boolean;
  onClick: () => void;
}

/**
 * Create-post floating action button.
 *
 * Keyboard state is subscribed HERE (not in Home) so that the keyboard
 * opening/closing only re-renders this tiny component instead of the
 * entire feed. Re-rendering all of Home mid keyboard animation was a
 * major source of input jank.
 */
export const CreatePostFab = memo(function CreatePostFab({ visible, onClick }: CreatePostFabProps) {
  const { isKeyboardOpen } = useKeyboardAware();

  if (!visible || isKeyboardOpen) return null;

  return (
    <button
      onClick={onClick}
      className="fixed right-4 z-[40] w-14 h-14 rounded-full bg-[#d4ff00] flex items-center justify-center hover:scale-105 transition-transform shadow-[0_0_20px_rgba(212,255,0,0.3)]"
      style={{ bottom: 'calc(4rem + 16px + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Create post"
    >
      <Plus className="h-7 w-7 text-black" />
    </button>
  );
});

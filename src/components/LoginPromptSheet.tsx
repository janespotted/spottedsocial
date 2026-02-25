import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';

interface LoginPromptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginPromptSheet({ open, onOpenChange }: LoginPromptSheetProps) {
  const navigate = useNavigate();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] border-t border-[#a855f7]/40">
        <DrawerHeader className="text-center">
          <DrawerTitle className="text-white text-xl">Join the conversation</DrawerTitle>
          <DrawerDescription className="text-white/60">
            Create an account to post, vote, and comment on Yap threads.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="gap-3 pb-8">
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate('/auth', { state: { mode: 'signup' } });
            }}
            className="w-full h-12 bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold text-lg rounded-xl"
          >
            Sign Up
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate('/auth');
            }}
            variant="outline"
            className="w-full h-12 border-[#a855f7]/40 text-white hover:bg-[#a855f7]/10 font-semibold text-lg rounded-xl"
          >
            Log In
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

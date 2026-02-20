import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';
import { copyToClipboard, isNativePlatform } from '@/lib/platform';

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteUrl: string;
}

export function QRCodeModal({ open, onOpenChange, inviteUrl }: QRCodeModalProps) {
  const handleCopy = async () => {
    const ok = await copyToClipboard(inviteUrl);
    if (ok) {
      haptic.light();
      toast.success('Link copied!');
    } else {
      toast.error('Failed to copy');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on Spotted!',
          text: 'Scan this QR code or use this link to add me on Spotted 🎉',
          url: inviteUrl,
        });
        haptic.success();
      } catch (error) {
        // User cancelled
      }
    } else {
      handleCopy();
    }
  };

  const handleDownload = async () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = async () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');

      if (isNativePlatform()) {
        // On native, use Share sheet instead of download
        try {
          const { Share } = await import('@capacitor/share');
          await Share.share({
            title: 'Spotted QR Code',
            text: 'Scan to add me on Spotted!',
            url: inviteUrl,
          });
        } catch {
          // User cancelled
        }
      } else {
        const link = document.createElement('a');
        link.download = 'spotted-invite-qr.png';
        link.href = dataUrl;
        link.click();
      }
      haptic.success();
      toast.success('QR code saved!');
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-b from-[#2d1b4e] to-[#1a0f2e] border-[#a855f7]/40 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-white text-xl">
            Scan to Add Me
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-6 py-4">
          {/* QR Code */}
          <div className="bg-white p-4 rounded-2xl">
            <QRCodeSVG
              id="qr-code-svg"
              value={inviteUrl}
              size={200}
              level="H"
              includeMargin={false}
              fgColor="#1a0f2e"
              bgColor="#ffffff"
            />
          </div>

          <p className="text-white/60 text-sm text-center">
            Friends can scan this to add you on Spotted
          </p>

          {/* Action Buttons */}
          <div className="flex gap-3 w-full">
            <Button
              onClick={handleShare}
              className="flex-1 bg-[#a855f7] hover:bg-[#a855f7]/90 text-white"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button
              onClick={handleCopy}
              variant="outline"
              className="border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleDownload}
              variant="outline"
              className="border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

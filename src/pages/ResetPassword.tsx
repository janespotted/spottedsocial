import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Check } from 'lucide-react';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we're in password reset mode (from email link)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');
    
    if (accessToken && type === 'recovery') {
      setIsResetting(true);
    }
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setEmailSent(true);
      toast.success('Password reset link sent! Check your email.');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast.success('Password updated successfully!');
      navigate('/auth');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
        <Card className="w-full max-w-[430px] mx-auto border-2 border-[#a855f7]/40 shadow-[0_0_30px_rgba(168,85,247,0.4)] bg-[#0a0118] rounded-3xl">
          <CardHeader className="space-y-2 text-center pt-8">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                <Check className="h-8 w-8 text-[#a855f7]" />
              </div>
            </div>
            <CardTitle className="text-2xl font-semibold text-white">
              Check Your Email
            </CardTitle>
            <CardDescription className="text-base text-white/60">
              We've sent a password reset link to {email}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <Button
              onClick={() => navigate('/auth')}
              className="w-full bg-[#a855f7] hover:bg-[#a855f7]/90 shadow-[0_0_15px_rgba(168,85,247,0.6)] text-white font-semibold"
            >
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
      <Card className="w-full max-w-[430px] mx-auto border-2 border-[#a855f7]/40 shadow-[0_0_30px_rgba(168,85,247,0.4)] bg-[#0a0118] rounded-3xl">
        <CardHeader className="space-y-2 text-center pt-8">
          <button
            onClick={() => navigate('/auth')}
            className="absolute left-4 top-4 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <CardTitle className="text-2xl font-semibold text-white">
            {isResetting ? 'Set New Password' : 'Reset Password'}
          </CardTitle>
          <CardDescription className="text-base text-white/60">
            {isResetting 
              ? 'Enter your new password below' 
              : 'Enter your email to receive a reset link'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isResetting ? (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="border-[#a855f7]/40 focus:border-[#a855f7] focus:shadow-[0_0_15px_rgba(168,85,247,0.4)] bg-[#1a0f2e] text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="border-[#a855f7]/40 focus:border-[#a855f7] focus:shadow-[0_0_15px_rgba(168,85,247,0.4)] bg-[#1a0f2e] text-white"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#a855f7] hover:bg-[#a855f7]/90 shadow-[0_0_15px_rgba(168,85,247,0.6)] text-white font-semibold"
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-[#a855f7]/40 focus:border-[#a855f7] focus:shadow-[0_0_15px_rgba(168,85,247,0.4)] bg-[#1a0f2e] text-white"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#a855f7] hover:bg-[#a855f7]/90 shadow-[0_0_15px_rgba(168,85,247,0.6)] text-white font-semibold"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-white/80 hover:text-white hover:bg-[#a855f7]/20"
                onClick={() => navigate('/auth')}
              >
                Back to Sign In
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

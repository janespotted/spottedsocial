import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { loginSchema, signupSchema } from '@/lib/auth-validation';
import { getRedirectOrigin, APP_BASE_URL } from '@/lib/platform';
import { Mail, Lock, User, AtSign } from 'lucide-react';
import spottedLogo from '@/assets/spotted-s-logo.png';

interface InviterInfo {
  display_name: string;
  avatar_url: string | null;
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('invite');
  
  const [isLogin, setIsLogin] = useState(false);

  // Store invite code in localStorage for processing after email confirmation
  useEffect(() => {
    if (inviteCode) {
      localStorage.setItem('pending_invite_code', inviteCode);
    }
  }, [inviteCode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const navigate = useNavigate();

  // Fetch inviter info if invite code exists
  useEffect(() => {
    if (inviteCode) {
      fetchInviterInfo();
    }
  }, [inviteCode]);

  const fetchInviterInfo = async () => {
    try {
      const { data: invite } = await supabase
        .from('invite_codes')
        .select('user_id')
        .eq('code', inviteCode)
        .maybeSingle();

      if (invite) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', invite.user_id)
          .single();

        if (profile) {
          setInviter(profile);
        }
      }
    } catch (error) {
      console.error('Error fetching inviter:', error);
    }
  };

  const processInviteCode = async (newUserId: string) => {
    if (!inviteCode) return;

    try {
      const { data, error } = await supabase.rpc('process_invite_code', {
        invite_code: inviteCode,
        new_user_id: newUserId,
      });

      if (error) {
        console.error('Error processing invite:', error);
        return;
      }

      // Type assertion since RPC returns Json type
      const result = data as { success: boolean; inviter_name?: string } | null;
      if (result?.success && result.inviter_name) {
        toast.success(`You're now friends with ${result.inviter_name}! 🎉`);
      }
    } catch (error) {
      console.error('Error processing invite code:', error);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setGoogleError(null);

    try {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: getRedirectOrigin(),
      });

      if (error) throw error;
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      const message = error?.message || 'Google sign-in failed, please try again';
      setGoogleError(window.location.hostname.includes('preview') ? `${message} — Try from the published app instead.` : message);
      setGoogleLoading(false);
    }
  };


  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        // Validate login inputs
        const validatedData = loginSchema.parse({ email, password });

        const { error } = await supabase.auth.signInWithPassword({
          email: validatedData.email,
          password: validatedData.password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Invalid email or password');
          }
          throw error;
        }

        toast.success('Welcome back!');
        navigate('/');
      } else {
        // Validate signup inputs
        const validatedData = signupSchema.parse({
          email,
          password,
          displayName,
          username,
          agreedToTerms,
        });

        const redirectUrl = `${getRedirectOrigin()}/`;
        const { error, data } = await supabase.auth.signUp({
          email: validatedData.email,
          password: validatedData.password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              display_name: validatedData.displayName,
              username: validatedData.username,
            },
          },
        });

        if (error) {
          if (error.message.includes('already registered')) {
            throw new Error('This email is already registered. Please log in instead.');
          }
          throw error;
        }

        // Check if email confirmation is required
        if (data?.user && !data.session) {
          // Invite code already stored in localStorage, will be processed on email confirm
          toast.success('Account created! Please check your email to confirm.');
        } else if (data?.user && data.session) {
          // Process invite code immediately if we have a session
          const pendingInvite = localStorage.getItem('pending_invite_code');
          if (pendingInvite) {
            await processInviteCode(data.user.id);
            localStorage.removeItem('pending_invite_code');
          }
          toast.success('Welcome to Spotted!');
          navigate('/');
        }
      }
    } catch (error: any) {
      if (error.errors) {
        // Zod validation errors
        const firstError = error.errors[0];
        toast.error(firstError.message);
      } else {
        toast.error(error.message || (isLogin ? 'Login failed' : 'Signup failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
     <div className="relative flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] overflow-hidden">
       {/* Animated floating orbs for ambient depth */}
       <div className="fixed inset-0 overflow-hidden pointer-events-none">
         <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-float-slow" />
         <div className="absolute top-1/4 -right-32 w-80 h-80 bg-accent/15 rounded-full blur-3xl animate-float-slow-reverse" />
         <div className="absolute -bottom-32 left-1/4 w-72 h-72 bg-primary/15 rounded-full blur-3xl animate-float-slow" />
       </div>
 
       <Card className="relative z-10 w-full max-w-[430px] mx-auto glass-card rounded-3xl shadow-[0_0_60px_rgba(168,85,247,0.3)] animate-fade-in">
         <CardHeader className="space-y-3 text-center pt-8 pb-4">
           {/* Logo with glow effect */}
           <div className="flex justify-center mb-2">
             <img 
               src={spottedLogo} 
               alt="Spotted" 
               className="w-14 h-14 object-contain drop-shadow-[0_0_15px_rgba(212,255,0,0.5)]"
             />
           </div>
           
           <CardTitle className="text-4xl font-light tracking-[0.25em] text-foreground">
            Spotted
          </CardTitle>
          
          {/* Inviter Badge */}
          {inviter && !isLogin && (
             <div className="flex items-center justify-center gap-2 bg-primary/20 border border-primary/40 rounded-full px-4 py-2 mx-auto">
               <Avatar className="h-6 w-6 border border-primary/60">
                <AvatarImage src={inviter.avatar_url || undefined} />
                 <AvatarFallback className="bg-card text-foreground text-xs">
                  {inviter.display_name?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
               <span className="text-foreground/80 text-sm">
                Invited by {inviter.display_name}
              </span>
            </div>
          )}
          
           <CardDescription className="text-base text-muted-foreground">
            {isLogin 
              ? 'Welcome back! Sign in to see who\'s out tonight.' 
              : inviteCode 
                ? 'Sign up to connect with your friend!'
                : 'Join Spotted to see where your friends are tonight.'
            }
          </CardDescription>
        </CardHeader>
         <CardContent className="space-y-5 px-6 pb-8">
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                   <Label htmlFor="displayName" className="text-foreground text-sm font-medium">Display Name</Label>
                   <div className="relative">
                     <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                     <Input
                       id="displayName"
                       type="text"
                       placeholder="Your name"
                       value={displayName}
                       onChange={(e) => setDisplayName(e.target.value)}
                       required={!isLogin}
                       className="pl-10 h-11 border-border/60 focus:border-primary focus:shadow-[0_0_15px_hsl(var(--primary)/0.3)] bg-card/50 text-foreground rounded-xl transition-all"
                     />
                   </div>
                </div>
                <div className="space-y-2">
                   <Label htmlFor="username" className="text-foreground text-sm font-medium">Username</Label>
                   <div className="relative">
                     <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                     <Input
                       id="username"
                       type="text"
                       placeholder="username"
                       value={username}
                       onChange={(e) => setUsername(e.target.value)}
                       required={!isLogin}
                       className="pl-10 h-11 border-border/60 focus:border-primary focus:shadow-[0_0_15px_hsl(var(--primary)/0.3)] bg-card/50 text-foreground rounded-xl transition-all"
                     />
                   </div>
                </div>
              </>
            )}
            <div className="space-y-2">
               <Label htmlFor="email" className="text-foreground text-sm font-medium">Email</Label>
               <div className="relative">
                 <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input
                   id="email"
                   type="email"
                   placeholder="you@example.com"
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   required
                   className="pl-10 h-11 border-border/60 focus:border-primary focus:shadow-[0_0_15px_hsl(var(--primary)/0.3)] bg-card/50 text-foreground rounded-xl transition-all"
                 />
               </div>
            </div>
            <div className="space-y-2">
               <Label htmlFor="password" className="text-foreground text-sm font-medium">Password</Label>
               <div className="relative">
                 <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input
                   id="password"
                   type="password"
                   placeholder="••••••••"
                   value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   required
                   minLength={6}
                   className="pl-10 h-11 border-border/60 focus:border-primary focus:shadow-[0_0_15px_hsl(var(--primary)/0.3)] bg-card/50 text-foreground rounded-xl transition-all"
                 />
               </div>
            </div>
            
            {isLogin && (
              <div className="text-right">
                <Link 
                  to="/reset-password" 
                   className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            {!isLogin && (
               <div className="flex items-start space-x-3 py-1">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                   className="border-primary/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary mt-0.5"
                />
                 <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight cursor-pointer">
                  I agree to the{' '}
                   <Link to="/terms" className="text-primary hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                   <Link to="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
                </label>
              </div>
            )}

            <Button
              type="submit"
               className="w-full h-12 bg-primary hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.5)] hover:shadow-[0_0_30px_hsl(var(--primary)/0.7)] transition-all text-primary-foreground font-semibold rounded-xl"
              disabled={loading}
            >
              {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Create Account'}
            </Button>
            <Button
              type="button"
              variant="ghost"
               className="w-full text-muted-foreground hover:text-foreground hover:bg-primary/10"
              onClick={() => {
                setIsLogin(!isLogin);
                setAgreedToTerms(false);
              }}
            >
              {isLogin ? 'Don\'t have an account? Sign up' : 'Already have an account? Sign in'}
            </Button>
          </form>
        </CardContent>
        
        {/* Business Portal Link */}
        <div className="text-center pb-6">
          <Link 
            to="/business/auth" 
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Own a venue?{' '}
            <span className="text-primary hover:underline">Sign in for Business</span>
          </Link>
        </div>
      </Card>
    </div>
  );
}

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
import { Mail, Lock, User, AtSign, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import spottedLogo from '@/assets/spotted-s-logo.png';

interface InviterInfo {
  display_name: string;
  avatar_url: string | null;
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('invite');
  
  const [isLogin, setIsLogin] = useState(!inviteCode); // Default to signup if invite code present

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
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [emailFormOpen, setEmailFormOpen] = useState(false);
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
        redirect_uri: window.location.origin,
      });

      if (error) throw error;
    } catch (error: any) {
      setGoogleError('Google sign-in failed, please try again');
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    setAppleError(null);

    try {
      const { error } = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: window.location.origin,
      });

      if (error) throw error;
    } catch (error: any) {
      setAppleError('Apple sign-in failed, please try again');
      setAppleLoading(false);
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

        const redirectUrl = `${window.location.origin}/`;
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
 
       <Card className="relative z-10 w-full max-w-[430px] mx-auto glass-card rounded-3xl border border-primary/30 shadow-[0_0_60px_rgba(168,85,247,0.3)] animate-fade-in">
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
          {/* Google Sign-In Button */}
           <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
               className="w-full h-12 bg-white hover:bg-gray-100 text-gray-800 border-gray-200 font-medium flex items-center justify-center gap-3 rounded-xl shadow-sm transition-all hover:shadow-md"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <span className="text-gray-600">Signing in…</span>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </Button>
            {googleError && (
              <p className="text-red-400 text-sm text-center">{googleError}</p>
            )}
            
            {/* Apple Sign-In Button */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 bg-black hover:bg-gray-900 text-white border-gray-800 font-medium flex items-center justify-center gap-3 rounded-xl shadow-sm transition-all hover:shadow-md"
              onClick={handleAppleSignIn}
              disabled={appleLoading}
            >
              {appleLoading ? (
                <span>Signing in…</span>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <span>Continue with Apple</span>
                </>
              )}
            </Button>
            {appleError && (
              <p className="text-red-400 text-sm text-center">{appleError}</p>
            )}
          </div>

          {/* Collapsible Email Form */}
          <Collapsible open={emailFormOpen} onOpenChange={setEmailFormOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-4 py-3 w-full group cursor-pointer">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <span className="text-muted-foreground text-sm font-medium px-2 flex items-center gap-1 group-hover:text-primary transition-colors">
                  or use email
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", emailFormOpen && "rotate-180")} />
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <form onSubmit={handleAuth} className="space-y-4 pt-2">
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
              {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Sign Up'}
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
            </CollapsibleContent>
          </Collapsible>
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

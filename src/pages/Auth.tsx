import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast({
          title: 'Welcome back!',
          description: 'You\'ve successfully logged in.',
        });
        navigate('/');
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              display_name: displayName,
              username: username,
            },
          },
        });

        if (error) throw error;

        toast({
          title: 'Account created!',
          description: 'Welcome to Spotted. You\'re now logged in.',
        });
        navigate('/');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: isLogin ? 'Login failed' : 'Signup failed',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-background via-background to-accent/10">
      <Card className="w-full max-w-[430px] border-primary/20 shadow-lg shadow-primary/5">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Spotted
          </CardTitle>
          <CardDescription className="text-base">
            {isLogin ? 'Welcome back! Sign in to see who\'s out tonight.' : 'Join Spotted to see where your friends are tonight.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
...
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

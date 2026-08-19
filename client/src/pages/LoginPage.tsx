import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';
import { GoogleSignIn } from '@/components/auth/GoogleSignIn';
import { useToast } from '@/store/toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const googleError = searchParams.get('google_error');
    if (googleError) {
      toast('error', 'Google sign-in failed', googleError);
    }
  }, [searchParams, toast]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Invalid email or password');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-ink">TaskFlow</h1>
        <p className="mt-1 text-sm text-ink-secondary">Sign in to your workspace</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="md">
            Sign in
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-card text-ink-secondary">Or continue with</span>
          </div>
        </div>

        <GoogleSignIn />

        <p className="mt-4 text-center text-sm text-ink-secondary">
          No account?{' '}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
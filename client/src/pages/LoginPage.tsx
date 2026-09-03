import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';
import { GoogleSignIn } from '@/components/auth/GoogleSignIn';
import AuthLayout from '@/components/auth/AuthLayout';
import PasswordField from '@/components/auth/PasswordField';
import { useToast } from '@/store/toast';
import { classifyApiError } from '@/lib/errors';

// Wrong credentials come back as a plain message; everything else maps to a
// semantic variant so users never see raw status codes or provider details.
const ERROR_BY_VARIANT: Record<string, string> = {
  network: "Can't reach Taskflow right now. Check your connection and try again.",
  server: 'Taskflow is having trouble signing you in. Please try again shortly.',
  rateLimited: 'Too many attempts — please wait a moment and try again.',
  unavailable: 'Taskflow is temporarily unavailable. Try again shortly.',
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const googleError = searchParams.get('google_error');
    if (googleError) {
      toast('error', 'Google sign-in failed', googleError);
    }
    // Server redirects to /?google=signed_in after successful OAuth.
    // URLSearchParams key is "google", value is "signed_in".
    if (searchParams.get('google') === 'signed_in') {
      void navigate('/dashboard', { replace: true });
    }
  }, [searchParams, toast, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }
    setIsLoading(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const variant = classifyApiError(err);
      if (variant === 'unauthorized') {
        setError('Sai email hoặc mật khẩu. Thử tài khoản demo bên dưới hoặc tạo tài khoản mới.');
      } else {
        setError(ERROR_BY_VARIANT[variant] ?? 'Đăng nhập thất bại. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue where you left off.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <div>
          <PasswordField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
          <div className="mt-1.5 text-right">
            <Link to="/forgot-password" className="text-xs font-medium text-ink-secondary hover:text-accent hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        {error && <p role="alert" className="type-caption text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="md" disabled={isLoading}>
          {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line" /></div>
        <div className="relative flex justify-center">
          <span className="px-2 text-xs uppercase tracking-wider text-ink-muted">or</span>
        </div>
      </div>

      <GoogleSignIn />

      <p className="mt-5 text-center type-caption text-ink-secondary">
        No account?{' '}
        <Link to="/register" className="font-medium text-accent hover:underline">Create one</Link>
      </p>
    </AuthLayout>
  );
}

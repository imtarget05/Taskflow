import axios from 'axios';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';
import { GoogleSignIn } from '@/components/auth/GoogleSignIn';
import AuthLayout from '@/components/auth/AuthLayout';
import PasswordField from '@/components/auth/PasswordField';
import { useToast } from '@/store/toast';
import { classifyApiError } from '@/lib/errors';

const RATE_LIMIT_HINT = 'Too many attempts — please wait about 15 minutes and try again.';
const NETWORK_HINT = "Can't reach Taskflow right now. Check your connection and try again.";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const googleError = searchParams.get('google_error');
    if (googleError) {
      toast('error', 'Google sign-in failed', googleError);
    }
  }, [searchParams, toast]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Vui lòng nhập họ tên');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Vui lòng nhập email hợp lệ');
      return;
    }
    if (password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự');
      return;
    }
    setIsLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      let message = 'Đăng ký thất bại. Vui lòng kiểm tra lại.';
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string } | undefined;
        if (err.response?.status === 409) {
          message = 'Email này đã được đăng ký. Hãy đăng nhập thay vì tạo mới.';
        } else if (err.response?.status === 429) {
          message = RATE_LIMIT_HINT;
        } else if (!err.response) {
          message = NETWORK_HINT;
        } else if (data?.message) {
          message = data.message;
        } else if (classifyApiError(err) === 'server') {
          message = 'Taskflow đang bận. Vui lòng thử lại sau.';
        }
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Set up your workspace in under a minute.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <PasswordField
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          hint="Use at least 8 characters."
          required
        />
        {error && <p role="alert" className="type-caption text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="md" disabled={isLoading}>
          {isLoading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
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
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

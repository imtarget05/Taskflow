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

  useEffect(() => {
    const googleError = searchParams.get('google_error');
    if (googleError) {
      toast('error', 'Google sign-in failed', googleError);
    }
  }, [searchParams, toast]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await register(name, email, password);
      navigate('/dashboard');
    } catch (err) {
      let message = 'Registration failed. Please check your details and try again.';
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string } | undefined;
        if (err.response?.status === 429) {
          message = RATE_LIMIT_HINT;
        } else if (!err.response) {
          message = NETWORK_HINT;
        } else if (data?.message) {
          message = data.message;
        } else if (classifyApiError(err) === 'server') {
          message = 'Taskflow is having trouble creating your account. Please try again shortly.';
        }
      }
      setError(message);
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
        <Button type="submit" className="w-full" size="md">Create account</Button>
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

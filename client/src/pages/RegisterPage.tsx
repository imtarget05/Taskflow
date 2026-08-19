import axios from 'axios';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';

const RATE_LIMIT_HINT =
  'Too many attempts — please wait about 15 minutes and try again.';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await register(name, email, password);
      navigate('/');
    } catch (err) {
      let message = 'Registration failed. Please check your details and try again.';
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string } | undefined;
        if (err.response?.status === 429) {
          message = RATE_LIMIT_HINT;
        } else if (data?.message) {
          message = data.message;
        } else if (err.response) {
          message = `Registration failed (HTTP ${err.response.status}). Please try again.`;
        } else {
          message = `Cannot reach the server (${err.message}). Please try again.`;
        }
      }
      setError(message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-ink">Create account</h1>
        <p className="mt-1 text-sm text-ink-secondary">Start collaborating on TaskFlow</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="md">
            Create account
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-secondary">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
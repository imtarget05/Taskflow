import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input } from '@/components/ui';
import { forgotPassword } from '@/lib/api';
import AuthLayout from '@/components/auth/AuthLayout';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [devToken, setDevToken] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setDevToken('');
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      setInfo(res.message);
      if (res.resetToken) {
        setDevToken(res.resetToken);
      }
    } catch {
      setError('Unable to process request. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="Enter your email and we’ll send you a reset link.">

        {info ? (
          <div className="mt-6 space-y-4">
            <p role="alert" className="text-sm text-success">
              {info}
            </p>
            {devToken && (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-ink-secondary">
                <p className="mb-1 font-medium">Dev reset link (no email provider configured):</p>
                <Link
                  to={`/reset-password?token=${devToken}`}
                  className="break-all text-accent hover:underline"
                >
                  {`/reset-password?token=${devToken}`}
                </Link>
              </div>
            )}
            <Link to="/login" className="block text-center text-sm font-medium text-accent hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
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
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="md" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </Button>
            <Link to="/login" className="block text-center text-sm font-medium text-accent hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
    </AuthLayout>
  );
}

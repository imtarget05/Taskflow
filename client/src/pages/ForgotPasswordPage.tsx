import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input } from '@/components/ui';
import { forgotPassword } from '@/lib/api';

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
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-ink">Reset password</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Enter your email and we'll send you a reset link.
        </p>

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
      </div>
    </div>
  );
}

import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { resetPassword } from '@/lib/api';
import AuthLayout from '@/components/auth/AuthLayout';
import PasswordField from '@/components/auth/PasswordField';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Missing or invalid reset token.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setInfo('Password updated. Redirecting to sign in...');
      setTimeout(() => navigate('/login'), 1500);
    } catch {
      setError('This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a new password for your account.">

        {info ? (
          <p role="alert" className="mt-6 text-sm text-success">
            {info}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <PasswordField
              label="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
            <PasswordField
              label="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
              required
            />
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="md" disabled={loading}>
              {loading ? 'Updating...' : 'Update password'}
            </Button>
            <Link to="/login" className="block text-center text-sm font-medium text-accent hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
    </AuthLayout>
  );
}

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { API_URL } from '@/lib/api';
import { useToast } from '@/store/toast';

interface GoogleSignInProps {
  className?: string;
}

interface GoogleStatusResponse {
  success: boolean;
  data: {
    configured: boolean;
    devMode?: boolean;
  };
}

export function GoogleSignIn({ className }: GoogleSignInProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<{ configured: boolean; devMode: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/auth/google/status`)
      .then((r) => r.json())
      .then((d: GoogleStatusResponse) => {
        if (!cancelled) {
          setStatus({
            configured: Boolean(d.data?.configured),
            devMode: Boolean(d.data?.devMode),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus({ configured: false, devMode: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleClick() {
    if (status === null || !status.configured) {
      toast('error', 'Google sign-in unavailable', 'Google sign-in is not configured on the server yet.');
      return;
    }
    window.location.href = `${API_URL}/auth/google`;
  }

  if (status === null) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      className={`w-full flex items-center justify-center gap-2 ${className}`}
      onClick={handleClick}
      title={status.configured ? undefined : 'Google sign-in is not configured on the server'}
    >
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
      Continue with Google
      {status.devMode && (
        <span className="ml-1 rounded bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-warning-ink">
          DEV
        </span>
      )}
    </Button>
  );
}

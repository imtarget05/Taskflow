import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren<unknown>, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren<unknown>) {
    super(props);
    this.state = { hasError: false };
    // App booted successfully — re-arm the chunk-error auto-reload.
    try {
      sessionStorage.removeItem('taskflow-chunk-reload');
    } catch {
      /* storage unavailable */
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // A deploy replaces hashed JS chunks; a browser holding cached HTML then
    // fails to import the old chunk ("Failed to fetch dynamically imported
    // module" / ChunkLoadError). Reload once to pick up the fresh HTML that
    // references the new hashes instead of showing a dead-end error screen.
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      /Failed to fetch dynamically imported module|Loading CSS chunk/i.test(error.message);
    const alreadyReloaded = sessionStorage.getItem('taskflow-chunk-reload');
    if (isChunkError && !alreadyReloaded) {
      sessionStorage.setItem('taskflow-chunk-reload', '1');
      window.location.reload();
    }
  }


  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
          <div className="card max-w-md w-full p-8 text-center">
            <h1 className="text-2xl font-bold text-danger mb-4">Something went wrong</h1>
            <p className="text-ink-secondary mb-6">
              We're sorry for the inconvenience. Please try refreshing the page or contact support if the problem persists.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary w-full"
            >
              Reload page
            </button>
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-ink-muted">Error details</summary>
                <pre className="mt-2 text-xs bg-surface-2 p-2 rounded overflow-auto">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
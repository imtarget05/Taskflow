import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';

/**
 * Full-page 404 for unknown routes. Replaces the old silent redirect to "/"
 * so a mistyped URL gives clear feedback instead of looking like a bug.
 */
export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <EmptyState
        icon={<Compass className="h-10 w-10" aria-hidden="true" />}
        title="404 — Không tìm thấy trang"
        description="Đường dẫn bạn truy cập không tồn tại hoặc đã bị di chuyển."
        action={
          <Link to="/">
            <Button variant="primary">Về trang chủ</Button>
          </Link>
        }
      />
    </div>
  );
}

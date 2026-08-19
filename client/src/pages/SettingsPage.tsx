import { EmptyState } from '@/components/ui';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="card mt-6">
        <EmptyState
          icon={<Settings className="h-8 w-8" aria-hidden="true" />}
          title="Settings coming soon"
          description="Account and appearance settings will live here."
        />
      </div>
    </div>
  );
}
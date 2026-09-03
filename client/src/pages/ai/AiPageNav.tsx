import { NavLink } from 'react-router-dom';
import { Server, FileCode, FlaskConical, ClipboardCheck } from 'lucide-react';

const TABS = [
  { to: '/ai/models', label: 'Models', icon: Server },
  { to: '/ai/prompts', label: 'Prompts', icon: FileCode },
  { to: '/ai/experiments', label: 'Experiments', icon: FlaskConical },
  { to: '/ai/evaluation', label: 'Evaluation', icon: ClipboardCheck },
];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primaryContainer text-onPrimaryContainer'
      : 'text-ink-secondary hover:bg-surfaceContainerHighest hover:text-ink'
  }`;

export default function AiPageNav() {
  return (
    <nav aria-label="AI Studio" className="flex items-center gap-1 overflow-x-auto">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={tabClass}>
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
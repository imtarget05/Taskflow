const SIZES: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
};

const COLORS = [
  'bg-accent-soft text-accent-ink',
  'bg-info-soft text-info',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
  'bg-danger-soft text-danger',
];

interface AvatarProps {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export default function Avatar({ name, size = 'sm', className = '' }: AvatarProps) {
  const index = name
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = COLORS[index % COLORS.length];
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      title={name}
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${SIZES[size]} ${color} ${className}`}
    >
      {initial}
    </span>
  );
}
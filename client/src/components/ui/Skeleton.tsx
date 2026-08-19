interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className = 'h-4 w-full' }: SkeletonProps) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}
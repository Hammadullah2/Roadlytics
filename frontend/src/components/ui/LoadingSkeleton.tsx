/** This component renders a simple animated skeleton placeholder. */
type LoadingSkeletonProps = {
  className?: string;
};

export const LoadingSkeleton = ({ className = "" }: LoadingSkeletonProps) => {
  return <div className={`animate-pulse rounded-2xl bg-slate-800 ${className}`} />;
};

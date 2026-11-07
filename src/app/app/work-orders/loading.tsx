import { Skeleton } from "@/components/ui/states";

/** Skeleton shaped like the work orders table. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading work orders" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pb-2">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

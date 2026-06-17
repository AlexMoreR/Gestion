import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingBalancesPage() {
  return (
    <section className="w-full space-y-5">
      <Card className="border-border bg-card">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-80" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Card key={index} className="border-border bg-card">
                <CardContent className="space-y-3 p-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-3 w-40" />
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </CardContent>
      </Card>
    </section>
  );
}

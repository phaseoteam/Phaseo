// components/(rankings)/Skeletons.tsx
// Purpose: Loading skeletons for rankings page
// Why: Better UX while data is loading
// How: Shadcn skeleton components arranged in layouts

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StatsSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-4 rounded" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-16 mb-2" />
                        <Skeleton className="h-3 w-full" />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

export function TableSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
            ))}
        </div>
    );
}

export function ChartSkeleton() {
    return (
        <Card className="p-4">
            <Skeleton className="h-[400px] w-full" />
        </Card>
    );
}

export function ListSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                    <CardContent className="p-4">
                        <Skeleton className="h-16 w-full" />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

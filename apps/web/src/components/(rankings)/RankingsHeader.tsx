// components/(rankings)/RankingsHeader.tsx
// Purpose: Header component for rankings page
// Why: Provides title, description, and context for the page
// How: Simple presentational component

import { Trophy } from "lucide-react";

export function RankingsHeader() {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                    <Trophy className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold">AI Model Rankings</h1>
                    <p className="text-muted-foreground">
                        Real-time usage statistics and performance metrics
                    </p>
                </div>
            </div>
            <p className="text-sm text-muted-foreground">
                Aggregated data from AI Stats Gateway. Updated every 5 minutes. All metrics are privacy-preserving aggregations across teams.
            </p>
        </div>
    );
}

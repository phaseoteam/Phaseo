"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { deleteBenchmarkResult } from "@/app/(dashboard)/models/actions"
import { createClient } from "@/utils/supabase/client"

interface BenchmarkResult {
  id: string
  benchmark_id: string
  benchmark_name?: string
  score: string
  is_self_reported: boolean
  other_info: string | null
  source_link: string | null
  variant: string | null
}

interface BenchmarksTabProps {
  modelId: string
  onBenchmarksChange?: (benchmarks: BenchmarkResult[]) => void
}

export default function BenchmarksTab({ modelId, onBenchmarksChange }: BenchmarksTabProps) {
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult[]>([])
  const [availableBenchmarks, setAvailableBenchmarks] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const { data: benchmarkData } = await supabase
        .from("data_benchmark_results")
        .select("id, benchmark_id, score, is_self_reported, other_info, source_link, variant")
        .eq("model_id", modelId)

      const { data: allBenchmarks } = await supabase
        .from("data_benchmarks")
        .select("id, name")
        .order("name")

      if (allBenchmarks) {
        setAvailableBenchmarks(allBenchmarks.map((b: any) => ({
          id: b.id,
          name: b.name || b.id,
        })))
      }

      if (benchmarkData) {
        setBenchmarks(
          benchmarkData.map((b: any) => ({
            id: b.id,
            benchmark_id: b.benchmark_id,
            score: b.score?.toString() ?? "",
            is_self_reported: b.is_self_reported ?? false,
            other_info: b.other_info,
            source_link: b.source_link,
            variant: b.variant,
          }))
        )
      }
    }
    fetchData()
  }, [modelId])

  useEffect(() => {
    onBenchmarksChange?.(benchmarks)
  }, [benchmarks, onBenchmarksChange])

  const updateBenchmark = (id: string, field: string, value: any) => {
    setBenchmarks(benchmarks.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
  }

  const removeBenchmark = async (id: string) => {
    if (!id.startsWith("new-")) {
      try {
        await deleteBenchmarkResult(id)
      } catch (err) {
        console.error("Error deleting benchmark:", err)
        return
      }
    }
    setBenchmarks(benchmarks.filter((b) => b.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Benchmark Results</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setBenchmarks([
              ...benchmarks,
              { id: `new-${Date.now()}`, benchmark_id: "", score: "", is_self_reported: false, other_info: null, source_link: null, variant: null },
            ])
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {benchmarks.map((benchmark) => (
          <div key={benchmark.id} className="border rounded-lg p-3 space-y-2">
            <div className="grid gap-2 lg:grid-cols-12">
              <label className="text-xs lg:col-span-5">
                <div className="mb-1 text-muted-foreground">Benchmark</div>
                <Select
                  value={benchmark.benchmark_id}
                  onValueChange={(value) => updateBenchmark(benchmark.id, "benchmark_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select benchmark" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBenchmarks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs lg:col-span-2">
                <div className="mb-1 text-muted-foreground">Score</div>
                <Input
                  value={benchmark.score}
                  onChange={(e) => updateBenchmark(benchmark.id, "score", e.target.value)}
                  placeholder="Score"
                />
              </label>
              <div className="flex items-end justify-end lg:col-span-3">
                <Button variant="ghost" size="icon" onClick={() => removeBenchmark(benchmark.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-2 lg:grid-cols-12">
              <label className="text-xs lg:col-span-6">
                <div className="mb-1 text-muted-foreground">Source link</div>
                <Input
                  value={benchmark.source_link || ""}
                  onChange={(e) => updateBenchmark(benchmark.id, "source_link", e.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label className="text-xs lg:col-span-3">
                <div className="mb-1 text-muted-foreground">Variant</div>
                <Input
                  value={benchmark.variant || ""}
                  onChange={(e) => updateBenchmark(benchmark.id, "variant", e.target.value)}
                  placeholder="e.g., Max"
                />
              </label>
              <div className="flex items-end lg:col-span-3">
                <label className="flex items-center gap-2 pb-2 text-xs">
                  <Checkbox
                    checked={benchmark.is_self_reported}
                    onCheckedChange={(checked) => updateBenchmark(benchmark.id, "is_self_reported", checked === true)}
                  />
                  <Label className="text-xs">Self-reported</Label>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

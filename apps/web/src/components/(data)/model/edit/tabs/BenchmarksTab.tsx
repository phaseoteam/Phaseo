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
  rank: number | null
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
        .select("id, benchmark_id, score, is_self_reported, other_info, source_link, rank")
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
            rank: b.rank,
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
              { id: `new-${Date.now()}`, benchmark_id: "", score: "", is_self_reported: false, other_info: null, source_link: null, rank: null },
            ])
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {benchmarks.map((benchmark) => (
          <div key={benchmark.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <Select
                value={benchmark.benchmark_id}
                onValueChange={(value) => updateBenchmark(benchmark.id, "benchmark_id", value)}
              >
                <SelectTrigger className="flex-1">
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
              <Input
                value={benchmark.score}
                onChange={(e) => updateBenchmark(benchmark.id, "score", e.target.value)}
                placeholder="Score"
                className="w-24"
              />
              <Input
                type="number"
                value={benchmark.rank || ""}
                onChange={(e) => updateBenchmark(benchmark.id, "rank", e.target.value ? Number(e.target.value) : null)}
                placeholder="Rank"
                className="w-16"
              />
              <Button variant="ghost" size="icon" onClick={() => removeBenchmark(benchmark.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={benchmark.source_link || ""}
                onChange={(e) => updateBenchmark(benchmark.id, "source_link", e.target.value)}
                placeholder="Source link"
                className="flex-1"
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={benchmark.is_self_reported}
                  onCheckedChange={(checked) => updateBenchmark(benchmark.id, "is_self_reported", checked === true)}
                />
                <Label className="text-xs">Self-reported</Label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

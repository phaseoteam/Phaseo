"use client"

import { type ReactNode, useEffect, useState } from "react"
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
import { createAdminBenchmark, fetchAdminModelEditorSource, fetchAdminModelFormOptions } from "@/lib/fetchers/internal/adminModelEditorClient"

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

function FieldRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
      <Label className="text-sm font-medium">{label}</Label>
      <div>{children}</div>
    </div>
  )
}

export default function BenchmarksTab({ modelId, onBenchmarksChange }: BenchmarksTabProps) {
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult[]>([])
  const [availableBenchmarks, setAvailableBenchmarks] = useState<Array<{ id: string; name: string }>>([])
  const [newBenchmarkId, setNewBenchmarkId] = useState("")
  const [newBenchmarkName, setNewBenchmarkName] = useState("")
  const [creatingBenchmark, setCreatingBenchmark] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const [source, options] = await Promise.all([fetchAdminModelEditorSource(modelId), fetchAdminModelFormOptions()])
      const benchmarkData = source.model?.benchmark_results ?? []
      const allBenchmarks = options.benchmarks ?? []

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
            is_self_reported: b.is_self_reported ?? true,
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

  const removeBenchmark = (id: string) => {
    setBenchmarks(benchmarks.filter((b) => b.id !== id))
  }

  const handleCreateBenchmark = async () => {
    const id = newBenchmarkId.trim()
    const name = newBenchmarkName.trim()
    if (!id || !name) return

    setCreatingBenchmark(true)
    try {
      await createAdminBenchmark({ id, name })
      setAvailableBenchmarks((prev) =>
        [...prev.filter((row) => row.id !== id), { id, name }].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        )
      )
      setBenchmarks((prev) => [
        ...prev,
        {
          id: `new-${Date.now()}`,
          benchmark_id: id,
          score: "",
          is_self_reported: true,
          other_info: null,
          source_link: null,
          variant: null,
        },
      ])
      setNewBenchmarkId("")
      setNewBenchmarkName("")
    } catch { /* The editor keeps the draft in place for retry. */ }
    setCreatingBenchmark(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold">Benchmark Results</Label>
          <p className="text-xs text-muted-foreground">
            Changes are staged locally and saved when you click Save Benchmarks.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setBenchmarks([
              ...benchmarks,
              { id: `new-${Date.now()}`, benchmark_id: "", score: "", is_self_reported: true, other_info: null, source_link: null, variant: null },
            ])
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <Label className="text-sm font-semibold">Create and Attach Benchmark</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={newBenchmarkId}
            onChange={(event) => setNewBenchmarkId(event.target.value)}
            placeholder="benchmark_id"
          />
          <Input
            value={newBenchmarkName}
            onChange={(event) => setNewBenchmarkName(event.target.value)}
            placeholder="Benchmark name"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCreateBenchmark}
            disabled={creatingBenchmark || !newBenchmarkId.trim() || !newBenchmarkName.trim()}
          >
            {creatingBenchmark ? "Creating..." : "Create and attach"}
          </Button>
        </div>
      </div>

      {benchmarks.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No benchmark entries yet.
        </div>
      ) : null}

      <div className="space-y-3">
        {benchmarks.map((benchmark, index) => (
          <div key={benchmark.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Entry {index + 1}</div>
              <Button variant="ghost" size="icon" onClick={() => removeBenchmark(benchmark.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <FieldRow label="Benchmark">
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
            </FieldRow>

            <FieldRow label="Score">
              <Input
                value={benchmark.score}
                onChange={(e) => updateBenchmark(benchmark.id, "score", e.target.value)}
                placeholder="Score"
              />
            </FieldRow>

            <FieldRow label="Source link">
              <Input
                value={benchmark.source_link || ""}
                onChange={(e) => updateBenchmark(benchmark.id, "source_link", e.target.value)}
                placeholder="https://..."
              />
            </FieldRow>

            <FieldRow label="Variant">
              <Input
                value={benchmark.variant || ""}
                onChange={(e) => updateBenchmark(benchmark.id, "variant", e.target.value)}
                placeholder="e.g., Max"
              />
            </FieldRow>

            <FieldRow label="Self-reported">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={benchmark.is_self_reported}
                  onCheckedChange={(checked) => updateBenchmark(benchmark.id, "is_self_reported", checked === true)}
                />
                <span>Benchmark result is self-reported</span>
              </label>
            </FieldRow>
          </div>
        ))}
      </div>
    </div>
  )
}

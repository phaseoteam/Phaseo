"use client"

import { type ReactNode, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { DatePickerInput } from "@/components/ui/date-picker-input"
import { Button } from "@/components/ui/button"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
  effective_to?: string | null
  variant: string | null
}

interface BenchmarksTabProps {
  modelId: string
  onBenchmarksChange?: (benchmarks: BenchmarkResult[]) => void
  onPendingChange?: (state: { dirty: boolean; saving: boolean }) => void
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

export default function BenchmarksTab({ modelId, onBenchmarksChange, onPendingChange }: BenchmarksTabProps) {
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult[]>([])
  const [availableBenchmarks, setAvailableBenchmarks] = useState<Array<{ id: string; name: string }>>([])
  const [newBenchmarkId, setNewBenchmarkId] = useState("")
  const [newBenchmarkName, setNewBenchmarkName] = useState("")
  const [creatingBenchmark, setCreatingBenchmark] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    onPendingChange?.({ dirty: Boolean(newBenchmarkId || newBenchmarkName), saving: creatingBenchmark })
  }, [newBenchmarkId, newBenchmarkName, creatingBenchmark, onPendingChange])

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
            effective_to: b.effective_to,
          }))
        )
      }
      setLoaded(true)
    }
    fetchData()
  }, [modelId])

  useEffect(() => {
    if (loaded) onBenchmarksChange?.(benchmarks)
  }, [benchmarks, onBenchmarksChange, loaded])

  const updateBenchmark = (id: string, field: string, value: any) => {
    setBenchmarks(benchmarks.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
  }

  const removeBenchmark = (id: string) => {
    setBenchmarks(id.startsWith("new-") ? benchmarks.filter((b) => b.id !== id) : benchmarks.map((b) => b.id === id ? { ...b, effective_to: new Date().toISOString() } : b))
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
          id: `new-${crypto.randomUUID()}`,
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
              { id: `new-${crypto.randomUUID()}`, benchmark_id: "", score: "", is_self_reported: true, other_info: null, source_link: null, variant: null },
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
              <Button variant="ghost" disabled={Boolean(benchmark.effective_to)} onClick={() => removeBenchmark(benchmark.id)}>
                {benchmark.effective_to ? "End-dated" : benchmark.id.startsWith("new-") ? "Discard draft" : "End now"}
              </Button>
            </div>

            <FieldRow label="Ends"><DatePickerInput value={benchmark.effective_to?.slice(0, 10) ?? ""} onChange={(value) => updateBenchmark(benchmark.id, "effective_to", value ? `${value}T00:00:00Z` : null)} placeholder="No end date" /></FieldRow>
            <FieldRow label="Benchmark">
              <SearchableSelect label="Benchmark" value={benchmark.benchmark_id} options={availableBenchmarks.map((benchmark) => ({ value: benchmark.id, label: benchmark.name }))} onValueChange={(value) => updateBenchmark(benchmark.id, "benchmark_id", value)} />
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

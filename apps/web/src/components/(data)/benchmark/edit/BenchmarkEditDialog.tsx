"use client"

import { useState, useEffect, useCallback } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/utils/supabase/client"

interface BenchmarkEditDialogProps {
  benchmarkId: string
}

interface BenchmarkData {
  id: string
  name: string | null
  category: string | null
  link: string | null
  ascending_order: boolean | null
  description?: string | null
}

export default function BenchmarkEditDialog({
  benchmarkId,
}: BenchmarkEditDialogProps) {
  const [open, setOpen] = useState(false)
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBenchmark = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from("data_benchmarks")
      .select("*")
      .eq("id", benchmarkId)
      .single()

    if (error) {
      console.error("[BenchmarkEditDialog] Error fetching:", error)
    } else {
      setBenchmark(data)
    }

    setLoading(false)
  }, [benchmarkId])

  useEffect(() => {
    if (open && !benchmark) {
      fetchBenchmark()
    }
  }, [open, benchmark, fetchBenchmark])

  const handleSave = async () => {
    if (!benchmark) return
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("data_benchmarks")
        .update({
          name: benchmark.name,
          category: benchmark.category,
          link: benchmark.link,
          ascending_order: benchmark.ascending_order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", benchmarkId)

      if (error) {
        throw new Error(error.message)
      }

      setOpen(false)
    } catch (err) {
      console.error("[BenchmarkEditDialog] Error saving:", err)
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Benchmark</DialogTitle>
          <DialogDescription>
            Make changes to the benchmark details here.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p>Loading...</p>
        ) : benchmark ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={benchmark.name || ""}
                onChange={(e) =>
                  setBenchmark({ ...benchmark, name: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={benchmark.category || ""}
                onChange={(e) =>
                  setBenchmark({ ...benchmark, category: e.target.value })
                }
                placeholder="e.g., Reasoning, Math, Coding"
              />
            </div>
            <div>
              <Label htmlFor="link">Link</Label>
              <Input
                id="link"
                type="url"
                value={benchmark.link || ""}
                onChange={(e) =>
                  setBenchmark({ ...benchmark, link: e.target.value })
                }
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="order">Scoring Order</Label>
              <Select
                value={benchmark.ascending_order === true ? "higher" : benchmark.ascending_order === false ? "lower" : "default"}
                onValueChange={(value) =>
                  setBenchmark({
                    ...benchmark,
                    ascending_order: value === "higher" ? true : value === "lower" ? false : null,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="higher">Higher is Better</SelectItem>
                  <SelectItem value="lower">Lower is Better</SelectItem>
                  <SelectItem value="default">Default</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <p>Error loading benchmark.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

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
import { createClient } from "@/utils/supabase/client"

interface APIProviderEditDialogProps {
  apiProviderId: string
}

interface APIProviderData {
  api_provider_id: string
  api_provider_name: string | null
  description: string | null
  link: string | null
  country_code: string | null
}

export default function APIProviderEditDialog({
  apiProviderId,
}: APIProviderEditDialogProps) {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<APIProviderData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProvider = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from("data_api_providers")
      .select("*")
      .eq("api_provider_id", apiProviderId)
      .single()

    if (error) {
      console.error("[APIProviderEditDialog] Error fetching:", error)
    } else {
      setProvider(data)
    }

    setLoading(false)
  }, [apiProviderId])

  useEffect(() => {
    if (open && !provider) {
      fetchProvider()
    }
  }, [open, provider, fetchProvider])

  const handleSave = async () => {
    if (!provider) return
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("data_api_providers")
        .update({
          api_provider_name: provider.api_provider_name,
          description: provider.description,
          link: provider.link,
          country_code: provider.country_code,
          updated_at: new Date().toISOString(),
        })
        .eq("api_provider_id", apiProviderId)

      if (error) {
        throw new Error(error.message)
      }

      setOpen(false)
    } catch (err) {
      console.error("[APIProviderEditDialog] Error saving:", err)
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
          <DialogTitle>Edit API Provider</DialogTitle>
          <DialogDescription>
            Make changes to the API provider details here.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p>Loading...</p>
        ) : provider ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Provider Name</Label>
              <Input
                id="name"
                value={provider.api_provider_name || ""}
                onChange={(e) =>
                  setProvider({ ...provider, api_provider_name: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={provider.description || ""}
                onChange={(e) =>
                  setProvider({ ...provider, description: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="link">Website Link</Label>
              <Input
                id="link"
                type="url"
                value={provider.link || ""}
                onChange={(e) =>
                  setProvider({ ...provider, link: e.target.value })
                }
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="country_code">Country Code</Label>
              <Input
                id="country_code"
                value={provider.country_code || ""}
                onChange={(e) =>
                  setProvider({ ...provider, country_code: e.target.value })
                }
                placeholder="e.g., US, GB, CN"
              />
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
          <p>Error loading provider.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

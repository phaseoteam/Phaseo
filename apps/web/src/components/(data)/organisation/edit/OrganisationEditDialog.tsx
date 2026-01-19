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

interface OrganisationEditDialogProps {
  organisationId: string
}

interface OrganisationData {
  organisation_id: string
  name: string | null
  description: string | null
  country_code: string | null
  colour: string | null
}

export default function OrganisationEditDialog({
  organisationId,
}: OrganisationEditDialogProps) {
  const [open, setOpen] = useState(false)
  const [organisation, setOrganisation] = useState<OrganisationData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrganisation = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from("data_organisations")
      .select("*")
      .eq("organisation_id", organisationId)
      .single()

    if (error) {
      console.error("[OrganisationEditDialog] Error fetching:", error)
    } else {
      setOrganisation(data)
    }

    setLoading(false)
  }, [organisationId])

  useEffect(() => {
    if (open && !organisation) {
      fetchOrganisation()
    }
  }, [open, organisation, fetchOrganisation])

  const handleSave = async () => {
    if (!organisation) return
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("data_organisations")
        .update({
          name: organisation.name,
          description: organisation.description,
          country_code: organisation.country_code,
          colour: organisation.colour,
          updated_at: new Date().toISOString(),
        })
        .eq("organisation_id", organisationId)

      if (error) {
        throw new Error(error.message)
      }

      setOpen(false)
    } catch (err) {
      console.error("[OrganisationEditDialog] Error saving:", err)
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
          <DialogTitle>Edit Organisation</DialogTitle>
          <DialogDescription>
            Make changes to the organisation details here.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p>Loading...</p>
        ) : organisation ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={organisation.name || ""}
                onChange={(e) =>
                  setOrganisation({ ...organisation, name: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={organisation.description || ""}
                onChange={(e) =>
                  setOrganisation({ ...organisation, description: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="country_code">Country Code</Label>
              <Input
                id="country_code"
                value={organisation.country_code || ""}
                onChange={(e) =>
                  setOrganisation({ ...organisation, country_code: e.target.value })
                }
                placeholder="e.g., US, GB, CN"
              />
            </div>
            <div>
              <Label htmlFor="colour">Brand Colour (hex)</Label>
              <Input
                id="colour"
                value={organisation.colour || ""}
                onChange={(e) =>
                  setOrganisation({ ...organisation, colour: e.target.value })
                }
                placeholder="e.g., #FF5722"
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
          <p>Error loading organisation.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

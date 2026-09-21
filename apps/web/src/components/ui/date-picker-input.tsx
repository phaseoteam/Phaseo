"use client"

import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider"

function parseDateInput(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const parts = value.split("-")
  if (parts.length !== 3) return undefined
  const [year, month, day] = parts.map((part) => Number(part))
  if (!year || !month || !day) return undefined
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return undefined
  return date
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

interface DatePickerInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  name?: string
  disabled?: boolean
  className?: string
}

export function DatePickerInput({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  name,
  disabled = false,
  className,
}: DatePickerInputProps) {
  const format = useDisplayFormatters()
  const selected = parseDateInput(value)

  return (
    <div className={className}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format.calendarDate(`${value}T00:00:00.000Z`, value) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => onChange(date ? formatDateInput(date) : "")}
            className="rounded-lg border"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

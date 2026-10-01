"use client"

import { CalendarIcon } from "lucide-react"
import { arSA, de, enGB, enUS, es, fr, hi, ja, ptBR, zhCN } from "date-fns/locale"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

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

const DATE_PICKER_LOCALES = {
  "ar-SA": arSA,
  "de-DE": de,
  "en-GB": enGB,
  "en-US": enUS,
  "en-XA": enUS,
  "es-ES": es,
  "fr-FR": fr,
  hi,
  ja,
  "pt-BR": ptBR,
  "zh-Hans": zhCN,
} as const

function formatDateLabel(value: string, locale: string): string {
  const date = parseDateInput(value)
  if (!date) return value
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
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
  placeholder,
  name,
  disabled = false,
  className,
}: DatePickerInputProps) {
  const locale = useLocale()
  const t = useTranslations("Common.ui.datePicker")
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
            {value ? formatDateLabel(value, locale) : placeholder ?? t("pickDate")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={DATE_PICKER_LOCALES[locale as keyof typeof DATE_PICKER_LOCALES] ?? enUS}
            selected={selected}
            onSelect={(date) => onChange(date ? formatDateInput(date) : "")}
            className="rounded-lg border"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

"use client";

import { Check, ChevronDown } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type ModelSearchDropdownOption = {
  value: string;
  label: string;
  description?: string;
  logoId?: string;
  keywords?: string[];
};

export function ModelSearchDropdown({
  value,
  onValueChange,
  options,
  open,
  onOpenChange,
  disabled,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  className,
  contentClassName,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  options: ModelSearchDropdownOption[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  contentClassName?: string;
}) {
  const t = useTranslations("Product.games");
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between gap-3 rounded-lg px-3 font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {selected?.logoId ? (
              <Logo
                id={selected.logoId}
                alt={selected.description ?? selected.label}
                width={18}
                height={18}
                className="size-[18px] shrink-0 rounded-sm object-contain"
              />
            ) : null}
            {selected ? (
              <span className="flex min-w-0 items-baseline gap-2 truncate text-left">
                <span className="truncate">{selected.label}</span>
                {selected.description ? (
                  <span className="shrink truncate text-xs text-muted-foreground">
                    {selected.description}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="min-w-0 truncate text-left">
                {placeholder ?? t("selectModel")}
              </span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(
          "w-(--anchor-width) max-w-[calc(100vw-2rem)] gap-0 rounded-lg p-1",
          contentClassName
        )}
      >
        <Command>
          <CommandInput
            autoFocus
            placeholder={searchPlaceholder ?? t("searchModels")}
          />
          <ScrollArea
            className="h-80 max-h-[52vh] [&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/40 hover:[&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/60"
            viewportClassName="p-1 pr-3"
            keepScrollbarMounted
          >
            <CommandList className="max-h-none overflow-visible p-0">
              <CommandEmpty>{emptyMessage ?? t("noModelsFound")}</CommandEmpty>
              <CommandGroup heading={t("modelsHeading")}>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label, option.description ?? "", ...(option.keywords ?? [])]}
                    onSelect={() => {
                      onValueChange(option.value);
                      onOpenChange?.(false);
                    }}
                    className="min-h-9 gap-2.5 rounded-lg px-2.5 py-1.5"
                  >
                    {option.logoId ? (
                      <Logo
                        id={option.logoId}
                        alt={option.description ?? option.label}
                        width={18}
                        height={18}
                        className="size-[18px] shrink-0 rounded-sm object-contain"
                      />
                    ) : (
                      <span className="size-[18px] shrink-0" aria-hidden />
                    )}
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate">
                      <span className="truncate text-sm font-medium">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="shrink truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {selected?.value === option.value ? (
                      <Check className="size-4 shrink-0" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

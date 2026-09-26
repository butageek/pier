"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Group picker: anchored combobox listing existing groups, with free-text
 * creation. Replaces the native <datalist> dropdown, which rendered outside
 * the dialog in some browsers.
 */
export function GroupSelect({
  value,
  onChange,
  groups,
}: {
  value: string;
  onChange: (group: string) => void;
  groups: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const filtered = groups.filter((g) => g.toLowerCase().includes(query));
  const canCreate = query.length > 0 && !groups.some((g) => g.toLowerCase() === query);

  const pick = (group: string) => {
    onChange(group);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "No group"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or create group…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              {canCreate ? `Press "Create" to use "${search.trim()}"` : "No groups yet"}
            </CommandEmpty>
            {(value === "" || !filtered.includes(value)) && query === "" && (
              <CommandGroup>
                <CommandItem onSelect={() => pick("")}>
                  <span className="text-muted-foreground">No group</span>
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((g) => (
                  <CommandItem key={g} value={g} onSelect={() => pick(g)}>
                    <Check className={cn("size-3.5", value === g ? "opacity-100" : "opacity-0")} />
                    {g}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canCreate && (
              <CommandGroup>
                <CommandItem
                  value={`create-${query}`}
                  onSelect={() => pick(search.trim())}
                >
                  <Plus className="size-3.5" /> Create &quot;{search.trim()}&quot;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

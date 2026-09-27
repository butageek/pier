import Link from "next/link";
import { ChevronRight, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Pier" };

export default function SettingsPage() {
  const hiddenCount = (
    getDb().prepare("SELECT COUNT(*) AS n FROM tiles WHERE hidden = 1").get() as { n: number }
  ).n;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage Pier&apos;s behaviour and content.</p>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border/70">
        <Link
          href="/settings/hidden"
          className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <EyeOff className="size-4 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Hidden links</span>
            <span className="block truncate text-xs text-muted-foreground">
              Links hidden from the dashboard — restore them anytime
            </span>
          </span>
          {hiddenCount > 0 && (
            <Badge variant="secondary" className="shrink-0">
              {hiddenCount}
            </Badge>
          )}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}

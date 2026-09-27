import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HiddenLinks } from "@/components/hidden-links";

export const metadata = { title: "Hidden links · Settings · Pier" };

export default function HiddenLinksPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Settings
      </Link>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Hidden links</h1>
        <p className="text-sm text-muted-foreground">
          Links you&apos;ve hidden from the dashboard.
        </p>
      </div>
      <HiddenLinks />
    </div>
  );
}

import { HiddenLinks } from "@/components/hidden-links";

export const metadata = { title: "Settings · Pier" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage links you&apos;ve hidden from the dashboard.</p>
      </div>
      <HiddenLinks />
    </div>
  );
}

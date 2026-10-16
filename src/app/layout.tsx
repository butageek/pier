import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pier",
  description: "A dock for your self-hosted services",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} dark h-full antialiased`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('pier-mode')||'system';var dt=localStorage.getItem('pier-dark-theme')||'bauhaus-dark';var lt=localStorage.getItem('pier-light-theme')||'bauhaus-studio';var validDark=['bauhaus-dark','cad-dark','pinboard-dark'];var validLight=['bauhaus-studio','cad-blueprint','pinboard-atelier'];if(validDark.indexOf(dt)===-1)dt='bauhaus-dark';if(validLight.indexOf(lt)===-1)lt='bauhaus-studio';var sysDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var isDark=m==='dark'||(m==='system'&&sysDark);var res=isDark?dt:lt;document.documentElement.setAttribute('data-theme',res);if(isDark){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex shrink-0 items-center gap-2.5">
              <Link href="/" className="group flex items-center gap-2.5" aria-label="Pier home">
                <Logo className="size-7 shrink-0 transition-transform duration-200 group-hover:scale-105" />
                <span className="text-[15px] font-semibold tracking-tight">Pier</span>
              </Link>
            </div>
            {/* Header actions: dashboard portal-renders status / search / buttons here */}
            <div id="header-actions" className="flex min-w-0 flex-1 items-center justify-end gap-2.5 empty:hidden" />
            <nav className="flex shrink-0 items-center gap-1.5 text-sm">
              <ThemeToggle />
              <Link
                href="/settings"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className="hidden sm:inline">Settings</span>
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}

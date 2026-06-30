"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/settings/providers", label: "Models & API" },
  { href: "/settings/products", label: "Products" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <main className="min-h-dvh">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Link href="/" className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-[15px] font-semibold">Settings</h1>
      </header>
      <div className="mx-auto flex max-w-4xl gap-8 px-6 py-8">
        <nav className="flex w-44 shrink-0 flex-col gap-0.5">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href}
              className={cn("rounded-lg px-3 py-2 text-[13px] transition",
                path === t.href ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")}>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}

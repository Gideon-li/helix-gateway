import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "ok" | "warn" | "danger" | "steel" }) {
  const tones = {
    default: "border-border text-muted",
    ok: "border-ok/30 text-ok bg-ok/10",
    warn: "border-warn/30 text-warn bg-warn/10",
    danger: "border-danger/30 text-danger bg-danger/10",
    steel: "border-steel/30 text-steel bg-steel/10",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

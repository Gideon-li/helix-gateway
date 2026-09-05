import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-faint",
        "outline-none transition-[border-color,box-shadow] duration-150",
        "focus:border-border-strong focus:ring-2 focus:ring-ring/30",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

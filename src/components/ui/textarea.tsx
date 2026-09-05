import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-faint",
        "outline-none transition-[border-color,box-shadow] duration-150",
        "focus:border-border-strong focus:ring-2 focus:ring-ring/30",
        className,
      )}
      {...props}
    />
  );
}

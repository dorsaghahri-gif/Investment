import * as React from "react";
import { cn } from "@/lib/utils";

/** Styled native <select>: accessible, works without JS inside server-action forms. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-card px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };

import * as React from "react";
import { cn } from "@/lib/utils";
import { useInputFocus } from "@/contexts/InputFocusContext";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, onFocus, onBlur, ...props }, ref) => {
  const { setInputFocused } = useInputFocus();

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setInputFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setInputFocused(false);
    onBlur?.(e);
  };

  return (
    <textarea
      autoComplete="off"
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };

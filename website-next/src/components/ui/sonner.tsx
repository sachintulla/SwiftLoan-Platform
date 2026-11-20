'use client';
import { Toaster as Sonner } from "sonner";
import { LAYERS } from "@/lib/layers";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Sonner defaults to bottom-right, and goes full-width at the bottom
      // below 600px (its own responsive CSS) — the same corner/edge Ruby's
      // voice widget lives in, so a toast would visually collide with it
      // (looked like the widget "jumping" whenever one fired). Top-center
      // is clear of it on every route/breakpoint.
      position="top-center"
      // Toasts sit above pop-ups and above Ruby (lib/layers.ts), instead of Sonner's own 999999999.
      style={{ zIndex: LAYERS.toast }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

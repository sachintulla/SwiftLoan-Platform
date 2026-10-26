'use client';
// Static, soft colour wash — no motion. The orbs used to drift continuously, which
// read as distracting behind the forms.
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />
      <div
        className="orb h-[38rem] w-[38rem] -top-40 -left-32 opacity-[0.14]"
        style={{ background: "var(--gradient-brand)" }}
      />
      <div
        className="orb h-[30rem] w-[30rem] top-[38%] -right-24 opacity-[0.10]"
        style={{ background: "var(--gradient-brand)" }}
      />
      <div
        className="orb h-[34rem] w-[34rem] bottom-0 left-1/3 opacity-[0.07]"
        style={{ background: "var(--gradient-brand)" }}
      />
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--brand) 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--brand) 6%, transparent) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at 50% 0%, black, transparent 75%)",
        }}
      />
    </div>
  );
}

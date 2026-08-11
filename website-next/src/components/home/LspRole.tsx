'use client';
import { Building2 } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { useCopy } from "@/lib/i18n";
import { lspRoleCopy } from "@/i18n/lsp-role";

export function LspRole() {
  const t = useCopy(lspRoleCopy);
  return (
    <section id="lsp-role" className="shell py-12 sm:py-16">
      <Reveal>
        <div className="glass-panel p-5 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="bg-brand-gradient text-primary-foreground grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
              <Building2 className="h-5 w-5" />
            </span>
            <h2 className="text-lg leading-snug font-bold sm:text-xl">{t.heading}</h2>
          </div>
          <p className="text-muted-foreground mt-5 text-sm leading-relaxed">{t.body}</p>
        </div>
      </Reveal>
    </section>
  );
}

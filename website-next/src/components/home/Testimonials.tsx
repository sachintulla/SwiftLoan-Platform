'use client';
import { Quote, Star } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { useCopy } from "@/lib/i18n";
import { testimonialsCopy } from "@/i18n/testimonials";

export function Testimonials() {
  const t = useCopy(testimonialsCopy);
  return (
    <section id="reviews" className="shell py-16 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h2 className="mt-6 text-3xl font-extrabold leading-snug sm:text-4xl">{t.heading}</h2>
          <div className="glass mx-auto mt-6 inline-flex flex-wrap items-center justify-center gap-2.5 rounded-full px-5 py-2.5">
            <span className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => {
                const fill = Math.min(Math.max(4.8 - i, 0), 1);
                return (
                  <span key={i} className="relative">
                    <Star className="text-muted h-4 w-4" />
                    <span
                      className="absolute inset-0 overflow-hidden"
                      style={{ width: `${fill * 100}%` }}
                    >
                      <Star className="fill-warning text-warning h-4 w-4" />
                    </span>
                  </span>
                );
              })}
            </span>
            <span className="text-sm font-semibold">{t.ratingText}</span>
          </div>
        </div>
      </Reveal>

      <div className="marquee -mx-4 mt-14 sm:-mx-6">
        <div className="marquee-track-slow">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className="marquee-group items-stretch gap-6 px-3"
              aria-hidden={copy === 1}
            >
              {t.reviews.map((r) => (
                <figure
                  key={r.name}
                  className="glass lift flex w-[19rem] shrink-0 flex-col rounded-3xl p-7 sm:w-[22rem]"
                >
                  <Quote className="text-primary/40 h-8 w-8" />
                  <blockquote className="mt-4 flex-1 text-sm leading-relaxed">
                    "{r.text}"
                  </blockquote>
                  <figcaption className="border-border/60 mt-6 flex items-center gap-3 border-t pt-5">
                    <span className="bg-brand-gradient grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-primary-foreground">
                      {r.name.charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm leading-snug font-bold">{r.name}</span>
                      <span className="text-muted-foreground block text-xs leading-snug">
                        {r.meta}
                      </span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}

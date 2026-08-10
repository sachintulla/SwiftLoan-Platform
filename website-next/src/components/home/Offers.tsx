'use client';
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import personalImg from "@/assets/personal-loan.jpg";
import businessImg from "@/assets/business-loan.jpg";
import { Reveal } from "@/components/site/Reveal";
import { useCopy } from "@/lib/i18n";
import { offersCopy } from "@/i18n/offers";

const images = [personalImg, businessImg];

export function Offers() {
  const t = useCopy(offersCopy);
  const offers = t.offers.map((o, i) => ({ ...o, image: images[i] }));

  return (
    <section id="offers" className="shell scroll-mt-28 py-16 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h2 className="mt-6 text-2xl leading-snug font-extrabold sm:text-3xl lg:text-4xl">
            {t.heading}
          </h2>
          <p className="text-muted-foreground mt-4 text-base leading-relaxed">{t.body}</p>
        </div>
      </Reveal>

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        {offers.map((o, i) => (
          <Reveal key={o.title} delay={i * 120}>
            <article className="glass-panel lift group flex h-full flex-col overflow-hidden p-2">
              <div className="relative overflow-hidden rounded-[1.4rem]">
                {/* Next's image loader returns a StaticImageData object, not a
                    string, so the raw import cannot be handed to <img src>. */}
                <img
                  src={typeof o.image === 'string' ? o.image : (o.image as { src: string }).src}
                  alt={o.alt}
                  loading="lazy"
                  width={1024}
                  height={1024}
                  className="h-48 w-full object-cover transition-transform duration-700 group-hover:scale-105 sm:h-56"
                />
                <div className="absolute top-4 left-4 max-w-[80%]">
                  <span className="glass rounded-full px-3 py-1 text-[0.68rem] font-semibold break-words">
                    {o.tag}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <div className="flex-1">
                  <h3 className="text-xl font-bold sm:text-2xl">{o.title}</h3>
                  <p className="text-muted-foreground mt-3 text-sm leading-relaxed lg:line-clamp-3">
                    {o.body}
                  </p>

                  <ul className="mt-6 space-y-3">
                    {o.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-sm">
                        <span className="bg-success text-success-foreground mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full">
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="font-medium">{p}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {o.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-accent text-accent-foreground rounded-full px-3 py-1 text-xs font-semibold"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <Link
                  href="/#lead-form"
                  className="bg-brand-gradient mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-3 text-center text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  <span>{o.cta}</span> <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

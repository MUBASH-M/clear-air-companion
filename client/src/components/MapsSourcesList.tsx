import { ExternalLink, MapPin, Quote } from "lucide-react";
import { MapsGroundingSource } from "@/lib/ai";
import { Lang } from "@/lib/knowledge";

type MapsSourcesListProps = {
  sources: MapsGroundingSource[];
  lang: Lang;
  compact?: boolean;
};

export function MapsSourcesList({ sources, lang, compact = false }: MapsSourcesListProps) {
  if (!sources.length) return null;

  return (
    <div
      className={compact ? "mt-2.5 border-t border-border/60 pt-2" : "mt-4 border-t pt-3"}
      data-testid="maps-grounding-sources"
    >
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
        {lang === "en" ? "Verified on Google Maps" : "Google Maps पर सत्यापित स्थान"}
      </p>
      <ul className={compact ? "space-y-1.5" : "grid gap-2 sm:grid-cols-2"}>
        {sources.map((src) => (
          <li
            key={src.uri}
            className="rounded-lg border bg-background/90 p-2.5 text-xs transition-colors hover:border-primary/40"
          >
            <a
              href={src.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start justify-between gap-2 font-semibold text-foreground hover:text-primary"
            >
              <span className="leading-snug">{src.title}</span>
              <ExternalLink
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                aria-hidden
              />
            </a>
            {src.reviewSnippets.length > 0 && (
              <div className="mt-1.5 space-y-1 border-t border-border/50 pt-1.5">
                {src.reviewSnippets.map((snip, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Quote className="mt-0.5 h-3 w-3 shrink-0 opacity-70" aria-hidden />
                    <div className="min-w-0">
                      {snip.text && <p className="line-clamp-2 leading-relaxed">{snip.text}</p>}
                      {snip.uri && (
                        <a
                          href={snip.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline underline-offset-2"
                        >
                          {snip.title || (lang === "en" ? "Read Google Maps review" : "समीक्षा देखें")}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { ExternalLink, Globe } from "lucide-react";
import { WebGroundingSource } from "@/lib/ai";
import { Lang } from "@/lib/knowledge";
import { isSafeHttpUrl } from "@/lib/url";

type WebSourcesListProps = {
  sources: WebGroundingSource[];
  lang: Lang;
  compact?: boolean;
};

export function WebSourcesList({ sources, lang, compact = false }: WebSourcesListProps) {
  const safeSources = sources.filter((src) => isSafeHttpUrl(src.uri));
  if (!safeSources.length) return null;

  return (
    <div
      className={compact ? "mt-2.5 border-t border-border/60 pt-2" : "mt-4 border-t pt-3"}
      data-testid="web-grounding-sources"
      role="region"
      aria-label={lang === "en" ? "Google Search web sources" : "Google Search वेब स्रोत"}
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Globe className="h-3.5 w-3.5 text-primary" aria-hidden />
        {lang === "en" ? "Sources from Google Search" : "Google Search से स्रोत"}
      </p>
      <ul className={compact ? "space-y-1.5" : "grid gap-2 sm:grid-cols-2"}>
        {safeSources.map((src) => {
          let host = "";
          try {
            host = new URL(src.uri).hostname.replace(/^www\./, "");
          } catch {
            host = "";
          }
          return (
            <li
              key={src.uri}
              className="rounded-lg border bg-background/90 p-2.5 text-xs transition-colors hover:border-primary/40"
            >
              <a
                href={src.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start justify-between gap-2 font-medium text-foreground hover:text-primary"
              >
                <span className="leading-snug">{src.title}</span>
                <ExternalLink
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                  aria-hidden
                />
              </a>
              {host && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{host}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

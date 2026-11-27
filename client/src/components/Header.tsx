import { useEffect, useRef, useState } from "react";
import { Languages, LocateFixed, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESET_PLACES, Place, detectCurrentLocation, searchPlaces } from "@/lib/air";
import { Lang } from "@/lib/knowledge";
import { UI } from "@/lib/ui-copy";

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" role="img" aria-label="Clear Air Companion">
      <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
      <path d="M7 13h13a3 3 0 1 0-3-3M7 19h17a3 3 0 1 1-3 3" stroke="hsl(var(--primary-foreground))" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

type HeaderProps = {
  lang: Lang;
  setLang: (l: Lang) => void;
  place: Place | null;
  setPlace: (p: Place) => void;
  locatingInitial: boolean;
  t: (x: { en: string; hi: string }) => string;
};

export function Header({ lang, setLang, place, setPlace, locatingInitial, t }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      searchPlaces(q).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (p: Place) => {
    setPlace(p);
    setOpen(false);
    setQ("");
    setLocError("");
    triggerRef.current?.focus();
  };

  const locate = async () => {
    if (locating) return;
    setLocError("");
    setLocating(true);
    try {
      const detected = await detectCurrentLocation(lang);
      choose(detected);
    } catch {
      setLocError(lang === "en" ? "Couldn't get your location. Pick a city instead." : "स्थान नहीं मिला। कोई शहर चुनें।");
    } finally {
      setLocating(false);
    }
  };

  const locationLabel = place
    ? place.name
    : locatingInitial
      ? lang === "en"
        ? "Detecting…"
        : "खोजा जा रहा है…"
      : lang === "en"
        ? "Choose location"
        : "स्थान चुनें";

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
        <Logo />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">
            <span className="hidden sm:inline">Clear Air Companion</span>
            <span className="sm:hidden">Clear Air</span>
          </p>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{t(UI.tagline)}</p>
        </div>
        <div className="relative" ref={boxRef}>
          <Button
            ref={triggerRef}
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen((o) => !o);
              setLocError("");
            }}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls="location-picker-popover"
            data-testid="button-location"
            className="max-w-[160px] sm:max-w-[220px]"
          >
            {locatingInitial && !place ? (
              <LocateFixed className="h-4 w-4 shrink-0 animate-pulse motion-reduce:animate-none" aria-hidden />
            ) : (
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="truncate">{locationLabel}</span>
          </Button>
          {open && (
            <div
              id="location-picker-popover"
              role="dialog"
              aria-label={lang === "en" ? "Choose city or detect location" : "शहर चुनें या स्थान खोजें"}
              className="absolute right-0 top-full z-40 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-lg border bg-popover p-3 shadow-lg"
            >
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                <Input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t(UI.searchCity)}
                  aria-label={t(UI.searchCity)}
                  className="pl-8"
                  data-testid="input-city"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full justify-start"
                onClick={locate}
                disabled={locating}
                data-testid="button-geolocate"
              >
                <LocateFixed className={`h-4 w-4 ${locating ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden />
                {locating ? (lang === "en" ? "Finding your location…" : "स्थान खोजा जा रहा है…") : t(UI.useLocation)}
              </Button>
              {locError && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {locError}
                </p>
              )}
              <div className="mt-2 max-h-64 overflow-y-auto" role="listbox" aria-label={lang === "en" ? "Suggested cities" : "सुझाए गए शहर"}>
                {(results.length ? results : PRESET_PLACES).map((p) => (
                  <button
                    key={`${p.name}-${p.lat}`}
                    type="button"
                    role="option"
                    aria-selected={place?.name === p.name && place?.lat === p.lat}
                    onClick={() => choose(p)}
                    className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`option-place-${p.name}`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.region}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLang(lang === "en" ? "hi" : "en")}
          data-testid="button-language"
          aria-label={lang === "en" ? "Switch language to Hindi" : "भाषा अंग्रेज़ी में बदलें"}
        >
          <Languages className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{lang === "en" ? "हिंदी" : "English"}</span>
          <span className="sm:hidden">{lang === "en" ? "हिं" : "EN"}</span>
        </Button>
      </div>
    </header>
  );
}

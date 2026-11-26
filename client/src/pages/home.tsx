import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import {
  Wind, MapPin, LocateFixed, RefreshCw, Sun, School, Route, AppWindow, Flame, HeartPulse, Home as HomeIcon, Leaf,
  Send, ShieldAlert, Check, Users, Search, Trash2, Info, Languages, MessageCircle, CalendarCheck, Lightbulb, BarChart3, UserCog, AlertTriangle, Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AirReport, CATEGORIES, PRESET_PLACES, Place, detectCurrentLocation, fetchAir, fmtHour, searchPlaces } from "@/lib/air";
import { askGroundedAssistant } from "@/lib/ai";
import { COST_LABEL, EVIDENCE_LABEL, KIND_LABEL, Lang, TIPS, Tip, TipKind, fx, tipById, tr } from "@/lib/knowledge";
import { ChatMsg, DEFAULT_PROFILE, PlanItem, Profile, SUGGESTIONS, buildPlan, extractProfile, isSensitive, rankedTips, safetyCheck } from "@/lib/companion";
import { DailyGuidanceCard } from "@/components/DailyGuidanceCard";
import { AirMapView } from "@/components/AirMapView";
import { MapsSourcesList } from "@/components/MapsSourcesList";

type TabId = "today" | "map" | "ask" | "tips" | "impact" | "community" | "profile";

const UI = {
  tagline: { en: "Daily guidance for living well through winter smog", hi: "सर्दियों की धुंध में बेहतर जीने के लिए रोज़ का मार्गदर्शन" },
  airNow: { en: "Air right now", hi: "अभी की हवा" },
  estAqi: { en: "Estimated India AQI", hi: "अनुमानित भारत AQI" },
  next24: { en: "Next 24 hours", hi: "अगले 24 घंटे" },
  cleanest: { en: "Cleanest window", hi: "सबसे साफ़ समय" },
  peak: { en: "Worst window", hi: "सबसे खराब समय" },
  source: { en: "Model estimate from CAMS via Open-Meteo. Check official CPCB stations for regulatory readings.", hi: "CAMS (Open-Meteo) से मॉडल अनुमान। आधिकारिक आँकड़ों के लिए CPCB स्टेशन देखें।" },
  updated: { en: "Reading for", hi: "समय" },
  useLocation: { en: "Use my location", hi: "मेरा स्थान" },
  searchCity: { en: "Search a city", hi: "शहर खोजें" },
  tabs: {
    today: { en: "Today", hi: "आज" },
    map: { en: "Map", hi: "नक्शा" },
    ask: { en: "Ask", hi: "पूछें" },
    tips: { en: "Tips", hi: "सुझाव" },
    impact: { en: "Impact", hi: "प्रभाव" },
    community: { en: "Community", hi: "समुदाय" },
    profile: { en: "Profile", hi: "प्रोफ़ाइल" },
  },
  didThis: { en: "I did this", hi: "मैंने किया" },
  done: { en: "Done", hi: "हो गया" },
  you: { en: "For you", hi: "आपके लिए" },
  neighbourhood: { en: "For your neighbourhood", hi: "आपके मोहल्ले के लिए" },
  disclaimer: {
    en: "General wellbeing guidance, not medical advice. In an emergency call 112.",
    hi: "सामान्य स्वास्थ्य मार्गदर्शन, चिकित्सा सलाह नहीं। आपात स्थिति में 112 पर कॉल करें।",
  },
};

const planTitles: Record<string, string> = {};

const ICONS: Record<PlanItem["icon"], typeof Sun> = { sun: Sun, school: School, route: Route, window: AppWindow, flame: Flame, heart: HeartPulse, home: HomeIcon, leaf: Leaf };

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [place, setPlace] = useState<Place | null>(null);
  const [locatingInitial, setLocatingInitial] = useState(true);
  const [locInitError, setLocInitError] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [profileTouched, setProfileTouched] = useState(false);
  const [tab, setTab] = useState<TabId>("today");
  const [done, setDone] = useState<Record<string, number>>({});
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const userPickedPlaceRef = useRef(false);
  const langRef = useRef<Lang>(lang);
  langRef.current = lang;

  const selectPlace = useCallback((p: Place) => {
    userPickedPlaceRef.current = true;
    setLocInitError(false);
    setLocatingInitial(false);
    setPlace(p);
  }, []);

  const autoDetectLocation = useCallback(async (force = false) => {
    if (force) userPickedPlaceRef.current = false;
    setLocInitError(false);
    setLocatingInitial(true);
    try {
      const detected = await detectCurrentLocation(langRef.current);
      if (force || !userPickedPlaceRef.current) {
        setPlace(detected);
      }
    } catch {
      if (force || !userPickedPlaceRef.current) {
        setLocInitError(true);
      }
    } finally {
      setLocatingInitial(false);
    }
  }, []);

  useEffect(() => {
    void autoDetectLocation(false);
  }, [autoDetectLocation]);

  const air = useQuery<AirReport>({
    queryKey: ["air", place?.lat, place?.lon, place?.name],
    queryFn: () => fetchAir(place!),
    enabled: Boolean(place),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleDone = (id: string) =>
    setDone((d) => {
      const n = { ...d };
      if (n[id]) delete n[id];
      else n[id] = Date.now();
      return n;
    });

  const updateProfile = (patch: Partial<Profile>) => {
    setProfile((p) => ({ ...p, ...patch }));
    setProfileTouched(true);
  };

  const t = (x: { en: string; hi: string }) => tr(x, lang);
  const navRef = useRef<HTMLElement>(null);
  const pendingScroll = useRef(false);
  const selectTab = (id: TabId) => {
    pendingScroll.current = true;
    setTab(id);
  };
  useEffect(() => {
    // On small screens the tabs sit below the air panel – bring the new section into view.
    const el = navRef.current;
    if (!pendingScroll.current || !el || window.innerWidth >= 1024) return;
    pendingScroll.current = false;
    const top = el.getBoundingClientRect().top + window.scrollY - 57;
    if (window.scrollY < top - 4) requestAnimationFrame(() => window.scrollTo({ top, behavior: "smooth" }));
  }, [tab]);

  return (
    <div className="min-h-screen bg-background">
      <Header lang={lang} setLang={setLang} place={place} setPlace={selectPlace} locatingInitial={locatingInitial} t={t} />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-4 md:px-6 lg:grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-6">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <AirPanel
            q={air}
            lang={lang}
            t={t}
            hasPlace={Boolean(place)}
            locating={locatingInitial}
            locError={locInitError}
            onRetry={() => (place ? air.refetch() : void autoDetectLocation(true))}
          />
        </aside>
        <section className="mt-6 min-h-[calc(100vh-57px)] min-w-0 lg:mt-0 lg:min-h-0">
          <nav ref={navRef} className="sticky top-[57px] z-20 -mx-4 mb-4 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur md:-mx-0 md:px-0 lg:top-[65px]" aria-label="Sections">
            <div className="flex gap-1">
              {(Object.keys(UI.tabs) as TabId[]).map((id) => {
                const Icon = { today: CalendarCheck, map: Compass, ask: MessageCircle, tips: Lightbulb, impact: BarChart3, community: Users, profile: UserCog }[id];
                const active = tab === id;
                return (
                  <button
                    key={id}
                    data-testid={`tab-${id}`}
                    onClick={() => selectTab(id)}
                    className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {t(UI.tabs[id])}
                    {id === "impact" && Object.keys(done).length > 0 && (
                      <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">{Object.keys(done).length}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {tab === "today" && (
            <TodayView
              q={air}
              profile={profile}
              profileTouched={profileTouched}
              lang={lang}
              t={t}
              done={done}
              toggleDone={toggleDone}
              goProfile={() => selectTab("profile")}
              hasPlace={Boolean(place)}
              locating={locatingInitial}
              onRetryLocate={() => void autoDetectLocation(true)}
            />
          )}
          {tab === "map" && (
            place ? (
              <AirMapView place={place} report={air.data ?? null} lang={lang} onSelectPlace={selectPlace} />
            ) : (
              <LocationPendingCard
                locating={locatingInitial}
                lang={lang}
                onRetry={() => void autoDetectLocation(true)}
              />
            )
          )}
          {tab === "ask" && <AskView place={place} locating={locatingInitial} report={air.data ?? null} profile={profile} lang={lang} messages={messages} setMessages={setMessages} updateProfile={updateProfile} />}
          {tab === "tips" && <TipsView profile={profile} lang={lang} t={t} done={done} toggleDone={toggleDone} />}
          {tab === "impact" && <ImpactView lang={lang} t={t} done={done} toggleDone={toggleDone} goTips={() => selectTab("tips")} />}
          {tab === "community" && <CommunityView lang={lang} joined={joined} setJoined={setJoined} doneCount={Object.keys(done).length} />}
          {tab === "profile" && (
            <ProfileView lang={lang} profile={profile} update={updateProfile} place={place} locating={locatingInitial}
              clearAll={() => { setProfile(DEFAULT_PROFILE); setProfileTouched(false); setDone({}); setJoined({}); setMessages([]); }}
              stored={{ actions: Object.keys(done).length, messages: messages.length, groups: Object.values(joined).filter(Boolean).length }} />
          )}
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p className="flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />{t(UI.disclaimer)}</p>
          <p>
            {lang === "en" ? "Data: " : "डेटा: "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Open-Meteo / CAMS</a>
            {" · "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://airquality.cpcb.gov.in/AQI_India/" target="_blank" rel="noreferrer">CPCB AQI India</a>
            {" · "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio" target="_blank" rel="noreferrer">Google Maps Platform</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-label="Clear Air Companion">
      <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
      <path d="M7 13h13a3 3 0 1 0-3-3M7 19h17a3 3 0 1 1-3 3" stroke="hsl(var(--primary-foreground))" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Header({ lang, setLang, place, setPlace, locatingInitial, t }: { lang: Lang; setLang: (l: Lang) => void; place: Place | null; setPlace: (p: Place) => void; locatingInitial: boolean; t: (x: { en: string; hi: string }) => string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const id = setTimeout(() => searchPlaces(q).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (p: Place) => { setPlace(p); setOpen(false); setQ(""); setLocError(""); };

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

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
        <Logo />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight"><span className="hidden sm:inline">Clear Air Companion</span><span className="sm:hidden">Clear Air</span></p>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{t(UI.tagline)}</p>
        </div>
        <div className="relative" ref={boxRef}>
          <Button variant="outline" size="sm" onClick={() => { setOpen((o) => !o); setLocError(""); }} data-testid="button-location" className="max-w-[160px] sm:max-w-[220px]">
            {locatingInitial && !place ? (
              <LocateFixed className="h-4 w-4 shrink-0 animate-pulse" aria-hidden />
            ) : (
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="truncate">
              {place
                ? place.name
                : locatingInitial
                  ? (lang === "en" ? "Detecting…" : "खोजा जा रहा है…")
                  : (lang === "en" ? "Choose location" : "स्थान चुनें")}
            </span>
          </Button>
          {open && (
            <div className="absolute right-0 top-full z-40 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-lg border bg-popover p-3 shadow-lg">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(UI.searchCity)} className="pl-8" data-testid="input-city" />
              </div>
              <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={locate} disabled={locating} data-testid="button-geolocate">
                <LocateFixed className={`h-4 w-4 ${locating ? "animate-pulse" : ""}`} aria-hidden />
                {locating ? (lang === "en" ? "Finding your location…" : "स्थान खोजा जा रहा है…") : t(UI.useLocation)}
              </Button>
              {locError && <p className="mt-1 text-xs text-destructive">{locError}</p>}
              <div className="mt-2 max-h-64 overflow-y-auto">
                {(results.length ? results : PRESET_PLACES).map((p) => (
                  <button key={`${p.name}-${p.lat}`} onClick={() => choose(p)} className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover-elevate" data-testid={`option-place-${p.name}`}>
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.region}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setLang(lang === "en" ? "hi" : "en")} data-testid="button-language" aria-label="Switch language">
          <Languages className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{lang === "en" ? "हिंदी" : "English"}</span><span className="sm:hidden">{lang === "en" ? "हिं" : "EN"}</span>
        </Button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------

function AqiDial({ aqi, color }: { aqi: number; color: string }) {
  const pct = Math.min(aqi, 500) / 500;
  const r = 52, c = 2 * Math.PI * r, arc = c * 0.75;
  return (
    <svg viewBox="0 0 128 128" className="h-32 w-32 shrink-0" aria-hidden>
      <g transform="rotate(135 64 64)">
        <circle cx="64" cy="64" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${arc * pct} ${c}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 600ms cubic-bezier(.2,.8,.2,1)" }} />
      </g>
      <text x="64" y="70" textAnchor="middle" className="fill-foreground" style={{ font: "700 30px Mukta, sans-serif", fontVariantNumeric: "tabular-nums" }}>{aqi}</text>
      <text x="64" y="90" textAnchor="middle" className="fill-muted-foreground" style={{ font: "500 11px Mukta, sans-serif" }}>/ 500</text>
    </svg>
  );
}

function LocationPendingCard({ locating, lang, onRetry }: { locating: boolean; lang: Lang; onRetry: () => void }) {
  if (locating) {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-6" data-testid="status-map-locating">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <LocateFixed className="h-4 w-4 animate-pulse text-primary" aria-hidden />
          {lang === "en" ? "Detecting your current location…" : "आपका वर्तमान स्थान खोजा जा रहा है…"}
        </p>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed bg-card p-6 text-center" data-testid="status-map-location-error">
      <LocateFixed className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
      <h2 className="mt-2 text-base font-semibold">{lang === "en" ? "We couldn't detect your location" : "आपका स्थान नहीं मिल सका"}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {lang === "en"
          ? "Allow location permission in your browser, or pick a city from the location menu above."
          : "ब्राउज़र में लोकेशन की अनुमति दें, या ऊपर दिए गए स्थान मेनू से कोई शहर चुनें।"}
      </p>
      <Button size="sm" className="mt-4" onClick={onRetry} data-testid="button-retry-location">
        <LocateFixed className="h-4 w-4" aria-hidden />
        {lang === "en" ? "Detect my location" : "मेरा स्थान खोजें"}
      </Button>
    </div>
  );
}

function AirPanel({ q, lang, t, hasPlace, locating, locError, onRetry }: {
  q: ReturnType<typeof useQuery<AirReport>>; lang: Lang; t: (x: { en: string; hi: string }) => string; hasPlace: boolean; locating: boolean; locError: boolean; onRetry: () => void;
}) {
  if ((!hasPlace && locating) || q.isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5" data-testid="status-air-loading">
        {!hasPlace && locating ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" data-testid="status-locating">
            <LocateFixed className="h-3.5 w-3.5 animate-pulse text-primary" aria-hidden />
            {lang === "en" ? "Detecting your current location…" : "आपका वर्तमान स्थान खोजा जा रहा है…"}
          </p>
        ) : (
          <Skeleton className="h-4 w-28" />
        )}
        <div className="mt-4 flex items-center gap-4"><Skeleton className="h-32 w-32 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-24" /><Skeleton className="h-4 w-32" /></div></div>
        <Skeleton className="mt-5 h-28 w-full" />
      </div>
    );
  }
  if (!hasPlace) {
    return (
      <div className="rounded-xl border bg-card p-5" data-testid="status-location-error">
        <p className="flex items-center gap-2 font-semibold">
          <LocateFixed className="h-4 w-4 text-primary" aria-hidden />
          {lang === "en" ? "Location needed" : "स्थान आवश्यक है"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {locError
            ? (lang === "en"
                ? "Couldn't detect your location automatically. Try again or pick a city from the header."
                : "आपका स्थान अपने आप नहीं मिल सका। फिर कोशिश करें या ऊपर से कोई शहर चुनें।")
            : (lang === "en"
                ? "Allow location access or pick a city above to load air quality for your area."
                : "अपने क्षेत्र की हवा देखने के लिए लोकेशन की अनुमति दें या ऊपर से शहर चुनें।")}
        </p>
        <Button size="sm" className="mt-3" onClick={onRetry} data-testid="button-retry-locate">
          <LocateFixed className="h-4 w-4" aria-hidden />
          {lang === "en" ? "Try detecting again" : "फिर से खोजें"}
        </Button>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="rounded-xl border bg-card p-5" data-testid="status-air-error">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />{lang === "en" ? "Couldn't load air data" : "वायु डेटा लोड नहीं हुआ"}</p>
        <p className="mt-1 text-sm text-muted-foreground">{lang === "en" ? "The plan needs a fresh reading, so we won't guess. Check your connection and try again." : "योजना के लिए ताज़ा आँकड़ा चाहिए, इसलिए हम अंदाज़ा नहीं लगाएँगे। कनेक्शन जाँचकर फिर कोशिश करें।"}</p>
        <Button size="sm" className="mt-3" onClick={onRetry} data-testid="button-retry"><RefreshCw className="h-4 w-4" aria-hidden />{lang === "en" ? "Try again" : "फिर कोशिश करें"}</Button>
      </div>
    );
  }
  const r = q.data;
  const c = CATEGORIES[r.category];
  const obs = new Date(r.observedAt);
  const chartData = r.next24.map((p) => ({ ...p, label: fmtHour(p.time) }));

  return (
    <div className="overflow-hidden rounded-xl border bg-card" data-testid="panel-air">
      <div className="h-1.5" style={{ background: c.color }} />
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(UI.airNow)} · {r.place.name}</p>
          <button onClick={onRetry} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Refresh" data-testid="button-refresh"><RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /></button>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <AqiDial aqi={r.aqi} color={c.color} />
          <div className="min-w-0">
            <span className="inline-block rounded-md px-2.5 py-0.5 text-sm font-semibold" style={{ background: c.color, color: c.ink }} data-testid="text-category">{tr(c, lang)}</span>
            <p className="mt-1.5 text-sm text-muted-foreground">{t(UI.estAqi)}</p>
            <p className="text-xs text-muted-foreground">{lang === "en" ? "Led by" : "मुख्य"} {r.dominant} · 24h avg</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { k: "PM2.5", v: Math.round(r.pm25), u: "µg/m³" },
            { k: "PM10", v: Math.round(r.pm10), u: "µg/m³" },
            { k: "NO₂", v: Math.round(r.no2), u: "µg/m³" },
            { k: lang === "en" ? "Temp" : "तापमान", v: Number.isFinite(r.temperature) ? Math.round(r.temperature) : "–", u: "°C" },
            { k: lang === "en" ? "Wind" : "हवा", v: Number.isFinite(r.wind) ? Math.round(r.wind) : "–", u: "km/h" },
            { k: lang === "en" ? "Humidity" : "नमी", v: Number.isFinite(r.humidity) ? Math.round(r.humidity) : "–", u: "%" },
          ].map((m) => (
            <div key={m.k} className="rounded-lg bg-muted/60 px-2 py-2">
              <dt className="text-xs text-muted-foreground">{m.k}</dt>
              <dd className="text-base font-semibold tabular-nums">{m.v}<span className="ml-0.5 text-xs font-normal text-muted-foreground">{m.u}</span></dd>
            </div>
          ))}
        </dl>
        {Number.isFinite(r.wind) && r.wind < 8 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><Wind className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{lang === "en" ? "Light winds – pollution tends to linger near the ground." : "हल्की हवा – प्रदूषण ज़मीन के पास ठहरता है।"}</p>
        )}

        <div className="mt-5">
          <p className="text-sm font-semibold">{t(UI.next24)} <span className="font-normal text-muted-foreground">· {lang === "en" ? "hourly estimate" : "प्रति घंटा अनुमान"}</span></p>
          <div className="mt-2 h-32" data-testid="chart-forecast">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" interval={5} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={34} />
                <ReferenceLine y={200} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12, background: "hsl(var(--popover))" }}
                  formatter={(v: number, _n, p: any) => [`${v} · ${tr(CATEGORIES[p.payload.category as keyof typeof CATEGORIES], lang)}`, "AQI"]}
                />
                <Bar dataKey="aqi" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {chartData.map((p) => <Cell key={p.time} fill={CATEGORIES[p.category].color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {r.bestWindow && (
              <div className="rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">{t(UI.cleanest)}</p>
                <p className="font-semibold" data-testid="text-best-window">{fmtHour(r.bestWindow.start)}–{fmtHour(r.bestWindow.end)}</p>
              </div>
            )}
            {r.worstWindow && (
              <div className="rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">{t(UI.peak)}</p>
                <p className="font-semibold">{fmtHour(r.worstWindow.start)}–{fmtHour(r.worstWindow.end)}</p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground" data-testid="text-source">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{t(UI.updated)} {obs.toLocaleString(lang === "en" ? "en-IN" : "hi-IN", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })} ({lang === "en" ? "local time" : "स्थानीय समय"}). {t(UI.source)}</span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TodayView({ q, profile, profileTouched, lang, t, done, toggleDone, goProfile, hasPlace, locating, onRetryLocate }: {
  q: ReturnType<typeof useQuery<AirReport>>; profile: Profile; profileTouched: boolean; lang: Lang; t: (x: { en: string; hi: string }) => string; done: Record<string, number>; toggleDone: (id: string) => void; goProfile: () => void; hasPlace: boolean; locating: boolean; onRetryLocate: () => void;
}) {
  if ((!hasPlace && locating) || q.isLoading) return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>;
  if (!hasPlace) {
    return (
      <LocationPendingCard locating={false} lang={lang} onRetry={onRetryLocate} />
    );
  }
  if (!q.data) return <p className="text-sm text-muted-foreground">{lang === "en" ? "Your plan will appear once air data loads." : "वायु डेटा लोड होने पर आपकी योजना दिखेगी।"}</p>;
  const plan = buildPlan(q.data, profile, lang);
  // Use the location's local date (from the reading), not the visitor's device date
  const [yy, mm, dd] = q.data.observedAt.slice(0, 10).split("-").map(Number);
  const today = new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString(lang === "en" ? "en-IN" : "hi-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{today}</p>
      <h1 className="mt-1 text-xl font-bold leading-tight" data-testid="text-plan-headline">{plan.headline}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{plan.summary}</p>

      <DailyGuidanceCard
        report={q.data}
        profile={profile}
        profileTouched={profileTouched}
        lang={lang}
        onPersonalise={goProfile}
      />

      {!profileTouched && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed bg-accent/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">{lang === "en" ? "Tell us about your household – children, older adults, health conditions, commute and cooking fuel – and the plan adapts." : "अपने घर के बारे में बताएँ – बच्चे, बुज़ुर्ग, स्वास्थ्य, यात्रा और ईंधन – और योजना आपके अनुसार बदलेगी।"}</p>
          <Button size="sm" onClick={goProfile} data-testid="button-setup-profile" className="shrink-0">{lang === "en" ? "Personalise" : "व्यक्तिगत बनाएँ"}</Button>
        </div>
      )}
      {isSensitive(profile) && (
        <Badge variant="outline" className="mt-3 gap-1"><HeartPulse className="h-3 w-3" aria-hidden />{lang === "en" ? "Extra-careful mode on" : "अतिरिक्त सावधानी मोड चालू"}</Badge>
      )}

      <h2 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {lang === "en" ? "Today's action plan" : "आज की कार्य योजना"}
      </h2>
      <ol className="mt-2.5 space-y-3">
        {plan.items.map((it, i) => {
          const Icon = ICONS[it.icon];
          const key = it.tipId ?? `plan-${it.id}`;
          const isDone = !!done[key];
          return (
            <li key={it.id} className={`rounded-xl border bg-card p-4 transition-colors ${isDone ? "border-primary/40 bg-accent/40" : ""}`} data-testid={`card-plan-${it.id}`}>
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><Icon className="h-[18px] w-[18px]" aria-hidden /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold leading-snug"><span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>{it.title}</h2>
                    {(
                      <Button size="sm" variant={isDone ? "default" : "outline"} onClick={() => { planTitles[key] = it.title; toggleDone(key); }} className="shrink-0" data-testid={`button-done-${it.id}`}>
                        <Check className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{isDone ? t(UI.done) : t(UI.didThis)}</span>
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/80">{it.detail}</p>
                  {(it.exposure || it.emissions) && (
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {it.exposure && <span><span className="font-semibold text-primary">{t(UI.you)}:</span> <span className="text-muted-foreground">{fx(it.exposure, lang)}</span></span>}
                      {it.emissions && <span><span className="font-semibold text-chart-2" style={{ color: "hsl(32 70% 36%)" }}>{t(UI.neighbourhood)}:</span> <span className="text-muted-foreground">{fx(it.emissions, lang)}</span></span>}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">{lang === "en" ? "Effect estimates are ranges from documented rules of thumb, not promises. They depend on your home, how well things fit and how long you use them." : "प्रभाव के अनुमान सामान्य नियमों पर आधारित दायरे हैं, वादे नहीं। ये आपके घर, फ़िटिंग और उपयोग की अवधि पर निर्भर करते हैं।"}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AskView({ place, locating, report, profile, lang, messages, setMessages, updateProfile }: {
  place: Place | null; locating: boolean; report: AirReport | null; profile: Profile; lang: Lang; messages: ChatMsg[]; setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>; updateProfile: (p: Partial<Profile>) => void;
}) {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, typing]);

  const send = async (raw: string) => {
    const msg = raw.trim();
    if (!msg || typing) return;
    const historySnapshot = messages
      .filter((m) => m.kind !== "error")
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setText("");

    const patch = extractProfile(msg);
    const merged = { ...profile, ...patch };
    const changed = (Object.keys(patch) as (keyof Profile)[]).filter((k) => profile[k] !== patch[k]);
    if (changed.length) updateProfile(patch);

    // Always run deterministic emergency & medical safety checks first
    const safe = safetyCheck(msg, lang);
    if (safe) {
      setMessages((m) => [...m, safe]);
      return;
    }

    if (!place) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          kind: "error",
          text: locating
            ? (lang === "en" ? "Still detecting your current location — please try again in a moment." : "आपका वर्तमान स्थान खोजा जा रहा है — कृपया कुछ पल बाद फिर कोशिश करें।")
            : (lang === "en" ? "Please detect your location or choose a city in the header first so I can give local advice." : "स्थानीय सलाह के लिए कृपया पहले ऊपर से अपना स्थान खोजें या कोई शहर चुनें।"),
        },
      ]);
      return;
    }

    setTyping(true);
    try {
      const grounded = await askGroundedAssistant({
        message: msg,
        lang,
        place,
        report,
        profile: merged,
        history: historySnapshot,
      });
      const note = changed.length
        ? (lang === "en"
            ? "\n\n*I've noted this in your household profile so your daily plan adapts. You can change or delete it in Profile.*"
            : "\n\n*मैंने इसे आपकी प्रोफ़ाइल में जोड़ लिया है ताकि योजना बदल सके। प्रोफ़ाइल में इसे बदल या मिटा सकते हैं।*")
        : "";
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          kind: "normal",
          text: grounded.text + note,
          sources: grounded.sources,
        },
      ]);
    } catch (err) {
      const errText =
        err instanceof Error
          ? err.message
          : lang === "en"
            ? "Could not reach the assistant right now. Please try again."
            : "अभी सहायक से संपर्क नहीं हो सका। कृपया फिर कोशिश करें।";
      setMessages((m) => [...m, { role: "assistant", kind: "error", text: errText }]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="flex min-h-[520px] flex-col rounded-xl border bg-card">
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="py-6 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-primary" aria-hidden />
            <h1 className="mt-2 text-lg font-semibold">{lang === "en" ? "Ask about today's air & nearby places" : "आज की हवा और आसपास के स्थानों के बारे में पूछें"}</h1>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {place
                ? (lang === "en"
                    ? `Tailored to ${place.name}'s live air reading, your household profile, and up-to-date Google Maps place data.`
                    : `${place.name} की ताज़ा हवा, आपके घर की प्रोफ़ाइल और Google Maps के ताज़ा स्थानीय डेटा के आधार पर उत्तर।`)
                : locating
                  ? (lang === "en" ? "Detecting your current location for local air and place guidance…" : "स्थानीय हवा और मार्गदर्शन के लिए आपका वर्तमान स्थान खोजा जा रहा है…")
                  : (lang === "en" ? "Pick or detect your location above to get tailored local guidance." : "स्थानीय मार्गदर्शन के लिए ऊपर से अपना स्थान चुनें या खोजें।")}
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.role}-${i}`}>
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "whitespace-pre-line rounded-br-md bg-primary text-primary-foreground"
                  : m.kind === "safety" || m.kind === "error"
                    ? "whitespace-pre-line rounded-bl-md border-2 border-destructive/50 bg-destructive/5"
                    : "rounded-bl-md bg-muted"
              }`}
            >
              {m.kind === "safety" && <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-destructive"><ShieldAlert className="h-3.5 w-3.5" aria-hidden />{lang === "en" ? "Safety response" : "सुरक्षा उत्तर"}</p>}
              {m.kind === "error" && <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{lang === "en" ? "Unable to reply" : "उत्तर प्राप्त नहीं हुआ"}</p>}
              {m.role === "assistant" && m.kind !== "safety" && m.kind !== "error" ? (
                <div className="prose prose-sm max-w-none text-foreground prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-primary">
                  <Markdown>{m.text}</Markdown>
                </div>
              ) : (
                m.text
              )}
              {m.tips && m.tips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.tips.map((id) => {
                    const tip = tipById(id);
                    return <span key={id} className="rounded-full border bg-background px-2 py-0.5 text-xs text-foreground/80">{tr(tip.title, lang)}</span>;
                  })}
                </div>
              )}
              {m.sources && m.sources.length > 0 && (
                <MapsSourcesList sources={m.sources} lang={lang} compact />
              )}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start"><div className="flex gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3" aria-label="typing">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 120}ms` }} />)}</div></div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t p-3">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => send(tr(s, lang))} className="shrink-0 rounded-full border px-3 py-1 text-xs hover-elevate" data-testid={`button-suggestion-${i}`}>{tr(s, lang)}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={lang === "en" ? "e.g. Where can I buy N95 masks near me?" : "जैसे: मेरे पास N95 मास्क कहाँ मिल सकते हैं?"} data-testid="input-chat" aria-label="Message" />
          <Button type="submit" disabled={!text.trim() || typing} data-testid="button-send" aria-label="Send"><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TipCard({ tip, lang, isDone, onToggle, outOfBudget }: { tip: Tip; lang: Lang; isDone: boolean; onToggle: () => void; outOfBudget?: boolean }) {
  return (
    <article className={`flex flex-col rounded-xl border bg-card p-4 ${isDone ? "border-primary/40 bg-accent/40" : ""}`} data-testid={`card-tip-${tip.id}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="secondary">{tr(KIND_LABEL[tip.kind], lang)}</Badge>
        <Badge variant="outline">{tr(COST_LABEL[tip.cost], lang)}</Badge>
        <span className="text-muted-foreground">{tr(EVIDENCE_LABEL[tip.evidence], lang)}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug">{tip.title[lang]}</h3>
      <p className="mt-1 text-sm leading-relaxed text-foreground/80">{tip.body[lang]}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold">{lang === "en" ? "What it won't fix: " : "क्या नहीं सुधरेगा: "}</span>{tip.limits[lang]}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-muted/60 px-2 py-1.5"><p className="font-semibold text-primary">{tr(UI.you, lang)}</p><p className="text-muted-foreground">{fx(tip.exposure, lang)}</p></div>
        <div className="rounded-md bg-muted/60 px-2 py-1.5"><p className="font-semibold" style={{ color: "hsl(32 70% 36%)" }}>{tr(UI.neighbourhood, lang)}</p><p className="text-muted-foreground">{fx(tip.emissions, lang)}</p></div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        {outOfBudget ? <span className="text-xs text-muted-foreground">{lang === "en" ? "Above your budget setting" : "आपके बजट से ऊपर"}</span> : <span />}
        <Button size="sm" variant={isDone ? "default" : "outline"} onClick={onToggle} data-testid={`button-tip-done-${tip.id}`}><Check className="h-4 w-4" aria-hidden />{isDone ? tr(UI.done, lang) : tr(UI.didThis, lang)}</Button>
      </div>
    </article>
  );
}

function TipsView({ profile, lang, t, done, toggleDone }: { profile: Profile; lang: Lang; t: (x: { en: string; hi: string }) => string; done: Record<string, number>; toggleDone: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | TipKind>("all");
  const tips = rankedTips(filter === "all" ? null : [filter], profile);
  const max = profile.budget === "tight" ? 1 : profile.budget === "some" ? 2 : 3;
  const kinds: ("all" | TipKind)[] = ["all", "indoor", "travel", "cooking", "heating", "waste", "shopping"];
  return (
    <div>
      <h1 className="text-xl font-bold">{lang === "en" ? "Indoor air fixes and cleaner choices" : "घर की हवा के उपाय और स्वच्छ विकल्प"}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{lang === "en" ? "Sorted by cost, then by effect – free and low-cost steps always come first. We never sell or promote products." : "लागत, फिर प्रभाव के अनुसार क्रम – मुफ़्त और सस्ते कदम हमेशा पहले। हम कोई उत्पाद नहीं बेचते।"}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-sm ${filter === k ? "border-primary bg-primary text-primary-foreground" : "hover-elevate"}`} data-testid={`filter-${k}`}>
            {k === "all" ? (lang === "en" ? "All" : "सभी") : tr(KIND_LABEL[k], lang)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {tips.map((tip) => <TipCard key={tip.id} tip={tip} lang={lang} isDone={!!done[tip.id]} onToggle={() => toggleDone(tip.id)} outOfBudget={tip.cost > max} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ImpactView({ lang, done, toggleDone, goTips }: { lang: Lang; t: (x: { en: string; hi: string }) => string; done: Record<string, number>; toggleDone: (id: string) => void; goTips: () => void }) {
  const ids = Object.keys(done).filter((id) => TIPS.some((t) => t.id === id)).sort((a, b) => done[b] - done[a]);
  const tips = ids.map(tipById);
  const protect = tips.filter((t) => !/no direct change/i.test(t.exposure));
  const reduce = tips.filter((t) => !/no direct change|electricity/i.test(t.emissions));
  const strong = tips.filter((t) => t.evidence === "strong").length;
  const steps = Object.keys(done).filter((id) => id.startsWith("plan-")).sort((a, b) => done[b] - done[a]);

  if (!tips.length && !steps.length) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="mt-2 text-lg font-semibold">{lang === "en" ? "No actions logged yet" : "अभी तक कोई कदम दर्ज नहीं"}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{lang === "en" ? "Tap “I did this” on any plan step or tip and your running summary appears here." : "किसी भी कदम पर “मैंने किया” दबाएँ और आपका सारांश यहाँ दिखेगा।"}</p>
        <Button size="sm" variant="outline" className="mt-4" onClick={goTips} data-testid="button-browse-tips">{lang === "en" ? "Browse tips" : "सुझाव देखें"}</Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold">{lang === "en" ? "Your impact so far" : "अब तक आपका प्रभाव"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{lang === "en" ? "A simple running summary of what you've done this session." : "इस सत्र में आपने जो किया उसका सरल सारांश।"}</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { k: lang === "en" ? "Actions taken" : "उठाए गए कदम", v: tips.length + steps.length },
          { k: lang === "en" ? "Lower your exposure" : "आपका प्रदूषण घटाते", v: protect.length },
          { k: lang === "en" ? "Cut local emissions" : "स्थानीय उत्सर्जन घटाते", v: reduce.length },
        ].map((s) => (
          <div key={s.k} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.k}</p>
            <p className="mt-1 text-xl font-bold tabular-nums" data-testid={`stat-${s.k}`}>{s.v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 divide-y rounded-xl border bg-card">
        {tips.map((tip) => (
          <div key={tip.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between" data-testid={`row-impact-${tip.id}`}>
            <div className="min-w-0">
              <p className="font-semibold">{tip.title[lang]}</p>
              <p className="mt-0.5 text-xs text-muted-foreground"><span className="font-semibold text-primary">{tr(UI.you, lang)}:</span> {fx(tip.exposure, lang)} · <span className="font-semibold" style={{ color: "hsl(32 70% 36%)" }}>{tr(UI.neighbourhood, lang)}:</span> {fx(tip.emissions, lang)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{tr(EVIDENCE_LABEL[tip.evidence], lang)}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => toggleDone(tip.id)} className="self-start text-muted-foreground" data-testid={`button-undo-${tip.id}`}>{lang === "en" ? "Undo" : "हटाएँ"}</Button>
          </div>
        ))}
        {steps.map((id) => (
          <div key={id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between" data-testid={`row-impact-${id}`}>
            <div className="min-w-0">
              <p className="font-semibold">{planTitles[id] ?? id}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{lang === "en" ? "Plan step followed" : "योजना का कदम पूरा"}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => toggleDone(id)} className="self-start text-muted-foreground">{lang === "en" ? "Undo" : "हटाएँ"}</Button>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
        {lang === "en"
          ? `${strong} of the ${tips.length} library actions here rest on strong evidence. Ranges are rules of thumb from published studies and depend on your home, fit and how long you keep them up; we show ranges rather than a single number on purpose.`
          : `इन ${tips.length} में से ${strong} कदम मज़बूत प्रमाण पर आधारित हैं। दायरे प्रकाशित अध्ययनों के सामान्य नियम हैं और आपके घर, फ़िटिंग और निरंतरता पर निर्भर करते हैं।`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

const GOALS = [
  { id: "idle", title: { en: "No-idling week at the school gate", hi: "स्कूल गेट पर इंजन-बंद सप्ताह" }, body: { en: "Parents and drivers switch off engines during drop-off and pick-up, 24–30 November.", hi: "24–30 नवंबर, छोड़ने और लेने के समय माता-पिता और ड्राइवर इंजन बंद रखें।" }, pledged: 74, target: 120, tip: "carpool" },
  { id: "burn", title: { en: "No leaf or rubbish burning this winter", hi: "इस सर्दी पत्ते या कचरा न जलाने का संकल्प" }, body: { en: "Leaves go to the society compost pit; burning is reported to the RWA.", hi: "पत्ते सोसाइटी के खाद गड्ढे में; जलाने की सूचना RWA को।" }, pledged: 131, target: 200, tip: "no-burning" },
  { id: "carpool", title: { en: "Carpool Tuesdays and Thursdays", hi: "मंगलवार और गुरुवार कारपूल" }, body: { en: "Office-goers share rides two days a week on the worst-forecast days.", hi: "सबसे खराब पूर्वानुमान वाले दिनों में सप्ताह में दो दिन सवारी साझा करें।" }, pledged: 38, target: 80, tip: "carpool" },
];

const TOP_QUESTIONS = [
  { q: { en: "Is it safe to send children to school?", hi: "क्या बच्चों को स्कूल भेजना सुरक्षित है?" }, n: 41 },
  { q: { en: "When to open windows", hi: "खिड़कियाँ कब खोलें" }, n: 33 },
  { q: { en: "Low-cost air filters", hi: "सस्ते एयर फ़िल्टर" }, n: 27 },
  { q: { en: "Masks for older parents", hi: "बुज़ुर्ग माता-पिता के लिए मास्क" }, n: 15 },
];

function CommunityView({ lang, joined, setJoined, doneCount }: { lang: Lang; joined: Record<string, boolean>; setJoined: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; doneCount: number }) {
  const maxQ = Math.max(...TOP_QUESTIONS.map((x) => x.n));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{lang === "en" ? "Green Park Residents & School Group" : "ग्रीन पार्क निवासी और स्कूल समूह"}</h1>
        <Badge variant="outline">{lang === "en" ? "Sample group" : "नमूना समूह"}</Badge>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{lang === "en" ? "212 households · 1 school · 3 small workplaces. Only grouped, anonymous numbers are shown – individual household details are never visible to the group." : "212 घर · 1 स्कूल · 3 छोटे कार्यस्थल। केवल समूहित, गुमनाम आँकड़े दिखते हैं – किसी घर की व्यक्तिगत जानकारी समूह को नहीं दिखती।"}</p>

      <h2 className="mt-6 text-base font-semibold">{lang === "en" ? "Shared goals" : "साझा लक्ष्य"}</h2>
      <div className="mt-2 space-y-3">
        {GOALS.map((g) => {
          const me = joined[g.id] ? 1 : 0;
          const n = g.pledged + me;
          return (
            <div key={g.id} className="rounded-xl border bg-card p-4" data-testid={`card-goal-${g.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold leading-snug">{g.title[lang]}</h3>
                  <p className="mt-0.5 text-sm text-foreground/80">{g.body[lang]}</p>
                </div>
                <Button size="sm" variant={me ? "default" : "outline"} onClick={() => setJoined((j) => ({ ...j, [g.id]: !j[g.id] }))} className="shrink-0" data-testid={`button-join-${g.id}`}>
                  {me ? <><Check className="h-4 w-4" aria-hidden />{lang === "en" ? "Joined" : "जुड़ गए"}</> : lang === "en" ? "Join" : "जुड़ें"}
                </Button>
              </div>
              <Progress value={(n / g.target) * 100} className="mt-3 h-2" />
              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums" data-testid={`text-goal-count-${g.id}`}>{n} / {g.target} {lang === "en" ? "households pledged" : "घरों ने संकल्प लिया"}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-base font-semibold">{lang === "en" ? "What neighbours are asking" : "पड़ोसी क्या पूछ रहे हैं"}</h2>
          <p className="text-xs text-muted-foreground">{lang === "en" ? "This week, grouped" : "इस सप्ताह, समूहित"}</p>
          <ul className="mt-3 space-y-2.5">
            {TOP_QUESTIONS.map((x) => (
              <li key={x.q.en}>
                <div className="flex justify-between gap-2 text-sm"><span className="min-w-0">{x.q[lang]}</span><span className="tabular-nums text-muted-foreground">{x.n}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(x.n / maxQ) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-base font-semibold">{lang === "en" ? "Actions taken together" : "मिलकर उठाए गए कदम"}</h2>
          <p className="text-xs text-muted-foreground">{lang === "en" ? "Since 1 November" : "1 नवंबर से"}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            {[
              { k: lang === "en" ? "Indoor-air actions" : "घर की हवा के कदम", v: 486 },
              { k: lang === "en" ? "Low-emission trips" : "कम-उत्सर्जन यात्राएँ", v: 1290 },
              { k: lang === "en" ? "Burning reports" : "जलाने की शिकायतें", v: 17 },
              { k: lang === "en" ? "Your actions" : "आपके कदम", v: doneCount },
            ].map((s) => (
              <div key={s.k} className="rounded-lg bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">{s.k}</dt><dd className="text-lg font-bold tabular-nums">{s.v.toLocaleString("en-IN")}</dd></div>
            ))}
          </dl>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{lang === "en" ? "Group numbers in this pilot are illustrative sample data." : "इस पायलट में समूह के आँकड़े उदाहरण के लिए हैं।"}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProfileView({ lang, profile, update, clearAll, stored, place, locating }: { lang: Lang; profile: Profile; update: (p: Partial<Profile>) => void; clearAll: () => void; stored: { actions: number; messages: number; groups: number }; place: Place | null; locating: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const L = (en: string, hi: string) => (lang === "en" ? en : hi);
  const toggles: { k: "children" | "olderAdult" | "pregnant" | "condition"; en: string; hi: string }[] = [
    { k: "children", en: "Children at home", hi: "घर में बच्चे" },
    { k: "olderAdult", en: "Older adults (60+)", hi: "बुज़ुर्ग (60+)" },
    { k: "pregnant", en: "Someone is pregnant", hi: "कोई गर्भवती है" },
    { k: "condition", en: "Asthma, COPD or a heart condition", hi: "दमा, COPD या हृदय रोग" },
  ];
  const selects = [
    { k: "home" as const, label: L("Home type", "घर का प्रकार"), opts: [["apartment", L("Apartment", "फ़्लैट")], ["house", L("Independent house", "स्वतंत्र मकान")], ["shared", L("Shared or single room", "साझा या एक कमरा")]] },
    { k: "commute" as const, label: L("Main way of travelling", "मुख्य यात्रा साधन"), opts: [["metro", L("Metro", "मेट्रो")], ["bus", L("Bus", "बस")], ["car", L("Car", "कार")], ["two_wheeler", L("Two-wheeler", "दोपहिया")], ["auto", L("Auto-rickshaw", "ऑटो")], ["walk_cycle", L("Walk or cycle", "पैदल या साइकिल")], ["home", L("Mostly at home", "ज़्यादातर घर पर")]] },
    { k: "fuel" as const, label: L("Cooking fuel", "खाना बनाने का ईंधन"), opts: [["lpg", "LPG / PNG"], ["induction", L("Induction / electric", "इंडक्शन / बिजली")], ["wood", L("Wood, dung or coal", "लकड़ी, उपले या कोयला")], ["kerosene", L("Kerosene", "मिट्टी का तेल")]] },
    { k: "budget" as const, label: L("Budget for air fixes", "हवा के उपायों का बजट"), opts: [["tight", L("Tight – free and under ₹500", "कम – मुफ़्त और ₹500 तक")], ["some", L("Some – up to ₹3,000", "कुछ – ₹3,000 तक")], ["comfortable", L("Comfortable", "आरामदायक")]] },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      <div className="rounded-xl border bg-card p-5">
        <h1 className="text-xl font-bold">{L("Your household", "आपका घर")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{L("Share only what you're comfortable with. Each detail makes the daily plan more useful.", "केवल उतना साझा करें जितना आप सहज हों। हर जानकारी योजना को और उपयोगी बनाती है।")}</p>
        <div className="mt-5 space-y-3">
          {toggles.map((x) => (
            <div key={x.k} className="flex items-center justify-between gap-3">
              <Label htmlFor={`sw-${x.k}`} className="text-sm font-normal">{lang === "en" ? x.en : x.hi}</Label>
              <Switch id={`sw-${x.k}`} checked={profile[x.k]} onCheckedChange={(v) => update({ [x.k]: v } as Partial<Profile>)} data-testid={`switch-${x.k}`} />
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {selects.map((s) => (
            <div key={s.k}>
              <Label className="text-sm">{s.label}</Label>
              <Select value={profile[s.k]} onValueChange={(v) => update({ [s.k]: v } as Partial<Profile>)}>
                <SelectTrigger className="mt-1.5" data-testid={`select-${s.k}`}><SelectValue /></SelectTrigger>
                <SelectContent>{s.opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold">{L("What's stored", "क्या संग्रहीत है")}</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground/80">
            <li>
              {L("Location", "स्थान")}:{" "}
              {place ? (
                <>
                  {place.name}{" "}
                  {place.approx === "gps" || place.region === "approx. 1 km"
                    ? L("(rounded to ~1 km)", "(~1 किमी तक)")
                    : place.approx === "ip"
                      ? L("(approximate from network)", "(नेटवर्क से अनुमानित)")
                      : ""}
                </>
              ) : locating ? (
                L("Detecting…", "खोजा जा रहा है…")
              ) : (
                L("Not set", "सेट नहीं है")
              )}
            </li>
            <li>{L("Household profile", "घर की प्रोफ़ाइल")}: {L("7 answers", "7 उत्तर")}</li>
            <li>{L("Logged actions", "दर्ज कदम")}: {stored.actions}</li>
            <li>{L("Chat messages", "चैट संदेश")}: {stored.messages}</li>
            <li>{L("Groups joined", "जुड़े समूह")}: {stored.groups}</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{L("Everything stays in this browser tab and is gone when you close it. Nothing is sent to a server except your approximate location to fetch air data.", "सब कुछ इसी ब्राउज़र टैब में रहता है और बंद करने पर मिट जाता है। वायु डेटा के लिए अनुमानित स्थान के अलावा कुछ भी सर्वर पर नहीं जाता।")}</p>
          {!confirm ? (
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setConfirm(true)} data-testid="button-delete-data"><Trash2 className="h-4 w-4" aria-hidden />{L("Delete my data", "मेरा डेटा मिटाएँ")}</Button>
          ) : (
            <div className="mt-3 rounded-lg border border-destructive/40 p-3">
              <p className="text-sm">{L("Clear your profile, actions, chat and groups?", "प्रोफ़ाइल, कदम, चैट और समूह मिटाएँ?")}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => { clearAll(); setConfirm(false); }} data-testid="button-confirm-delete">{L("Delete", "मिटाएँ")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)} data-testid="button-cancel-delete">{L("Cancel", "रद्द करें")}</Button>
              </div>
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-card p-5 text-sm">
          <h2 className="text-base font-semibold">{L("How we keep advice safe", "सलाह को सुरक्षित कैसे रखते हैं")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-foreground/80">
            <li>{L("General wellbeing guidance only – no diagnosis or medicines.", "केवल सामान्य मार्गदर्शन – निदान या दवा नहीं।")}</li>
            <li>{L("Breathing emergencies get a fixed response pointing to 112.", "साँस की आपात स्थिति में 112 की ओर निश्चित उत्तर।")}</li>
            <li>{L("More cautious advice for children, older adults, pregnancy and health conditions.", "बच्चों, बुज़ुर्गों, गर्भावस्था और रोगों के लिए अधिक सावधान सलाह।")}</li>
            <li>{L("Low-cost options first; no brands or paid placements.", "सस्ते विकल्प पहले; कोई ब्रांड या विज्ञापन नहीं।")}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

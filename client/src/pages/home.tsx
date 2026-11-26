import { KeyboardEvent, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarCheck, Compass, Lightbulb, MessageCircle, ShieldAlert, UserCog, Users } from "lucide-react";
import { Header } from "@/components/Header";
import { AirPanel, LocationPendingCard } from "@/components/AirPanel";
import { TodayView } from "@/components/TodayView";
import { AirMapView } from "@/components/AirMapView";
import { AskView } from "@/components/AskView";
import { TipsView } from "@/components/TipsView";
import { ImpactView } from "@/components/ImpactView";
import { CommunityView } from "@/components/CommunityView";
import { ProfileView } from "@/components/ProfileView";
import { useCompanionState } from "@/hooks/use-companion-state";
import { AirReport, fetchAir } from "@/lib/air";
import { getNextTabIndex } from "@/lib/appState";
import { tr } from "@/lib/knowledge";
import { TAB_ORDER, TabId, UI } from "@/lib/ui-copy";

const TAB_ICONS: Record<TabId, typeof CalendarCheck> = {
  today: CalendarCheck,
  map: Compass,
  ask: MessageCircle,
  tips: Lightbulb,
  impact: BarChart3,
  community: Users,
  profile: UserCog,
};

export default function Home() {
  const {
    lang,
    place,
    locatingInitial,
    locInitError,
    profile,
    profileTouched,
    tab,
    done,
    joined,
    messages,
    stored,
    setLang,
    selectPlace,
    autoDetectLocation,
    setTab,
    toggleDone,
    updateProfile,
    setJoined,
    setMessages,
    clearUserData,
  } = useCompanionState();

  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const air = useQuery<AirReport>({
    queryKey: ["air", place?.lat, place?.lon, place?.name],
    queryFn: () => fetchAir(place!),
    enabled: Boolean(place),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const t = (x: { en: string; hi: string }) => tr(x, lang);
  const navRef = useRef<HTMLElement>(null);
  const pendingScroll = useRef(false);

  const selectTab = useCallback(
    (id: TabId) => {
      pendingScroll.current = true;
      setTab(id);
    },
    [setTab],
  );

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = getNextTabIndex(currentIndex, e.key, TAB_ORDER.length);
    if (nextIndex !== null) {
      e.preventDefault();
      const nextId = TAB_ORDER[nextIndex];
      selectTab(nextId);
      tabRefs.current[nextId]?.focus();
    }
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
      >
        {lang === "en" ? "Skip to main content" : "मुख्य सामग्री पर जाएँ"}
      </a>

      <Header
        lang={lang}
        setLang={setLang}
        place={place}
        setPlace={selectPlace}
        locatingInitial={locatingInitial}
        t={t}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 pb-16 pt-4 outline-none md:px-6 lg:grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-6"
      >
        <aside className="lg:sticky lg:top-20 lg:self-start" aria-label={lang === "en" ? "Current air quality" : "वर्तमान वायु गुणवत्ता"}>
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
          <nav
            ref={navRef}
            className="sticky top-[57px] z-20 -mx-4 mb-4 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur md:-mx-0 md:px-0 lg:top-[65px]"
            aria-label={lang === "en" ? "Sections" : "अनुभाग"}
          >
            <div className="flex gap-1" role="tablist" aria-label={lang === "en" ? "Clear Air Companion sections" : "क्लियर एयर कम्पेनियन अनुभाग"}>
              {TAB_ORDER.map((id, idx) => {
                const Icon = TAB_ICONS[id];
                const active = tab === id;
                return (
                  <button
                    key={id}
                    ref={(el) => {
                      tabRefs.current[id] = el;
                    }}
                    id={`tab-btn-${id}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`tabpanel-${id}`}
                    tabIndex={active ? 0 : -1}
                    data-testid={`tab-${id}`}
                    onClick={() => selectTab(id)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {t(UI.tabs[id])}
                    {id === "impact" && stored.actions > 0 && (
                      <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">
                        {stored.actions}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          <div
            id={`tabpanel-${tab}`}
            role="tabpanel"
            aria-labelledby={`tab-btn-${tab}`}
            tabIndex={0}
            className="outline-none"
          >
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
            {tab === "map" &&
              (place ? (
                <AirMapView place={place} report={air.data ?? null} lang={lang} onSelectPlace={selectPlace} />
              ) : (
                <LocationPendingCard locating={locatingInitial} lang={lang} onRetry={() => void autoDetectLocation(true)} />
              ))}
            {tab === "ask" && (
              <AskView
                place={place}
                locating={locatingInitial}
                report={air.data ?? null}
                profile={profile}
                lang={lang}
                messages={messages}
                setMessages={setMessages}
                updateProfile={updateProfile}
              />
            )}
            {tab === "tips" && <TipsView profile={profile} lang={lang} done={done} toggleDone={toggleDone} />}
            {tab === "impact" && (
              <ImpactView lang={lang} done={done} toggleDone={toggleDone} goTips={() => selectTab("tips")} />
            )}
            {tab === "community" && (
              <CommunityView
                lang={lang}
                place={place}
                joined={joined}
                setJoined={setJoined}
                doneCount={stored.actions}
              />
            )}
            {tab === "profile" && (
              <ProfileView
                lang={lang}
                profile={profile}
                update={updateProfile}
                place={place}
                locating={locatingInitial}
                clearAll={clearUserData}
                stored={stored}
              />
            )}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t(UI.disclaimer)}
          </p>
          <p>
            {lang === "en" ? "Data: " : "डेटा: "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://open-meteo.com/en/docs/air-quality-api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open-Meteo / CAMS
            </a>
            {" · "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://airquality.cpcb.gov.in/AQI_India/"
              target="_blank"
              rel="noopener noreferrer"
            >
              CPCB AQI India
            </a>
            {" · "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Maps Platform
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

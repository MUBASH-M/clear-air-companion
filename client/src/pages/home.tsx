import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck,
  Compass,
  Lightbulb,
  MessageCircle,
  ShieldAlert,
  UserCog,
  Users,
} from "lucide-react";
import { AirIndicesStrip } from "@/components/AirIndicesStrip";
import { AirMapView } from "@/components/AirMapView";
import { AirPanel, LocationPendingCard } from "@/components/AirPanel";
import { AskView } from "@/components/AskView";
import { CommunityView } from "@/components/CommunityView";
import { DailyPlan } from "@/components/DailyPlan";
import { Header } from "@/components/Header";
import { ImpactView } from "@/components/ImpactView";
import { ProfileView } from "@/components/ProfileView";
import { SurroundingAirMapCard } from "@/components/SurroundingAirMapCard";
import { TipsView } from "@/components/TipsView";
import { TodayView } from "@/components/TodayView";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanionState } from "@/hooks/use-companion-state";
import { AirReport, fetchAir } from "@/lib/air";
import { tr } from "@/lib/knowledge";
import { TAB_ORDER, TabId, UI } from "@/lib/ui-copy";

export { DailyPlan, buildDailyPlanAdvice } from "@/components/DailyPlan";
export type { DailyPlanAdviceItem } from "@/components/DailyPlan";

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

  const air = useQuery<AirReport>({
    queryKey: ["air", place?.lat, place?.lon, place?.name],
    queryFn: () => fetchAir(place!),
    enabled: Boolean(place),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const t = (x: { en: string; hi: string }) => tr(x, lang);
  const navRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef(false);

  const selectTab = useCallback(
    (id: TabId) => {
      pendingScroll.current = true;
      setTab(id);
    },
    [setTab],
  );

  const handleRefresh = useCallback(() => {
    if (place) {
      void air.refetch();
    } else {
      void autoDetectLocation(true);
    }
  }, [air, autoDetectLocation, place]);

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

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-16 pt-5 outline-none md:px-6">
        <AirIndicesStrip
          report={air.data}
          isLoading={air.isLoading}
          isFetching={air.isFetching}
          isError={air.isError}
          hasPlace={Boolean(place)}
          locating={locatingInitial}
          locError={locInitError}
          lang={lang}
          onRefresh={handleRefresh}
        />

        <DailyPlan
          report={air.data}
          profile={profile}
          profileTouched={profileTouched}
          isLoading={air.isLoading}
          hasPlace={Boolean(place)}
          locating={locatingInitial}
          lang={lang}
          activeTab={tab}
          onAction={() => selectTab(tab === "today" ? "profile" : "today")}
        />

        <div className="lg:grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-6">
          <aside className="lg:sticky lg:top-20 lg:self-start" aria-label={lang === "en" ? "Current air quality" : "वर्तमान वायु गुणवत्ता"}>
            <AirPanel
              q={air}
              lang={lang}
              t={t}
              hasPlace={Boolean(place)}
              locating={locatingInitial}
              locError={locInitError}
              onRetry={handleRefresh}
            />
          </aside>

          <section className="mt-6 min-h-[calc(100vh-57px)] min-w-0 lg:mt-0 lg:min-h-0">
            <Tabs value={tab} onValueChange={(v) => selectTab(v as TabId)} className="w-full">
              <div
                ref={navRef}
                className="sticky top-[57px] z-20 -mx-4 mb-4 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur md:-mx-0 md:px-0 lg:top-[65px]"
              >
                <TabsList
                  aria-label={lang === "en" ? "Clear Air Companion sections" : "क्लियर एयर कम्पेनियन अनुभाग"}
                  className="h-auto w-full justify-start gap-1 rounded-none bg-transparent p-0"
                >
                  {TAB_ORDER.map((id) => {
                    const Icon = TAB_ICONS[id];
                    return (
                      <TabsTrigger
                        key={id}
                        value={id}
                        id={`tab-btn-${id}`}
                        data-testid={`tab-${id}`}
                        className="flex shrink-0 items-center gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-3 text-sm font-medium text-muted-foreground shadow-none transition-colors whitespace-nowrap hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span>{t(UI.tabs[id])}</span>
                        {id === "impact" && stored.actions > 0 && (
                          <span className="text-xs font-semibold text-primary tabular-nums">({stored.actions})</span>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <TabsContent value="today" id="tabpanel-today" className="mt-0 outline-none">
                <SurroundingAirMapCard
                  place={place}
                  report={air.data}
                  lang={lang}
                  locating={locatingInitial}
                  onSelectPlace={selectPlace}
                  onOpenFullMap={() => selectTab("map")}
                />
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
              </TabsContent>

              <TabsContent value="map" id="tabpanel-map" className="mt-0 outline-none">
                {place ? (
                  <AirMapView place={place} report={air.data ?? null} lang={lang} onSelectPlace={selectPlace} />
                ) : (
                  <LocationPendingCard locating={locatingInitial} lang={lang} onRetry={() => void autoDetectLocation(true)} />
                )}
              </TabsContent>

              <TabsContent value="ask" id="tabpanel-ask" className="mt-0 outline-none">
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
              </TabsContent>

              <TabsContent value="tips" id="tabpanel-tips" className="mt-0 outline-none">
                <TipsView profile={profile} lang={lang} done={done} toggleDone={toggleDone} />
              </TabsContent>

              <TabsContent value="impact" id="tabpanel-impact" className="mt-0 outline-none">
                <ImpactView lang={lang} done={done} toggleDone={toggleDone} goTips={() => selectTab("tips")} />
              </TabsContent>

              <TabsContent value="community" id="tabpanel-community" className="mt-0 outline-none">
                <CommunityView
                  lang={lang}
                  place={place}
                  joined={joined}
                  setJoined={setJoined}
                  doneCount={stored.actions}
                />
              </TabsContent>

              <TabsContent value="profile" id="tabpanel-profile" className="mt-0 outline-none">
                <ProfileView
                  lang={lang}
                  profile={profile}
                  update={updateProfile}
                  place={place}
                  locating={locatingInitial}
                  clearAll={clearUserData}
                  stored={stored}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>

      <Separator />
      <footer>
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t(UI.disclaimer)}
          </p>
          <p>
            {lang === "en" ? "Data: " : "डेटा: "}
            <a
              className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="https://open-meteo.com/en/docs/air-quality-api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open-Meteo / CAMS
            </a>
            {" · "}
            <a
              className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="https://airquality.cpcb.gov.in/AQI_India/"
              target="_blank"
              rel="noopener noreferrer"
            >
              CPCB AQI India
            </a>
            {" · "}
            <a
              className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

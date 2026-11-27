import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { AlertTriangle, Globe, MapPin, MessageCircle, RotateCcw, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MapsSourcesList } from "@/components/MapsSourcesList";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { WebSourcesList } from "@/components/WebSourcesList";
import { AirReport, Place } from "@/lib/air";
import { GroundingMode, askGroundedAssistant } from "@/lib/ai";
import { ChatMsg, Profile, SUGGESTIONS, extractProfile, safetyCheck } from "@/lib/companion";
import { Lang, tipById, tr } from "@/lib/knowledge";

type AskViewProps = {
  place: Place | null;
  locating: boolean;
  report: AirReport | null;
  profile: Profile;
  lang: Lang;
  messages: ChatMsg[];
  setMessages: Dispatch<SetStateAction<ChatMsg[]>>;
  updateProfile: (p: Partial<Profile>) => void;
};

const GROUNDING_OPTIONS: Array<{ id: GroundingMode; en: string; hi: string }> = [
  { id: "auto", en: "Auto", hi: "ऑटो" },
  { id: "maps", en: "Google Maps", hi: "Google Maps" },
  { id: "search", en: "Google Search", hi: "Google Search" },
];

export function AskView({ place, locating, report, profile, lang, messages, setMessages, updateProfile }: AskViewProps) {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [groundingMode, setGroundingMode] = useState<GroundingMode>("auto");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView !== "function") return;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "nearest" });
  }, [messages, typing]);

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
            ? lang === "en"
              ? "Still detecting your current location — please try again in a moment."
              : "आपका वर्तमान स्थान खोजा जा रहा है — कृपया कुछ पल बाद फिर कोशिश करें।"
            : lang === "en"
              ? "Please detect your location or choose a city in the header first so I can give local advice."
              : "स्थानीय सलाह के लिए कृपया पहले ऊपर से अपना स्थान खोजें या कोई शहर चुनें।",
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
        groundingMode,
      });
      const note = changed.length
        ? lang === "en"
          ? "\n\n*I've noted this in your household profile so your daily plan adapts. You can change or delete it in Profile.*"
          : "\n\n*मैंने इसे आपकी प्रोफ़ाइल में जोड़ लिया है ताकि योजना बदल सके। प्रोफ़ाइल में इसे बदल या मिटा सकते हैं।*"
        : "";
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          kind: "normal",
          text: grounded.text + note,
          sources: grounded.sources,
          webSources: grounded.webSources,
          groundingUsed: grounded.groundingUsed,
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
    <Card className="flex min-h-[540px] flex-col overflow-hidden shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div
          className="inline-flex items-center gap-1 rounded-lg bg-muted p-1"
          role="group"
          aria-label={lang === "en" ? "Live grounding source" : "लाइव डेटा स्रोत"}
        >
          {GROUNDING_OPTIONS.map((opt) => {
            const active = groundingMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setGroundingMode(opt.id)}
                aria-pressed={active}
                data-testid={`grounding-mode-${opt.id}`}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.id === "maps" && <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />}
                {opt.id === "search" && <Globe className="h-3.5 w-3.5 text-primary" aria-hidden />}
                {lang === "en" ? opt.en : opt.hi}
              </button>
            );
          })}
        </div>

        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMessages([])}
            disabled={typing}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
            data-testid="button-clear-chat"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {lang === "en" ? "New chat" : "नई बातचीत"}
          </Button>
        )}
      </div>

      <div
        className="flex-1 space-y-4 overflow-y-auto p-4"
        role="log"
        aria-live="polite"
        aria-busy={typing}
        aria-label={lang === "en" ? "Conversation with Clear Air Companion" : "क्लियर एयर कम्पेनियन के साथ बातचीत"}
      >
        {messages.length === 0 && (
          <div className="py-6 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-primary" aria-hidden />
            <h1 className="mt-2 text-lg font-semibold">
              {lang === "en" ? "Ask about today's air, news & nearby places" : "आज की हवा, ताज़ा अपडेट और आसपास के स्थानों के बारे में पूछें"}
            </h1>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {place
                ? lang === "en"
                  ? `Multi-turn assistant grounded in ${place.name}'s live air reading, Google Maps local places, and Google Search air advisories.`
                  : `${place.name} की ताज़ा हवा, Google Maps के स्थानीय स्थानों और Google Search के ताज़ा अपडेट पर आधारित सहायक।`
                : locating
                  ? lang === "en"
                    ? "Detecting your current location for local air and place guidance…"
                    : "स्थानीय हवा और मार्गदर्शन के लिए आपका वर्तमान स्थान खोजा जा रहा है…"
                  : lang === "en"
                    ? "Pick or detect your location above to get tailored local guidance."
                    : "स्थानीय मार्गदर्शन के लिए ऊपर से अपना स्थान चुनें या खोजें।"}
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.role}-${i}`}>
            <div
              role={m.kind === "safety" || m.kind === "error" ? "alert" : undefined}
              className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "whitespace-pre-line rounded-br-md bg-primary text-primary-foreground"
                  : m.kind === "safety" || m.kind === "error"
                    ? "whitespace-pre-line rounded-bl-md border-2 border-destructive/50 bg-destructive/5"
                    : "rounded-bl-md bg-muted"
              }`}
            >
              {m.kind === "safety" && (
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                  {lang === "en" ? "Safety response" : "सुरक्षा उत्तर"}
                </p>
              )}
              {m.kind === "error" && (
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {lang === "en" ? "Unable to reply" : "उत्तर प्राप्त नहीं हुआ"}
                </p>
              )}
              {m.role === "assistant" && m.kind === "normal" && m.groundingUsed && (
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                  {m.groundingUsed === "maps"
                    ? lang === "en"
                      ? "Grounded with Google Maps"
                      : "Google Maps डेटा पर आधारित"
                    : lang === "en"
                      ? "Grounded with Google Search"
                      : "Google Search डेटा पर आधारित"}
                </p>
              )}
              {m.role === "assistant" && m.kind !== "safety" && m.kind !== "error" ? (
                <div className="prose prose-sm max-w-none text-foreground prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-primary">
                  <SafeMarkdown>{m.text}</SafeMarkdown>
                </div>
              ) : (
                m.text
              )}
              {m.tips && m.tips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {m.tips.map((id, idx) => {
                    const tip = tipById(id);
                    return (
                      <span key={id}>
                        {idx > 0 && <span aria-hidden className="mr-2">·</span>}
                        {tr(tip.title, lang)}
                      </span>
                    );
                  })}
                </div>
              )}
              {m.sources && m.sources.length > 0 && <MapsSourcesList sources={m.sources} lang={lang} compact />}
              {m.webSources && m.webSources.length > 0 && <WebSourcesList sources={m.webSources} lang={lang} compact />}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start" role="status" aria-label={lang === "en" ? "Assistant is typing" : "सहायक लिख रहा है"}>
            <div className="flex gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce motion-reduce:animate-none rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${d * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t p-3">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={lang === "en" ? "Suggested questions" : "सुझाए गए प्रश्न"}>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => send(tr(s, lang))}
              disabled={typing}
              className="shrink-0 whitespace-nowrap rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              data-testid={`button-suggestion-${i}`}
            >
              {tr(s, lang)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex gap-2"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              groundingMode === "search"
                ? lang === "en"
                  ? "e.g. Latest GRAP smog rules or school advisories today?"
                  : "जैसे: आज के ताज़ा GRAP नियम या स्कूल एडवाइजरी क्या हैं?"
                : lang === "en"
                  ? "e.g. Where can I buy N95 masks near me?"
                  : "जैसे: मेरे पास N95 मास्क कहाँ मिल सकते हैं?"
            }
            data-testid="input-chat"
            aria-label={lang === "en" ? "Ask a question about air quality, news, or nearby places" : "वायु गुणवत्ता, ताज़ा अपडेट या आसपास के स्थानों के बारे में प्रश्न लिखें"}
          />
          <Button type="submit" disabled={!text.trim() || typing} data-testid="button-send" aria-label={lang === "en" ? "Send message" : "संदेश भेजें"}>
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </form>
      </div>
    </Card>
  );
}

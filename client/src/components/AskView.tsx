import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { AlertTriangle, MessageCircle, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapsSourcesList } from "@/components/MapsSourcesList";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { AirReport, Place } from "@/lib/air";
import { askGroundedAssistant } from "@/lib/ai";
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

export function AskView({ place, locating, report, profile, lang, messages, setMessages, updateProfile }: AskViewProps) {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
              {lang === "en" ? "Ask about today's air & nearby places" : "आज की हवा और आसपास के स्थानों के बारे में पूछें"}
            </h1>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {place
                ? lang === "en"
                  ? `Tailored to ${place.name}'s live air reading, your household profile, and up-to-date Google Maps place data.`
                  : `${place.name} की ताज़ा हवा, आपके घर की प्रोफ़ाइल और Google Maps के ताज़ा स्थानीय डेटा के आधार पर उत्तर।`
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
              {m.role === "assistant" && m.kind !== "safety" && m.kind !== "error" ? (
                <div className="prose prose-sm max-w-none text-foreground prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-primary">
                  <SafeMarkdown>{m.text}</SafeMarkdown>
                </div>
              ) : (
                m.text
              )}
              {m.tips && m.tips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.tips.map((id) => {
                    const tip = tipById(id);
                    return (
                      <span key={id} className="rounded-full border bg-background px-2 py-0.5 text-xs text-foreground/80">
                        {tr(tip.title, lang)}
                      </span>
                    );
                  })}
                </div>
              )}
              {m.sources && m.sources.length > 0 && <MapsSourcesList sources={m.sources} lang={lang} compact />}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start" role="status" aria-label={lang === "en" ? "Assistant is typing" : "सहायक लिख रहा है"}>
            <div className="flex gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
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
              className="shrink-0 rounded-full border px-3 py-1 text-xs hover-elevate disabled:opacity-50"
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
            placeholder={lang === "en" ? "e.g. Where can I buy N95 masks near me?" : "जैसे: मेरे पास N95 मास्क कहाँ मिल सकते हैं?"}
            data-testid="input-chat"
            aria-label={lang === "en" ? "Ask a question about air quality or nearby places" : "वायु गुणवत्ता या आसपास के स्थानों के बारे में प्रश्न लिखें"}
          />
          <Button type="submit" disabled={!text.trim() || typing} data-testid="button-send" aria-label={lang === "en" ? "Send message" : "संदेश भेजें"}>
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </form>
      </div>
    </div>
  );
}

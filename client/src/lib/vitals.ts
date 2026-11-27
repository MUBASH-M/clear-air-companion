/**
 * Local, privacy-preserving Core Web Vitals observer (LCP, CLS, INP).
 * Records metrics strictly in browser memory for diagnostics and Lighthouse/CI checks;
 * never transmits telemetry or user data to third parties.
 */

export type WebVitalsSnapshot = {
  lcpMs: number | null;
  cls: number;
  inpMs: number | null;
};

declare global {
  interface Window {
    __CLEAR_AIR_VITALS__?: WebVitalsSnapshot;
  }
}

export function initWebVitalsMonitor(): () => void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return () => {};
  }

  const snapshot: WebVitalsSnapshot = { lcpMs: null, cls: 0, inpMs: null };
  window.__CLEAR_AIR_VITALS__ = snapshot;
  const observers: PerformanceObserver[] = [];

  const observe = (type: string, handler: (entries: PerformanceEntryList) => void) => {
    try {
      const obs = new PerformanceObserver((list) => handler(list.getEntries()));
      obs.observe({ type, buffered: true } as PerformanceObserverInit);
      observers.push(obs);
    } catch {
      // Unsupported entry type in this browser
    }
  };

  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1];
    if (last) snapshot.lcpMs = Math.round(last.startTime);
  });

  observe("layout-shift", (entries) => {
    for (const entry of entries) {
      const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
      if (!shift.hadRecentInput && typeof shift.value === "number") {
        snapshot.cls = Math.round((snapshot.cls + shift.value) * 10000) / 10000;
      }
    }
  });

  observe("event", (entries) => {
    for (const entry of entries) {
      const dur = Math.round(entry.duration);
      if (snapshot.inpMs === null || dur > snapshot.inpMs) {
        snapshot.inpMs = dur;
      }
    }
  });

  return () => {
    for (const obs of observers) obs.disconnect();
  };
}

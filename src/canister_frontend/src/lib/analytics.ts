type AnalyticsValue = string | number | boolean | null | undefined;

type AnalyticsParams = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (
      command: "js" | "config" | "event",
      target: string | Date,
      params?: AnalyticsParams,
    ) => void;
  }
}

function hasGtag(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

function compactParams(params?: AnalyticsParams): AnalyticsParams | undefined {
  if (!params) {
    return undefined;
  }
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function trackEvent(name: string, params?: AnalyticsParams): void {
  if (!hasGtag()) {
    return;
  }
  window.gtag?.("event", name, compactParams(params));
}

export function trackPageView(path: string, title?: string): void {
  if (!hasGtag()) {
    return;
  }
  const normalizedPath = path || "/";
  trackEvent("page_view", {
    page_path: normalizedPath,
    page_title: title ?? document.title,
    page_location: `${window.location.origin}${normalizedPath}`,
  });
}

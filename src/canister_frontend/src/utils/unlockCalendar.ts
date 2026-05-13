/** Default timed event length after the unlock instant (30 minutes). */
export const UNLOCK_EVENT_DURATION_MS = 30 * 60 * 1000;

const SUMMARY_MAX_LEN = 200;
const DESCRIPTION_MAX_LEN = 1800;
const GOOGLE_TEXT_MAX_LEN = 900;

export interface UnlockCalendarInput {
  unlockDateNs: bigint;
  title: string;
  capsuleId: string;
  /** Shown in description when provided (e.g. claim page URL). */
  claimUrl?: string;
}

export interface UnlockCalendarLinks {
  googleCalendarUrl: string;
  icsContent: string;
  suggestedFilename: string;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC datetime in compact form for Google Calendar `dates` and ICS DTSTART/DTEND in UTC. */
function formatUtcCompact(dt: Date): string {
  return (
    `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}` +
    `T${pad2(dt.getUTCHours())}${pad2(dt.getUTCMinutes())}${pad2(dt.getUTCSeconds())}Z`
  );
}

/** ICS TEXT escaping for SUMMARY / DESCRIPTION values (RFC 5545). */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function safeFilenameSegment(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 48) || "capsule";
}

function buildDescription(input: UnlockCalendarInput): string {
  const parts = [
    `Canister unlock time is enforced on the Internet Computer.`,
    input.claimUrl ? `Open this canister: ${input.claimUrl}` : null,
    `Capsule ID: ${input.capsuleId}`,
  ].filter((p): p is string => Boolean(p));
  return truncate(parts.join("\n\n"), DESCRIPTION_MAX_LEN);
}

/**
 * Builds Google Calendar URL and ICS document for the unlock moment.
 * Caller should only invoke when unlock is in the future.
 */
export function buildUnlockCalendarLinks(
  input: UnlockCalendarInput,
): UnlockCalendarLinks {
  const unlockMs = Number(input.unlockDateNs / 1_000_000n);
  const start = new Date(unlockMs);
  const end = new Date(unlockMs + UNLOCK_EVENT_DURATION_MS);

  const summaryRaw = `Canister unlocks: ${input.title}`;
  const summary = truncate(summaryRaw, SUMMARY_MAX_LEN);
  const summaryGoogle = truncate(summaryRaw, GOOGLE_TEXT_MAX_LEN);

  const description = buildDescription(input);

  const datesParam = `${formatUtcCompact(start)}/${formatUtcCompact(end)}`;
  const googleCalendarUrl =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(summaryGoogle)}` +
    `&dates=${encodeURIComponent(datesParam)}` +
    `&details=${encodeURIComponent(description)}`;

  const uid = `${input.capsuleId}@time-canister`;
  const dtStamp = formatUtcCompact(new Date());
  const dtStart = formatUtcCompact(start);
  const dtEnd = formatUtcCompact(end);

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Time Canister//Unlock Reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const icsContent = icsLines.join("\r\n") + "\r\n";

  const suggestedFilename = `${safeFilenameSegment(input.capsuleId)}-unlock.ics`;

  return { googleCalendarUrl, icsContent, suggestedFilename };
}

export function triggerIcsDownload(icsContent: string, filename: string): void {
  const blob = new Blob([icsContent], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

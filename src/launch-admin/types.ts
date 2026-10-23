export interface Wave {
  id: string;
  name: string;
  capacity: number;
  status: "draft" | "open" | "paused";
  selected: number;
  invited: number;
  awaiting: number;
  started: number;
  joined: number;
}
export interface Guest {
  id: string;
  phone: string;
  name: string;
  source: "seed" | "nomination";
  wave_id: string | null;
  state: string;
  nominator_name: string | null;
  invited_at: string | null;
  invited_via: string | null;
  claimed_at: string | null;
  joined_at: string | null;
  consent_at: string | null;
  consent_note: string | null;
  suppressed_at: string | null;
  delivery: string | null;
  error_code: string | null;
}
export interface Snapshot {
  settings: {
    gated: boolean;
    requirePhone: boolean;
    installUrl: string | null;
    smsEnabled: boolean;
  };
  summary: { members: number; legacy: number };
  waves: Wave[];
  pending: number;
  audit: {
    action: string;
    target: string | null;
    created_at: string;
    details: Record<string, unknown>;
  }[];
}
export interface GuestPage {
  rows: Guest[];
  total: number;
}
export const stateLabels: Record<string, string> = {
  queued: "Waiting for a wave",
  selected: "Selected",
  ready: "Access activated · not sent",
  invited: "Invitation sent · not joined",
  started: "Started onboarding",
  joined: "Onboarding completed",
  revoked: "Revoked",
};
// Strict, explicit phone parsing. A country code is required outside US/Canada.
export function normalizePhone(raw: string): string | null {
  if (/[^\d\s()+.-]/.test(raw)) return null;
  const d = raw.replace(/\D/g, "");
  const n = raw.trim().startsWith("+")
    ? `+${d}`
    : d.length === 10
      ? `+1${d}`
      : d.length === 11 && d.startsWith("1")
        ? `+${d}`
        : "";
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}
export function parseGuestImport(
  text: string,
): { phone: string; name: string }[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((x) => x.trim());
  if (lines.length > 501) throw Error("Import up to 500 people at a time.");
  return lines.flatMap((line, i) => {
    const columns =
      line
        .match(/("(?:[^"]|"")*"|[^,\t]+)(?=\s*[,\t]|\s*$)/g)
        ?.map((v) => v.trim().replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
    if (i === 0 && columns.some((v) => /^(phone|phone number)$/i.test(v)))
      return [];
    const p = columns.findIndex((v) => !!normalizePhone(v));
    if (p < 0)
      throw Error(
        `Line ${i + 1}: use a valid number, including its country code outside the US.`,
      );
    const name = columns
      .filter((_, j) => j !== p)
      .join(" ")
      .trim();
    if (name.length > 80)
      throw Error(`Line ${i + 1}: shorten the name to 80 characters.`);
    return [{ phone: normalizePhone(columns[p])!, name }];
  });
}
export function invitationText(url: string) {
  return `Your Spotted invitation is open. Join with the phone number I invited: ${url}`;
}
export function csvCell(value: string) {
  return (
    '"' +
    (/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replace(/"/g, '""') +
    '"'
  );
}

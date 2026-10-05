/**
 * Design tokens (client feedback §6/§9). One place for the brand colours
 * and for what "selected", "ordinary" and "disabled" controls look like,
 * so every screen draws them the same way. New code imports from here;
 * do not re-declare NEON / PURPLE / INK in a screen.
 */

export const NEON = '#d4ff00';
export const PURPLE = '#a855f7';
/** Deepest background. */
export const INK = '#110a24';
/** Header / floating-control background. */
export const INK_LIGHT = '#1a0f2e';
export const RECORD_RED = '#ff3b5c';
/**
 * Brand bible (Sept 2026) "Action Violet": the fill for violet controls
 * that carry white text. PURPLE (#a855f7) is the accent for icons, rings
 * and outlines, but white on it measures 3.96:1; on this it is 6.5:1.
 */
export const VIOLET_FILL = '#8040aa';
/** Brand bible "Active Lavender": the selected tab in the native tab bar. */
export const LAVENDER = '#dac2ff';
/** Brand bible "Secondary Mist": inactive tab icons / secondary copy. */
export const MIST = '#b6adbf';

/**
 * Shared screen background: a soft purple bloom at the top fading into the
 * base background — applied via each stack's contentStyle so every screen
 * gets it without per-screen wrappers.
 */
export const SCREEN_GRADIENT =
  'bg-gradient-to-b from-[#34215c] via-[#1d1240] via-40% to-background';

export type ControlState = 'ordinary' | 'selected' | 'disabled';

/**
 * Control surfaces. `ordinary` is a quiet translucent button; `selected`
 * is the one neon treatment used for "this is on / current"; `disabled`
 * is dimmed and never neon. Apply with the matching icon/text colour.
 */
export const control: Record<ControlState, string> = {
  ordinary: 'bg-white/10 border border-white/12',
  selected: 'bg-[#d4ff00]/18 border border-[#d4ff00]/55',
  disabled: 'bg-white/5 border border-white/6 opacity-40',
};

/** Icon / label colour that pairs with each control surface. */
export const controlTint: Record<ControlState, string> = {
  ordinary: 'rgba(255,255,255,0.85)',
  selected: NEON,
  disabled: 'rgba(255,255,255,0.45)',
};

/** Filled call-to-action (neon on ink text). */
export const primaryControl = 'bg-[#d4ff00]';
export const primaryControlText = 'text-[#1a0f2e]';

/** Outlined secondary action (profile Edit / Share, etc.). */
export const outlineControl = 'border border-white/20 active:bg-white/5';

/*
 * Day Mode and Morning After (client mockup, Oct 2026; DAY-NIGHT-MODE-SPEC.md).
 */
/** The moon badge on Leaderboard / Map in Day Mode (native tab badge fill). */
export const PLUM_BADGE = '#493551';
/** Raised plum surface: the countdown row, the opening screen's icon tile, the Day chip. */
export const dayRaised = 'bg-[#302142] border border-[#493657]';
/** The "LAST NIGHT" sticker and other lime-on-ink labels. */
export const STICKER_INK = '#1a1229';
/** Morning After stop tickets: light paper with dark ink (8.9:1). */
export const TICKET_PAPER = '#F0E6F3';
export const TICKET_INK = '#281835';
export const TICKET_MUTED = '#594460';
/** Polaroid frame border on the scrapbook photos. */
export const POLAROID_EDGE = '#DCCEE3';
/** The Morning After cover card and the replay's story panel. */
export const recapCover = 'bg-gradient-to-br from-[#503165] to-[#2E2043] border border-[#715087]';
export const recapPanel = 'bg-gradient-to-br from-[#382447] to-[#251B37]';

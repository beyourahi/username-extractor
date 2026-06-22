/**
 * Form + surface base-class consts — the hoisted vocabulary behind Dropout's
 * inputs, tiles, and pills. Exported so surfaces can be composed natively
 * (the way the live onboarding dialog does) as well as via the components.
 *
 * NOTE: these surfaces are tuned for the DARK canonical theme (faint white
 * raised fills, white hairlines). They read as intended on dark backgrounds.
 */

/** Text input / textarea / select. 16px on mobile (no iOS zoom), mono, hairline. */
export const inputBase =
	"w-full rounded-[11px] border border-hair bg-white/[0.025] px-[15px] py-[13px] font-mono text-base text-foreground transition-[border-color,background] duration-[250ms] ease-[var(--ease)] outline-none placeholder:text-ink-muted hover:border-white/20 focus:border-white/55 focus:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[2px] focus-visible:outline-signal lg:text-xs";

/** Field label — mono, uppercase, micro. */
export const labelBase = "mb-2.5 block font-mono text-micro text-ink-muted uppercase";

/**
 * Prose roles — one canonical class per role so surfaces stop hand-picking
 * text-sm / text-xs / text-body interchangeably. Fixed sizes (body copy doesn't
 * need to scale; the problem is consistency, not responsiveness). Compose with
 * layout via cn(), e.g. cn(bodyBase, "max-w-prose mt-2").
 */
/** Body copy / paragraphs / page intros. */
export const bodyBase = "text-body leading-body text-foreground";
/** Muted helper / hint / description text (under a field or section header). */
export const helperBase = "text-caption leading-relaxed text-ink-muted text-pretty";
/** Quiet metadata — timestamps, counts, secondary table data. */
export const metaBase = "text-caption text-ink-muted tabular-nums";

/** Selectable tile (radio/checkbox surface). Compose with selected/unselected. */
export const tileBase =
	"rounded-[11px] border p-3 text-left transition-colors duration-[250ms] ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal active:opacity-90";
export const tileSelected = "border-signal bg-ink-2";
export const tileUnselected =
	"border-hair bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]";

/** Choice pill (compact selectable chip). */
export const pillBase =
	"rounded-full border px-4 py-2 font-mono text-micro uppercase transition-colors duration-[250ms] ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";
export const pillSelected = "border-signal bg-signal font-semibold text-background";
export const pillUnselected =
	"border-hair text-ink-muted hover:border-white/30 hover:text-foreground";

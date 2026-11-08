import { BookOpenText, Pointer, ShieldAlert, Wrench } from "lucide-react";
import type { Strings } from "@/lib/i18n";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

// Each note: its own paper colour and its own slight angle, like notes pinned by hand.
const ITEMS: { mode: Mode; icon: typeof Pointer; tone: string; paper: string; tilt: string }[] = [
  { mode: "show_me", icon: Pointer, tone: "bg-surface-2 text-ink", paper: "bg-[var(--note-1)]", tilt: "-rotate-2" },
  { mode: "scam_check", icon: ShieldAlert, tone: "bg-danger-bg text-danger", paper: "bg-[var(--note-3)]", tilt: "rotate-[1.5deg]" },
  { mode: "fix_it", icon: Wrench, tone: "bg-surface-2 text-ink", paper: "bg-[var(--note-4)]", tilt: "rotate-1" },
  { mode: "explain_it", icon: BookOpenText, tone: "bg-sky-bg text-sky", paper: "bg-[var(--note-2)]", tilt: "-rotate-[2.5deg]" },
];

/**
 * What Sid can do, told through real questions. Sid picks the mode itself, so a tap only
 * fills in the question box; nothing is sent until the person presses the button.
 * Simple mode: four big tappable notes. Standard: one compact list with the mode names.
 */
export function ModeGuide({
  t,
  simple,
  onPick,
  onMood,
  className,
}: {
  t: Strings;
  simple: boolean;
  onPick: (question: string) => void;
  /** Which kind of question the pointer is on (Sid makes the matching face) */
  onMood?: (mode: Mode | null) => void;
  className?: string;
}) {
  const hover = (mode: Mode) => ({
    onPointerEnter: () => onMood?.(mode),
    onPointerLeave: () => onMood?.(null),
    onFocus: () => onMood?.(mode),
    onBlur: () => onMood?.(null),
  });

  return (
    <section aria-labelledby="people-ask" className={cn("flex flex-col gap-3", className)}>
      <h3 id="people-ask" className="px-1 font-hand text-lg font-bold text-ink-soft">
        {t.peopleAsk}
      </h3>
      {simple ? (
        <ul className="cork grid gap-x-5 gap-y-6 rounded-3xl p-5 pt-6 sm:grid-cols-2 sm:p-6">
          {ITEMS.map(({ mode, icon: Icon, paper, tilt }) => (
            <li key={mode} className={cn("relative drop-shadow-[2px_4px_0_rgb(0_0_0_/_0.22)] transition-transform hover:rotate-0", tilt)}>
              <span className="pin absolute -top-2 left-1/2 z-10 size-4 -translate-x-1/2 rounded-full" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onPick(t.modeExample[mode])}
                {...hover(mode)}
                className={cn("note flex h-full w-full flex-col items-start gap-2 p-4 pt-5 pe-6 text-start", paper)}
              >
                <Icon className={cn("size-6", mode === "scam_check" && "text-[var(--pin)]")} aria-hidden="true" />
                <span className="font-hand text-xl leading-snug font-bold">&ldquo;{t.modeExample[mode]}&rdquo;</span>
                <span className="text-sm opacity-75">{t.modeHint[mode]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
          {ITEMS.map(({ mode, icon: Icon, tone }) => (
            <li key={mode}>
              <button
                type="button"
                onClick={() => onPick(t.modeExample[mode])}
                {...hover(mode)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-start first:rounded-t-2xl hover:bg-surface-2"
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tone)} aria-hidden="true">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-ink">{t.modeExample[mode]}</span>
                <span className="hidden shrink-0 text-sm text-ink-soft sm:inline">{t.modes[mode]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

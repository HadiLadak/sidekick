import { BookOpenText, Pointer, ShieldAlert, Wrench } from "lucide-react";
import type { Strings } from "@/lib/i18n";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

// Only scams get a colour of their own; the rest stay in the core ink / yellow / blue.
const ITEMS: { mode: Mode; icon: typeof Pointer; tone: string }[] = [
  { mode: "show_me", icon: Pointer, tone: "bg-mark text-on-mark" },
  { mode: "scam_check", icon: ShieldAlert, tone: "bg-danger-bg text-danger" },
  { mode: "fix_it", icon: Wrench, tone: "bg-surface-2 text-ink" },
  { mode: "explain_it", icon: BookOpenText, tone: "bg-sky-bg text-sky" },
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
        <ul className="grid gap-3 sm:grid-cols-2">
          {ITEMS.map(({ mode, icon: Icon, tone }) => (
            <li key={mode}>
              <button
                type="button"
                onClick={() => onPick(t.modeExample[mode])}
                {...hover(mode)}
                className="sticker flex h-full w-full flex-col items-start gap-2 rounded-2xl bg-surface p-4 text-start hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                <span className={cn("grid size-10 place-items-center rounded-xl", tone)} aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <span className="text-lg leading-snug font-bold text-ink">&ldquo;{t.modeExample[mode]}&rdquo;</span>
                <span className="text-sm text-ink-soft">{t.modeHint[mode]}</span>
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

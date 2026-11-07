import { BookOpenText, Pointer, ShieldAlert, Wrench } from "lucide-react";
import type { Strings } from "@/lib/i18n";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

// Each bubble sits at its own slight angle, like notes stuck to a fridge.
const ITEMS: { mode: Mode; icon: typeof Pointer; tone: string; tilt: string }[] = [
  { mode: "show_me", icon: Pointer, tone: "bg-sky-bg text-sky", tilt: "-rotate-1 sm:me-10" },
  { mode: "scam_check", icon: ShieldAlert, tone: "bg-danger-bg text-danger", tilt: "rotate-[0.8deg] sm:ms-10" },
  { mode: "fix_it", icon: Wrench, tone: "bg-fix-bg text-fix", tilt: "rotate-[0.4deg] sm:me-6" },
  { mode: "explain_it", icon: BookOpenText, tone: "bg-learn-bg text-learn", tilt: "-rotate-[1.2deg] sm:ms-14" },
];

/**
 * What Sid can do, told through real questions. Sid picks the mode itself, so the bubbles
 * only fill in the question box (nothing is sent until the person presses Ask).
 */
export function ModeGuide({ t, onPick }: { t: Strings; onPick?: (question: string) => void }) {
  return (
    <section aria-labelledby="people-ask" className="flex flex-col gap-4">
      <h2 id="people-ask" className="font-hand text-2xl font-bold text-ink sm:text-[1.7rem]">
        {t.peopleAsk}
      </h2>
      <ul className="flex flex-col gap-4">
        {ITEMS.map(({ mode, icon: Icon, tone, tilt }, i) => (
          <li key={mode} className={cn("transition-transform hover:rotate-0", tilt)}>
            <button
              type="button"
              onClick={() => onPick?.(t.modeExample[mode])}
              className={cn(
                "sticker group flex w-full items-start gap-3 bg-surface p-4 text-start active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
                i % 2 ? "bubble-user" : "bubble",
              )}
            >
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-full border-2 border-edge", tone)} aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-lg leading-snug font-bold text-ink">&ldquo;{t.modeExample[mode]}&rdquo;</span>
                <span className="mt-1 text-sm text-ink-soft">
                  <span className="font-hand font-bold text-ink">{t.modes[mode]}</span>
                  <span aria-hidden="true">: </span>
                  {t.modeHint[mode].toLowerCase()}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

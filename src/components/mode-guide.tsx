import { Lightbulb, Pointer, ShieldAlert, Wrench } from "lucide-react";
import type { Strings } from "@/lib/i18n";
import type { Mode } from "@/lib/types";

const ITEMS: { mode: Mode; icon: typeof Pointer; tone: string }[] = [
  { mode: "show_me", icon: Pointer, tone: "bg-sky-bg text-sky" },
  { mode: "fix_it", icon: Wrench, tone: "bg-fix-bg text-fix" },
  { mode: "scam_check", icon: ShieldAlert, tone: "bg-danger-bg text-danger" },
  { mode: "explain_it", icon: Lightbulb, tone: "bg-learn-bg text-learn" },
];

/** What Sid can do. Sid picks the right one automatically, so this is information, not a control. */
export function ModeGuide({ t }: { t: Strings }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-5" aria-label="What Sid helps with">
      {ITEMS.map(({ mode, icon: Icon, tone }) => (
        <li key={mode} className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`} aria-hidden="true">
            <Icon className="size-5" />
          </span>
          <span className="flex flex-col">
            <span className="font-bold text-ink">{t.modes[mode]}</span>
            <span className="text-sm leading-snug text-ink-soft">{t.modeHint[mode]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

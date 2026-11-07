"use client";

import { Check, Copy, Download, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isRtl, type Strings } from "@/lib/i18n";
import type { PreparedImage } from "@/lib/image";

/** Drafts a message for a family member. Never sends anything: share/copy only. */
export function FamilySheet({
  t,
  lang,
  problem,
  title,
  image,
  onClose,
}: {
  t: Strings;
  lang: string;
  problem: string;
  title: string;
  image: PreparedImage | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [msg, setMsg] = useState(() => t.familyMsg(problem.trim(), title));
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after mount
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  async function imageFile() {
    if (!image) return null;
    const blob = await (await fetch(image.url)).blob();
    return new File([blob], "screenshot.jpg", { type: "image/jpeg" });
  }

  async function share() {
    try {
      const file = await imageFile();
      const data: ShareData = { text: msg };
      if (file && navigator.canShare?.({ files: [file] })) data.files = [file];
      await navigator.share(data);
    } catch {
      /* user cancelled */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="family-title"
      className="m-auto mb-0 w-full max-w-lg bg-transparent p-0 backdrop:bg-ink/40 sm:mb-auto"
    >
      <div className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(2rem,env(safe-area-inset-bottom))] ring-1 ring-line sm:rounded-[1.75rem] sm:pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="family-title" className="text-2xl font-bold text-ink">
              {t.familyTitle}
            </h2>
            <p className="mt-1 text-base text-ink-soft">{t.familyIntro}</p>
          </div>
          <form method="dialog">
            <button className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink" aria-label={t.close}>
              <X className="size-5" aria-hidden="true" />
            </button>
          </form>
        </div>

        <div className="flex gap-3">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- local preview
            <img
              src={image.url}
              alt=""
              width={image.width}
              height={image.height}
              className="h-36 w-auto max-w-[6rem] shrink-0 rounded-xl border-2 border-ink object-cover object-top"
            />
          )}
          <label className="flex-1">
            <span className="sr-only">Message</span>
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              dir={isRtl(lang) ? "rtl" : "auto"}
              lang={lang}
              rows={7}
              className="bubble-user h-full w-full resize-none bg-sky-bg p-3 text-base leading-relaxed text-ink outline-none focus-visible:ring-2 focus-visible:ring-sky"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {canShare && (
            <button
              type="button"
              onClick={share}
              className="flex h-12 flex-[1_1_9rem] items-center justify-center gap-2 rounded-full whitespace-nowrap bg-mark px-5 font-bold text-on-mark press"
            >
              <Share2 className="size-5" aria-hidden="true" />
              {t.share}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className="flex h-12 flex-[1_1_9rem] items-center justify-center gap-2 rounded-full whitespace-nowrap bg-surface-2 px-5 font-bold text-ink ring-1 ring-line"
          >
            {copied ? <Check className="size-5" aria-hidden="true" /> : <Copy className="size-5" aria-hidden="true" />}
            <span aria-live="polite">{copied ? t.copied : t.copy}</span>
          </button>
          {image && (
            <a
              href={image.url}
              download="screenshot.jpg"
              className="flex h-12 flex-[1_1_9rem] items-center justify-center gap-2 rounded-full whitespace-nowrap bg-surface-2 px-5 font-bold text-ink ring-1 ring-line"
            >
              <Download className="size-5" aria-hidden="true" />
              {t.saveImage}
            </a>
          )}
        </div>
        <p className="text-sm text-ink-soft">{t.neverAsk}</p>
      </div>
    </dialog>
  );
}

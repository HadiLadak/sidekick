"use client";

import { ImagePlus, Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Strings } from "@/lib/i18n";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { getRecognition } from "@/lib/speech";
import { cn } from "@/lib/utils";

export function Composer({
  t,
  speechLang,
  text,
  setText,
  image,
  setImage,
  onSubmit,
  simple,
  onNotice,
}: {
  t: Strings;
  speechLang: string;
  text: string;
  setText: (s: string) => void;
  image: PreparedImage | null;
  setImage: (i: PreparedImage | null) => void;
  onSubmit: (override?: { text?: string }) => void;
  simple: boolean;
  onNotice: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<ReturnType<typeof getRecognition>>(null);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  async function takeFile(file: File | Blob | null | undefined) {
    if (!file) return;
    // HEIC (iPhone photos) often arrives with an empty type on Windows: try it, explain if it fails
    const name = "name" in file ? file.name : "";
    if (!file.type.startsWith("image/") && !/\.(heic|heif|avif|bmp|tiff?)$/i.test(name)) {
      onNotice(t.errors.unsupported);
      return;
    }
    try {
      setImage(await prepareImage(file));
    } catch {
      onNotice(t.errors.unsupported);
    }
  }

  // Paste a screenshot from anywhere on the page
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        takeFile(item.getAsFile());
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      onNotice(t.noVoice);
      return;
    }
    const base = textRef.current ? textRef.current.trimEnd() + " " : "";
    rec.lang = speechLang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText(base + finalText + interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") onNotice(t.noVoice);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      // In Simple mode, speaking is enough: send right away.
      if (simple && finalText.trim()) onSubmit({ text: base + finalText });
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <form
      className={cn(
        "bubble-user relative bg-surface p-3 shadow-[0_0.375rem_0_0_var(--surface-2)] ring-1 ring-line transition-shadow focus-within:ring-2 focus-within:ring-sky sm:p-4",
        dragging && "ring-4 ring-sky",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        takeFile(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          takeFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {image ? (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img
            src={image.url}
            alt=""
            width={image.width}
            height={image.height}
            className="h-20 w-auto max-w-[7rem] rounded-lg border-2 border-ink object-cover object-top"
          />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full px-2 py-1 text-sm font-semibold text-sky underline-offset-4 hover:underline"
            >
              {t.replaceScreenshot}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setImage(null)}
            className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink"
            aria-label={t.removeScreenshot}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group mb-3 flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-paper p-4 text-start transition-colors hover:border-sky hover:bg-sky-bg"
        >
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink text-mark dark:bg-mark dark:text-on-mark transition-transform group-hover:-rotate-6">
            <ImagePlus className="size-7" aria-hidden="true" />
          </span>
          <span className="flex flex-col">
            <span className="text-lg font-bold text-ink">{dragging ? t.dropHere : t.addScreenshot}</span>
            <span className="text-sm text-ink-soft">{t.orPaste}</span>
          </span>
        </button>
      )}

      <label htmlFor="sid-question" className="sr-only">
        {t.ask}
      </label>
      <textarea
        id="sid-question"
        name="question"
        autoComplete="off"
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
        placeholder={t.placeholder}
        rows={simple ? 2 : 3}
        className="block w-full resize-none rounded-xl bg-transparent px-2 py-1 text-lg leading-relaxed text-ink outline-none placeholder:text-ink-soft/80"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleVoice}
          aria-pressed={listening}
          className={cn(
            "flex h-12 items-center gap-2 rounded-full px-4 font-semibold ring-1 transition-colors",
            listening ? "bg-danger-bg text-danger ring-danger" : "bg-surface-2 text-ink ring-line hover:ring-sky",
          )}
        >
          {listening ? (
            <Square className="size-4 fill-current" aria-hidden="true" />
          ) : (
            <Mic className="size-5" aria-hidden="true" />
          )}
          <span>{listening ? t.listening : t.speak}</span>
          {listening && <span className="size-2 animate-ping rounded-full bg-danger" aria-hidden="true" />}
        </button>
        <button
          type="submit"
          disabled={!text.trim() && !image}
          className="ms-auto h-12 rounded-full bg-mark px-6 text-lg font-bold text-on-mark shadow-[0_0.25rem_0_0_var(--ink)] transition-transform active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
        >
          {t.send}
        </button>
      </div>
    </form>
  );
}

"use client";
import { useEffect, useMemo, useRef } from "react";
import { Section } from "@/components/ui/layout";
import { TorqueTick } from "./demo/torque-tick";

/** Gap between two words lighting up when several cross the trigger line in the same frame. */
export const WORD_STEP_MS = 60;
/** The trigger line sits 35% above the bottom of the viewport. */
export const TRIGGER_MARGIN = "0px 0px -35% 0px";

/**
 * Tagline reveal (B11): a large statement whose words light up one by one, in reading order,
 * as each crosses the trigger line. One IntersectionObserver watches every word; each word lights once.
 * Reduced motion (or no IntersectionObserver): every word is shown at full ink straight away.
 */
export function TaglineReveal({ text, label }: { text: string; label?: string }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-word]"));
    const light = (s: HTMLElement) => {
      s.dataset.on = "true";
    };
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      spans.forEach(light);
      return;
    }
    const queue: HTMLElement[] = [];
    let timer = 0;
    const drain = () => {
      const next = queue.shift();
      if (next) light(next);
      timer = queue.length ? window.setTimeout(drain, WORD_STEP_MS) : 0;
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          queue.push(e.target as HTMLElement);
        }
        queue.sort((a, b) => Number(a.dataset.word) - Number(b.dataset.word));
        if (!timer && queue.length) drain();
      },
      { rootMargin: TRIGGER_MARGIN, threshold: 1 },
    );
    spans.forEach((s) => io.observe(s));
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [words]);

  return (
    <Section rhythm="open">
      <TorqueTick className="mb-6" />
      {label ? <p className="caption-3 mb-6 text-text-subtle">{label}</p> : null}
      <p ref={ref} className="heading-3 lg:heading-1 max-w-hero text-text">
        {words.map((w, i) => (
          <span key={i} className="kit-word" data-word={i}>
            {w}{" "}
          </span>
        ))}
      </p>
    </Section>
  );
}

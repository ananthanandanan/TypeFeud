"use client";

/**
 * The typing surface. SPEC §6.2 and docs/design/canvas/TypingSurface.dc.html.
 *
 * The most-looked-at element in the game, so the rules are strict:
 *   - the whole line is laid out at final metrics before the first keystroke,
 *     and only colour and the caret ever change — zero layout shift, ever
 *   - a wrong character keeps the key the player pressed and gains an
 *     underline, so it never signals by hue alone and never gets replaced
 *   - the caret is a 3px rule that slides between characters, never a block
 *
 * Underlines are drawn with text-decoration and the caret is absolutely
 * positioned: neither can push a character sideways.
 */

import { displayLine, type DisplayChar, type LineProgress } from "@typefeud/game";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const FONT_SIZE_PX = 32;
const LINE_HEIGHT = 1.7;

interface Caret {
  x: number;
  y: number;
  height: number;
}

/**
 * Split into chunks that each end with their trailing space, so a line only
 * ever wraps between words. Per-character spans would otherwise let a word
 * break anywhere.
 */
function chunk(chars: DisplayChar[]): { start: number; chars: DisplayChar[] }[] {
  const chunks: { start: number; chars: DisplayChar[] }[] = [];
  let current: DisplayChar[] = [];
  let start = 0;

  chars.forEach((char, i) => {
    current.push(char);
    if (char.char === " " || i === chars.length - 1) {
      chunks.push({ start, chars: current });
      current = [];
      start = i + 1;
    }
  });

  return chunks;
}

const STATE_CLASS: Record<DisplayChar["state"], string> = {
  correct: "text-text",
  current: "text-muted",
  pending: "text-muted",
  wrong: "text-error underline decoration-[3px] underline-offset-[6px] decoration-[color:var(--error)]",
};

export function TypingSurface({ text, progress }: { text: string; progress: LineProgress }) {
  const chars = useMemo(() => displayLine(text, progress), [text, progress]);
  const chunks = useMemo(() => chunk(chars), [chars]);

  const containerRef = useRef<HTMLDivElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [caret, setCaret] = useState<Caret | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const atEnd = progress.charIndex >= text.length;
    const target = charRefs.current[atEnd ? text.length - 1 : progress.charIndex];
    if (!target) return;

    const base = container.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    setCaret({
      x: (atEnd ? rect.right : rect.left) - base.left,
      y: rect.top - base.top,
      height: rect.height,
    });
  }, [progress.charIndex, text.length]);

  useLayoutEffect(measure, [measure]);

  // The line rewraps on resize, which moves every character under the caret.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className="border-edge bg-panel border-2 px-9 py-8">
      <div
        ref={containerRef}
        className="relative font-medium"
        style={{
          fontSize: `${FONT_SIZE_PX}px`,
          lineHeight: LINE_HEIGHT,
          letterSpacing: "0.01em",
        }}
      >
        {chunks.map((group) => (
          // inline-block keeps a word from breaking mid-way; pre keeps its space.
          <span key={group.start} className="inline-block whitespace-pre">
            {group.chars.map((char, i) => {
              const index = group.start + i;
              return (
                <span
                  key={index}
                  ref={(el) => {
                    charRefs.current[index] = el;
                  }}
                  className={STATE_CLASS[char.state]}
                >
                  {char.char}
                </span>
              );
            })}
          </span>
        ))}

        {caret && (
          <span
            aria-hidden
            className="bg-momentum pointer-events-none absolute top-0 left-0 w-[3px] transition-transform duration-75 ease-out"
            style={{
              height: `${caret.height}px`,
              transform: `translate(${caret.x}px, ${caret.y}px)`,
            }}
          />
        )}
      </div>
    </div>
  );
}

"use client";

/**
 * The dev tuning panel from SPEC §7.2 — live-edit the damage constants without
 * a reload. Values start at DEFAULT_TUNING and are passed explicitly into the
 * damage math, so nothing in `packages/game` has to become mutable to support
 * this. Toggle with the backtick key.
 */

import { DEFAULT_TUNING, type Tuning } from "@typefeud/game";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface TuningStore {
  tuning: Tuning;
  set: (path: TuningPath, value: number) => void;
  reset: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TuningContext = createContext<TuningStore | null>(null);

export function useTuning(): TuningStore {
  const store = useContext(TuningContext);
  if (!store) throw new Error("useTuning must be used inside <TuningProvider>");
  return store;
}

type TuningPath =
  | Exclude<keyof Tuning, "tierBaseDamage">
  | `tierBaseDamage.${keyof Tuning["tierBaseDamage"]}`;

const FIELDS: { path: TuningPath; label: string; step: number }[] = [
  { path: "tierBaseDamage.jab", label: "base · jab", step: 1 },
  { path: "tierBaseDamage.combo", label: "base · combo", step: 1 },
  { path: "tierBaseDamage.haymaker", label: "base · haymaker", step: 1 },
  { path: "errorDamagePenalty", label: "error penalty", step: 0.01 },
  { path: "accuracyMultFloor", label: "accuracy floor", step: 0.05 },
  { path: "selfDamagePerError", label: "self damage / error", step: 1 },
  { path: "parWpm", label: "par wpm", step: 1 },
  { path: "speedMultMin", label: "speed mult min", step: 0.05 },
  { path: "speedMultMax", label: "speed mult max", step: 0.05 },
  { path: "specialDamageMult", label: "special mult", step: 0.1 },
  { path: "momentumChargesForSpecial", label: "charges / special", step: 1 },
];

function read(tuning: Tuning, path: TuningPath): number {
  if (path.startsWith("tierBaseDamage.")) {
    const tier = path.slice("tierBaseDamage.".length) as keyof Tuning["tierBaseDamage"];
    return tuning.tierBaseDamage[tier];
  }
  return tuning[path as Exclude<keyof Tuning, "tierBaseDamage">];
}

function write(tuning: Tuning, path: TuningPath, value: number): Tuning {
  if (path.startsWith("tierBaseDamage.")) {
    const tier = path.slice("tierBaseDamage.".length) as keyof Tuning["tierBaseDamage"];
    return { ...tuning, tierBaseDamage: { ...tuning.tierBaseDamage, [tier]: value } };
  }
  return { ...tuning, [path]: value };
}

export function TuningProvider({
  children,
  initiallyOpen = false,
}: {
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [tuning, setTuning] = useState<Tuning>(DEFAULT_TUNING);
  const [open, setOpen] = useState(initiallyOpen);

  const set = useCallback((path: TuningPath, value: number) => {
    setTuning((current) => write(current, path, value));
  }, []);
  const reset = useCallback(() => setTuning(DEFAULT_TUNING), []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "`") return;
      ev.preventDefault();
      setOpen((wasOpen) => !wasOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const store = useMemo(
    () => ({ tuning, set, reset, open, setOpen }),
    [tuning, set, reset, open],
  );

  return <TuningContext.Provider value={store}>{children}</TuningContext.Provider>;
}

export function TuningPanel() {
  const { tuning, set, reset, open, setOpen } = useTuning();
  if (!open) return null;

  return (
    <aside className="border-edge bg-panel fixed top-6 right-6 z-50 w-72 border-2 p-4 text-xs">
      <header className="mb-3 flex items-baseline justify-between">
        <span className="text-momentum font-extrabold tracking-[0.18em]">TUNING</span>
        <span className="text-muted">SPEC §2.5</span>
      </header>

      <div className="flex flex-col gap-2">
        {FIELDS.map((field) => (
          <label key={field.path} className="flex items-center justify-between gap-3">
            <span className="text-muted">{field.label}</span>
            <input
              type="number"
              step={field.step}
              value={read(tuning, field.path)}
              onChange={(ev) => set(field.path, Number(ev.target.value))}
              onKeyDown={(ev) => ev.stopPropagation()}
              className="border-edge-soft bg-ground text-text w-20 border-2 px-2 py-1 text-right"
            />
          </label>
        ))}
      </div>

      <footer className="text-muted mt-4 flex items-center justify-between">
        <button type="button" onClick={reset} className="text-momentum underline">
          reset
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          close &#96;
        </button>
      </footer>
    </aside>
  );
}

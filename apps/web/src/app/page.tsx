export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-mono text-4xl font-bold tracking-tight">TypeFeud</h1>
      <p className="max-w-md text-sm opacity-70">
        Scaffold only. Milestone 1 (Feel) builds the typing surface here: one prompt,
        correctness tracking, WPM, backspace cost, damage on error. Ugly is fine.
      </p>
      <p className="max-w-md text-xs opacity-50">
        Exit criterion: typing feels good. See SPEC.md §8.
      </p>
    </main>
  );
}

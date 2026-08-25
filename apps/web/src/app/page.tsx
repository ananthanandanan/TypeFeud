import { TypingStage } from "@/components/typing-stage";
import { parseDevFlags } from "@/dev/flags";
import { TuningProvider } from "@/dev/tuning";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const flags = parseDevFlags(await searchParams);

  return (
    <TuningProvider initiallyOpen={flags.tuning}>
      <TypingStage flags={flags} />
    </TuningProvider>
  );
}

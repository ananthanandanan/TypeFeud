import { MatchStage } from "@/components/match-stage";
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
      <MatchStage flags={flags} />
    </TuningProvider>
  );
}

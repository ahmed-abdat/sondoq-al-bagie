import { PublicCacheSeed } from "@/components/app/cache-seed";
import { heroData } from "@/components/app/page-data";
import { AppShell } from "@/components/app/shell";
import * as src from "@/components/app/source";

// Public tabs: open to everyone, no login. Data is the same for every visitor (cached 60 s).
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const [hero, summary] = await Promise.all([heroData(), src.fundSummary()]);
  return (
    <AppShell hero={hero}>
      <PublicCacheSeed summary={summary} fetchedAt={Date.now()} />
      {children}
    </AppShell>
  );
}

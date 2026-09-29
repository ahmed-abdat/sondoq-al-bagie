import { PublicCacheSeed } from "@/components/app/cache-seed";
import * as src from "@/components/app/source";

// Public tabs: open to everyone, no login. Data is the same for every visitor (cached 60 s).
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const summary = await src.fundSummary();
  return (
    <>
      <PublicCacheSeed summary={summary} fetchedAt={src.today().getTime()} />
      {children}
    </>
  );
}

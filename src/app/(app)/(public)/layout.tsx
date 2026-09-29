import { PublicCacheSeed } from "@/components/app/cache-seed";
import * as src from "@/components/app/source";

// Public tabs: open to everyone, no login. Data is the same for every visitor (cached 60 s).
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  // amount-free (money privacy): only counts and dates go into the phone's saved cache
  const stats = await src.fundStats();
  return (
    <>
      <PublicCacheSeed stats={stats} fetchedAt={src.today().getTime()} />
      {children}
    </>
  );
}

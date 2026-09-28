import { AppShell } from "@/components/app/shell";
import { heroData } from "@/components/app/page-data";

// Public tabs: open to everyone, no login. Data is the same for every visitor (cached 60 s).
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  return <AppShell hero={await heroData()}>{children}</AppShell>;
}

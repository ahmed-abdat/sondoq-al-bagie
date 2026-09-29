import { heroData } from "@/components/app/page-data";
import { AppShell } from "@/components/app/shell";

// One frame for every tab (public and committee): the nav, its pill and the desktop aside stay
// mounted when moving to or from «اللجنة», so the pill slides instead of the page being rebuilt.
// Only public, cached data here: anything per-user would make the public pages dynamic.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell hero={await heroData()}>{children}</AppShell>;
}

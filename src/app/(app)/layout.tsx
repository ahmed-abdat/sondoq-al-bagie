import { AppShell } from "@/components/app/shell";

// One frame for the committee pages: the nav and its pill stay mounted between tabs.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { prefetchWorkspace } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Local session read — no network round-trip before the first screen paints.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  // Starts the workspace read before the screen mounts, without blocking navigation.
  loader: ({ context }) => {
    void prefetchWorkspace(context.queryClient);
  },

  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

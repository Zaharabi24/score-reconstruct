import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEMO_MODE, listPersonas, loadWorkspace, personaFromRequest, resolveActor } from "./kpi.server";

/** Everything the active persona may see: people, KPIs, scores, evidence and audit history. */
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveActor(context.userId, personaFromRequest());
    const workspace = await loadWorkspace(actor);
    return { ...workspace, personas: DEMO_MODE ? await listPersonas() : [] };
  });

/** Re-runs the seed so a demo can be replayed from a clean, fully populated state. */
export const resetDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    if (!DEMO_MODE) throw new Error("Demo mode is disabled");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (
      supabaseAdmin as unknown as { rpc: (fn: string) => Promise<{ error: { message: string } | null }> }
    ).rpc("reset_demo_data");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Demo mode only: makes sure the shared presenter account exists and returns its
 * credentials so the browser can start a real Supabase session for it.
 * The account only ever sees seeded demo data.
 */
export const ensureDemoAccount = createServerFn({ method: "POST" }).handler(async () => {
  if (!DEMO_MODE) throw new Error("Demo mode is disabled");
  const email = "demo@anwarkpiflow.demo";
  const password = "Demo@2026";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => u.email === email);
  if (!existing) {
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "KPIFlow Demo" },
    });
    if (error) throw new Error(error.message);
  } else {
    await supabaseAdmin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  }
  return { email, password };
});

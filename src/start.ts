import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { getPersonaId, PERSONA_HEADER } from "./lib/demo";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Demo mode: tells the server which seeded persona the presenter is viewing as.
const attachDemoPersona = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const personaId = getPersonaId();
  return next(personaId ? { headers: { [PERSONA_HEADER]: personaId } } : {});
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, attachDemoPersona],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));

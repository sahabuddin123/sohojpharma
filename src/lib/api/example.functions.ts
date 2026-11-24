import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";
import { requireAppAdmin } from "@/lib/api/middleware/require-app-admin";

// Example createServerFn. Restricted to platform app-admins because an
// unauthenticated createServerFn is a public endpoint on the published site.
// Server-side handler invoked from the client:
//   const result = await getGreeting({ data: { name: "Ada" } })

export const getGreeting = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator(z.object({ name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const config = getServerConfig();
    return {
      greeting: `Hello, ${data.name}!`,
      mode: config.nodeEnv ?? "unknown",
    };
  });

import { createAuthClient } from "better-auth/react";

// Browser-side auth client. Talks to /api/auth on the same origin and holds
// no secrets.
export const authClient = createAuthClient();

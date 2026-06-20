// Browser-side Better Auth client. Empty config = same-origin baseURL inferred from
// the page. Google OAuth is the only sign-in method (email/password is disabled server-side).
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({});

export const { signIn, signOut, useSession } = authClient;

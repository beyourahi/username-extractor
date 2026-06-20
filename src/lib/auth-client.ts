// Browser-side Better Auth client. Same-origin baseURL is inferred from the page.
// `basePath` MUST mirror the server (auth.ts) — auth routes live under /auth, not the
// default /api/auth — so every client call (/auth/sign-in/social, /auth/sign-out,
// /auth/get-session) hits the handler the svelteKitHandler dispatches. Google OAuth is
// the only sign-in method (email/password is disabled server-side).
import { createAuthClient } from "better-auth/svelte";
import { oneTapClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { env } from "$env/dynamic/public";

// Browser-exposed Google OAuth client id (non-secret) for One Tap. Empty where it isn't
// configured → One Tap is simply never triggered (the login page guards on this value).
const googleClientId = env.PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const authClient = createAuthClient({
    basePath: "/auth",
    plugins: [
        // Passkey / WebAuthn — device biometrics (Face ID / Touch ID / fingerprint) + security keys.
        passkeyClient(),
        // Google One Tap. Initialized with the public client id; harmless when empty since the
        // prompt is only ever triggered explicitly from the login page.
        oneTapClient({
            clientId: googleClientId,
            autoSelect: false,
            cancelOnTapOutside: true,
            context: "signin",
            promptOptions: { baseDelay: 1000, maxAttempts: 3 }
        })
    ]
});

export const { signIn, signOut, useSession } = authClient;

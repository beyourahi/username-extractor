import type { Handle } from "@sveltejs/kit";

/**
 * Cloudflare Access JWT verification.
 *
 * Phase 0: stub. event.locals.userId is hardcoded to a dev user so the rest of the
 * app can be built without Access in front. Phase 5 wires real JWT verification
 * against the Access certs endpoint (see PRD §Security NFR-7).
 */
export const handle: Handle = async ({ event, resolve }) => {
    event.locals.userId = "dev-user";
    event.locals.userEmail = "dev@local";
    return resolve(event);
};

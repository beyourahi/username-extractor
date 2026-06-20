import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// Already authenticated → bounce to the app. The hooks gate lets /login through unauthenticated.
export const load: PageServerLoad = async ({ locals }) => {
    if (locals.userId) {
        redirect(303, "/");
    }
    return {};
};

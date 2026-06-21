/**
 * User-facing help strings for Cloudflare connection failures. Kept out of the
 * route/UI code so the wording is consistent across the settings form and the
 * per-item error surfaced in job results.
 */

import { CfInferenceError } from "./run-rest";

/** Step-by-step the user can follow to mint the right token. Shown on auth failures. */
export const CF_TOKEN_HELP =
    "Create an API token at dash.cloudflare.com/profile/api-tokens → Create Custom Token, " +
    'with the permission "Account → Workers AI → Read". ' +
    "Then paste it here along with your Account ID (right sidebar of any account page).";

/** Maps a thrown error to a short, user-readable settings-form message. */
export function describeCloudflareError(err: unknown): string {
    if (err instanceof CfInferenceError) {
        switch (err.kind) {
            case "auth":
                return `Your token was rejected. ${CF_TOKEN_HELP}`;
            case "rate_limit":
                return "Cloudflare is busy right now. Try again in a moment.";
            case "model_unavailable":
                return "That model isn't available on your account. Pick another from the list.";
            default:
                return "Couldn't reach Cloudflare. Check your Account ID and try again.";
        }
    }
    return err instanceof Error ? err.message : "Something went wrong checking your Cloudflare connection.";
}

/** Per-item failure message recorded on a job item when inference fails for CF reasons. */
export function itemErrorForCfError(err: CfInferenceError, model: string): string {
    switch (err.kind) {
        case "auth":
            return "Your Cloudflare token was rejected — reconnect your account in Settings.";
        case "model_unavailable":
            return `The model ${model} isn't available on your account — pick another in Settings.`;
        case "rate_limit":
            return "Cloudflare is busy or you've hit your AI usage limit.";
        default:
            return "Something went wrong running the AI.";
    }
}

import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess({ script: true }),
    kit: {
        adapter: adapter({
            routes: {
                include: ["/*"],
                exclude: ["<all>"]
            }
        }),
        csrf: {
            trustedOrigins: [
                "http://localhost:5173",
                "http://localhost:8787",
                "https://username-extractor.dropoutstudio.co"
            ]
        }
    }
};

export default config;

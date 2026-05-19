import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import devtoolsJson from "vite-plugin-devtools-json";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
    test: {
        environment: "node",
        include: ["src/**/*.{test,spec}.ts"],
        exclude: ["node_modules", ".svelte-kit", "build"]
    }
});

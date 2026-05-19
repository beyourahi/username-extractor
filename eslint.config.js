import prettier from "eslint-config-prettier";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

export default ts.config(
    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs.recommended,
    prettier,
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
        }
    },
    {
        files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
        languageOptions: {
            parserOptions: {
                parser: ts.parser
            }
        },
        rules: {
            "svelte/no-navigation-without-resolve": "off"
        }
    },
    {
        ignores: [
            "build/",
            ".svelte-kit/",
            ".wrangler/",
            "dist/",
            "migrations/",
            "node_modules/",
            "scripts/",
            "worker-configuration.d.ts"
        ]
    }
);

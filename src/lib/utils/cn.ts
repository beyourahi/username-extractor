import clsx, { type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// twMerge taught the Dropout custom type scale so a class list mixing a custom
// text-* SIZE with a text-* COLOR keeps both — otherwise they collapse into one
// text-* group and the loser is dropped (the white-on-white button bug). Mirrors
// src/lib/ds/utils.ts; keep the list in sync with --text-* in ds/styles/tokens.css.
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            "font-size": [
                {
                    text: [
                        "micro",
                        "caption",
                        "label",
                        "body",
                        "body-lg",
                        "button",
                        "lead",
                        "subtitle",
                        "title-sm",
                        "title",
                        "title-lg",
                        "display"
                    ]
                }
            ]
        }
    }
});

/** Compose Tailwind classes, deduping conflicts. */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

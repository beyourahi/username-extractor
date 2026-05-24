<script lang="ts">
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils/cn";

    type Variant = "outline" | "ghost" | "destructive" | "brand" | "soft";
    type Size = "sm" | "default" | "lg" | "icon" | "icon-sm";

    let {
        variant = "outline",
        size = "default",
        type = "button",
        class: className = "",
        children,
        disabled = false,
        href,
        onclick,
        title,
        "aria-label": ariaLabel,
        ...rest
    }: {
        variant?: Variant;
        size?: Size;
        type?: "button" | "submit" | "reset";
        class?: string;
        children: Snippet;
        disabled?: boolean;
        href?: string;
        onclick?: (e: MouseEvent) => void;
        title?: string;
        "aria-label"?: string;
        [k: string]: unknown;
    } = $props();

    const base =
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium sleek disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

    const variants: Record<Variant, string> = {
        outline: "border border-border-strong bg-transparent text-zinc-200 hover:bg-secondary hover:text-white",
        ghost: "text-zinc-300 hover:bg-secondary hover:text-white",
        destructive: "bg-destructive text-white hover:bg-[hsl(0_62%_45%)]",
        brand: "bg-brand text-white hover:bg-[hsl(160_84%_34%)]",
        soft: "bg-secondary text-white hover:bg-[hsl(240_4%_22%)]"
    };

    const sizes: Record<Size, string> = {
        sm: "h-8 px-3 text-xs",
        default: "h-9 px-4",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7"
    };
</script>

{#if href}
    <a
        {href}
        class={cn(base, variants[variant], sizes[size], className)}
        title={title ?? undefined}
        aria-label={ariaLabel ?? undefined}
        {...rest}
    >
        {@render children()}
    </a>
{:else}
    <button
        {type}
        class={cn(base, variants[variant], sizes[size], className)}
        {disabled}
        {onclick}
        title={title ?? undefined}
        aria-label={ariaLabel ?? undefined}
        {...rest}
    >
        {@render children()}
    </button>
{/if}

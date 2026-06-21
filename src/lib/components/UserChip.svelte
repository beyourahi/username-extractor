<script lang="ts">
    import { Power } from "@lucide/svelte";

    let {
        email,
        onSignOut
    }: {
        email: string;
        onSignOut?: () => void;
    } = $props();

    let expanded = $state(false);
    let tooltip = $state(false);

    const name = $derived(email.split("@")[0] ?? email);
    const initials = $derived(
        name
            .split(/[._-]/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? "")
            .join("") ||
            email[0]?.toUpperCase() ||
            "?"
    );
</script>

<div class="flex items-center gap-2">
    <div
        class="group relative flex items-center"
        onmouseenter={() => (expanded = true)}
        onmouseleave={() => (expanded = false)}
        role="group"
    >
        <div
            tabindex="0"
            onfocus={() => (expanded = true)}
            onblur={() => (expanded = false)}
            class="sleek border-hair bg-card text-foreground relative z-10 flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center overflow-hidden rounded-full border text-sm font-semibold backdrop-blur-sm"
            aria-label={email}
            role="button"
        >
            <span class="text-caption font-mono font-semibold">{initials}</span>
        </div>
        <div
            class="border-hair bg-card absolute right-0 flex h-9 items-center overflow-hidden rounded-full border whitespace-nowrap backdrop-blur-sm transition-all duration-300 {expanded
                ? 'w-auto pr-11 pl-3 opacity-100'
                : 'w-0 pr-0 pl-0 opacity-0'}"
        >
            <div class="flex flex-col justify-center">
                <span class="text-foreground text-caption leading-tight font-medium">{name}</span>
                <span class="text-ink-muted text-micro leading-tight">{email}</span>
            </div>
        </div>
    </div>
    <div class="relative">
        <button
            type="button"
            onclick={onSignOut}
            onmouseenter={() => (tooltip = true)}
            onmouseleave={() => (tooltip = false)}
            aria-label="Sign out"
            class="sleek border-tier-failed-border bg-tier-failed-bg hover:bg-tier-failed group flex h-9 w-9 cursor-pointer touch-manipulation items-center justify-center rounded-full border backdrop-blur-sm"
        >
            <Power size={15} class="sleek text-tier-failed-fg group-hover:text-background" />
        </button>
        {#if tooltip}
            <div
                class="bg-secondary text-foreground absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shadow-lg"
            >
                Sign out
            </div>
        {/if}
    </div>
</div>

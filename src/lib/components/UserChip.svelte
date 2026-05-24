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
            class="sleek border-border-strong bg-card relative z-10 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border text-sm font-semibold text-zinc-300 backdrop-blur-sm"
            aria-label={email}
            role="button"
        >
            <span class="font-mono text-[11px] font-semibold">{initials}</span>
        </div>
        <div
            class="border-border-strong bg-card absolute right-0 flex h-9 items-center overflow-hidden rounded-full border whitespace-nowrap backdrop-blur-sm transition-all duration-300 {expanded
                ? 'w-auto pr-11 pl-3 opacity-100'
                : 'w-0 pr-0 pl-0 opacity-0'}"
        >
            <div class="flex flex-col justify-center">
                <span class="text-xs leading-tight font-medium text-zinc-200">{name}</span>
                <span class="text-[10px] leading-tight text-zinc-500">{email}</span>
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
            class="sleek group flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border backdrop-blur-sm hover:bg-[hsl(0_62%_50%)]"
            style="background: hsl(0 62% 50% / 0.10); border-color: hsl(0 62% 50% / 0.40);"
        >
            <Power size={15} class="sleek text-[hsl(0_70%_72%)] group-hover:text-white" />
        </button>
        {#if tooltip}
            <div
                class="bg-secondary absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-zinc-200 shadow-lg"
            >
                Sign out
            </div>
        {/if}
    </div>
</div>

<!--
    Global top bar. Matches the sibling tools' chrome: no logo/wordmark, icon-only controls,
    labels revealed on hover. Because this is a multi-route app (unlike the single-page siblings),
    it keeps a primary nav — rendered as icon-only links (Extract / Jobs / Leads) with a tooltip on
    hover (desktop) or a dropdown menu (mobile). Account controls live in the sibling-parity
    <User> cluster (avatar + Settings + Sign out); signed-out visitors get a Sign-in pill instead.
-->
<script lang="ts">
    import { Upload, Layers, Users as UsersIcon, ChevronDown, LogIn } from "@lucide/svelte";
    import User from "./User.svelte";
    import { cn } from "$lib/utils/cn";

    let {
        currentPath = "/",
        user
    }: {
        currentPath?: string;
        user?: { name: string; email: string; image?: string | null } | null;
    } = $props();

    const items = [
        { href: "/", id: "upload", label: "Extract", icon: Upload },
        { href: "/jobs", id: "jobs", label: "Jobs", icon: Layers },
        { href: "/leads", id: "leads", label: "Leads", icon: UsersIcon }
    ];

    function isActive(href: string): boolean {
        if (href === "/") return currentPath === "/";
        return currentPath.startsWith(href);
    }

    let mobileOpen = $state(false);
</script>

<header class="border-hair bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur-md">
    <div class="mx-auto flex h-14 w-full max-w-[var(--content-max)] items-center gap-3 px-[var(--content-x)]">
        <nav class="hidden items-center gap-1 md:flex" aria-label="Primary">
            {#each items as item (item.id)}
                {@const Active = isActive(item.href)}
                {@const Ic = item.icon}
                <a
                    href={item.href}
                    aria-label={item.label}
                    aria-current={Active ? "page" : undefined}
                    class={cn(
                        "sleek group relative flex h-9 w-9 touch-manipulation items-center justify-center rounded-full",
                        Active ? "bg-ink-2 text-foreground" : "text-ink-muted hover:bg-ink-2 hover:text-foreground"
                    )}
                >
                    <Ic size={16} />
                    <span
                        class="bg-secondary text-foreground pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                    >
                        {item.label}
                    </span>
                </a>
            {/each}
        </nav>

        <div class="ml-auto flex items-center gap-2">
            <div class="md:hidden">
                <div class="relative">
                    <button
                        type="button"
                        onclick={() => (mobileOpen = !mobileOpen)}
                        class="sleek border-hair bg-card text-ink-muted hover:border-signal hover:text-foreground flex h-9 w-9 touch-manipulation items-center justify-center rounded-full border"
                        aria-label="Open navigation"
                        aria-expanded={mobileOpen}
                    >
                        <ChevronDown size={16} />
                    </button>
                    {#if mobileOpen}
                        <button
                            type="button"
                            aria-label="Close menu"
                            class="fixed inset-0 z-30"
                            onclick={() => (mobileOpen = false)}
                        ></button>
                        <div
                            class="fade-in border-hair bg-card absolute top-11 right-0 z-40 w-44 max-w-[calc(100vw-2rem)] rounded-lg border p-1 shadow-lg"
                        >
                            {#each items as item (item.id)}
                                {@const Active = isActive(item.href)}
                                {@const Ic = item.icon}
                                <a
                                    href={item.href}
                                    onclick={() => (mobileOpen = false)}
                                    class={cn(
                                        "flex w-full touch-manipulation items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                                        Active
                                            ? "bg-ink-2 text-foreground"
                                            : "text-ink-muted hover:bg-ink-2 hover:text-foreground"
                                    )}
                                >
                                    <Ic size={14} />
                                    {item.label}
                                </a>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

            {#if user}
                <User {user} />
            {:else}
                <a
                    href="/login"
                    class="sleek border-hair bg-card text-foreground hover:border-signal flex h-9 touch-manipulation items-center gap-2 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap backdrop-blur-sm"
                >
                    <LogIn size={14} class="text-ink-muted" aria-hidden="true" />
                    <span>Sign in</span>
                </a>
            {/if}
        </div>
    </div>
</header>

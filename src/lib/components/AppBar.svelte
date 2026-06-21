<script lang="ts">
    import {
        Upload,
        Layers,
        Users as UsersIcon,
        Settings as SettingsIcon,
        ChevronDown,
        Search,
        LogIn
    } from "@lucide/svelte";
    import UserChip from "./UserChip.svelte";
    import { signOut as authSignOut } from "$lib/auth-client";
    import { cn } from "$lib/utils/cn";

    let {
        currentPath = "/",
        userEmail
    }: {
        currentPath?: string;
        userEmail?: string | null;
    } = $props();

    const items = [
        { href: "/", id: "upload", label: "Extract", icon: Upload },
        { href: "/jobs", id: "jobs", label: "Jobs", icon: Layers },
        { href: "/leads", id: "leads", label: "Leads", icon: UsersIcon },
        { href: "/settings", id: "settings", label: "Settings", icon: SettingsIcon }
    ];

    function isActive(href: string): boolean {
        if (href === "/") return currentPath === "/";
        return currentPath.startsWith(href);
    }

    let mobileOpen = $state(false);

    async function signOut() {
        // Better Auth sign-out, then back to the login screen.
        if (typeof window === "undefined") return;
        try {
            await authSignOut();
        } catch {
            // ignore — redirect to /login regardless so the user lands somewhere sane
        }
        window.location.href = "/login";
    }
</script>

<header class="border-hair bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur-md">
    <div class="mx-auto flex h-14 w-full max-w-[var(--content-max)] items-center gap-3 px-[var(--content-x)]">
        <a
            href="/"
            class="sleek flex shrink-0 touch-manipulation items-center gap-2 rounded-lg px-1.5 py-1 hover:opacity-80"
            aria-label="Username Extractor home"
        >
            <Search size={16} class="text-brand" />
            <span class="text-foreground text-sm font-semibold tracking-tight whitespace-nowrap"
                >Username Extractor</span
            >
        </a>

        <nav class="ml-2 hidden items-center gap-1 md:flex" aria-label="Primary">
            {#each items as item (item.id)}
                {@const Active = isActive(item.href)}
                {@const Ic = item.icon}
                <a
                    href={item.href}
                    class={cn(
                        "sleek inline-flex h-8 touch-manipulation items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap",
                        Active ? "bg-ink-2 text-foreground" : "text-ink-muted hover:text-foreground"
                    )}
                    aria-current={Active ? "page" : undefined}
                >
                    <Ic size={13} />
                    {item.label}
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

            {#if userEmail}
                <UserChip email={userEmail} onSignOut={signOut} />
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

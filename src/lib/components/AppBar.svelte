<script lang="ts">
    import { Upload, Layers, Users as UsersIcon, Settings as SettingsIcon, ChevronDown, Search } from "@lucide/svelte";
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

<header
    class="border-border sticky top-0 z-40 w-full border-b backdrop-blur-md"
    style="background: hsl(0 0% 5.9% / 0.78);"
>
    <div class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <a
            href="/"
            class="sleek flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 hover:opacity-80"
            aria-label="Username Extractor home"
        >
            <Search size={16} class="text-brand" />
            <span class="text-sm font-black tracking-tight whitespace-nowrap text-white">Username Extractor</span>
        </a>

        <nav class="ml-2 hidden items-center gap-1 md:flex" aria-label="Primary">
            {#each items as item (item.id)}
                {@const Active = isActive(item.href)}
                {@const Ic = item.icon}
                <a
                    href={item.href}
                    class={cn(
                        "sleek inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                        Active ? "text-white" : "text-zinc-400 hover:text-white"
                    )}
                    style={Active ? "background: var(--secondary);" : undefined}
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
                        class="sleek border-border-strong bg-card flex h-9 w-9 items-center justify-center rounded-full border"
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
                            class="border-border-strong bg-card fade-in absolute top-11 right-0 z-40 w-44 rounded-lg border p-1 shadow-xl"
                        >
                            {#each items as item (item.id)}
                                {@const Active = isActive(item.href)}
                                {@const Ic = item.icon}
                                <a
                                    href={item.href}
                                    onclick={() => (mobileOpen = false)}
                                    class={cn(
                                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                                        Active ? "text-white" : "text-zinc-300 hover:text-white"
                                    )}
                                    style={Active ? "background: var(--secondary);" : undefined}
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
            {/if}
        </div>
    </div>
</header>

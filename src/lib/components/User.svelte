<!--
    Signed-in account cluster for the AppBar. An inline (non-fixed) adaptation of the sibling
    tools' (day-zero / order-processor / invoice-generator) `User.svelte`: an icon-only avatar
    that reveals the name/email on hover via an expanding pill (desktop, sm+) or opens a Dialog
    (mobile, <sm), beside Settings and Sign-out icon buttons with hover tooltips. Shows the user's
    profile picture when available, falling back to the same user-silhouette glyph the siblings use
    (NOT initials). Visuals match the siblings; positioning is inline because this lives inside the
    sticky AppBar rather than as a fixed floating widget (and there is no AI copilot rail here).
-->
<script lang="ts">
    import { Dialog } from "bits-ui";
    import { signOut as authSignOut } from "$lib/auth-client";
    import { cn } from "$lib/utils/cn";
    import { Settings, LogOut } from "@lucide/svelte";
    import Eyebrow from "./Eyebrow.svelte";

    let {
        user
    }: {
        user: { name: string; email: string; image?: string | null };
    } = $props();

    let isLoggingOut = $state(false);
    let expanded = $state(false);
    let mobileOpen = $state(false);

    // Better Auth may leave `name` blank; fall back to the email's local part so the pill
    // and dialog never render an empty line.
    const displayName = $derived(user.name?.trim() || (user.email.split("@")[0] ?? user.email));

    async function handleLogout() {
        // Full reload to /login (not goto) so the auth-derived layout data is re-fetched
        // and no signed-in chrome lingers — matches the AppBar's prior sign-out behavior.
        if (typeof window === "undefined") return;
        isLoggingOut = true;
        try {
            await authSignOut();
        } catch {
            // ignore — redirect regardless so the user lands somewhere sane
        }
        mobileOpen = false;
        window.location.href = "/login";
    }
</script>

{#snippet avatarVisual(sizeClass: string, iconClass: string)}
    <div
        class={cn(
            "sleek border-hair bg-card text-foreground relative flex shrink-0 items-center justify-center rounded-full border text-sm font-semibold backdrop-blur-sm",
            sizeClass,
            user.image && "overflow-hidden p-0"
        )}
    >
        {#if user.image}
            <img src={user.image} alt={displayName} class="h-full w-full object-cover" referrerpolicy="no-referrer" />
        {:else}
            <svg
                class={iconClass}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        {/if}
    </div>
{/snippet}

<!-- Mobile (<sm): tap avatar -> dialog -->
<div class="sm:hidden">
    <Dialog.Root open={mobileOpen} onOpenChange={(v) => (mobileOpen = v)}>
        <Dialog.Trigger
            aria-label="User menu"
            class="focus-visible:outline-signal touch-manipulation rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        >
            {@render avatarVisual("h-9 w-9", "h-[1.125rem] w-[1.125rem]")}
        </Dialog.Trigger>
        <Dialog.Portal>
            <Dialog.Overlay class="fade-in bg-background/60 fixed inset-0 z-50" style="backdrop-filter: blur(6px);" />
            <Dialog.Content
                class="border-hair bg-card slide-in fixed top-1/2 left-1/2 z-50 flex w-[min(90vw,360px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 rounded-lg border shadow-xl"
            >
                <Dialog.Title class="border-hair border-b px-4 py-3.5">
                    <Eyebrow>Signed in</Eyebrow>
                </Dialog.Title>
                <div class="flex items-center gap-3 px-4 py-4">
                    {@render avatarVisual("h-12 w-12", "h-6 w-6")}
                    <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium">{displayName}</p>
                        <p class="text-ink-muted truncate text-xs">{user.email}</p>
                    </div>
                </div>
                <div class="border-hair border-t p-1.5">
                    <a
                        href="/settings"
                        onclick={() => (mobileOpen = false)}
                        class="text-foreground hover:bg-ink-2 focus:bg-ink-2 flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-lg px-3 text-left transition-colors focus:outline-none"
                    >
                        <Settings size={16} aria-hidden="true" />
                        <span class="text-sm font-medium whitespace-nowrap">Settings</span>
                    </a>
                    <button
                        type="button"
                        onclick={handleLogout}
                        disabled={isLoggingOut}
                        class={cn(
                            "text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-lg px-3 text-left transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
                            isLoggingOut && "cursor-wait"
                        )}
                    >
                        {#if isLoggingOut}
                            <div
                                class="border-ink-muted h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                                aria-hidden="true"
                            ></div>
                        {:else}
                            <LogOut size={16} aria-hidden="true" />
                        {/if}
                        <span class="text-sm font-medium whitespace-nowrap">Sign out</span>
                    </button>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
</div>

<!-- Desktop (sm+): avatar w/ hover-expand name/email pill + Settings + Sign out icon buttons -->
<div class="hidden items-center gap-2 sm:flex">
    <div
        class="group relative flex items-center"
        role="group"
        aria-label="User profile"
        onmouseenter={() => (expanded = true)}
        onmouseleave={() => (expanded = false)}
    >
        <div class="relative z-10">
            {@render avatarVisual("h-9 w-9", "h-[1.125rem] w-[1.125rem]")}
        </div>

        <div
            class={cn(
                "border-hair bg-card sleek absolute right-0 flex h-9 items-center overflow-hidden rounded-full border whitespace-nowrap backdrop-blur-sm",
                expanded ? "w-auto pr-11 pl-3 opacity-100" : "w-0 pr-0 pl-0 opacity-0"
            )}
        >
            <div class="flex flex-col justify-center">
                <span class="text-foreground text-caption leading-tight font-medium whitespace-nowrap"
                    >{displayName}</span
                >
                <span class="text-ink-muted text-micro leading-tight whitespace-nowrap">{user.email}</span>
            </div>
        </div>
    </div>

    <a
        href="/settings"
        aria-label="Settings"
        class={cn(
            "sleek group border-hair bg-card hover:border-signal relative flex h-9 w-9 touch-manipulation items-center justify-center rounded-full border backdrop-blur-sm active:scale-95",
            "focus-visible:outline-signal focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        )}
    >
        <Settings
            class="text-ink-muted group-hover:text-foreground h-[1.125rem] w-[1.125rem] transition-colors"
            aria-hidden="true"
        />
        <span
            class="bg-secondary text-foreground pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
            Settings
        </span>
    </a>

    <button
        type="button"
        onclick={handleLogout}
        disabled={isLoggingOut}
        aria-label="Sign out"
        class={cn(
            "sleek group relative flex h-9 w-9 cursor-pointer touch-manipulation items-center justify-center rounded-full border backdrop-blur-sm",
            "focus-visible:outline-signal focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
            isLoggingOut
                ? "border-hair bg-card cursor-wait"
                : "border-hair bg-card hover:border-destructive/50 hover:bg-destructive/10 active:scale-95"
        )}
    >
        {#if isLoggingOut}
            <div
                class="border-ink-muted h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                aria-hidden="true"
            ></div>
        {:else}
            <svg
                class="text-ink-muted group-hover:text-destructive h-[1.125rem] w-[1.125rem] transition-colors"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
        {/if}
        {#if !isLoggingOut}
            <span
                class="bg-secondary text-foreground pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
                Sign out
            </span>
        {/if}
    </button>
</div>

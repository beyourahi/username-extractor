<!--
    Signed-in account cluster, rendered inline inside the invisible <Navbar>. Ported verbatim from the
    sibling tools (day-zero / invoice-generator / order-processor) so the sign-in/out chrome is identical
    across all four: mobile (<sm) taps the avatar to open a shadcn Dialog holding Settings + Sign out;
    desktop (sm+) hover-expands a name/email pill beside Settings + Sign out shadcn Tooltip icon buttons.
    Sign out runs authClient.signOut() then a full navigation to /api/logout (clears every cookie variant).
-->
<script lang="ts">
    import { authClient } from "$lib/auth-client";
    import { cn } from "$lib/utils";
    import * as Dialog from "$lib/components/ui/dialog";
    import * as Tooltip from "$lib/components/ui/tooltip";
    import { Eyebrow, IconButton } from "$lib/ds";
    import { Power, Settings, User } from "@lucide/svelte";

    interface Props {
        user: {
            email: string;
            name: string;
            image?: string | null | undefined;
        };
        currentUser: { name: string };
    }

    let { user, currentUser }: Props = $props();

    let isLoggingOut = $state(false);
    let expanded = $state(false);
    let mobileOpen = $state(false);

    const handleLogout = async () => {
        isLoggingOut = true;
        try {
            await authClient.signOut();
        } catch {
            // ignore — the /api/logout navigation below clears every cookie variant regardless
        }
        mobileOpen = false;
        // Full navigation (not goto): re-fetches a clean logged-out state AND lets the server expire
        // the cookieCache `session_data` cookie that signOut alone can leave behind.
        window.location.href = "/api/logout";
    };
</script>

{#snippet avatarVisual(sizeClass: string, iconClass: string)}
    <div
        class={cn(
            "sleek relative flex shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            "border-hair bg-card text-foreground border backdrop-blur-sm",
            sizeClass,
            user.image && "overflow-hidden p-0"
        )}
    >
        {#if user.image}
            <img src={user.image} alt={user.name} class="h-full w-full object-cover" referrerpolicy="no-referrer" />
        {:else}
            <User class={iconClass} aria-hidden="true" />
        {/if}
    </div>
{/snippet}

<div class="relative">
    <div class="sm:hidden">
        <Dialog.Root bind:open={mobileOpen}>
            <Dialog.Trigger
                aria-label="User menu"
                class="focus-visible:outline-signal rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 touch-manipulation"
            >
                {@render avatarVisual("h-9 w-9", "h-4 w-4")}
            </Dialog.Trigger>
            <Dialog.Content
                class="data-open:slide-in-from-bottom-2 data-closed:slide-out-to-bottom-1 gap-0 p-0 sm:max-w-sm"
                showCloseButton={false}
            >
                <Dialog.Header class="border-hair border-b px-4 py-3.5">
                    <Dialog.Title>
                        <Eyebrow as="span">Signed in</Eyebrow>
                    </Dialog.Title>
                </Dialog.Header>
                <div class="flex items-center gap-3 px-4 py-4">
                    {@render avatarVisual("h-12 w-12", "h-6 w-6")}
                    <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium">{currentUser.name}</p>
                        <p class="text-ink-muted truncate text-xs">{user.email}</p>
                    </div>
                </div>
                <div class="border-hair border-t p-1.5">
                    <a
                        href="/settings"
                        onclick={() => (mobileOpen = false)}
                        class="text-foreground pointer-fine:hover:bg-ink-2 focus:bg-ink-2 flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-lg px-3 text-left transition-colors focus:outline-none"
                    >
                        <Settings size={16} aria-hidden="true" />
                        <span class="text-sm font-medium whitespace-nowrap">Settings</span>
                    </a>
                    <button
                        type="button"
                        onclick={handleLogout}
                        disabled={isLoggingOut}
                        class={cn(
                            "text-destructive pointer-fine:hover:bg-destructive/10 pointer-fine:hover:text-destructive focus:bg-destructive/10 focus:text-destructive flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-lg px-3 text-left transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
                            isLoggingOut && "cursor-wait"
                        )}
                    >
                        {#if isLoggingOut}
                            <div
                                class="border-ink-muted h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                                aria-hidden="true"
                            ></div>
                        {:else}
                            <Power size={16} aria-hidden="true" />
                        {/if}
                        <span class="text-sm font-medium whitespace-nowrap">Sign out</span>
                    </button>
                </div>
            </Dialog.Content>
        </Dialog.Root>
    </div>

    <div class="hidden items-center gap-2 sm:flex">
        <div
            class="group relative flex items-center"
            role="group"
            aria-label="User profile"
            onmouseenter={() => (expanded = true)}
            onmouseleave={() => (expanded = false)}
        >
            <div class="relative z-10">
                {@render avatarVisual("h-10 w-10", "h-5 w-5")}
            </div>

            <div
                class={cn(
                    "border-hair bg-card sleek absolute right-0 flex h-10 items-center overflow-hidden rounded-full border whitespace-nowrap backdrop-blur-sm",
                    expanded ? "w-auto pr-12 pl-3 opacity-100" : "w-0 pr-0 pl-0 opacity-0"
                )}
            >
                <div class="flex flex-col justify-center">
                    <span class="text-foreground text-sm leading-tight font-medium whitespace-nowrap">
                        {currentUser.name}
                    </span>
                    <span class="text-ink-muted text-xs leading-tight whitespace-nowrap">{user.email}</span>
                </div>
            </div>
        </div>

        <Tooltip.Provider delayDuration={150}>
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <IconButton href="/settings" aria-label="Settings" {...props}>
                            <Settings
                                class="text-ink-muted pointer-fine:group-hover:text-foreground size-[1.125rem] transition-colors"
                                aria-hidden="true"
                            />
                        </IconButton>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="bottom">Settings</Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>

        <Tooltip.Provider delayDuration={150}>
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <!-- {...props} first so our onclick/disabled win (Bits tooltip injects its own onclick) -->
                        <IconButton
                            tone="destructive"
                            aria-label="Sign out"
                            class={isLoggingOut ? "cursor-wait" : ""}
                            {...props}
                            onclick={handleLogout}
                            disabled={isLoggingOut}
                        >
                            {#if isLoggingOut}
                                <div
                                    class="border-ink-muted h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                                    aria-hidden="true"
                                ></div>
                            {:else}
                                <Power
                                    class="text-ink-muted pointer-fine:group-hover:text-destructive size-[1.125rem] transition-colors"
                                    aria-hidden="true"
                                />
                            {/if}
                        </IconButton>
                    {/snippet}
                </Tooltip.Trigger>
                {#if !isLoggingOut}
                    <Tooltip.Content side="bottom">Sign out</Tooltip.Content>
                {/if}
            </Tooltip.Root>
        </Tooltip.Provider>
    </div>
</div>

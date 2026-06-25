<!--
    Signed-in account cluster, rendered inline inside the invisible <Navbar>. Ported verbatim from the
    sibling tools (day-zero / invoice-generator / order-processor) so the sign-in/out chrome is identical
    across all four: the avatar (hover-expands a name/email pill on fine pointers) sits beside Settings +
    Sign out shadcn Tooltip icon buttons, shown identically at every width — no mobile dialog.
    Sign out runs authClient.signOut() then a full navigation to /api/logout (clears every cookie variant).
-->
<script lang="ts">
    import { authClient } from "$lib/auth-client";
    import { cn } from "$lib/utils";
    import * as Tooltip from "$lib/components/ui/tooltip";
    import { IconButton } from "$lib/ds";
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

    const handleLogout = () => {
        isLoggingOut = true;
        // Fire the client sign-out best-effort, but NEVER await it: authClient.signOut() does not
        // return control on a non-2xx response (rate-limit / CSRF / transient) — it leaves the
        // promise pending, and `await` would then hang here forever, so the redirect below never
        // runs and logout silently "does nothing". /api/logout is the authoritative logout (kills
        // the D1 session + expires every cookie variant server-side), so we redirect regardless.
        void authClient.signOut().catch(() => {});
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
    <div class="flex items-center gap-2">
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

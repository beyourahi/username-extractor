<!--
    Login screen. Single "Continue with Google" → Better Auth social OAuth (the only
    sign-in method). The $effect force-redirects if a session is already present on mount.
    Rendered on a bare layout (no AppBar/Footer — see +layout.svelte).
-->
<script lang="ts">
    import { authClient } from "$lib/auth-client";
    import { browser } from "$app/environment";
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import HeroHeading from "$lib/components/HeroHeading.svelte";
    import { Cta, cn } from "$lib/ds";

    let loading = $state(false);
    let error = $state<string | null>(null);

    const redirectTo = $derived(page.url.searchParams.get("redirect") ?? "/");

    const session = authClient.useSession();
    $effect(() => {
        if (browser && $session.data?.user) goto(redirectTo);
    });

    async function signInGoogle() {
        loading = true;
        error = null;
        try {
            await authClient.signIn.social({ provider: "google", callbackURL: redirectTo });
        } catch {
            error = "Couldn't start Google sign-in. Please try again.";
            loading = false;
        }
    }
</script>

<svelte:head>
    <title>Sign in · Username Extractor</title>
</svelte:head>

<div class="flex grow flex-col items-center justify-center gap-8 px-4 sm:gap-10 lg:gap-12">
    <HeroHeading />

    {#if error}
        <div
            class="border-tier-failed-border bg-tier-failed-bg text-tier-failed-fg max-w-sm rounded-xl border px-4 py-2.5 text-center text-sm text-pretty"
            role="alert"
        >
            {error}
        </div>
    {/if}

    <Cta
        variant="primary"
        arrow={false}
        onclick={signInGoogle}
        disabled={loading}
        class={cn("min-w-[264px] justify-center py-[15px]", loading && "cursor-wait")}
    >
        <span class="inline-flex items-center gap-2.5">
            {#if loading}
                <span
                    class="border-background/40 size-4 animate-spin rounded-full border-2 border-t-transparent"
                    aria-hidden="true"
                ></span>
            {:else}
                <svg class="size-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                </svg>
            {/if}
            <span>Continue with Google</span>
        </span>
    </Cta>

    <p class="text-ink-muted max-w-xs text-center text-[11px] text-pretty">
        After signing in you'll connect your own Cloudflare account — extractions run on your account, billed to you.
    </p>
</div>

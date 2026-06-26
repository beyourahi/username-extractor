<script lang="ts">
    import "../app.css";
    import { Toaster } from "svelte-sonner";
    import { CloudUpload } from "@lucide/svelte";
    import { page } from "$app/state";
    import User from "$lib/components/User.svelte";
    import HeroHeading from "$lib/components/HeroHeading.svelte";
    import SectionTabs from "$lib/components/SectionTabs.svelte";
    import Footer from "$lib/components/Footer.svelte";

    let { children, data } = $props();

    const path = $derived(page.url.pathname);
    // /login drops the account chrome + first-run wizard (bare auth canvas) but KEEPS the global
    // Footer — matching the sibling tools (day-zero / invoice-generator / order-processor), which
    // render their footer on every route, login included.
    const isLogin = $derived(path === "/login");
    // The shared wordmark hero + section tabs ride the three primary routes only. Drill-downs
    // (/jobs/[id]) plus /settings and /changelog are focused views — no hero/tabs there (those
    // pages carry their own back affordance).
    const showTabs = $derived(path === "/" || path === "/jobs" || path === "/leads");
</script>

<svelte:head>
    <title>Username Extractor</title>
</svelte:head>

<Toaster richColors theme="dark" position="bottom-right" toastOptions={{ class: "font-sans text-xs" }} />

<div class="bg-background flex min-h-dvh flex-col">
    <a
        href="#main"
        class="focus:bg-card focus:text-foreground focus:outline-signal sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:inline-flex focus:items-center focus:rounded-xl focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:shadow-lg focus:outline-2 focus:outline-offset-2"
    >
        Skip to content
    </a>

    <!-- Account controls in an invisible navbar (in-flow, no bg/border) on every route except the
         bare /login canvas; the main section starts cleanly below it. -->
    {#if !isLogin}
        <header class="flex w-full items-center justify-end px-[var(--content-x)] pt-4 sm:pt-6">
            {#if data?.user}
                <User
                    user={data.user}
                    currentUser={{ name: data.user.name?.trim() || (data.user.email.split("@")[0] ?? data.user.email) }}
                />
            {:else}
                <a
                    href="/login"
                    class="sleek border-hair bg-card text-foreground group pointer-fine:hover:border-signal/50 focus-visible:outline-signal flex h-10 touch-manipulation items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap backdrop-blur-sm transition-colors ease-[var(--ease)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 motion-reduce:transition-none"
                >
                    <CloudUpload
                        class="text-ink-muted pointer-fine:group-hover:text-signal h-4 w-4 transition-colors"
                        aria-hidden="true"
                    />
                    <span class="hidden sm:inline">Sign in to sync</span>
                    <span class="sm:hidden">Sign in</span>
                </a>
            {/if}
        </header>
    {/if}

    {#if showTabs}
        <!-- Shared chrome: the wordmark hero sits on top (always), the section tabs directly
             beneath it, and the active tab's content below — the same top on all three tabs. -->
        <main
            id="main"
            tabindex="-1"
            class="flex w-full grow flex-col px-[var(--content-x)] py-16 outline-none sm:py-20"
        >
            <div class="m-auto flex w-full flex-col items-center gap-12 sm:gap-16">
                <div class="flex flex-col items-center gap-6 sm:gap-8">
                    <HeroHeading />
                    <SectionTabs />
                </div>
                {@render children()}
            </div>
        </main>
    {:else}
        <main id="main" tabindex="-1" class="flex grow flex-col outline-none">
            {@render children()}
        </main>
    {/if}

    <Footer />
</div>

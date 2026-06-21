<script lang="ts">
    import "../app.css";
    import { Toaster } from "svelte-sonner";
    import { page } from "$app/state";
    import AppBar from "$lib/components/AppBar.svelte";
    import Footer from "$lib/components/Footer.svelte";
    import FirstRunWizard from "$lib/components/FirstRunWizard.svelte";

    let { children, data } = $props();

    let showWizard = $state(false);

    $effect(() => {
        if (data?.userSettings === null && data?.userId) {
            showWizard = true;
        }
    });

    const path = $derived(page.url.pathname);
    // /login drops the AppBar + first-run wizard (bare auth canvas) but KEEPS the global
    // Footer — matching the sibling tools (day-zero / invoice-generator / order-processor),
    // which render their footer on every route, login included.
    const isLogin = $derived(path === "/login");
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
    {#if !isLogin}
        <AppBar currentPath={path} user={data?.user ?? null} />
    {/if}

    <main id="main" tabindex="-1" class="flex grow flex-col outline-none">
        {@render children()}
    </main>

    <Footer />
</div>

{#if !isLogin}
    <FirstRunWizard open={showWizard} onclose={() => (showWizard = false)} />
{/if}

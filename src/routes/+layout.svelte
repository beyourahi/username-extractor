<script lang="ts">
    import "../app.css";
    import { ModeWatcher } from "mode-watcher";
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
    // /login renders on a bare canvas — no app chrome (AppBar/Footer/wizard).
    const isLogin = $derived(path === "/login");
</script>

<svelte:head>
    <title>Username Extractor</title>
</svelte:head>

<ModeWatcher defaultMode="dark" />
<Toaster richColors theme="dark" position="bottom-right" toastOptions={{ class: "font-sans text-xs" }} />

{#if isLogin}
    <div class="bg-background flex min-h-dvh flex-col">
        <main class="flex grow flex-col">
            {@render children()}
        </main>
    </div>
{:else}
    <div class="bg-background flex min-h-dvh flex-col">
        <AppBar currentPath={path} userEmail={data?.userEmail ?? null} />

        <main class="flex grow flex-col">
            {@render children()}
        </main>

        <Footer />
    </div>

    <FirstRunWizard open={showWizard} onclose={() => (showWizard = false)} />
{/if}

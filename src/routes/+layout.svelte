<script lang="ts">
    import "../app.css";
    import { ModeWatcher } from "mode-watcher";
    import { Toaster } from "svelte-sonner";
    import { page } from "$app/state";
    import FirstRunWizard from "$lib/components/FirstRunWizard.svelte";

    let { children, data } = $props();

    let showWizard = $state(false);

    $effect(() => {
        if (data?.userSettings === null && data?.userId) {
            showWizard = true;
        }
    });

    const nav = [
        { href: "/", label: "upload" },
        { href: "/jobs", label: "jobs" },
        { href: "/leads", label: "leads" },
        { href: "/settings", label: "settings" }
    ];

    const path = $derived(page.url.pathname);

    function isActive(href: string): boolean {
        if (href === "/") return path === "/";
        return path.startsWith(href);
    }
</script>

<svelte:head>
    <title>username-extractor</title>
</svelte:head>

<ModeWatcher defaultMode="dark" />
<Toaster richColors theme="dark" toastOptions={{ class: "font-mono text-xs" }} />

<div class="flex min-h-dvh flex-col">
    <header class="border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
        <nav class="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3 font-mono">
            <a href="/" class="text-foreground cursor-pointer text-sm font-medium tracking-tight whitespace-nowrap">
                <span class="text-accent">::</span> username-extractor
            </a>
            <ul class="flex items-center gap-1 text-xs tracking-widest uppercase">
                {#each nav as item (item.href)}
                    <li>
                        <a
                            href={item.href}
                            class={`pointer-fine:hover:text-foreground cursor-pointer rounded-sm px-2 py-1 whitespace-nowrap ${
                                isActive(item.href) ? "text-foreground bg-surface" : "text-foreground-muted"
                            }`}
                        >
                            {item.label}
                        </a>
                    </li>
                {/each}
            </ul>
        </nav>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {@render children()}
    </main>

    <footer
        class="border-border text-foreground-muted/60 border-t px-6 py-3 text-center font-mono text-[10px] tracking-widest whitespace-nowrap uppercase"
    >
        forensics build · v0.1
    </footer>
</div>

<FirstRunWizard open={showWizard} onclose={() => (showWizard = false)} />

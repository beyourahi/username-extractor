<!--
    Shared section navigation, rendered once in the root layout so it persists across the three
    primary routes and the active pill SLIDES between them on client-side navigation. Visually +
    interaction-wise a port of the dropout-studio pricing tabs (a dark rounded segmented control
    with an animated white sliding-pill indicator), translated to this app's DS tokens.

    These are route LINKS (not an ARIA tablist): each "tab" is a separate SvelteKit route with its
    own server loader, so a <nav> of <a aria-current> is the correct semantic — and it preserves
    prefetch, deep-linking, and middle-click that a button+goto() would lose.
-->
<script lang="ts">
    import { page } from "$app/state";

    const tabs = [
        { href: "/", label: "Extract" },
        { href: "/jobs", label: "Jobs" },
        { href: "/leads", label: "Leads" }
    ];

    const path = $derived(page.url.pathname);
    // Mirrors AppBar's former isActive semantics: "/" exact, others by prefix (so /jobs/[id] keeps
    // Jobs lit). Math.max(0, …) guarantees the pill never disappears on an unexpected path.
    const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
    const activeIndex = $derived(
        Math.max(
            0,
            tabs.findIndex((t) => isActive(t.href))
        )
    );

    let navEl = $state<HTMLElement>();
    let indicator = $state({ x: 0, y: 0, width: 0, height: 0, ready: false });
    let rafId = 0;

    const positionIndicator = () => {
        if (!navEl) return;
        const el = navEl.querySelectorAll<HTMLElement>("[data-section-tab]")[activeIndex];
        if (!el) return;
        const c = navEl.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(navEl);
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        const bt = parseFloat(cs.borderTopWidth) || 0;
        indicator = {
            x: b.left - c.left - bl + navEl.scrollLeft,
            y: b.top - c.top - bt + navEl.scrollTop,
            width: b.width,
            height: b.height,
            ready: true
        };
    };

    const schedulePosition = () => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(positionIndicator);
    };

    // Re-runs whenever the active route changes (the layout does NOT remount between these routes,
    // so this is what makes the pill slide on navigation). Reading activeIndex + path inside the
    // guard registers both as dependencies; path is always a non-empty string so this always fires.
    $effect(() => {
        if (activeIndex >= 0 && path) schedulePosition();
    });

    // Mount-time setup + observers (effects run client-side only, mirroring onMount here).
    $effect(() => {
        positionIndicator();

        const onResize = () => schedulePosition();
        window.addEventListener("resize", onResize);
        window.addEventListener("load", schedulePosition);

        let ro: ResizeObserver | undefined;
        if (navEl && typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => schedulePosition());
            ro.observe(navEl);
        }

        if (document.fonts?.ready) document.fonts.ready.then(positionIndicator);

        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("load", schedulePosition);
            ro?.disconnect();
        };
    });
</script>

<nav
    bind:this={navEl}
    class="bg-ink-2 border-hair relative flex w-full max-w-full [scrollbar-width:none] flex-nowrap gap-[4px] overflow-x-auto rounded-full border p-[4px] [-ms-overflow-style:none] sm:w-fit [&::-webkit-scrollbar]:hidden"
    aria-label="Sections"
>
    <span
        aria-hidden="true"
        class="bg-signal pointer-events-none absolute top-0 left-0 z-0 rounded-full will-change-transform motion-reduce:transition-none"
        style:width="{indicator.width}px"
        style:height="{indicator.height}px"
        style:opacity={indicator.ready ? "1" : "0"}
        style:transform="translate3d({indicator.x}px,{indicator.y}px,0)"
        style:transition="transform 0.5s var(--ease), width 0.5s var(--ease), height 0.5s var(--ease)"
    ></span>
    {#each tabs as tab (tab.href)}
        {@const active = isActive(tab.href)}
        <a
            data-section-tab
            href={tab.href}
            aria-current={active ? "page" : undefined}
            class="text-caption relative z-[1] flex min-h-[40px] flex-1 items-center justify-center rounded-full px-[16px] py-[10px] font-mono whitespace-nowrap uppercase transition-colors duration-[350ms] ease-[var(--ease)] max-[720px]:min-h-[44px] max-[360px]:px-[12px] sm:flex-none sm:px-[30px] {active
                ? 'text-background font-semibold'
                : 'text-ink-muted hover:text-foreground'}"
        >
            {tab.label}
        </a>
    {/each}
</nav>

<!--
    Global footer. Hairline top border, mono uppercase wide-tracked links per the
    Dropout editorial law; muted at rest, foreground on hover (fine pointers only).
    1:1 parity with the sibling tools (day-zero / invoice-generator / order-processor):
    same markup, links, and behavior. Aligns content to the shared --content-x gutter
    (same as the siblings + the rest of this app's chrome); the author is inlined since
    this tool carries no APP_CONFIG.
-->
<footer
    class="border-hair text-ink-muted text-micro flex w-full flex-col items-center justify-center gap-x-6 gap-y-3 border-t px-[var(--content-x)] py-8 text-center font-mono tracking-[0.22em] uppercase sm:flex-row sm:flex-wrap sm:justify-between sm:py-10 sm:text-left"
>
    <p class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:justify-start">
        <a
            href="/changelog"
            class="pointer-fine:hover:text-foreground touch-manipulation whitespace-nowrap transition-colors ease-[var(--ease)]"
        >
            Changelog
        </a>
        <span class="text-hair" aria-hidden="true">/</span>
        <a
            href="https://dropoutstudio.co/tools"
            target="_blank"
            rel="noopener noreferrer"
            class="pointer-fine:hover:text-foreground touch-manipulation whitespace-nowrap transition-colors ease-[var(--ease)]"
        >
            Other tools
        </a>
    </p>
    <p>
        <a
            href="https://dropoutstudio.co"
            target="_blank"
            rel="noopener noreferrer"
            class="pointer-fine:hover:text-foreground touch-manipulation whitespace-nowrap transition-colors ease-[var(--ease)]"
        >
            Designed by Dropout Studio
        </a>
    </p>
</footer>

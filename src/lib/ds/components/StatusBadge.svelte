<script lang="ts">
	import { cn } from "../utils";

	/**
	 * Connection status pill — the one "Connected / Not connected" badge, site-wide.
	 * A mono uppercase pill with a leading dot: the `status-connected` functional mint
	 * when connected, muted ink otherwise. The pill keeps its hairline (it's a badge,
	 * not a button); the mint is the single sanctioned functional accent for live status,
	 * one value across every tool so equivalent badges match exactly.
	 */
	let {
		connected = false,
		connectedLabel = "Connected",
		disconnectedLabel = "Not connected",
		class: className = ""
	}: {
		connected?: boolean;
		connectedLabel?: string;
		disconnectedLabel?: string;
		class?: string;
	} = $props();
</script>

<span
	class={cn(
		"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-micro tracking-[0.14em] whitespace-nowrap uppercase",
		connected ? "border-status-connected/40 text-foreground" : "border-hair text-ink-muted",
		className
	)}
>
	<span class={cn("size-1.5 rounded-full", connected ? "bg-status-connected" : "bg-ink-muted")}></span>
	{connected ? connectedLabel : disconnectedLabel}
</span>

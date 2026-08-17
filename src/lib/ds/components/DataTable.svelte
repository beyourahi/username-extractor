<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "../utils";

	let { caption, class: className = "", children }: { caption: string; class?: string; children: Snippet } = $props();
</script>

<div class="border-hair w-full overflow-x-auto rounded-lg border">
	<table class={cn("min-w-table text-label w-full border-collapse text-left tabular-nums", className)}>
		<caption class="sr-only">{caption}</caption>
		{@render children()}
	</table>
</div>

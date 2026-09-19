<script lang="ts">
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import { cn } from "../utils";

	let {
		class: className = "",
		label = "Loading",
		announce = false
	}: { class?: string; label?: string; announce?: boolean } = $props();
</script>

<LoaderCircle
	role={announce ? "status" : undefined}
	aria-label={announce ? label : undefined}
	aria-hidden={announce ? undefined : "true"}
	class={cn("size-4 animate-spin motion-reduce:animate-none", className)}
/>

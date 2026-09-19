<script lang="ts">
	import { Drawer as DrawerPrimitive } from "vaul-svelte";
	import { cn } from "../../utils";

	let { class: className, ...restProps }: DrawerPrimitive.TitleProps = $props();
</script>

<DrawerPrimitive.Title
	data-slot="drawer-title"
	class={cn("text-foreground text-base font-medium", className)}
	{...restProps}
/>

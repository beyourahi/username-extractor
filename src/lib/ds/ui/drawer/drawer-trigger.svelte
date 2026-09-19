<script lang="ts">
	import { Drawer as DrawerPrimitive } from "vaul-svelte";
	import { Dialog as DialogPrimitive } from "bits-ui";

	let { ...restProps }: DialogPrimitive.TriggerProps = $props();
</script>

<DrawerPrimitive.Trigger data-slot="drawer-trigger" {...restProps} />

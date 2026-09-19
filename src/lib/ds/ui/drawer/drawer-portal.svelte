<script lang="ts">
	import { Drawer as DrawerPrimitive } from "vaul-svelte";
	import { Dialog as DialogPrimitive } from "bits-ui";

	let { ...restProps }: DialogPrimitive.PortalProps = $props();
</script>

<DrawerPrimitive.Portal {...restProps} />

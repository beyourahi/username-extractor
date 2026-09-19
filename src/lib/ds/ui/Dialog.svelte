<script lang="ts">
	import { Dialog as BitsDialog } from "bits-ui";
	import X from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import Button from "./button/button.svelte";

	let {
		open = $bindable(false),
		title,
		description,
		portalTarget,
		overlayLayer,
		contentLayer,
		trigger,
		footer,
		children
	}: {
		open?: boolean;
		title: string;
		description?: string;
		portalTarget?: string;
		overlayLayer?: string;
		contentLayer?: string;
		trigger?: Snippet;
		footer?: Snippet;
		children: Snippet;
	} = $props();
</script>

<BitsDialog.Root bind:open>
	{#if trigger}
		<BitsDialog.Trigger>
			{#snippet child({ props })}<Button {...props} variant="secondary">{@render trigger()}</Button>{/snippet}
		</BitsDialog.Trigger>
	{/if}
	<BitsDialog.Portal {...portalTarget !== undefined ? { to: portalTarget } : {}}>
		<BitsDialog.Overlay
			class="bg-scrim fixed inset-0 z-50 backdrop-blur-sm"
			{...overlayLayer !== undefined ? { "data-overlay-layer": overlayLayer } : {}}
		/>
		<BitsDialog.Content
			class="surface-modal max-w-dialog fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[calc(100dvh-2rem)] -translate-y-1/2 flex-col overflow-hidden rounded-xl p-4 sm:p-6"
			{...contentLayer !== undefined ? { "data-overlay-layer": contentLayer } : {}}
		>
			<div class="flex items-start justify-between gap-4">
				<div class="flex min-w-0 flex-col gap-2">
					<BitsDialog.Title class="text-title-sm leading-heading font-medium">{title}</BitsDialog.Title
					>{#if description}<BitsDialog.Description class="text-label text-muted-foreground"
							>{description}</BitsDialog.Description
						>{/if}
				</div>
				<BitsDialog.Close>
					{#snippet child({ props })}<Button {...props} variant="icon" aria-label="Close dialog"
							><X class="size-5" aria-hidden="true" /></Button
						>{/snippet}
				</BitsDialog.Close>
			</div>
			<div class="mt-6 min-h-0 overflow-y-auto overscroll-contain">{@render children()}</div>
			{#if footer}<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					{@render footer()}
				</div>{/if}
		</BitsDialog.Content>
	</BitsDialog.Portal>
</BitsDialog.Root>

/**
 * @dropout/ds — public entry point.
 *
 * Products consume the vendored source through this barrel. Import tokens once
 * from `styles/tokens.css`; generic controls live in `ui`, Dropout language in
 * `signature`, and reusable compositions in `patterns`.
 */
export { cn } from "./utils";
export { Button, buttonVariants } from "./ui/button";
export { default as Input } from "./ui/input/input.svelte";
export { default as Textarea } from "./ui/textarea/textarea.svelte";
export {
	Alert,
	Checkbox,
	Combobox,
	DataTable,
	Dialog,
	EmptyState,
	Field,
	MultiSelect,
	NativeSelect,
	Radio,
	Select,
	Spinner
} from "./ui";
export { default as Cta } from "./signature/Cta.svelte";
export { default as IconButton } from "./signature/IconButton.svelte";
export { default as Heading } from "./signature/Heading.svelte";
export { default as Eyebrow } from "./signature/Eyebrow.svelte";
export { default as StatusBadge } from "./signature/StatusBadge.svelte";
export { default as Tile } from "./signature/Tile.svelte";
export { default as SettingsSection } from "./patterns/SettingsSection.svelte";
export { default as SettingsRow } from "./patterns/SettingsRow.svelte";
export { default as SettingsActions } from "./patterns/SettingsActions.svelte";
export { default as SettingsSaveBar } from "./patterns/SettingsSaveBar.svelte";
export { motion, prefersReducedMotion } from "./motion";
export {
	AlertDialog,
	Badge,
	Breadcrumb,
	Card,
	CheckboxPrimitive,
	Command,
	ContextMenu,
	DialogPrimitive,
	Drawer,
	DropdownMenu,
	InputGroup,
	InputOTP,
	Pagination,
	Popover,
	Progress,
	RadioGroup,
	SelectPrimitive,
	Sheet,
	Skeleton,
	Sonner,
	Switch,
	Table,
	Tabs,
	Tooltip
} from "./ui";
export {
	inputBase,
	labelBase,
	bodyBase,
	helperBase,
	metaBase,
	tileBase,
	tileSelected,
	tileUnselected,
	pillBase,
	pillSelected,
	pillUnselected
} from "./styles/recipes";

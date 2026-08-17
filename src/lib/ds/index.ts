/**
 * @dropout/ds — public entry point.
 *
 * Token styles ship separately and must be imported once by the consumer:
 *     import "@dropout/ds/tokens.css";
 *     import "@dropout/ds/animations.css"; // optional, for <Cta dot> + sheen
 */
export { cn } from "./utils";
export {
	isPlatformAuthenticatorAvailable,
	detectPlatform,
	biometricLabel,
	biometricLabelFor,
	type Platform
} from "./biometric";

export { default as Cta } from "./components/Cta.svelte";
export { default as IconButton } from "./components/IconButton.svelte";
export { default as Heading } from "./components/Heading.svelte";
export { default as Eyebrow } from "./components/Eyebrow.svelte";
export { default as Input } from "./components/Input.svelte";
export { default as Tile } from "./components/Tile.svelte";
export { default as SettingsSection } from "./components/SettingsSection.svelte";
export { default as SettingsRow } from "./components/SettingsRow.svelte";
export { default as SettingsActions } from "./components/SettingsActions.svelte";
export { default as SettingsSaveBar } from "./components/SettingsSaveBar.svelte";
export { default as Select } from "./components/Select.svelte";
export { default as StatusBadge } from "./components/StatusBadge.svelte";
export { default as Button } from "./components/Button.svelte";
export { default as Field } from "./components/Field.svelte";
export { default as Textarea } from "./components/Textarea.svelte";
export { default as NativeSelect } from "./components/NativeSelect.svelte";
export { default as Checkbox } from "./components/Checkbox.svelte";
export { default as Radio } from "./components/Radio.svelte";
export { default as Alert } from "./components/Alert.svelte";
export { default as Dialog } from "./components/Dialog.svelte";
export { default as DataTable } from "./components/DataTable.svelte";
export { default as EmptyState } from "./components/EmptyState.svelte";
export { default as Spinner } from "./components/Spinner.svelte";
export { motion, prefersReducedMotion } from "./motion";
export { BROWSER_THEME_COLOR, emailPresentation } from "./presentation";
export { renderFatalError } from "./fatal-error";

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
} from "./components/styles";

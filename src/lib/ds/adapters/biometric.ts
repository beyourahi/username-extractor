/**
 * Platform-biometric capability + naming — the single source of truth shared by
 * every product's Settings + Login pages (vendored to `ds/biometric.ts`).
 *
 * The web exposes WHETHER a platform authenticator exists (UVPAA) but NOT which
 * biometric it is — Face ID vs Touch ID is invisible to the WebAuthn API. So the
 * human label is derived from the OS family, with two hard rules:
 *   1. Never say "Face ID" anywhere but a genuine iPhone/iPod (Macs/iPads/PCs lack it).
 *   2. Only ever surface the feature when a platform authenticator is actually present.
 *
 * Detection takes an optional server hint (read from `Sec-CH-UA-Platform` / `User-Agent`
 * in the page loader) so the first server render already picks the right label — no
 * flash of the wrong name — then the client confirms real availability via UVPAA.
 */

export type Platform = "ios" | "macos" | "windows" | "android" | "linux" | "unknown";

/**
 * True only when this device has a usable platform authenticator (Face ID / Touch ID /
 * Windows Hello / Android fingerprint or a device PIN). SSR-safe: returns false on the
 * server. This is the gate — if it's false, no biometric UI or text should render.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
	if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
	try {
		return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
	} catch {
		return false;
	}
}

/**
 * Classify a single string into an OS family. Robust to BOTH a short
 * `Sec-CH-UA-Platform` token ("macOS", "iOS", "Windows", "Android", "Linux",
 * "Chrome OS") AND a full `User-Agent` string — Safari on iOS/macOS sends no
 * Client Hints, so the server falls back to the UA and this must handle it.
 *
 * Order is load-bearing: iPhone/iPod (and the "iOS" token) are matched FIRST
 * because the iPhone UA itself contains "like Mac OS X" — checking "mac" before
 * "iphone" would mislabel every iPhone. iPad + real Macs resolve to "macos"
 * (→ "Touch ID", never Face ID); Android before Linux because the Android UA
 * also contains "Linux".
 */
function classify(value: string): Platform {
	const s = value.toLowerCase();
	if (/iphone|ipod/.test(s) || /\bios\b/.test(s)) return "ios";
	if (/ipad|macintosh|mac os|macos/.test(s)) return "macos";
	if (/android/.test(s)) return "android";
	if (/windows/.test(s)) return "windows";
	if (/chrome os|chromeos|\bcros\b|\blinux\b|\bx11\b/.test(s)) return "linux";
	return "unknown";
}

/**
 * Resolve the OS family. Prefers the server `hint` (a CH token or a UA fallback;
 * avoids a label flash on first paint); falls back to `navigator.userAgent` in
 * the browser when the hint is absent or inconclusive.
 */
export function detectPlatform(hint?: string | null): Platform {
	if (hint) {
		const fromHint = classify(hint);
		if (fromHint !== "unknown") return fromHint;
	}
	const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
	return ua ? classify(ua) : "unknown";
}

/**
 * The device-accurate, human label for the platform biometric. Reads naturally in both
 * a section title ("Touch ID") and a sentence ("Sign in with Touch ID"). The generic
 * fallback covers the rare Linux/unknown device that still reports an authenticator.
 */
export function biometricLabel(platform: Platform): string {
	switch (platform) {
		case "ios":
			return "Face ID";
		case "macos":
			return "Touch ID";
		case "windows":
			return "Windows Hello";
		case "android":
			return "Fingerprint";
		default:
			return "device biometrics";
	}
}

/** Convenience: resolve the label straight from a server hint (SSR-safe). */
export function biometricLabelFor(hint?: string | null): string {
	return biometricLabel(detectPlatform(hint));
}

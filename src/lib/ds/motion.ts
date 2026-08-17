export const motion = {
	fast: 150,
	base: 250,
	slow: 350,
	editorial: 450,
	easeStandard: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
	easeEmphasized: "cubic-bezier(0.65, 0, 0.35, 1)",
	easeDecelerate: "cubic-bezier(0.16, 1, 0.3, 1)"
} as const;

export const prefersReducedMotion = () =>
	typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

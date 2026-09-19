import { tokenMotion } from "./tokens/generated";

export const motion = tokenMotion;

export const prefersReducedMotion = () =>
	typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

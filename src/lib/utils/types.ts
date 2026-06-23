/**
 * Helper types used by shadcn-svelte primitives. `WithElementRef` exposes a
 * bindable `ref` on top of an element's native attributes; the `Without*`
 * helpers strip `child`/`children` from a props type.
 */
export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & {
    ref?: E | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;

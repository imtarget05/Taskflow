import type { Transition, Variants } from 'motion-dom';

/**
 * Shared Framer Motion presets for TaskFlow micro-interactions. Every preset
 * is intentionally subtle and respects the user's reduced-motion preference
 * (components pass these through `motion(...)` with `useReducedMotion()`).
 */

/** Drawer / slide-over enter from the right. */
export const slideInRight: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0 },
};

export const overlayFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const riseFade: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export const softSpring: Transition = { type: 'spring', stiffness: 320, damping: 32 };

export const quickEase: Transition = { duration: 0.18, ease: 'easeOut' };

/** No-op variants for users preferring reduced motion. */
export function stillVariants(variants: Variants): Variants {
  return Object.fromEntries(
    Object.entries(variants).map(([key, value]) => [
      key,
      Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([prop]) => prop === 'opacity' ? false : true)),
    ])
  ) as Variants;
}

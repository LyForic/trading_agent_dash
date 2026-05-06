/**
 * Minimal framer-motion stub for vitest/jsdom.
 *
 * AnimatePresence renders children immediately (no exit animation hold),
 * and motion.* components are plain passthrough divs/buttons/etc.
 * This avoids the jsdom issue where AnimatePresence keeps exiting elements
 * in the DOM during animation and causes `.not.toBeInTheDocument()` to fail.
 */
import React from 'react';

type AnyProps = Record<string, unknown>;

// Strip framer-motion-specific props before passing to DOM elements
function stripMotionProps(props: AnyProps): AnyProps {
  const {
    initial: _initial,
    animate: _animate,
    exit: _exit,
    transition: _transition,
    variants: _variants,
    whileHover: _whileHover,
    whileTap: _whileTap,
    whileFocus: _whileFocus,
    whileInView: _whileInView,
    layout: _layout,
    layoutId: _layoutId,
    drag: _drag,
    dragConstraints: _dragConstraints,
    dragElastic: _dragElastic,
    dragListener: _dragListener,
    dragControls: _dragControls,
    onAnimationStart: _onAnimationStart,
    onAnimationComplete: _onAnimationComplete,
    onDragEnd: _onDragEnd,
    transformOrigin: _transformOrigin,
    ...rest
  } = props;
  return rest;
}

function makeMotion(tag: keyof React.JSX.IntrinsicElements) {
  const Component = React.forwardRef<HTMLElement, AnyProps>((props, ref) => {
    const clean = stripMotionProps(props);
    return React.createElement(tag, { ...clean, ref });
  });
  Component.displayName = `motion.${tag}`;
  return Component;
}

export const motion = new Proxy(
  {},
  {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;
      return makeMotion(prop as keyof React.JSX.IntrinsicElements);
    },
  },
) as typeof import('framer-motion').motion;

export function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

// Re-export commonly used hooks/utilities as no-ops
export const useAnimation = () => ({
  start: () => Promise.resolve(),
  stop: () => {},
  set: () => {},
});

export const useMotionValue = (initial: number) => ({
  get: () => initial,
  set: () => {},
  on: () => () => {},
});

export const useTransform = (_value: unknown, _input: unknown, output: unknown[]) => output[0];

export const useSpring = (initial: number) => ({
  get: () => initial,
  set: () => {},
});

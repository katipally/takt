import type { Transition, Variants } from "motion/react";

// One motion vocabulary, shared by every animated surface so the app feels
// consistent. Balanced feel: spring on the key moments, quick eases elsewhere.
export const spring: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 26 };
export const easeOut: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };
export const quick: Transition = { duration: 0.15, ease: [0.22, 1, 0.36, 1] };

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: 6, transition: quick },
};

export const dropdown: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, y: -6, scale: 0.97, transition: quick },
};

export const overlay: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: quick },
};

export const modal: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: quick },
};

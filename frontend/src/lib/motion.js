// Единые тайминги анимаций framer-motion. До JS-пропсов framer-motion CSS-токены
// @theme не доходят, поэтому источник правды для длительности/easing - здесь.
// Бренд-гайд (business/assets/brand-guidelines.md): 0.18-0.22s, без пружин,
// easing cubic-bezier(0.4, 0, 0.2, 1) - тот же, что у CSS-переходов (--ease-brand).
export const EASE = [0.4, 0, 0.2, 1]

export const MOTION = { duration: 0.2, ease: EASE }
export const MOTION_FAST = { duration: 0.15, ease: EASE }

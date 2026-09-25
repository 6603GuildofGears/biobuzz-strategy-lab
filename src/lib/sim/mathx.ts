/**
 * Our own sin, cos and atan2.
 *
 * Why? JavaScript's Math.sin, Math.cos and Math.atan2 are allowed to differ very slightly between
 * browsers (Chrome, Safari, Node...), in the 16th digit. In a simulation, a difference that tiny
 * snowballs: a robot turns a hair differently, bumps a ball a hair differently, and eventually the
 * whole match plays out differently. Then the same seed would give different matches on different
 * computers.
 *
 * These versions only use + − × ÷ and √, which every computer is required to do exactly the same way.
 * So a seed gives the same match everywhere. They're accurate to about 15 digits.
 */

const TWO_PI = 2 * Math.PI;
const HALF_PI = Math.PI / 2;

/** sin(x) from its Taylor series: x − x³/3! + x⁵/5! − ... (after shifting x into −π/2..π/2, where the series is very accurate). */
export function sin(x: number): number {
  let a = x - TWO_PI * Math.round(x / TWO_PI); // now between −π and π
  if (a > HALF_PI) a = Math.PI - a; // sin(π − a) = sin(a)
  else if (a < -HALF_PI) a = -Math.PI - a;
  const a2 = a * a;
  let term = a;
  let sum = a;
  for (let n = 1; n <= 10; n++) {
    term *= -a2 / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

export const cos = (x: number) => sin(x + HALF_PI);

/** atan(t) for any t. Uses the half-angle trick twice to make t small, then its Taylor series t − t³/3 + t⁵/5 − ... */
function atan(t: number): number {
  const sign = t < 0 ? -1 : 1;
  let x = Math.abs(t);
  let scale = 1;
  if (x > 1) {
    // atan(x) = π/2 − atan(1/x)
    return sign * (HALF_PI - atan(1 / x));
  }
  for (let i = 0; i < 2; i++) {
    // atan(x) = 2·atan(x / (1 + √(1 + x²)))
    x = x / (1 + Math.sqrt(1 + x * x));
    scale *= 2;
  }
  const x2 = x * x;
  let power = x;
  let sum = x;
  for (let n = 1; n <= 12; n++) {
    power *= -x2;
    sum += power / (2 * n + 1);
  }
  return sign * scale * sum;
}

/** The angle of the point (x, y), from −π to π, like Math.atan2. */
export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + Math.PI : atan(y / x) - Math.PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

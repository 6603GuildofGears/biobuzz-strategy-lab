import { POINTS } from "./rules";
import { nectarOwner, ownNectar, type FlowerTube, type MatchState } from "./state";
import { FLOWER_BELOW_SLOTS } from "./tuning";
import type { Alliance, FlowerMode, Kind } from "./types";

/**
 * FLOWERS (9.7, 10.5.2). A FLOWER is a tube. Elements dropped in the top stack up from the bottom.
 * POLLEN can fall past the middle ring into the bottom section, but NECTAR is too big and gets
 * caught on the middle ring. Only elements between the middle ring and the top ring (the
 * "scoring volume") score.
 *
 *  - Bottom NECTAR bonus: the alliance whose NECTAR is lowest in the scoring volume.
 *  - Owner: the alliance whose NECTAR is highest. The owner scores every element in the volume.
 */

/** The alliance with the highest NECTAR in the scoring volume. */
export function topNectar(volume: Kind[]): Alliance | null {
  for (let i = volume.length - 1; i >= 0; i--) {
    const owner = nectarOwner(volume[i]);
    if (owner) return owner;
  }
  return null;
}

/** The alliance with the lowest NECTAR in the scoring volume. */
export function bottomNectar(volume: Kind[]): Alliance | null {
  for (const k of volume) {
    const owner = nectarOwner(k);
    if (owner) return owner;
  }
  return null;
}

/** Drop an element in the top. Returns false if the FLOWER is already full. */
export function placeInFlower(f: FlowerTube, k: Kind, capacity: number): boolean {
  if (f.volume.length >= capacity) return false;
  // An empty tube lets POLLEN fall through to the bottom section.
  if (k === "P" && f.volume.length === 0 && f.below < FLOWER_BELOW_SLOTS) f.below++;
  else f.volume.push(k);
  return true;
}

/** Pull one POLLEN out of the bottom (G418 allows only this). Returns false if there is none. */
export function pullFromBottom(f: FlowerTube): boolean {
  if (f.below <= 0) return false;
  f.below--;
  // Everything above slides down, unless NECTAR is caught on the middle ring.
  while (f.below < FLOWER_BELOW_SLOTS && f.volume[0] === "P") {
    f.volume.shift();
    f.below++;
  }
  return true;
}

/**
 * Plan a FLOWER visit: how many points would this alliance gain by placing what it holds?
 * Stealing a FLOWER counts double, because the opponent also loses the points.
 */
export function planFlower(m: MatchState, a: Alliance, fi: number, held: Kind[], mode: FlowerMode) {
  const stack = [...m.flowers[fi].volume];
  let nectar = held.filter((k) => k === ownNectar(a)).length;
  let pollen = held.filter((k) => k === "P").length;
  let value = 0;
  let used = 0;
  while (stack.length < m.settings.flowerCapacity) {
    const owner = topNectar(stack);
    if (mode === "claim") {
      // Only FLOWERS with no NECTAR yet: the bottom NECTAR bonus, and owning it for now.
      if (bottomNectar(stack) !== null || nectar === 0) break;
      value += POINTS.bottomNectar + POINTS.ownedFlowerElement * (stack.length + 1);
      used++;
      break;
    }
    if (owner !== a && nectar > 0) {
      if (bottomNectar(stack) === null) value += POINTS.bottomNectar;
      value += POINTS.ownedFlowerElement * (stack.length + 1);
      if (owner) value += POINTS.ownedFlowerElement * stack.length;
      stack.push(ownNectar(a));
      nectar--;
      used++;
      if (mode === "cap") break;
    } else if (owner === a && pollen > 0 && mode === "fill") {
      value += POINTS.ownedFlowerElement;
      stack.push("P");
      pollen--;
      used++;
    } else break;
  }
  return { value, used };
}

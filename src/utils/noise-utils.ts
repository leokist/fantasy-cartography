// Seeded value noise for shapes that should look natural but come out the same for the same seed

/** Value noise summed over octaves, in -1..1; each octave doubles the frequency and halves the weight */
export function createNoise(seed: string, octaves: number): (x: number, y: number) => number {
  let hashSeed = 2166136261;
  for (let i = 0; i < seed.length; i++) hashSeed = Math.imul(hashSeed ^ seed.charCodeAt(i), 16777619);
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + hashSeed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * fx;
    const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * fx;
    return top + (bottom - top) * fy;
  };
  return (x, y) => {
    let sum = 0;
    let weight = 0;
    for (let octave = 0, amplitude = 1, scale = 1; octave < octaves; octave++, amplitude *= 0.5, scale *= 2) {
      sum += (value(x * scale + octave * 17.3, y * scale - octave * 9.1) * 2 - 1) * amplitude;
      weight += amplitude;
    }
    return sum / weight;
  };
}

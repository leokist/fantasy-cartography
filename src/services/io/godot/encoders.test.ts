import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodeExr, encodePng } from "./encoders";

describe("godot package encoders", () => {
  it("writes float heights as uncompressed EXR scanlines", () => {
    const values = Float32Array.from([-12.5, 0, 3.25, 1000, 7, -1]);
    const file = encodeExr(values, 3, 2);
    const view = new DataView(file.buffer);
    expect(view.getUint32(0, true)).toBe(20000630); // EXR magic number
    const lineBytes = 3 * 4 * 3;
    const offsets = file.length - 2 * (8 + lineBytes) - 2 * 8;
    for (let y = 0; y < 2; y++) {
      const start = Number(view.getBigUint64(offsets + y * 8, true));
      expect(view.getInt32(start, true)).toBe(y);
      expect(view.getInt32(start + 4, true)).toBe(lineBytes);
      for (let channel = 0; channel < 3; channel++)
        for (let x = 0; x < 3; x++)
          expect(view.getFloat32(start + 8 + (channel * 3 + x) * 4, true)).toBe(values[y * 3 + x]);
    }
  });

  it("writes PNGs whose rows hold the pixels as given", async () => {
    const pixels = Uint8Array.from([0, 1, 2, 250, 251, 252]);
    const png = await encodePng(pixels, 3, 2, 1);
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer);
    expect([view.getUint32(16), view.getUint32(20), png[24], png[25]]).toEqual([3, 2, 8, 0]);
    const dataLength = view.getUint32(33);
    const raw = inflateSync(png.subarray(41, 41 + dataLength));
    expect(Array.from(raw)).toEqual([0, 0, 1, 2, 0, 250, 251, 252]);
  });
});

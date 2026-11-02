// File formats of the Godot package: float EXR heights and 8-bit PNG maps, no dependencies

/** Uncompressed scanline OpenEXR with R, G and B channels of 32-bit floats, the same value in each */
export function encodeExr(values: Float32Array, width: number, height: number): Uint8Array {
  const header: number[] = [];
  const text = (value: string) => {
    for (let i = 0; i < value.length; i++) header.push(value.charCodeAt(i));
    header.push(0);
  };
  const int = (value: number) =>
    header.push(value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255);
  const float = (value: number) => header.push(...new Uint8Array(new Float32Array([value]).buffer));
  const attribute = (name: string, type: string, size: number, write: () => void) => {
    text(name);
    text(type);
    int(size);
    write();
  };

  header.push(0x76, 0x2f, 0x31, 0x01, 2, 0, 0, 0); // magic number, version 2, scanline
  const channels = ["B", "G", "R"]; // alphabetical, as the format requires
  attribute("channels", "chlist", channels.length * 18 + 1, () => {
    for (const channel of channels) {
      text(channel);
      int(2); // FLOAT
      int(0); // pLinear and reserved
      int(1); // x sampling
      int(1); // y sampling
    }
    header.push(0);
  });
  attribute("compression", "compression", 1, () => header.push(0));
  attribute("dataWindow", "box2i", 16, () => [0, 0, width - 1, height - 1].forEach(int));
  attribute("displayWindow", "box2i", 16, () => [0, 0, width - 1, height - 1].forEach(int));
  attribute("lineOrder", "lineOrder", 1, () => header.push(0));
  attribute("pixelAspectRatio", "float", 4, () => float(1));
  attribute("screenWindowCenter", "v2f", 8, () => [0, 0].forEach(float));
  attribute("screenWindowWidth", "float", 4, () => float(1));
  header.push(0);

  const lineBytes = width * 4 * channels.length;
  const offsetsStart = header.length;
  const dataStart = offsetsStart + height * 8;
  const file = new Uint8Array(dataStart + height * (8 + lineBytes));
  file.set(header);
  const view = new DataView(file.buffer);
  for (let y = 0; y < height; y++) {
    const lineStart = dataStart + y * (8 + lineBytes);
    view.setBigUint64(offsetsStart + y * 8, BigInt(lineStart), true);
    view.setInt32(lineStart, y, true);
    view.setInt32(lineStart + 4, lineBytes, true);
    for (let c = 0; c < channels.length; c++) {
      const channelStart = lineStart + 8 + c * width * 4;
      for (let x = 0; x < width; x++) view.setFloat32(channelStart + x * 4, values[y * width + x], true);
    }
  }
  return file;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** An 8-bit PNG: 1 channel is grayscale, 3 is RGB, 4 is RGBA */
export async function encodePng(pixels: Uint8Array, width: number, height: number, channels: 1 | 3 | 4) {
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);

  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
    body.set(data, 4);
    const out = new Uint8Array(body.length + 8);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(body, 4);
    view.setUint32(out.length - 4, crc32(body));
    return out;
  };
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = { 1: 0, 3: 2, 4: 6 }[channels];

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array())
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

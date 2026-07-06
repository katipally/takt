// Convert an STL mesh to a binary glTF (.glb) so <model-viewer> (Model3D) can
// show it. ponytail: hand-rolled parser + minimal single-mesh GLB writer — GLB
// is a documented container and STL is trivial, so a ~150-line dependency-free
// converter beats pulling three.js + a finicky GLTFExporter into the Node
// ingest pipeline. Handles binary and ASCII STL; emits POSITION + NORMAL.

export interface Mesh { positions: Float32Array; normals: Float32Array; vertexCount: number }

function faceNormal(a: number[], b: number[], c: number[]): [number, number, number] {
  const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!;
  const vx = c[0]! - a[0]!, vy = c[1]! - a[1]!, vz = c[2]! - a[2]!;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export function parseStl(buf: Buffer): Mesh {
  // Binary STL: 80-byte header, uint32 triangle count, then n*50 bytes.
  if (buf.length >= 84) {
    const n = buf.readUInt32LE(80);
    if (84 + n * 50 === buf.length) return parseBinary(buf, n);
  }
  return parseAscii(buf.toString("utf8"));
}

function parseBinary(buf: Buffer, n: number): Mesh {
  const positions = new Float32Array(n * 9);
  const normals = new Float32Array(n * 9);
  let o = 84, p = 0;
  for (let i = 0; i < n; i++) {
    let nx = buf.readFloatLE(o), ny = buf.readFloatLE(o + 4), nz = buf.readFloatLE(o + 8);
    const vs: number[][] = [];
    for (let v = 0; v < 3; v++) { const b = o + 12 + v * 12; vs.push([buf.readFloatLE(b), buf.readFloatLE(b + 4), buf.readFloatLE(b + 8)]); }
    if (nx === 0 && ny === 0 && nz === 0) [nx, ny, nz] = faceNormal(vs[0]!, vs[1]!, vs[2]!);
    for (const vtx of vs) { positions[p] = vtx[0]!; positions[p + 1] = vtx[1]!; positions[p + 2] = vtx[2]!; normals[p] = nx; normals[p + 1] = ny; normals[p + 2] = nz; p += 3; }
    o += 50;
  }
  return { positions, normals, vertexCount: n * 3 };
}

function parseAscii(txt: string): Mesh {
  const positions: number[] = [], normals: number[] = [];
  for (const f of txt.split(/facet\s+normal/i).slice(1)) {
    const nums = (f.match(/-?\d+\.?\d*(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (nums.length < 12) continue;
    let [nx, ny, nz] = [nums[0]!, nums[1]!, nums[2]!];
    const vs = [[nums[3]!, nums[4]!, nums[5]!], [nums[6]!, nums[7]!, nums[8]!], [nums[9]!, nums[10]!, nums[11]!]];
    if (nx === 0 && ny === 0 && nz === 0) [nx, ny, nz] = faceNormal(vs[0]!, vs[1]!, vs[2]!);
    for (const v of vs) { positions.push(v[0]!, v[1]!, v[2]!); normals.push(nx, ny, nz); }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), vertexCount: positions.length / 3 };
}

const GLB_MAGIC = 0x46546c67, CHUNK_JSON = 0x4e4f534a, CHUNK_BIN = 0x004e4942;

export function toGlb(mesh: Mesh, name = "part"): Uint8Array {
  const { positions, normals, vertexCount } = mesh;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let c = 0; c < 3; c++) {
    const v = positions[i + c]!; if (v < min[c]!) min[c] = v; if (v > max[c]!) max[c] = v;
  }
  const posBuf = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  const normBuf = Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength);
  const bin = Buffer.concat([posBuf, normBuf]); // both float32 → 4-aligned

  const gltf = {
    asset: { version: "2.0", generator: "takt-stl2glb" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, mode: 4 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: normBuf.length, target: 34962 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertexCount, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: vertexCount, type: "VEC3" },
    ],
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltf), "utf8");
  const jpad = (4 - (jsonBuf.length % 4)) % 4;
  if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
  const total = 12 + 8 + jsonBuf.length + 8 + bin.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(CHUNK_JSON, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(CHUNK_BIN, 4);
  return new Uint8Array(Buffer.concat([header, jh, jsonBuf, bh, bin]));
}

export function stlToGlb(buf: Buffer, name?: string): Uint8Array {
  return toGlb(parseStl(buf), name);
}

// ── self-check: `tsx src/stl.ts` ─────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };

  // build a 1-triangle binary STL
  const stl = Buffer.alloc(84 + 50);
  stl.writeUInt32LE(1, 80);
  const tri = [0, 0, 0, /*n*/ 0, 0, 0, /*v1*/ 1, 0, 0, /*v2*/ 0, 1, 0]; // normal 0 → computed
  let o = 84;
  for (const f of tri) { stl.writeFloatLE(f, o); o += 4; }
  const mesh = parseStl(stl);
  assert(mesh.vertexCount === 3, "binary STL → 3 vertices");
  assert(Math.abs(mesh.normals[2]! - 1) < 1e-6, "zero normal recomputed to +Z");

  const glb = Buffer.from(toGlb(mesh, "tri"));
  assert(glb.readUInt32LE(0) === GLB_MAGIC, "GLB magic");
  assert(glb.readUInt32LE(4) === 2, "GLB version 2");
  assert(glb.readUInt32LE(8) === glb.length, "GLB total length matches");
  const jsonLen = glb.readUInt32LE(12);
  assert(glb.readUInt32LE(16) === CHUNK_JSON, "first chunk is JSON");
  const gltf = JSON.parse(glb.slice(20, 20 + jsonLen).toString("utf8"));
  assert(gltf.accessors[0].count === 3 && gltf.accessors[0].type === "VEC3", "POSITION accessor VEC3 count 3");
  assert(gltf.buffers[0].byteLength === glb.readUInt32LE(20 + jsonLen), "buffer length matches BIN chunk");

  // ASCII STL parses too
  const ascii = parseStl(Buffer.from("solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid s"));
  assert(ascii.vertexCount === 3, "ASCII STL → 3 vertices");

  console.log("stl self-check ok");
}

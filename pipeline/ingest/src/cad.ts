import { unzipSync, strFromU8 } from "fflate";
import { toGlb, type Mesh } from "./stl.js";

// STEP (.stp/.step) and 3MF (.3mf) → GLB, reusing stl.ts's GLB writer. STEP is a
// BREP CAD format that must be TESSELLATED (occt-import-js = OpenCascade wasm);
// 3MF is already a triangle mesh zipped with XML, so a tiny unzip + parse does it.
// Both come out indexed; we expand to the flat triangle soup toGlb wants.

// occt-import-js ships no types — declare the sliver of the API we use.
type OcctMesh = { attributes?: { position?: { array: ArrayLike<number> }; normal?: { array: ArrayLike<number> } }; index?: { array: ArrayLike<number> } };
type Occt = { ReadStepFile: (data: Uint8Array, params: unknown) => { success: boolean; meshes?: OcctMesh[] } };
let occtPromise: Promise<Occt> | null = null;
async function getOcct(): Promise<Occt> {
  occtPromise ??= (async () => {
    const mod = await import("occt-import-js" as string);
    return (mod.default ?? mod)() as Promise<Occt>;
  })();
  return occtPromise;
}

/** Per-triangle face normal for a flat positions buffer with no normals (3MF). */
function withFaceNormals(positions: Float32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i]!, ay = positions[i + 1]!, az = positions[i + 2]!;
    const bx = positions[i + 3]!, by = positions[i + 4]!, bz = positions[i + 5]!;
    const cx = positions[i + 6]!, cy = positions[i + 7]!, cz = positions[i + 8]!;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    for (let v = 0; v < 3; v++) { normals[i + v * 3] = nx; normals[i + v * 3 + 1] = ny; normals[i + v * 3 + 2] = nz; }
  }
  return normals;
}

/** Indexed mesh → flat triangle soup (positions + normals, one vertex per corner). */
function expandIndexed(pos: ArrayLike<number>, idx: ArrayLike<number>, norm?: ArrayLike<number>): Mesh {
  const n = idx.length;
  const positions = new Float32Array(n * 3);
  const hasNorm = norm && norm.length === pos.length;
  const normals = hasNorm ? new Float32Array(n * 3) : null;
  for (let i = 0; i < n; i++) {
    const v = idx[i]! * 3;
    positions[i * 3] = pos[v]!; positions[i * 3 + 1] = pos[v + 1]!; positions[i * 3 + 2] = pos[v + 2]!;
    if (normals && norm) { normals[i * 3] = norm[v]!; normals[i * 3 + 1] = norm[v + 1]!; normals[i * 3 + 2] = norm[v + 2]!; }
  }
  return { positions, normals: normals ?? withFaceNormals(positions), vertexCount: n };
}

function mergeMeshes(parts: Mesh[]): Mesh {
  if (parts.length === 1) return parts[0]!;
  const total = parts.reduce((n, m) => n + m.vertexCount, 0);
  const positions = new Float32Array(total * 3), normals = new Float32Array(total * 3);
  let o = 0;
  for (const m of parts) { positions.set(m.positions, o); normals.set(m.normals, o); o += m.vertexCount * 3; }
  return { positions, normals, vertexCount: total };
}

/** STEP → GLB (async — loads the OpenCascade wasm once, then tessellates). */
export async function stepToGlb(buf: Buffer, name?: string): Promise<Uint8Array> {
  const occt = await getOcct();
  const r = occt.ReadStepFile(new Uint8Array(buf), null);
  if (!r?.success || !r.meshes?.length) throw new Error("STEP tessellation produced no meshes");
  const parts: Mesh[] = [];
  for (const m of r.meshes) {
    const pos = m.attributes?.position?.array, idx = m.index?.array;
    if (pos && idx) parts.push(expandIndexed(pos, idx, m.attributes?.normal?.array));
  }
  if (!parts.length) throw new Error("STEP had no triangulated geometry");
  return toGlb(mergeMeshes(parts), name);
}

/** 3MF → GLB (a zip of model XML; parse vertices + triangles). Synchronous. */
export function threeMfToGlb(buf: Buffer, name?: string): Uint8Array {
  const files = unzipSync(new Uint8Array(buf));
  const key = Object.keys(files).find((k) => /3dmodel\.model$/i.test(k)) ?? Object.keys(files).find((k) => /\.model$/i.test(k));
  if (!key) throw new Error("3MF has no .model part");
  const xml = strFromU8(files[key]!);
  const verts: number[] = [];
  for (const m of xml.matchAll(/<vertex\b[^>]*\bx="([-\d.eE+]+)"[^>]*\by="([-\d.eE+]+)"[^>]*\bz="([-\d.eE+]+)"/g)) verts.push(+m[1]!, +m[2]!, +m[3]!);
  const tris: number[] = [];
  for (const m of xml.matchAll(/<triangle\b[^>]*\bv1="(\d+)"[^>]*\bv2="(\d+)"[^>]*\bv3="(\d+)"/g)) tris.push(+m[1]!, +m[2]!, +m[3]!);
  if (verts.length < 9 || tris.length < 3) throw new Error("3MF has no mesh geometry");
  return toGlb(expandIndexed(new Float32Array(verts), tris), name);
}

// ── self-check: `tsx src/cad.ts` ─────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  // expandIndexed: 1 triangle, no normals → face normal computed (+Z for CCW xy tri)
  const mesh = expandIndexed(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), [0, 1, 2]);
  assert(mesh.vertexCount === 3, "expanded to 3 vertices");
  assert(Math.abs(mesh.normals[2]! - 1) < 1e-6, "face normal is +Z");
  // merge two 1-tri meshes
  const merged = mergeMeshes([mesh, mesh]);
  assert(merged.vertexCount === 6, "merge concatenates vertices");
  // build a minimal 3MF (zip) and round-trip it
  const { zipSync, strToU8 } = await import("fflate");
  const model = `<?xml version="1.0"?><model><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources></model>`;
  const zip = zipSync({ "3D/3dmodel.model": strToU8(model) });
  const glb = threeMfToGlb(Buffer.from(zip), "tri3mf");
  assert(Buffer.from(glb).readUInt32LE(0) === 0x46546c67, "3MF → valid GLB magic");
  console.log("cad self-check ok");
}

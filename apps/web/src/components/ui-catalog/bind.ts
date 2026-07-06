// JSON-Pointer get/set for a surface's two-way-bound `data` model. Immutable
// set (clones along the path) so React re-renders cleanly. Kept tiny and pure so
// it's unit-testable without a DOM.

function decode(k: string): string { return k.replace(/~1/g, "/").replace(/~0/g, "~"); }

export function ptrGet(obj: unknown, ptr?: string): unknown {
  if (!ptr || ptr === "/") return obj;
  let cur: any = obj;
  for (const raw of ptr.replace(/^\//, "").split("/")) {
    if (cur == null) return undefined;
    cur = cur[decode(raw)];
  }
  return cur;
}

export function ptrSet<T>(obj: T, ptr: string, val: unknown): T {
  const parts = ptr.replace(/^\//, "").split("/").map(decode);
  const clone = (x: any) => (Array.isArray(x) ? x.slice() : { ...x });
  const root: any = obj && typeof obj === "object" ? clone(obj) : {};
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    cur[k] = cur[k] && typeof cur[k] === "object" ? clone(cur[k]) : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]!] = val;
  return root;
}

// ── self-check: `tsx bind.ts` ────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  assert(ptrGet({ a: { b: 2 } }, "/a/b") === 2, "nested get");
  assert(ptrGet({ a: 1 }, "/missing") === undefined, "missing get → undefined");
  const base = { a: { b: 1 }, c: 3 };
  const next = ptrSet(base, "/a/b", 9);
  assert(ptrGet(next, "/a/b") === 9, "nested set writes value");
  assert(ptrGet(base, "/a/b") === 1, "set is immutable (original untouched)");
  assert((next as any).c === 3, "unrelated keys preserved");
  const made = ptrSet({}, "/x/y/z", true);
  assert(ptrGet(made, "/x/y/z") === true, "set creates intermediate objects");
  console.log("bind self-check ok");
}

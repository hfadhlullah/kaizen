// Shared scalar lookup for comment-preserving Kaizen config files.
// Read and write a dotted key by walking indentation, so the comment above every
// key survives. Parsing to an object and dumping it back would delete all of them.
export function lineOf(text: string, key: string) {
  const parts = key.split(".");
  const lines = text.split("\n");
  let depth = 0, from = 0;
  for (const [pi, part] of parts.entries()) {
    const want = new RegExp(`^ {${depth}}${part}:`);
    let found = -1;
    for (let i = from; i < lines.length; i++) {
      if (want.test(lines[i]!)) { found = i; break; }
      if (pi > 0 && /^\S/.test(lines[i]!) && i > from) break;   // left the parent block
    }
    if (found < 0) return { lines, index: -1, indent: depth };
    from = found + 1; depth += 2;
  }
  return { lines, index: from - 1, indent: depth - 2 };
}

export function read(text: string, key: string) {
  const { lines, index } = lineOf(text, key);
  if (index < 0) return null;
  const v = lines[index]!.split(":").slice(1).join(":").split("#")[0]!.trim();
  return v.replace(/^["']|["']$/g, "");
}


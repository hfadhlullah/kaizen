// A file as an HTTP response that honours Range: one range, or several as
// multipart/byteranges, the way GitHub's CDN answers electron-updater's
// differential download. Used by update-test.ts's local feed.
export async function rangeResponse(file: Blob, header: string | null): Promise<Response> {
  const spec = header?.match(/^bytes=(.+)$/)?.[1];
  if (!spec) return new Response(file, { headers: { "accept-ranges": "bytes" } });
  // "a-b", open-ended "a-" (to the end) and suffix "-n" (the last n bytes).
  const last = file.size - 1;
  const parts = spec.split(",").map((r): [number, number] => {
    const [a, b] = r.trim().split("-");
    if (a === "") return [Math.max(0, file.size - Number(b)), last];
    return [Number(a), b === "" ? last : Math.min(Number(b), last)];
  });
  const cr = ([a, b]: [number, number]) => `bytes ${a}-${b}/${file.size}`;
  if (parts.length === 1) return new Response(file.slice(parts[0]![0], parts[0]![1] + 1), { status: 206, headers: { "content-range": cr(parts[0]!), "accept-ranges": "bytes" } });
  const boundary = "kzrange";
  // Bytes read up front: Bun leaves a Bun.file slice empty inside a new Blob.
  const chunks: (string | Uint8Array)[] = [];
  // The first delimiter has no leading CRLF; electron-updater's parser counts on it.
  for (const p of parts) chunks.push(`${chunks.length ? "\r\n" : ""}--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: ${cr(p)}\r\n\r\n`, new Uint8Array(await file.slice(p[0], p[1] + 1).arrayBuffer()));
  chunks.push(`\r\n--${boundary}--\r\n`);
  return new Response(new Blob(chunks), { status: 206, headers: { "content-type": `multipart/byteranges; boundary=${boundary}` } });
}

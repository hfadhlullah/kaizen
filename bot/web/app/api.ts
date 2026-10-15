export const api = async (path, opts = {}) => {
  const r = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json" },
    body: opts.body && JSON.stringify(opts.body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

const m = 60e3,
  h = 3600e3,
  d = 86400e3;
// "5m", "3h", "2d": how long ago, from two timestamps in ms.
export const age = (t: number, now: number) => {
  const x = now - t;
  return x < h ? Math.round(x / m) + "m" : x < d ? Math.round(x / h) + "h" : Math.round(x / d) + "d";
};

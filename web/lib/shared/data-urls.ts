// A phone photo is many MB and a few of them pass the server's cap; a big raster image
// goes up as a JPEG of at most 2560px a side. Anything that will not decode goes as is.
const MAX_IMG = 1_500_000;
async function shrink(x: File): Promise<File> {
  if (x.size <= MAX_IMG || !/^image\/(jpeg|png|webp|bmp|heic|heif)$/.test(x.type)) return x;
  try {
    const bm = await createImageBitmap(x);
    const k = Math.min(1, 2560 / Math.max(bm.width, bm.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bm.width * k);
    c.height = Math.round(bm.height * k);
    c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return b && b.size < x.size ? new File([b], x.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : x;
  } catch {
    return x;
  }
}
// Files as {name, data-URL}, the shape /note and /icebox take.
export const dataUrls = (files: File[]) =>
  Promise.all(
    files.map(
      async (f) => {
        const x = await shrink(f);
        return new Promise<{ name: string; data: string }>((res) => {
          const rd = new FileReader();
          rd.onload = () => res({ name: x.name, data: rd.result as string });
          rd.readAsDataURL(x);
        });
      },
    ),
  );

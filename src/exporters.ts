import type { ModelerLike } from "./editor";

export function triggerDownload(content: Blob | string, filename: string, mime: string): void {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Rasterize an SVG string to a PNG blob via an offscreen canvas.
export function svgToPngBlob(svg: string): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const sized = svg;
    const img = new Image();
    const svgUrl = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 1200;
      canvas.height = img.naturalHeight || img.height || 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        resolve(null);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((b) => resolve(b), "image/png");
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(svgUrl);
      reject(e instanceof Error ? e : new Error("svg load failed"));
    };
    img.src = svgUrl;
  });
}

export async function exportSvg(
  modeler: ModelerLike,
  baseName: string,
  download: (c: Blob | string, f: string, m: string) => void = triggerDownload,
): Promise<void> {
  const { svg } = await modeler.saveSVG();
  download(svg, `${baseName}.svg`, "image/svg+xml");
}

export async function exportPng(
  modeler: ModelerLike,
  baseName: string,
  download: (c: Blob | string, f: string, m: string) => void = triggerDownload,
  toBlob: (svg: string) => Promise<Blob | null> = svgToPngBlob,
): Promise<void> {
  const { svg } = await modeler.saveSVG();
  const blob = await toBlob(svg);
  if (!blob) throw new Error("No se pudo generar el PNG");
  download(blob, `${baseName}.png`, "image/png");
}

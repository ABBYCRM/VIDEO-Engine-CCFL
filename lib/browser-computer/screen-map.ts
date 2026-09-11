export const VIEW_W = 1280;
export const VIEW_H = 800;

type Rect = { left: number; top: number; width: number; height: number };

function layout(rect: Rect, viewW: number, viewH: number, objectPosition: "top" | "center") {
  const scale = Math.min(rect.width / viewW, rect.height / viewH);
  if (scale <= 0) return null;
  const renderedW = viewW * scale;
  const renderedH = viewH * scale;
  const offsetX = (rect.width - renderedW) / 2;
  const offsetY = objectPosition === "center" ? (rect.height - renderedH) / 2 : 0;
  return { scale, offsetX, offsetY };
}

/** Map a pointer on an object-contain screenshot to the 1280×800 Chrome viewport. */
export function mapContainedClick(args: {
  clientX: number;
  clientY: number;
  rect: Rect;
  viewW?: number;
  viewH?: number;
  objectPosition?: "top" | "center";
}): { x: number; y: number } | null {
  const viewW = args.viewW ?? VIEW_W;
  const viewH = args.viewH ?? VIEW_H;
  const box = layout(args.rect, viewW, viewH, args.objectPosition ?? "top");
  if (!box) return null;
  const x = (args.clientX - args.rect.left - box.offsetX) / box.scale;
  const y = (args.clientY - args.rect.top - box.offsetY) / box.scale;
  if (x < -4 || y < -4 || x > viewW + 4 || y > viewH + 4) return null;
  return {
    x: Math.round(Math.min(viewW - 1, Math.max(0, x))),
    y: Math.round(Math.min(viewH - 1, Math.max(0, y))),
  };
}

export function pointerOffset(
  x: number,
  y: number,
  rect: { width: number; height: number },
  viewW = VIEW_W,
  viewH = VIEW_H,
  objectPosition: "top" | "center" = "top",
): { left: number; top: number } {
  const box = layout({ left: 0, top: 0, ...rect }, viewW, viewH, objectPosition);
  if (!box) return { left: 0, top: 0 };
  return { left: box.offsetX + x * box.scale, top: box.offsetY + y * box.scale };
}

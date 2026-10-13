/** Clamp floating content to the usable viewport, including narrow phones and large text. */
export function popupBounds({ x, y, width, height, topInset = 0, bottomInset = 0, desiredWidth = 300, desiredHeight = 360 }: {
  x: number; y: number; width: number; height: number; topInset?: number; bottomInset?: number; desiredWidth?: number; desiredHeight?: number;
}) {
  const margin = 12;
  const w = Math.max(0, Math.min(desiredWidth, width - margin * 2));
  const maxHeight = Math.max(0, Math.min(desiredHeight, y - topInset - margin - 8, height - topInset - bottomInset - margin * 2));
  return { left: Math.max(margin, Math.min(x, width - w - margin)), width: w, maxHeight };
}

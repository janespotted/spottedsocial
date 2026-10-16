/** Clamp floating content to the usable viewport, including narrow phones and large text. */
export function popupBounds({ x, y, width, height, topInset = 0, bottomInset = 0, desiredWidth = 300, desiredHeight = 360 }: {
  x: number; y: number; width: number; height: number; topInset?: number; bottomInset?: number; desiredWidth?: number; desiredHeight?: number;
}) {
  const margin = 12;
  const w = Math.max(0, Math.min(desiredWidth, width - margin * 2));
  const maxHeight = Math.max(0, Math.min(desiredHeight, y - topInset - margin - 8, height - topInset - bottomInset - margin * 2));
  return { left: Math.max(margin, Math.min(x, width - w - margin)), width: w, maxHeight };
}

/** The pin and card share the map's measured coordinate space, not the window's. */
export function mapPopupLayout({ x, y, width, height, topInset = 0, bottomInset = 0, desiredHeight = 440 }: {
  x: number; y: number; width: number; height: number; topInset?: number; bottomInset?: number; desiredHeight?: number;
}) {
  const margin = 12, pinRadius = 38, pointer = 7;
  const topEdge = topInset + margin, bottomEdge = height - bottomInset - margin;
  const above = Math.max(0, y - pinRadius - pointer - topEdge);
  const below = Math.max(0, bottomEdge - y - pinRadius - pointer);
  const placeAbove = above >= Math.min(desiredHeight, 240) || above >= below;
  const cardHeight = Math.min(desiredHeight, placeAbove ? above : below);
  const cardWidth = Math.min(320, Math.max(0, width - margin * 2));
  const left = Math.max(margin, Math.min(x - cardWidth / 2, width - cardWidth - margin));
  const top = placeAbove ? y - pinRadius - pointer - cardHeight : y + pinRadius + pointer;
  return { left, top, width: cardWidth, height: cardHeight,
    pointerLeft: Math.max(left + 20, Math.min(x - pointer, left + cardWidth - 34)),
    pointerTop: placeAbove ? top + cardHeight - pointer : top - pointer };
}

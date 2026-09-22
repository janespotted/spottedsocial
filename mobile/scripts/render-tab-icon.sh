#!/usr/bin/env bash
# Regenerate the Profile tab-bar icon (assets/images/tab-profile*.png) from
# the SAME path data components/spotted-mark.tsx draws, so the tab mark can
# never drift from the in-app mark.
#
#   ./scripts/render-tab-icon.sh
#
# Why a PNG and not <SpottedMark />: NativeTabs' `Icon.src` is typed
# React.ReactElement but at runtime only accepts expo-router's own VectorIcon
# / promise-loader elements. Any other element is dropped with a console
# warning and the tab renders with no icon at all.
#
# Why white on transparent: a tab-bar icon is a TEMPLATE — iOS discards the
# artwork's colour and re-tints it from the bar (MIST inactive, LAVENDER
# active). Only the alpha channel is used, so the fill colour is irrelevant
# and the mark must NOT carry the lime or any background.
set -euo pipefail
cd "$(dirname "$0")/.."

HEIGHT_PT=25   # Apple's tab-bar glyph box is ~25pt tall
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. Pull viewBox + path straight out of the component.
node -e "
const fs=require('fs');
const src=fs.readFileSync('src/components/spotted-mark.tsx','utf8');
const vb=src.match(/const VIEW_BOX = '([^']+)'/)[1];
const p=src.match(/const PATH =\s*'([^']+)'/)[1];
fs.writeFileSync('$TMP/mark.svg',
  '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"'+vb+'\" preserveAspectRatio=\"xMidYMid meet\">'+
  '<path d=\"'+p+'\" fill=\"#ffffff\"/></svg>');
const [,,w,h]=vb.split(/\s+/).map(Number);
fs.writeFileSync('$TMP/ar', String(w/h));
"

# 2. Rasterise at 1x/2x/3x, keeping the mark's aspect ratio.
cat > "$TMP/render.swift" <<'SWIFT'
import AppKit
let a = CommandLine.arguments
guard a.count >= 5, let w = Int(a[3]), let h = Int(a[4]) else { print("usage"); exit(1) }
guard let src = NSImage(contentsOfFile: a[1]) else { print("bad input"); exit(1) }
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.clear.set()
NSRect(x: 0, y: 0, width: w, height: h).fill()
src.draw(in: NSRect(x: 0, y: 0, width: w, height: h))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
print("wrote \(a[2]) \(w)x\(h)")
SWIFT
swiftc -O "$TMP/render.swift" -o "$TMP/render"

AR="$(cat "$TMP/ar")"
for s in 1 2 3; do
  w=$(node -p "Math.round($HEIGHT_PT*$AR*$s)")
  h=$(node -p "$HEIGHT_PT*$s")
  # Note: no `$(... && echo ...)` here — a false test returns non-zero and
  # `set -e` would kill the loop on the 1x pass.
  if [ "$s" -eq 1 ]; then suffix=""; else suffix="@${s}x"; fi
  "$TMP/render" "$TMP/mark.svg" "assets/images/tab-profile${suffix}.png" "$w" "$h"
done

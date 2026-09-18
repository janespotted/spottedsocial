import AppKit
import CoreImage

// glow.swift <mark.svg-or-png> <out.png> <size> <bgHex|none> <glowRadiusFrac> [cornerFrac]
// Renders a transparent mark, blurs a copy underneath it as a neon glow,
// and composites onto an optional background.
let a = CommandLine.arguments
guard a.count >= 6, let size = Int(a[3]), let glowFrac = Double(a[5]) else {
    print("usage: glow in out size bgHex|none glowFrac [cornerFrac]"); exit(1)
}
let outPath = a[2]
let bgHex = a[4]
let cornerFrac = a.count > 6 ? Double(a[6]) ?? 0 : 0

func color(_ hex: String) -> NSColor? {
    var h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard h.count == 6, let v = Int(h, radix: 16) else { return nil }
    return NSColor(srgbRed: CGFloat((v >> 16) & 0xff)/255.0,
                   green: CGFloat((v >> 8) & 0xff)/255.0,
                   blue: CGFloat(v & 0xff)/255.0, alpha: 1)
}

// 1. Rasterise the source (transparent mark) at target size.
guard let src = NSImage(contentsOfFile: a[1]) else { print("bad input"); exit(1) }
let markRep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: markRep)
src.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
NSGraphicsContext.restoreGraphicsState()
guard let markCG = markRep.cgImage else { print("no mark"); exit(1) }

// 2. Blur a copy for the glow.
let ci = CIImage(cgImage: markCG)
let blur = CIFilter(name: "CIGaussianBlur")!
blur.setValue(ci, forKey: kCIInputImageKey)
blur.setValue(Double(size) * glowFrac, forKey: kCIInputRadiusKey)
let ctx = CIContext()
guard let blurred = blur.outputImage,
      let glowCG = ctx.createCGImage(blurred, from: ci.extent) else { print("no glow"); exit(1) }

// 3. Compose: background, glow (twice for intensity), then the crisp mark.
let out = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: out)
let rect = NSRect(x: 0, y: 0, width: size, height: size)
if let bg = color(bgHex) {
    if cornerFrac > 0 {
        let p = NSBezierPath(roundedRect: rect, xRadius: CGFloat(Double(size)*cornerFrac),
                             yRadius: CGFloat(Double(size)*cornerFrac))
        bg.setFill(); p.fill()
    } else {
        bg.setFill(); rect.fill()
    }
}
let gi = NSImage(cgImage: glowCG, size: rect.size)
gi.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 0.85)
gi.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 0.65)
NSImage(cgImage: markCG, size: rect.size).draw(in: rect)
NSGraphicsContext.restoreGraphicsState()

guard let data = out.representation(using: .png, properties: [:]) else { exit(1) }
try! data.write(to: URL(fileURLWithPath: outPath))
print("ok \(outPath)")

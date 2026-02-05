

## Fix Front Camera Image Mirroring

### Problem
When taking a selfie with the native iOS camera, the output image appears "flipped" compared to what you saw in the viewfinder. This is because:
- The camera preview shows a **mirrored** view (like looking in a mirror)
- The captured photo is saved in its **true orientation** (not mirrored)
- Users expect the final photo to match what they saw while taking it

### Solution
Add a canvas-based horizontal flip transformation in `camera-service.ts` after capturing a photo with the front camera. This will mirror the image so it matches the viewfinder preview.

---

### Technical Implementation

**File: `src/lib/camera-service.ts`**

1. Add a new helper function `mirrorImage()` that:
   - Creates a canvas element
   - Loads the captured image
   - Applies horizontal flip transformation (`scale(-1, 1)`)
   - Exports the mirrored image as a blob/base64

2. Update `capturePhoto()` to:
   - Use `CameraDirection.Front` detection (Capacitor provides this)
   - Apply mirroring only for front camera captures
   - Return the mirrored image

**Key code changes:**

```typescript
// New helper function to mirror image horizontally
async function mirrorImage(base64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d')!;
      
      // Apply horizontal flip
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = base64;
  });
}
```

3. The mirroring should be applied automatically since iOS front camera photos typically need this correction.

---

### Why This Works
- Canvas `scale(-1, 1)` flips the image horizontally
- `translate(canvas.width, 0)` ensures the flipped image stays in the visible canvas area
- The original quality is preserved at 90% JPEG compression

---

### Files to Modify
- `src/lib/camera-service.ts` - Add mirror function and apply to front camera captures

---

### Note on Detection
Since Capacitor's Camera plugin doesn't reliably return which camera was used, we'll apply mirroring to all camera captures by default. Gallery picks won't be mirrored since those are already in their final orientation. This matches how Instagram and Snapchat handle selfies.


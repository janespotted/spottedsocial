

## Swap Post Media Picker Button Hierarchy

### Current State
- **Primary (large):** Choose from Gallery
- **Secondary (small pill):** Take a Photo

### Desired State (matching StoryCaptureScreen)
- **Primary (large):** Take a Photo
- **Secondary (small pill):** Choose from Gallery

---

### Implementation

**File: `src/components/PostMediaPicker.tsx`**

Swap the button layout in the main content area (lines 94-112):

1. Move the Camera button to be the primary large card with:
   - `rounded-3xl bg-white/5 border border-white/10` container
   - Gradient icon circle (`bg-gradient-to-br from-[#a855f7] to-[#d4ff00]`)
   - Camera icon inside
   - "Take a Photo" text

2. Move the Gallery button to be the secondary small pill:
   - `rounded-full bg-white/10` styling
   - Image icon + "Choose from Gallery" text
   - Smaller, understated appearance

---

### Visual Result
The Post creation screen will match the Story creation screen with the camera option prominently featured, encouraging spontaneous photo capture over gallery selection.


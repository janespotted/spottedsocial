

## Fix: Style unclustered venue markers as pins

### Change (`src/pages/Map.tsx`)

Replace the `venue-unclustered` circle layer with a symbol layer using a custom SVG pin image rendered to canvas.

#### 1. Create and register a custom pin image before adding layers (after `addSource`, before `addLayer` calls, ~line 1089)

Generate a teardrop pin shape via canvas:
```typescript
// Create pin image if not already loaded
if (!m.hasImage('venue-pin')) {
  const size = 36;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + 8; // taller for teardrop
  const ctx = canvas.getContext('2d')!;
  
  // Teardrop/pin shape
  ctx.beginPath();
  ctx.moveTo(size / 2, size + 4); // bottom point
  ctx.bezierCurveTo(size / 2 - 2, size - 4, 0, size / 2, 0, size / 2 - 4);
  ctx.arc(size / 2, size / 2 - 4, size / 2, Math.PI, 0, false);
  ctx.bezierCurveTo(size, size / 2, size / 2 + 2, size - 4, size / 2, size + 4);
  ctx.closePath();
  ctx.fillStyle = '#a855f7';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // White dot in center
  ctx.beginPath();
  ctx.arc(size / 2, size / 2 - 4, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  
  m.addImage('venue-pin', canvas, { pixelRatio: 2 });
}
```

Also create a "hot" variant for venues with heat > 0:
```typescript
if (!m.hasImage('venue-pin-hot')) {
  // Same shape but full opacity, slightly brighter
  // ... same canvas code with full opacity fill
  m.addImage('venue-pin-hot', canvas, { pixelRatio: 2 });
}
```

#### 2. Replace the `venue-unclustered` circle layer (lines 1122-1135) with a symbol layer

```typescript
m.addLayer({
  id: 'venue-unclustered',
  type: 'symbol',
  source: 'venues-source',
  filter: ['!', ['has', 'point_count']],
  layout: {
    'icon-image': 'venue-pin',
    'icon-size': 1,
    'icon-anchor': 'bottom',
    'icon-allow-overlap': true,
  },
  paint: {
    'icon-opacity': ['case', ['>', ['get', 'heatScore'], 0], 1, 0.7],
  },
});
```

#### 3. No other changes
- Cluster circles stay as-is (they look good)
- Click/cursor handlers stay the same (they reference `venue-unclustered` layer which keeps the same ID)
- Promoted DOM markers unchanged


# Icon Setup

## Icons Created

Placeholder icons have been created in the `icons/` directory:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

These are simple blue squares (#0088ff) created using ImageMagick.

## Replacing Icons

To replace with custom icons:

1. Create your icon files (PNG format):
   - `icons/icon16.png` - 16x16 pixels
   - `icons/icon48.png` - 48x48 pixels
   - `icons/icon128.png` - 128x128 pixels

2. Rebuild the extension:
   ```bash
   npm run build:test
   ```

3. Icons will be automatically copied to `dist/icons/` during build.

## Using ImageMagick

If you have ImageMagick installed, you can recreate the placeholder icons:

```bash
magick -size 16x16 xc:"#0088ff" icons/icon16.png
magick -size 48x48 xc:"#0088ff" icons/icon48.png
magick -size 128x128 xc:"#0088ff" icons/icon128.png
```

## Icon Requirements

- Format: PNG
- Sizes: 16x16, 48x48, 128x128 pixels
- Location: `icons/` directory (will be copied to `dist/icons/` on build)


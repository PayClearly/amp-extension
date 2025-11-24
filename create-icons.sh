#!/bin/bash
# Create placeholder icons for Chrome extension
# Uses ImageMagick or sips (macOS) to create simple colored squares

ICON_DIR="icons"
mkdir -p "$ICON_DIR"

# Colors: Blue (#08f) for PayClearly
COLOR="#08f"

# Check for ImageMagick
if command -v convert &> /dev/null; then
  convert -size 16x16 xc:"$COLOR" "$ICON_DIR/icon16.png"
  convert -size 48x48 xc:"$COLOR" "$ICON_DIR/icon48.png"
  convert -size 128x128 xc:"$COLOR" "$ICON_DIR/icon128.png"
  echo "Icons created using ImageMagick"
# Check for sips (macOS)
elif command -v sips &> /dev/null; then
  # Create a temporary image first
  sips -c 16 16 --setProperty format png /System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns --out "$ICON_DIR/icon16.png" 2>/dev/null || \
  python3 -c "
from PIL import Image
img16 = Image.new('RGB', (16, 16), color='#0088ff')
img48 = Image.new('RGB', (48, 48), color='#0088ff')
img128 = Image.new('RGB', (128, 128), color='#0088ff')
img16.save('$ICON_DIR/icon16.png')
img48.save('$ICON_DIR/icon48.png')
img128.save('$ICON_DIR/icon128.png')
print('Icons created using Python PIL')
"
else
  # Fallback: Use Python PIL if available
  python3 -c "
from PIL import Image
img16 = Image.new('RGB', (16, 16), color='#0088ff')
img48 = Image.new('RGB', (48, 48), color='#0088ff')
img128 = Image.new('RGB', (128, 128), color='#0088ff')
img16.save('$ICON_DIR/icon16.png')
img48.save('$ICON_DIR/icon48.png')
img128.save('$ICON_DIR/icon128.png')
print('Icons created using Python PIL')
" 2>/dev/null || echo "Error: Need ImageMagick, sips, or Python PIL to create icons"
fi


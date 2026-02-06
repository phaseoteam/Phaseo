# Raycast Extension Assets

## Required Assets

### Icon (Required)
- **File**: `icon.png`
- **Size**: 512x512 pixels
- **Format**: PNG
- **Source**: Convert from `apps/web/src/app/favicon.ico` or create from AI Stats branding

To convert the favicon:
```bash
# Using ImageMagick (if available)
convert apps/web/src/app/favicon.ico -resize 512x512 packages/devtools/raycast-extension/assets/icon.png

# Or manually using any image editing tool
# 1. Open apps/web/src/app/favicon.ico
# 2. Resize to 512x512
# 3. Export as PNG to packages/devtools/raycast-extension/assets/icon.png
```

### Dark Mode Icon (Optional)
- **File**: `icon@dark.png`
- **Size**: 512x512 pixels
- **Format**: PNG
- **Note**: If not provided, Raycast will use the light mode icon for both themes

## Current Status

- [ ] icon.png - Needs to be created from favicon.ico
- [ ] icon@dark.png - Optional

## Notes

- Raycast requires at least one icon.png file
- The icon should represent the AI Stats brand
- Use the favicon from the web app as a starting point
- Ensure the icon is clear and recognizable at small sizes (16x16, 32x32)

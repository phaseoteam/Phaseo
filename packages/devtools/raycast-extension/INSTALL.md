# Installation Guide

## Before Installing

### 1. Create Extension Icon

The extension requires an icon file. Create `assets/icon.png` (512x512 pixels) from the AI Stats favicon:

```bash
# Option 1: Using ImageMagick
convert apps/web/src/app/favicon.ico -resize 512x512 packages/devtools/raycast-extension/assets/icon.png

# Option 2: Manual conversion
# 1. Open apps/web/src/app/favicon.ico in an image editor
# 2. Resize to 512x512 pixels
# 3. Save as packages/devtools/raycast-extension/assets/icon.png
```

### 2. Install Dependencies

```bash
cd packages/devtools/raycast-extension
npm install
```

## Development

### Run in Development Mode

```bash
npm run dev
```

This will:
1. Build the extension
2. Open Raycast
3. Load the extension in development mode

### Configure API Key

1. Open Raycast
2. Search for "AI Stats"
3. Press `⌘ + ,` to open preferences
4. Enter your API key from [api.phaseo.app](https://api.phaseo.app)

## Testing

### Test Each Command

1. **Browse Models**
   - Search for a model by name
   - Try sorting by different criteria
   - View model details
   - Open a model in AI Stats

2. **Browse Organisations**
   - Search for an organisation
   - View organisation details
   - Open in AI Stats

3. **Browse Providers**
   - Search for a provider
   - View provider details
   - Open provider docs

## Building for Production

```bash
npm run build
```

The built extension will be in the `dist/` directory.

## Publishing to Raycast Store

1. Ensure all tests pass
2. Update version in package.json
3. Build the extension
4. Follow [Raycast Extension Publishing Guide](https://developers.raycast.com/basics/publish-an-extension)

## Troubleshooting

### "API key is required" Error
- Make sure you've configured your API key in Raycast preferences
- The key should start with `aistats_`

### "Failed to load models/organisations/providers" Error
- Check your internet connection
- Verify your API key is valid
- Try the API URL in your browser with the auth header

### Extension Not Appearing in Raycast
- Make sure you ran `npm run dev`
- Check the terminal for build errors
- Restart Raycast if needed

## API Endpoints Used

- `GET /v1/models` - List all AI models
- `GET /v1/organisations` - List all organisations
- `GET /v1/providers` - List all API providers

All endpoints require Bearer authentication with your API key.

# Installation Guide

## Install Dependencies

```bash
pnpm install
```

## Development

### Run in Development Mode

```bash
pnpm run dev
```

This will:
1. Build the extension
2. Open Raycast
3. Load the extension in development mode

### Configure API Key

1. Open Raycast
2. Search for "Phaseo"
3. Press `⌘ + ,` to open preferences
4. Enter your API key from [Phaseo](https://phaseo.app)

### Configure a Management API Key (Optional)

The **Usage & Credits** and **Recent Gateway Activity** commands require a
management API key with the relevant read permissions. Open either command and
choose **Configure Management Key** when prompted. Keep this key separate from
your regular gateway API key.

## Testing

### Test Each Command

1. **Browse Models**
   - Search for a model by name
   - Try sorting by different criteria
   - View model details
   - Open a model in Phaseo

2. **Browse Organisations**
   - Search for an organisation
   - View organisation details
   - Open in Phaseo

3. **Browse Providers**
   - Search for a provider
   - View provider details
   - Open provider docs

## Building for Production

```bash
pnpm run build
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
- The key should start with `phaseo_v1_sk_`

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
- `GET /v1/credits` - View workspace credits (management API key)
- `GET /v1/activity` - View workspace activity (management API key)

All endpoints require Bearer authentication. Catalogue endpoints use the regular
API key; account endpoints use the optional management API key.

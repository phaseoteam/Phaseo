# Application icons

The mark and development orange (#ff8800) follow apps/web/src/app/api/favicon/route.ts. Production uses the web dark monochrome variant. SVG sources have corresponding 512px PNGs, multi-resolution Windows ICOs (16–256px), and macOS ICNS (256/512px).

The dev server selects development assets. Packaged builds always use production assets; Windows dev has its own taskbar identity without changing the account/profile directory.

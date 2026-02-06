# AI Stats Ruby SDK (preview)

Generated from the AI Stats Gateway OpenAPI spec. The current wrapper (`lib/index.rb`) only surfaces the `models` endpoint as groundwork.

Status:
- **Preview**: Not published yet. Will be released to RubyGems once the client stabilises.
- Generate with `pnpm openapi:gen:ruby`.

Usage (after generation):
```ruby
client = AIStatsSdk::Client.new(api_key: '<API_KEY>')
resp = client.get_models(limit: 5)
```

Python and TypeScript SDKs are fully supported today; other languages will follow soon.

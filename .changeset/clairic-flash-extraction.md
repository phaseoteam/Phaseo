---
"@phaseo/gateway-api": patch
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
"@phaseo/cpp-sdk": minor
---

Route Cloudflare Clairic Flash (`@cf/cloudflare/clairic-flash`) through `/extractions` alongside Clairic. Extraction usage can now report nonzero `output_tokens`; they are not billed. In the Go, Rust, C#, Java, PHP, Ruby and C++ SDKs, `ExtractionUsage.output_tokens` is now an integer instead of a string or untyped value.

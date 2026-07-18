# Report build notes

- Audience: technical maintainers and pricing-data owners.
- Reading path: assessment, coverage/provenance visual, then supporting notebook and JSON detail.
- Visual: a single bar chart compares providers with and without `pricing_source_url`; fields are `source_status` and `provider_count` from `source_coverage`.
- Main takeaway: 41 of 63 providers with current pricing lack a provider-level source URL.
- Full route, conflict, source-check, methodology, and limitation detail stays in the executed notebook and bounded JSON datasets so the portable report remains responsive.
- The eleven unresolved Ambient/Avian routes and the evidence gap for each are listed in `manual-review-needed.md`.
- Delivery surface: self-contained `report.html`, generated from `artifact.json`; packaged validation and browser verification passed at 1440 px and 390 px.

---
"@phaseo/mobile": patch
---

The mobile model page shows provider uptime the way the website does. Model uptime now shows three per-attempt rates, Reachable, Accepted and Completed, as a 24-hour line each, with the share of attempts that failed each step ("0.6% of attempts couldn't reach the provider", "No failures this hour", "<0.1%" for tiny shares). Tap a rate to see what it measures. Older data without these rates keeps the single uptime line.

Provider rows and the provider sheet use per-attempt uptime too. The sheet adds daily uptime for the last three days and the Reachable, Accepted and Completed breakdown.

The page no longer shows request counts: the uptime chart says what share of requests failed in an hour, and the location picker lists locations without their request counts. The performance empty state now says when a location has too little traffic to publish, as on the website.

---
"@phaseo/web": patch
---

Make the compare page's highlights match what it shows. Context window and max output rows add a digit when two different values would otherwise read the same, so GPT-6 Astra (1,050,000) and Gemini 4 Argon (1,048,576) now read 1.05M and 1.049M, not 1.05M twice with only one highlighted. Lab-reported benchmark scores are shown side by side without a "best" mark, because each lab uses its own version, settings and task set. Performance says "None in the last 24 hours" or "No traffic in the last 5 days" instead of "No traffic yet", which read as never next to Activity's 30-day totals. The sticky model bar now sits below the retirement notice instead of sliding under the header. On phones, model names in the sticky bar and leaderboard titles wrap instead of being cut off, the last page of three models reads "Model 3 of 3", and the providers list shows the cache read price.

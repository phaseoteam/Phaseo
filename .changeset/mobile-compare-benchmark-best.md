---
"@phaseo/mobile": patch
---

Fix the benchmark rows on the mobile compare screen. They showed each model's lowest score and highlighted the worst one as best, because "higher is better" was read backwards. Each model now shows its best score, the highest (or, for ranks and costs, the lowest) is highlighted, and lab-reported scores, ties and single scores get no highlight.

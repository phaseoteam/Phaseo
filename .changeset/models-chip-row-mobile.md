---
"@phaseo/web": patch
---

Make the models page output chips work on phones. Audio now fits on screen (unselected chips drop their count below the `sm` breakpoint), touch screens get an edge fade where the row can still scroll instead of a scrollbar, horizontal swipes stay on the row instead of triggering the browser's back gesture, and a chip that is cut off scrolls fully into view when pressed. Screens above `sm` keep their counts, and mouse users keep the scrollbar.

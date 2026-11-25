---
"@phaseo/web": patch
---

Fix the remaining accessibility issues found by lint and by a scan of the live site. The model pickers in Chat, the pricing calculator and Council now work fully from the keyboard and with screen readers, the colour picker's sliders respond to the arrow keys, dialogs focus their first field instead of using autofocus, and buttons and links now include their visible text in the name screen readers announce. Every accessibility lint rule now fails the pull request.

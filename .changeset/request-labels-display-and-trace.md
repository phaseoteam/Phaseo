---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Request labels are easier to read and use. The request sheet shows them first, in a Labels section laid out like the sheet's other details: each value with its classifier's confidence as a small bar, one quiet line for the classifier, model, cost and its call, and a status only when a classifier failed or reached its budget. The logs table has a Labels column with each request's labels as badges. Every label value, in the sheet or the table, opens the logs filtered to it. The Trace tab is now available to every workspace, and its payload status no longer names the storage backend.

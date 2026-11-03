# Gateway billing reconciliation

`gateway-billing-reconciliation.sql` checks one UTC window, read-only, in three
steps. Run each statement separately on a window of a few days.

1. **Charges to requests.** Each wallet charge (`gateway_request_charges`) is
   joined to the request row of the attempt it paid for through
   `gateway_requests.billing_request_id`. Only `matched` is expected.
2. **Paid requests to charges.** Every successful, non-BYOK request row with a
   cost should have a charge of the same amount. `not_linked` rows were written
   before the link existed or were billed through wallet reservations (batch,
   realtime, and videos paid by capturing their hold); reconcile those through
   their reservations. A video paid by a direct completion charge links to its
   `video_capture:<video id>` charge once the video finishes.
   `charge_shared_by_rows` means two rows carry one charge key, which step 1
   reports as `charge_linked_to_multiple_rows`; that charge counts once.
3. **Customer-side totals for the provider comparison.** Requests, meter
   quantities and charged nanos per provider, executed model, UTC day and price
   meter, from the pricing lines stored on each request.

The charge key is not the public request ID. Every attempt, including each
model fallback, gets its own public ID and its own billing ID, so a failed
attempt's row carries a billing ID with no charge, and the charged attempt's
row carries the charged one.

## Provider costs

Step 3 is only half of the provider comparison. The other half is the
provider's own record for the same UTC window, for every provider that served
paid non-BYOK traffic:

- usage and cost per model and day, with each meter the provider bills
  (input, output, cached read and write, reasoning, images, audio seconds and
  so on), in USD;
- from the provider's usage or cost export, billing API or invoice line items.

Compare quantities first, then cost. Expected differences are meter naming,
rounding (Phaseo rounds each line to whole nanos), and provider billing days
that are not UTC. Margin per provider is the step 3 charged total minus the
provider's cost; do not estimate it from Phaseo's catalogue prices.

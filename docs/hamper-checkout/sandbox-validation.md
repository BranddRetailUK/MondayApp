# Hamper sandbox checkout verification — 10 November 2026

The integration is sandbox-only. It refuses live keys and checks Ultimate Promotions account `acct_1UaBAa7O9atIxBPe`. Sandbox orders never enter fulfilment or production jobs.

## Catalogue and VAT

All 90 SKUs were independently re-extracted from pages 2–91 of the supplied May 2026 corporate brochure. All catalogue VAT percentages and page mappings matched, with no corrections required. The source SHA-256 and per-SKU values are recorded in `test/fixtures/hamper-brochure-vat.json`. There are 40 distinct rates, including five zero-rated products. `npm run test:hampers` compares every SKU against this fixture, checks quantity boundaries and calculates totals for quantities 1 and 10.

For example, Christmas Treats Basket uses 8.2% product VAT; The Christmas Gift Box uses 10.9%; The Sparkle Hamper uses 11.6%; Cheese Cool Bag uses 0%. Delivery is separately charged at £7.25 ex VAT per hamper, with 20% delivery VAT. Product VAT is rounded on the line subtotal, not independently per unit.

## Actual Stripe and deployed-app tests

- Successful card payment: order `5202f7e3-91a9-479d-b57e-e59bdfc0e2d6`, one Christmas Treats Basket, £41.15 total. Provider payment succeeded, webhook persisted `paid`, and the browser showed the confirmation.
- Card decline: Stripe test card ending 0002 was declined in that same checkout; retry with the successful test card completed normally.
- Cancellation: order `ff3f686a-42b6-469a-8529-6519c32d57b8` returned to the cancellation screen without marking it paid. Browser Back resumed that checkout.
- 3-D Secure failure: the test challenge's FAIL action produced Stripe's authentication error and left the order pending.
- 3-D Secure success: retry and COMPLETE authenticated the test card ending 3155. The same order completed for ten hampers at £411.49. Stripe reports `three_d_secure.result=authenticated`; the deployed order and browser confirmation both showed paid.
- Delivery for ten hampers was £72.50 ex VAT plus £14.50 VAT.
- Two genuine completion events were replayed twice against the deployed signed webhook; both returned 200 and retained exactly one ledger row per event.
- Real session creation retries returned the same Stripe session. New quantity-1 and quantity-10 sessions were expired through Stripe; both became `expired` in the database through the deployed webhook.
- Deployed quote rejects quantity 11 (400). Product UI changes to bulk enquiry at 11. Unsigned webhook rejected (400), foreign browser Origin rejected (403), unauthenticated admin API rejected (401), protected admin HTML redirected to login (302).
- Zero-rate product UI showed £0.00 product VAT and £1.45 delivery VAT for one Cheese Cool Bag, £45.19 total.

## Automated checks and limits

`npm run test:hampers` uses PGlite and official Stripe signature verification to exercise schema idempotence, immutable snapshots, untrusted-price rejection, request reuse, total mismatch rejection, invalid signature rejection, live-mode refusal, async success/failure, event deduplication and late expiry after payment.

The authenticated admin view uses existing full Hub access. The browser had no Hub login session, so its login gate was verified; authenticated live rendering was not verified. The checkout is responsive in CSS, but browser viewport override did not take effect, so mobile rendering remains unverified. Refunds remain in Stripe and are not synchronised to Hub order statuses. No live payments, supplier orders, dispatch or marketing emails were sent by these tests.

Run `scripts/test-hamper-stripe-sandbox.js` with the Hub environment and a reachable DB connection for provider session/expiry checks. Run `scripts/verify-hamper-sandbox-payments.js <order-id>...` for paid test orders and duplicate-event replay. Both refuse live keys and avoid logging credentials.

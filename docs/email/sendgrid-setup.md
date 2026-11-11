# Ultimate Promotions SendGrid setup

Railway: UltimateHub / production / UltimateHub. Uses the existing Good Game Apparel SendGrid account and API key, copied directly between Railway services without saving the secret in the repository.

Sender: hampers@ultimatepromotions.co.uk (updated 11 November 2026). Reply-to: sales@ultimatepromotions.co.uk. Sender name: Ultimate Promotions. The ultimatepromotions.co.uk SendGrid domain authentication 33726409 is verified. Campaign sending remains disabled by default; individual tests require explicit authorization.

## Domain authentication

SendGrid authentication ID: 33726462. DNS provider: GoDaddy.

Saved and verified CNAME records in the upcbranding.co.uk zone:

| Host | Target |
| --- | --- |
| em3606 | u59884118.wl119.sendgrid.net |
| s1._domainkey | s1.domainkey.u59884118.wl119.sendgrid.net |
| s2._domainkey | s2.domainkey.u59884118.wl119.sendgrid.net |

Saved `_dmarc` TXT `v=DMARC1; p=none;`. All four records were added after explicit authorization. GoDaddy confirmed the save and SendGrid confirmed domain verification on 29 October 2026. Existing website and nameserver records were preserved.

## Server sending helper

`src/services/sendgrid.js` uses the SendGrid Mail Send API. `scripts/sendgrid-email.js` provides operator-only commands; no public send endpoint or campaign UI is added.

- `node scripts/sendgrid-email.js --status`: non-secret configuration status.
- `node scripts/sendgrid-email.js --validate message.json`: sandbox validation, never delivery.
- `node scripts/sendgrid-email.js --send message.json`: explicit live delivery of one email, only after `SENDGRID_SENDING_ENABLED=true` and `SENDGRID_UNSUBSCRIBE_GROUP_ID` is a positive integer.

Run with Railway-provided environment variables or a secure local environment. Never put an API key in message JSON. Message format: `{ "to": "recipient@example.com", "subject": "...", "html": "...", "text": "..." }`.

Marketing content must contain `<%asm_group_unsubscribe_raw_url%>` in HTML and plain text. Dedicated unsubscribe group **Ultimate Promotions**, ID **43513**, is configured as `SENDGRID_UNSUBSCRIBE_GROUP_ID` in UltimateHub. It is not a default group for the shared account. Provider suppressions are never bypassed. Click/open tracking are explicitly disabled so the shared Goodgame default tracking domain is not used. There is no automatic retry on failure or timeout.

The three finished campaigns are in `emails/christmas-2026/`, with subjects in `campaigns.json`, HTML and plain text bodies. They use hosted Cloudinary photography, collection and product links targeting https://christmashampers.ultimatepromotions.co.uk/, the Unicorn House postal address, and SendGrid unsubscribe/preference tokens. Each product shows the current brochure ex-VAT RRP plus 30%, rounded upwards to the next .49 or .99 price, matching the website. Each email includes six rounded View hamper buttons and an Explore the full range homepage button, matching the site typography and colours. Review inbox tests and obtain an approved recipient list before customer sending; do not infer marketing permission from existing customer records.

## Verification, 29 October 2026

- Five unit tests pass (`node --test test/sendgrid.test.js`).
- Live SendGrid sandbox validation succeeded using the copied UltimateHub configuration; no mail was delivered.
- All three final payloads passed SendGrid sandbox validation. Three explicit tests to scott@brandd.co.uk were accepted (HTTP 202) at 12:48 UTC on 29 October 2026. Acceptance does not confirm inbox delivery.
- Hosted images loaded in all three browser previews; mobile cells are centered. Real Outlook/inbox rendering remains for user review.
- `SENDGRID_SENDING_ENABLED=false` remains set in Railway. The test process alone enabled sending temporarily; no customer emails were sent.

The initial ultimatepromotions.co.uk authentication (33726409) remains pending and unused; no DNS changes were made for that domain.

Updated live-site version: all three passed sandbox validation; one test of the first campaign was accepted for scott@brandd.co.uk at 13:16 UTC on 29 October 2026 (SendGrid message X8FnMj1OT8mgrBs5Sqoljg). No additional customer sends.

November 2026 styling: all three emails use the site’s cream background across the full email window, centred product titles/prices, compact cards without descriptions and matching delivery terms. Body/table/cell inline backgrounds and `bgcolor` fallbacks supplement stylesheet rules for email clients.

- 10 November 2026: all three restyled mailers passed SendGrid sandbox validation. One user-requested test of the first campaign was accepted for scott@brandd.co.uk (subject `[TEST] A little thank you for your team this Christmas`, provider message ID `ZeoRMLlySGOIXFq1hn3YKw`). Inbox delivery/rendering is not independently confirmed. Sending was enabled only in the test process; the shared production sending flag remains disabled.

Each email now contains six products in ascending price order, recorded in `campaigns.json`; the original three gifts remain in each campaign. Product prices round upwards to .49/.99 after the 30% markup. Previous test sends described above predate this six-product revision.

- Latest 10 November test: the first campaign with the wider six-product £29.99–£580.99 range passed sandbox validation and was accepted for scott@brandd.co.uk (SendGrid message `o5AL1KE6RlO3PDVYhU-mvA`). This supersedes the earlier narrow-range test for review; inbox delivery remains unverified.

## Hamper transactional confirmations — 11 November 2026

The existing ultimatepromotions.co.uk authentication **33726409** is now verified. Approved CNAMEs added in GoDaddy: `em9126` → `u59884118.wl119.sendgrid.net`, `s1._domainkey` → `s1.domainkey.u59884118.wl119.sendgrid.net`, `s2._domainkey` → `s2.domainkey.u59884118.wl119.sendgrid.net`. Existing DMARC and other records were preserved.

Paid live hamper confirmations use hampers@ultimatepromotions.co.uk as From and Reply-To, with the generated invoice PDF attached. The worker uses the existing private SendGrid API key and a separate `HAMPER_EMAIL_ENABLED` flag. Marketing sending remains disabled. Charlie receives a hidden BCC controlled by `HAMPER_EMAIL_MONITOR_ENABLED` and `HAMPER_EMAIL_MONITOR_BCC`; turn the former off to disable monitoring. A sent outbox status means SendGrid accepted the message; inbox delivery needs provider/inbox evidence. Never automatically resend unknown deliveries, as a timeout may follow provider acceptance.

- 11 November 2026: confirmation preview accepted by SendGrid for scott@brandd.co.uk with hidden monitoring copy to charlie@ultimatepromotions.co.uk, message ID `UrxGVxMmSu-tlhXIz43yeg`. Attached HINV-000000.pdf is explicitly a sandbox preview, not a live VAT invoice. No charge, Hub order or discount redemption was created. Browser preview checked; inbox delivery is not independently confirmed. Fifteen checkout/invoice/email tests passed.

# Ultimate Promotions SendGrid setup

Railway: UltimateHub / production / UltimateHub. Uses the existing Good Game Apparel SendGrid account and API key, copied directly between Railway services without saving the secret in the repository.

Sender and reply-to: sales@ultimatepromotions.co.uk. Sender name: Ultimate Promotions.

## Domain authentication

SendGrid authentication ID: 33726409. DNS provider: GoDaddy.

Add these CNAME records in the ultimatepromotions.co.uk zone:

| Host | Target |
| --- | --- |
| em9126 | u59884118.wl119.sendgrid.net |
| s1._domainkey | s1.domainkey.u59884118.wl119.sendgrid.net |
| s2._domainkey | s2.domainkey.u59884118.wl119.sendgrid.net |

The existing `_dmarc` TXT record is already `v=DMARC1; p=none;`; preserve it, do not create a duplicate. Check for existing DKIM records before adding these CNAMEs. Verify the domain in SendGrid after propagation. Domain authentication is pending until that succeeds.

## Server sending helper

`src/services/sendgrid.js` uses the SendGrid Mail Send API. `scripts/sendgrid-email.js` provides operator-only commands; no public send endpoint or campaign UI is added.

- `node scripts/sendgrid-email.js --status`: non-secret configuration status.
- `node scripts/sendgrid-email.js --validate message.json`: sandbox validation, never delivery.
- `node scripts/sendgrid-email.js --send message.json`: explicit live delivery of one email, only after `SENDGRID_SENDING_ENABLED=true` and `SENDGRID_UNSUBSCRIBE_GROUP_ID` is a positive integer.

Run with Railway-provided environment variables or a secure local environment. Never put an API key in message JSON. Message format: `{ "to": "recipient@example.com", "subject": "...", "html": "...", "text": "..." }`.

Marketing content must contain `<%asm_group_unsubscribe_raw_url%>` in HTML and plain text. Select/create a dedicated Ultimate Promotions unsubscribe group in the shared SendGrid account and configure its ID before live sending. Provider suppressions are never bypassed. Click/open tracking are explicitly disabled so the shared Goodgame default tracking domain is not used. There is no automatic retry on failure or timeout.

The three hamper emails remain approval drafts: replace enquiry/footer placeholders and local asset URLs before using them. Supply the business postal address and an approved recipient list before a campaign is sent. Do not infer marketing permission from existing customer records.

## Verification, 29 October 2026

- Five unit tests pass (`node --test test/sendgrid.test.js`).
- Live SendGrid sandbox validation succeeded using the copied UltimateHub configuration; no mail was delivered.
- `SENDGRID_SENDING_ENABLED=false` until domain verification and campaign preparation are complete.

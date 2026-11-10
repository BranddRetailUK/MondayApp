# Ultimate Christmas

Live site: https://ultimatechristmas-production.up.railway.app/

Dedicated Railway service `ultimatechristmas` (3334c04d-0daa-4359-95b8-c881561e2d37) in UltimateHub production (25edd9ec-8cf4-499c-b136-da2a1828b1b6), project b51fde69-eb1d-4b68-b772-a895c9676c31. Docker uses nginx on port 8080; only HTML, CSS, JS and public assets are served. `/health` returns 200. No credentials or database access are required.

Deploy from repository root:

```sh
railway up web/hamper-collection --path-as-root --project b51fde69-eb1d-4b68-b772-a895c9676c31 --environment 25edd9ec-8cf4-499c-b136-da2a1828b1b6 --service 3334c04d-0daa-4359-95b8-c881561e2d37 --detach --json
```

Deployment uses local directory uploads; GitHub autodeploy is not connected. Check the returned deployment ID reaches SUCCESS before reporting a release. Local preview: `python3 -m http.server 3119 --bind 127.0.0.1 --directory web/hamper-collection`.

Prices exclude VAT and use each brochure ex-VAT RRP × 1.30, rounded once to the nearest penny. The supplier's 15% discount through 16 November 2026 is retained by Ultimate and does not reduce the published selling price. Source: AW26 Spicers of Hythe Corporate Brochure May 2026, all 90 products on PDF pages 2–91. `products.json` records the selling price, brochure ex-VAT price, product-specific VAT percentage, SKU and source page. VAT percentages are retained for the future orders backend; no VAT is currently calculated or collected.

Individual delivery to one UK mainland address costs clients £7.25 + VAT; bulk delivery is POA. Ultimate's supplier delivery cost is £6.25 and is not customer-facing. A printed gift card may use one shared message across all hampers in the order, with no individual personalisation.

Enquiry controls open the user's email client with the chosen product and quantity. There is no checkout. All three email campaigns show the same ex-VAT selling prices and delivery terms and link directly to the live product pages and homepage. Updating these templates does not send any emails.

The full brochure catalogue is available on the website: 90 product pages with exact SKU/source-page records and extracted product photographs. The original nine featured products retain their URLs and lead the collection; remaining products follow brochure order. Similar-price related products link to valid catalogue pages. The three mailers retain only their original nine products. Clock-only and tree-only listings explicitly exclude drinks.

The homepage offers an accessible price-band filter based on displayed ex-VAT selling prices, with a live result count. All prices restores the full collection; without JavaScript the full collection remains visible.

Sort by offers Featured, Price: low to high and Price: high to low. Sorting and price filtering work together, with stable original ordering for equal prices.

Cache handling: nginx sends `Cache-Control: no-cache` for revalidation, and HTML references `site.js` / `style.css` with the first 12 SHA-256 hex characters in `?v=`. Refresh those hashes across all HTML pages whenever either asset changes, so browsers holding older unversioned assets request the new release.

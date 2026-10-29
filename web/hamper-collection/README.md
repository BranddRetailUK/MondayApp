# Ultimate Christmas

Live site: https://ultimatechristmas-production.up.railway.app/

Dedicated Railway service `ultimatechristmas` (3334c04d-0daa-4359-95b8-c881561e2d37) in UltimateHub production (25edd9ec-8cf4-499c-b136-da2a1828b1b6), project b51fde69-eb1d-4b68-b772-a895c9676c31. Docker uses nginx on port 8080; only HTML, CSS, JS and public assets are served. `/health` returns 200. No credentials or database access are required.

Deploy from repository root:

```sh
railway up web/hamper-collection --path-as-root --project b51fde69-eb1d-4b68-b772-a895c9676c31 --environment 25edd9ec-8cf4-499c-b136-da2a1828b1b6 --service 3334c04d-0daa-4359-95b8-c881561e2d37 --detach --json
```

Deployment uses local directory uploads; GitHub autodeploy is not connected. Check the returned deployment ID reaches SUCCESS before reporting a release. Local preview: `python3 -m http.server 3119 --bind 127.0.0.1 --directory web/hamper-collection`.

Prices are the VAT-inclusive RRPs from the supplied AW26 Spicers of Hythe Corporate Brochure May 2026, PDF pages 2, 3, 9, 21, 23, 25, 32, 34 and 45. `products.json` records prices, SKUs and source pages. Enquiry controls open the user's email client with the chosen product and quantity. There is no checkout. The three email campaigns link directly to the live product pages and homepage.

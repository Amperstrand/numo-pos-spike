# Numo (cashubtc/numo) — Research Report

**Repo researched:** https://github.com/cashubtc/numo
**Local clone:** `/home/z/my-project/numo-research`
**Purpose:** Background research for a hackathon POS (point-of-sale) demo.

---

## TL;DR — Critical Findings Up Front

1. **Numo is NOT a server, NOT a Node/Bun/Next.js project, and NOT a payment gateway.**
   It is a native **Android (Kotlin/Java)** Point-of-Sale **app** that a merchant runs
   on an Android phone. It receives Cashu ecash and Lightning payments.

2. **There is NO inbound REST API, NO inbound WebSocket, and NO deep-link / URL scheme**
   registered in `AndroidManifest.xml` that lets an external web shop trigger Numo to
   "request payment from a customer." The only externally observable surface is an
   **outbound webhook** that Numo fires *after* a payment is received.

3. **The integration model is webhook-based, post-confirmation.** The Next.js web shop
   exposes a webhook endpoint; the merchant configures that endpoint inside Numo
   (Settings → Webhooks → Add Endpoint, optionally with a Bearer auth key). After the
   merchant taps Charge and the customer pays (Cashu NFC tap or Lightning QR), Numo
   POSTs a `payment.received` webhook to the configured endpoint.

4. **The hackathon-friendly path is one of these:**
   - **(A) Webhook-listener pattern** — Next.js app receives webhooks from a real Numo
     install on an Android device. Post-confirmation only.
   - **(B) BTCPay-as-orchestrator pattern** — Run the bundled BTCPay + Cashu plugin
     Docker stack (`integration-tests/btcpay/docker-compose.yml`). Next.js creates
     invoices via BTCPay Greenfield API and gets both a BOLT11 + a Cashu payment
     request back. Numo is not strictly needed in this flow, but can be configured to
     use BTCPay as its backend (`Settings → BTCPay`).
   - **(C) Mock / direct-Cashu pattern** — Skip Numo entirely and build a Next.js POS
     that talks the Cashu protocol directly via `@cashu/cashu-ts` (npm). Emit Numo's
     webhook contract from your own backend so the rest of the demo "feels" Numo-shaped.

5. **Default mints (real, mainnet, real sats):**
   - `https://mint.minibits.cash/Bitcoin` ← preferred Lightning mint
   - `https://mint.macadamia.cash`
   - `https://antifiat.cash`
   - `https://mint.cubabitcoin.org`
   For local test sats, use the regtest docker-compose (Cashu `cashubtc/mintd:latest`
   exposed on `http://localhost:3338`).

---

## 1. Project Overview

**Numo 🥜⚡** is an Android Point-of-Sale terminal that lets a merchant accept
**Cashu ecash** (via NFC tap-to-pay) and **Bitcoin Lightning** (via BOLT11 QR).

From the README:

> "Numo is an Android Point-of-Sale application that enables merchants to receive
> Cashu ecash payments via tap-2-pay. ... The merchant enters the desired amount in
> satoshis using the application's keypad. When they press 'Charge', a payment screen
> appears and a type-4 forum tag is emulated with a Cashu PaymentRequest string as its
> content. When the payer approaches their phone, their Cashu wallet will interact with
> the emulated tag using the NDEF protocol, reading the contents and decoding the
> payment request. Immediately after, the paying wallet will write a Cashu token with
> the requested amount to the emulated tag and Numo will process it."

Key features:
- Tap-2-pay with Cashu ecash over NFC NDEF (HCE)
- Cashu over Nostr (NIP-17) as an alternative transport
- Lightning BOLT11 invoices (displayed as QR + written to the emulated tag)
- Optional external BTCPay Server (Greenfield API + Cashu plugin) as a backend
- Withdraw received sats to self-custody or to a Lightning address
- Auto-withdrawal after a threshold
- Merchant item catalogs, saved baskets, barcode scanning, tips, VAT, payment history,
  webhook dispatch, insights/analytics
- Android 7.0+ (API 24), NFC + HCE required for tap-to-pay

**License:** MIT.

---

## 2. Tech Stack

Source of truth: `app/build.gradle.kts`, `gradle/libs.versions.toml`, `AGENTS.md`.

| Concern | Choice |
|---|---|
| Platform | Android (minSdk 24, targetSdk 36, Java 17 toolchain) |
| Languages | Kotlin (primary), Java (legacy/interop) |
| Build | Gradle (Kotlin DSL) — `./gradlew assembleDebug` |
| UI | View binding (`viewBinding = true`), XML layouts. **No Jetpack Compose.** |
| Architecture | MVVM/MVC mix, Android Navigation Components, ViewBinding |
| Networking | OkHttp 3 / 4.12.0 |
| JSON / CBOR | Gson 2.10.1, Jackson 2.16.1, `com.upokecenter:cbor:4.5.2` |
| Crypto | BouncyCastle `bcprov-jdk18on:1.80` |
| Cashu SDK | `org.cashudevkit:cdk-android:0.18.0-rc.0` (CDK — Cashu Development Kit) |
| QR / scanning | ZXing core 3.5.3, CameraX 1.4.2, ML Kit barcode 17.3.0 |
| Coroutines | `kotlinx-coroutines` |
| Test stack | JUnit 4, Mockito-Kotlin, Robolectric, MockWebServer |
| Version | v1.9 (versionCode 25) |
| Application ID | `com.electricdreams.numo` |

**What is NOT in the repo:** there is **no `package.json`** anywhere. The only
TypeScript file in the repo is `docs/webhook-payload-v2.ts`, which is a *documentation*
schema for downstream webhook consumers, not runtime code. The repo contains no Node,
Bun, Next.js, Express, or any server runtime. There is no HTTP server in the Android
code either — `OkHttpClient` is used only for *outbound* calls (mints, BTCPay,
webhooks, Nostr WebSocket).

There is also a top-level `satocash_client.py` — that is a *standalone Python*
reference client for the **Satocash JavaCard applet** (a separate hardware product
mentioned in the README's commented-out section). It is not Numo and not how an
external system would talk to Numo.

---

## 3. Cashu Protocol — High-Level Refresher

Cashu is a Chaumian ecash protocol over Bitcoin. The key concepts you need for a
hackathon integration:

### 3.1 Mint
A **mint** is a trusted HTTP server (in this repo: `cashubtc/mintd:latest`, the CDK
mint daemon). It holds Bitcoin (typically via a Lightning node) and issues digital
tokens that are claims on that Bitcoin. Trust is required in the mint not to inflate
or default; for the demo, trust comes from running the mint yourself.

Mint URLs look like `https://mint.minibits.cash/Bitcoin`. Standard REST endpoints
under `/v1/...`:
- `GET /v1/keys` — current keysets
- `GET /v1/keysets/{keysetId}/keys`
- `POST /v1/mint/quote/bolt11` (NUT-04) — request a BOLT11 invoice; mint returns a quote
- `GET /v1/mint/quote/bolt11/{quoteId}` — poll quote state (UNPAID / PAID / ISSUED)
- `POST /v1/mint/bolt11` — turn a paid quote into blinded ecash proofs
- `POST /v1/melt/quote/bolt11` (NUT-05) — request the mint to pay a BOLT11 invoice for you
- `POST /v1/melt/bolt11` — execute the melt using ecash proofs
- `POST /v1/swap` — atomically swap proofs for new proofs (different denominations / same mint)
- `GET /v1/info` (NUT-15) — mint capabilities, supported nuts, limits
- `GET /v1/checkstate/{Ys}` (NUT-09) — check whether proofs are spent
- `wss://<mint>/v1/ws` (NUT-17) — WebSocket for subscribe/notify on quote state

### 3.2 Tokens / Proofs
A Cashu **token** is a bundle of **proofs**. Each proof is a blinded Chaumian signature
on a secret, with an associated satoshi denomination. A wallet holds proofs; the sum
of denominations is the wallet balance. Tokens are exchanged peer-to-peer (off-mint)
to transfer value.

Encodings (from `CashuPaymentHelper`):
- `cashuA...` — JSON-encoded token, base64url
- `cashuB...` — CBOR-encoded token, base64url (preferred, compact)
- `crawB...` — raw binary CBOR variant (also accepted by Numo)

Tokens commonly appear in URLs as `https://cashu.me/#token=cashuB...`.

### 3.3 How a payment works (Numo's two flows)

**A. Cashu NFC tap-to-pay (ecash, off-Lightning):**
1. Numo creates a **NUT-18 Payment Request** string (`creqA...` base64url-CBOR or
   its Bech32 form `creq1...`) carrying: id, amount, unit (sat), description,
   single-use flag, and optionally a list of allowed mint URLs.
2. Numo writes that string to an emulated NFC Type 4 NDEF tag (HCE).
3. The payer's Cashu wallet reads the NDEF Text record, parses the request,
   constructs a Cashu token of the requested amount, and writes that token back to
   the tag via UPDATE BINARY APDUs.
4. Numo extracts and validates the token (`CashuPaymentHelper.validateTokenDetailed`),
   checks the mint is allowed (or swaps if "accept unknown mints" is enabled and the
   mint supports Lightning), and redeems the proofs with the mint.

**B. Lightning BOLT11 flow (NUT-04 mint quote):**
1. Numo calls `mintQuote(Bolt11, amount, description)` on the preferred Lightning
   mint. The mint returns a quote with a BOLT11 invoice and a quote id.
2. Numo shows the BOLT11 as a QR and also writes `lightning:<bolt11>` to the NDEF tag.
3. Customer pays the BOLT11 from any Lightning wallet.
4. Numo subscribes to the mint's WebSocket (`/v1/ws`, kind=`bolt11_mint_quote`)
   **and** polls `GET /v1/mint/quote/bolt11/{quoteId}` in parallel. Either path
   triggers `tryMintOnce` (atomic, only one wins) which calls `POST /v1/mint/bolt11`
   to mint fresh proofs to Numo's wallet.

### 3.4 NUT-18 Payment Request — wire format (from `CashuPaymentHelper.createPaymentRequest`)
CBOR map with keys:
- `i` — payment id (8-char prefix of a UUID)
- `a` — amount (integer)
- `u` — unit (`"sat"` / `"msat"` / `"usd"` / `"eur"`)
- `d` — description string
- `s` — single-use boolean
- `m` — optional array of allowed mint URLs (omitted entirely when "accept unknown
  mints" is on, so paying wallets don't treat it as a strict requirement)
- `t` — optional transports array (e.g. `{t: "nostr", a: <nprofile>, g: [["n","17"]]}`
  or `{t: "post", a: <url>}` for HTTP POST token-return transport)

Encoded as `"creqA" + base64url(cbor)` (no padding), or converted to Bech32 form
`"creq1..."` via `org.cashudevkit.PaymentRequest.toBech32String()`.

A unified BIP21 URI is also produced: `bitcoin:?creq={creq1...}&lightning={lnbc...}`.

---

## 4. Integration Model — How an External Web Shop Interacts with Numo

### 4.1 What is *not* possible
There is no:
- inbound HTTP server in the Android app,
- inbound WebSocket server,
- Android deep-link / custom URL scheme registered in `AndroidManifest.xml`,
- ADB-triggered intent endpoint exposed to other apps over the network,
- exported launcher activity that accepts payment parameters from an external app.

The only exported components are `OnboardingActivity` (launcher) and
`ModernPOSActivity` (also launcher). `PaymentRequestActivity` is `exported="false"`.
The only externally callable service is `NdefHostCardEmulationService`, which is
locked behind `android.permission.BIND_NFC_SERVICE` and only callable by the Android
NFC framework — not by Next.js.

**Therefore: an external Next.js web shop cannot programmatically tell Numo
"charge this customer X sats."** That interaction is a *human* interaction: the
merchant taps the amount into Numo on the Android device.

### 4.2 What *is* possible — the outbound webhook
The only programmatic surface an external system has onto Numo is the
**`payment.received` webhook** (`PaymentWebhookDispatcher` +
`WebhookSettingsManager`). After a payment succeeds (Cashu token redeemed or
Lightning mint quote state = `ISSUED`), Numo:

1. Constructs a v2 payload (see `docs/webhook-payload-v2.ts`).
2. POSTs it as JSON to every configured webhook endpoint URL.
3. Retries up to 3 times (immediate, +1 s, +2.5 s) on non-2xx or transport errors.
4. Optionally sends `Authorization: Bearer <authKey>` if the user configured one.

The merchant configures endpoints in-app at
`Settings → Webhooks → Add Endpoint`. URLs must be `http(s)://`.

This is **post-confirmation only**. The webhook fires *after* the money is in the
merchant's wallet. It cannot initiate, modify, hold, or cancel a payment.

### 4.3 Recommended integration approach for a hackathon Next.js spike

Pick one of three patterns depending on what hardware you have and what story you
want to tell:

#### Pattern A — Real Numo + Next.js webhook listener
**Use when:** you have an Android phone with NFC, you've built the Numo debug APK,
and you want a live end-to-end demo.

- Build & install Numo: `./gradlew assembleDebug && ./gradlew installDebug`
- Complete onboarding (create wallet, accept default mints, or restore from seed).
- In Next.js, expose `POST /api/numo/webhook` that:
  - Validates `Authorization: Bearer <shared-secret>` if you set one.
  - Parses `payloadVersion: 2`, reads `payment.paymentId`, `payment.amountSats`,
    `payment.paymentType` (`"cashu"` | `"lightning"`), `payment.status`, optional
    `checkout.items[]` (line items).
  - Marks the matching order as paid (you key on `paymentId` or a basket id you
    already wrote to the order when the merchant started the charge).
- In Numo: `Settings → Webhooks → Add Endpoint` →
  `https://<your-ngrok-or-tunnel>/api/numo/webhook` + your bearer secret.
- Demo flow: customer orders in your web shop, merchant types the same amount into
  Numo (or scans a QR generated by your web shop to pre-fill Numo's basket), customer
  taps or pays Lightning, Numo fires the webhook, your web shop flips to "Paid."

**Hackathon caveat:** matching a specific web-shop order to a Numo payment requires
*human* coordination (the merchant typing the same number) unless you also pre-load
a basket via CSV import in Numo (there's `CsvImportHelper` and a basket system in
`feature/items/` + `feature/baskets/`). Numo's own item catalog is local to the
Android device — not synced from your web shop.

#### Pattern B — BTCPay Server as the orchestrator (recommended if you want the
web shop to *initiate* the charge)

Numo ships a complete BTCPay + Cashu plugin + CDK-mint integration test stack at
`integration-tests/btcpay/`. Bring it up with `docker compose up` and run
`provision.sh`. You get:
- BTCPay Server on `http://localhost:49392` (admin@example.com / Password123!)
- A Cashu-enabled store with POS app
- A CDK mint on `http://localhost:3338` (trusted by BTCPay)
- Two LND nodes (BTCPay internal + customer) on Bitcoin regtest

Then your Next.js web shop talks **directly to BTCPay**:
- `POST /api/v1/stores/{storeId}/invoices` with `Authorization: token {apiKey}` and
  body `{"amount":"<sats>","currency":"SATS","metadata":{"itemDesc":"...",
  "posData":"<cart-json>"}}` → returns `{"id":"<invoiceId>", ...}`
- `GET /api/v1/stores/{storeId}/invoices/{invoiceId}/payment-methods` → array
  containing entries for `BTC-LN` (with `destination` = BOLT11) and `BTC-Cashu` /
  `Cashu*` (with `destination` = `creq1...` payment request).
- Customer pays either method; BTCPay settles the invoice.
- Your Next.js polls `GET .../invoices/{invoiceId}` for `status: "Settled"` or
  registers a BTCPay webhook (`/api/v1/stores/{storeId}/invoices/{invoiceId}/events`).

**Optionally** configure Numo to use this BTCPay instance as its backend
(`Settings → BTCPay`): enter server URL, API key, store ID, optional POS app ID.
When BTCPay is enabled, Numo's "Charge" button creates a BTCPay invoice instead of
a local Cashu/Lightning quote (see `PaymentServiceFactory.create()` →
`BTCPayPaymentService`).

#### Pattern C — Skip Numo; build a Next.js POS that speaks Cashu directly
**Use when:** you don't have an Android device, your hackathon wants a web-only demo,
or you want full control.

Use [`@cashu/cashu-ts`](https://www.npmjs.com/package/@cashu/cashu-ts) on the Next.js
server side (it's the reference TS SDK). Steps:

1. Initialize a `CashuMint` against one of the default mints (or your local CDK
   mint on `http://localhost:3338`). Call `mint.getInfo()` to fetch supported nuts.
2. Create a `CashuWallet({mint, unit: "sat"})`.
3. **To receive** (merchant side): `wallet.createMintQuote(amount)` returns a BOLT11
   invoice + quote id. Display the BOLT11 as a QR. Subscribe to quote updates via
   `wallet.checkMintQuote(quoteId)` polling or the mint WebSocket
   (`wss://<mint>/v1/ws`). When state = `PAID`, call `wallet.mintProofs(amount, quoteId)`
   to receive the proofs.
4. **To send** (customer side, in another browser tab/wallet): build a token from
   proofs you already hold (`wallet.serializeProofs(proofs)` → `cashuB...`), or pay
   the BOLT11 with any Lightning wallet.
5. To mimic Numo's UX, encode a NUT-18 request: `creq1...` carrying `{a: amount,
   u: "sat", d: description, m: [mintUrl]}` and show it as both a QR and a deep-link
   `https://cashu.me/#token=...` for cashu.me compatibility.

Then either:
- (a) Emit Numo-shaped `payment.received` v2 webhooks from your Next.js backend to
  pretend you're Numo (so other parts of your demo consume the same contract), OR
- (b) Skip the webhook entirely and just use Next.js server actions / SSE to update
  the POS UI.

---

## 5. Key API Endpoints / Methods (from the source)

### 5.1 Outbound webhook from Numo → your server
- **Method:** `POST <configured-endpoint-url>`
- **Headers:**
  - `Content-Type: application/json`
  - `Accept: application/json`
  - `User-Agent: Numo/<versionName>`
  - `X-Numo-Event: payment.received`
  - `X-Numo-Event-Id: <uuid-v4>`
  - `Authorization: Bearer <authKey>` *(only if the user configured an auth key)*
- **Retry:** 3 attempts (delay 0 ms, 1 000 ms, 2 500 ms).
- **Body:** the v2 payload below.

**Example payload** (from `docs/webhook-payload-v2.ts`):

```json
{
  "event": "payment.received",
  "payloadVersion": 2,
  "eventId": "9e8a7b6c-...",
  "timestampMs": 1736000000000,
  "timestampIso": "2025-01-04T12:00:00.000Z",
  "payment": {
    "paymentId": "abc12345",
    "amountSats": 1500,
    "paymentType": "cashu",
    "status": "completed",
    "mintUrl": "https://mint.minibits.cash/Bitcoin",
    "tipAmountSats": 0,
    "tipPercentage": 0,
    "basketId": null,
    "lightningInvoice": null,
    "lightningQuoteId": null,
    "lightningMintUrl": null
  },
  "transaction": {
    "paymentId": "abc12345",
    "status": "completed",
    "paymentType": "cashu",
    "amountSats": 1500,
    "baseAmountSats": 1500,
    "tipAmountSats": 0,
    "tipPercentage": 0,
    "unit": "sat",
    "entryUnit": "sat",
    "enteredAmount": 1500,
    "formattedAmount": "1 500 sats",
    "bitcoinPrice": null,
    "mintUrl": "https://mint.minibits.cash/Bitcoin",
    "lightningInvoice": null,
    "lightningQuoteId": null,
    "lightningMintUrl": null,
    "paymentRequest": "creq1...",
    "basketId": null,
    "dateMs": 1736000000000,
    "swapToLightningMint": null
  },
  "checkout": null,
  "terminal": {
    "platform": "android",
    "appPackage": "com.electricdreams.numo",
    "appVersionName": "1.9",
    "appVersionCode": 25
  }
}
```

If the payment originated from a Numo checkout basket (itemized), `checkout` is
populated with `checkoutBasketId`, `currency`, `totalSatoshis`, `itemCount`,
`hasVat`, `vatBreakdown`, and `items[]` (each with `itemId`, `uuid`, `name`, `sku`,
`quantity`, `priceType`, `netTotalCents`, `grossTotalCents`, etc.). See
`docs/webhook-payload-v2.ts` for the full schema.

**Important:** the Cashu token itself is *never* included in the payload.

### 5.2 Mint REST endpoints Numo uses internally (Lightning flow)

These are the standard Cashu NUT endpoints Numo hits via the CDK. Useful for the
Next.js Pattern C above.

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/v1/info` | — | Mint capabilities (NUT-15) |
| GET | `/v1/keys` | — | All keysets (NUT-02) |
| POST | `/v1/mint/quote/bolt11` | `{amount, unit, description?}` | Get a BOLT11 invoice + quote id (NUT-04) |
| GET | `/v1/mint/quote/bolt11/{quoteId}` | — | Poll quote state |
| POST | `/v1/mint/bolt11` | `{quote, outputs: [BlindedMessage...]}` | Mint proofs after payment |
| POST | `/v1/melt/quote/bolt11` | `{unit, request: <bolt11>}` | Ask the mint to pay a BOLT11 (NUT-05) |
| POST | `/v1/melt/bolt11` | `{quote, inputs: [Proofs...]}` | Execute the melt |
| POST | `/v1/swap` | `{inputs: [...], outputs: [...]}` | Atomic swap of proofs |
| GET | `/v1/checkstate/{Ys}` | — | Check if proofs are spent (NUT-09) |
| WS | `/v1/ws` | sub: `{kind:"bolt11_mint_quote", filters:[{quoteId}]}` | Live updates (NUT-17) |

### 5.3 BTCPay Greenfield endpoints (when Numo is configured to use BTCPay)

These are what `BTCPayPaymentService` calls. Your Next.js app can hit them directly
if you run the BTCPay stack from `integration-tests/btcpay/docker-compose.yml`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/stores/{storeId}/invoices` | `Authorization: token {apiKey}` | Create a SATS-denominated invoice |
| POST | `/apps/{appId}/pos` | form-encoded `cartData=<json>` | Create a POS invoice linked to inventory (returns 302 with `Location: /i/{invoiceId}`) |
| GET | `/api/v1/stores/{storeId}/invoices/{invoiceId}` | `Authorization: token {apiKey}` | Poll status: New / Processing / Settled / Expired / Invalid |
| GET | `/api/v1/stores/{storeId}/invoices/{invoiceId}/payment-methods` | `Authorization: token {apiKey}` | Array of `{paymentMethodId, destination}` — find `BTC-LN` (destination = BOLT11) and `*-Cashu*` (destination = `creq1...`) |
| POST | `/cashu/pay-invoice?token={token}&invoiceId={invoiceId}` | `Authorization: token {apiKey}` | Redeem a Cashu token against a BTCPay invoice |
| POST | `/api/v1/stores/{storeId}/cashu/wallet` | `Authorization: token {apiKey}` | Create Cashu wallet (returns mnemonic) |
| PUT | `/api/v1/stores/{storeId}/cashu` | `Authorization: token {apiKey}` | Enable Cashu payment method, set `paymentModel` (e.g. `TrustedMintsOnly`) and `trustedMintsUrls` |
| POST | `/api/v1/stores/{storeId}/apps/pos` | `Authorization: token {apiKey}` | Create a POS app with `template` (JSON string of items) |

`provision.sh` shows the full sequence end-to-end, including the JSON shape for
POS items: `[{"id":"test-item-coffee","title":"Test Coffee","price":1000,"priceType":"Fixed","description":"..."}]`.

### 5.4 NFC NDEF protocol (the actual tap-to-pay wire format)

Documented in `docs/NDEF_Payer_Side_Spec.md`. Summary:

- Numo emulates a **Type 4 NDEF tag** via Android HCE.
- Tag AID: `D2 76 00 00 85 01 01` (select APDU: `00 A4 04 00 07 D2 76 00 00 85 01 01 00`).
- Capability Container file ID: `E1 03` (15 bytes, advertises max NDEF size 0x70FF = 28 671 B).
- NDEF file ID: `E1 04` (single Text record, language `"en"`, payload = payment string).
- Payer reads the NDEF, parses the payment payload (one of: `bitcoin:?creq=...&lightning=...`,
  raw `creqA...`, or `lnbc...`), then writes back an NDEF message containing a Cashu
  token via one or more `UPDATE BINARY` APDUs.
- Numo accepts either Text or URI NDEF records; the token string is extracted via
  `CashuPaymentHelper.extractCashuToken` (recognizes `cashuA`, `cashuB`, `crawB`,
  `#token=cashu`, and `token=cashu` URL forms).

This is *not* useful for a Next.js web-shop integration unless you're writing a
payer-side app. WebNFC API in Chromium could in principle act as the payer, but
WebNFC is largely deprecated/removed from Chrome on Android.

---

## 6. Test Mints / Seed Data

### 6.1 Public mainnet mints (real sats) — Numo defaults
From `MintManager.kt`:

```kotlin
private val DEFAULT_MINTS: Set<String> = setOf(
    "https://mint.minibits.cash/Bitcoin",
    "https://mint.macadamia.cash",
    "https://antifiat.cash",
    "https://mint.cubabitcoin.org",
)
private const val DEFAULT_LIGHTNING_MINT = "https://mint.minibits.cash/Bitcoin"
```

These will issue real ecash in exchange for real Lightning payments. Suitable for a
live demo with a small amount of sats if you have a Lightning wallet with funds.

### 6.2 Local regtest stack — bundled in repo
`integration-tests/btcpay/docker-compose.yml` brings up:

| Service | Image | Port | Role |
|---|---|---|---|
| `btcpayserver` | `btcpayserver/btcpayserver:2.3.9` | `49392` | BTCPay Server (regtest) with Cashu plugin |
| `cdk-mint` | `cashubtc/mintd:latest` | `3338` | CDK Cashu mint (Lightning-backed) |
| `customer_lnd` | `btcpayserver/lnd:v0.19.3-beta` | `35532` | Customer Lightning node |
| `mint_lnd` | `btcpayserver/lnd:v0.19.3-beta` | (internal) | Mint's Lightning backend |
| `lnd_bitcoin` | `btcpayserver/lnd:v0.19.3-beta` | (internal) | BTCPay's Lightning |
| `bitcoind` | `btcpayserver/bitcoin:26.0` | `18443` | Bitcoin regtest |
| `nbxplorer` | `nicolasdorier/nbxplorer:2.5.30` | (internal) | Block explorer |
| `postgres` | `postgres:15-alpine` | (internal) | BTCPay DB |

- CDK mint mnemonic: `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`
- BTCPay admin: `admin@example.com` / `Password123!`
- BTCPay base URL: `http://localhost:49392`
- Customer LND REST: `http://localhost:35532`
- Run `provision.sh` to auto-create user, API key, store, POS app, enable Lightning
  and Cashu, and write credentials to `btcpay_env.properties`.

### 6.3 Numo onboarding amounts (illustrative only)
`OnboardingAmounts.kt` uses a fixed illustrative BTC price of `$78,544.00` for the
onboarding preview screens — *not* a real exchange rate, *not* used in production.

### 6.4 Nostr relays (Cashu-over-Nostr flow)
`NostrPaymentHandler.NOSTR_RELAYS = ["wss://relay.primal.net", "wss://relay.damus.io",
"wss://nos.lol", "wss://nostr.mom"]`. Cashu is sent/received as a NIP-17 gift-wrapped
direct message. Not relevant to a Next.js POS integration.

---

## 7. Recommended Integration Approach for a Next.js Hackathon Spike

Given Numo is an Android app with no inbound API, **the most hackathon-friendly path
is Pattern B (BTCPay orchestrator) or Pattern C (direct Cashu TS SDK)**, with Pattern
A (real Numo + webhooks) used if you have Android hardware.

**Concrete recommendation — hybrid demo:**

1. **Backend (Next.js Route Handlers / Server Actions):**
   - Spin up the bundled `integration-tests/btcpay/docker-compose.yml` stack locally.
   - Run `provision.sh` to get `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`, `BTCPAY_POS_APP_ID`.
   - Implement `POST /api/pos/charge` that calls BTCPay's
     `POST /api/v1/stores/{storeId}/invoices` with the cart total in sats, then
     `GET .../payment-methods` to fetch the BOLT11 and `creq1...`.
   - Return both to the client as a unified BIP21 URI:
     `bitcoin:?creq={creq1}&lightning={lnbc...}`.
   - Implement `GET /api/pos/status/{invoiceId}` that polls BTCPay invoice status.
   - Optionally implement `POST /api/pos/webhook` (Numo-shaped v2 payload) so the
     demo also works against a real Numo install in Pattern A.

2. **Frontend (Next.js App Router, React Server Components):**
   - POS terminal page: merchant enters amount or scans barcodes → calls
     `/api/pos/charge` → renders the unified QR + Lightning QR + Cashu `creq1` deep
     link to `https://cashu.me/#token=...`.
   - Customer-facing page: pay via any Lightning wallet, or paste the `creq1` into
     cashu.me / a Cashu wallet browser extension.
   - SSE or polling on `/api/pos/status/{invoiceId}` to flip to "Paid."

3. **Optional real-Numo leg (Pattern A):**
   - Build & install Numo on an Android device.
   - In Numo: `Settings → BTCPay` → point at your local BTCPay instance (use ngrok
     or `adb reverse tcp:49392 tcp:49392` to make BTCPay reachable from the phone).
   - Also `Settings → Webhooks → Add Endpoint` → your Next.js `/api/pos/webhook`.
   - Demo: merchant taps Charge in Numo, customer pays, Numo creates the invoice via
     BTCPay and fires the webhook to Next.js which updates the order.

This way your Next.js app is the system-of-record, BTCPay handles payment creation
and settlement, Cashu is a first-class payment method alongside Lightning, and Numo
is the physical-POS terminal (when you have one).

---

## 8. Gotchas, TODOs, Assumptions

### Gotchas
- **No inbound API.** Don't waste time looking for one. The webhook is outbound only.
- **Webhook is post-confirmation only.** You can't use it to *initiate* or *cancel* a
  payment — only to learn that one happened.
- **Order matching is manual.** Numo has no concept of a foreign order id. To correlate
  a Numo payment with a web-shop order, the merchant must type the same amount
  (or you key on basket id via Numo's CSV/basket system, but those baskets live on
  the device, not in your Next.js DB).
- **No deep link.** No `numo://` URL scheme is registered. You cannot build a "Pay
  with Numo" button in your web shop that opens Numo pre-filled with an amount.
- **`satocash_client.py` is unrelated.** It's a Python tool for the separate
  Satocash JavaCard hardware. Don't confuse it with Numo's NFC NDEF protocol.
- **Default mints are real mainnet.** A small live demo is fine; for a hackathon
  with many test cycles, use the regtest docker-compose.
- **Cashu token is never in the webhook payload.** Only metadata (amount, mint,
  status, etc.). The proofs stay in the merchant's wallet on the Android device.
- **Webhook auth key is stored plaintext** in Android `SharedPreferences`
  (`WebhookSettings` prefs, `KEY_ENDPOINTS`). Treat it as a shared secret; use a
  dedicated low-priv key per demo environment.
- **Webhook HTTP client:** 8 s connect / 10 s read / 10 s write timeouts; only
  `http` and `https` schemes accepted; trailing slash stripped from endpoint URL.
- **BTCPay POS endpoint returns a 302**, not JSON, when used via the web UI form
  route (`/apps/{appId}/pos`). The Greenfield API (`/api/v1/stores/{storeId}/invoices`)
  is JSON and is the right choice for Next.js.
- **CDK is a release candidate** (`cdk-android:0.18.0-rc.0`). APIs may shift.
- **Numo targets SDK 36 / Java 17** and uses `useLibrary("org.apache.http.legacy")`.

### Assumptions made in this report
- The hackathon demo wants to demonstrate *receiving* a Cashu/Lightning payment
  from a customer through a web-shop / POS UX, notecash wallet management.
- You're OK running Docker locally for the BTCPay + CDK-mint stack.
- If you don't have an NFC-capable Android phone, you'll use Pattern B or C and
  won't actually run Numo — you'll just respect its webhook contract.

### TODOs for the hackathon team
1. Bring up `integration-tests/btcpay/docker-compose.yml` and run `provision.sh`;
   verify `btcpay_env.properties` exists with non-empty values.
2. Write a smoke-test script that creates a 1 000-sat BTCPay invoice, fetches its
   payment methods, and prints the BOLT11 + Cashu `creq1...`.
3. Stand up the Next.js app with `/api/pos/charge`, `/api/pos/status/[id]`, and
   `/api/pos/webhook` (Numo v2 contract).
4. (If real-Numo leg is wanted) build & install the Numo debug APK on an Android
   device, configure BTCPay + webhook endpoint (use ngrok or `adb reverse`).
5. Decide whether you'll show a real Cashu wallet (cashu.me) paying the `creq1` or
   a real Lightning wallet paying the BOLT11 — and rehearse both.
6. Have a fallback demo path that doesn't depend on the live BTCPay stack (e.g.
   a mock invoice-generator) in case the regtest chain or LND channels fail.

---

## 9. File-to-Concept Map (where to look in the repo)

| Concept | File(s) |
|---|---|
| App entry / main POS screen | `app/src/main/java/com/electricdreams/numo/ModernPOSActivity.kt` |
| Payment request screen (QR + NDEF) | `app/src/main/java/com/electricdreams/numo/PaymentRequestActivity.kt` |
| Webhook payload schema | `docs/webhook-payload-v2.ts` |
| Webhook dispatch logic | `app/src/main/java/com/electricdreams/numo/payment/PaymentWebhookDispatcher.kt` |
| Webhook settings storage | `app/src/main/java/com/electricdreams/numo/core/util/WebhookSettingsManager.kt` |
| Webhook settings UI | `app/src/main/java/com/electricdreams/numo/feature/settings/WebhookSettingsActivity.kt` |
| Cashu payment request creation | `app/src/main/java/com/electricdreams/numo/ndef/CashuPaymentHelper.kt` |
| NFC NDEF emulation | `app/src/main/java/com/electricdreams/numo/ndef/Ndef*.java`, `NdefHostCardEmulationService.kt` |
| NFC NDEF protocol spec | `docs/NDEF_Payer_Side_Spec.md` |
| Mint manager (default mints!) | `app/src/main/java/com/electricdreams/numo/core/util/MintManager.kt` |
| Lightning (NUT-04/17) flow | `app/src/main/java/com/electricdreams/numo/payment/LightningMintHandler.kt` |
| Nostr (NIP-17) flow | `app/src/main/java/com/electricdreams/numo/payment/NostrPaymentHandler.kt` |
| BTCPay integration | `app/src/main/java/com/electricdreams/numo/core/payment/impl/BTCPayPaymentService.kt` |
| Payment service factory | `app/src/main/java/com/electricdreams/numo/core/payment/PaymentServiceFactory.kt` |
| BTCPay docker stack | `integration-tests/btcpay/docker-compose.yml`, `provision.sh`, `channel-setup.sh` |
| Build config / dependencies | `app/build.gradle.kts`, `gradle/libs.versions.toml` |
| Agent / dev guidelines | `AGENTS.md` |
| Project overview / install | `README.md` |

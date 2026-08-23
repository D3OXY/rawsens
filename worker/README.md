# Sponsored AI Worker

This Worker exposes one endpoint: `POST /v1/infer`. It accepts the RawSens v1 inference contract, permits only `stealth/ox-alpha`, and returns a validated RawSens AI response.

## Safety boundary

- `OPENROUTER_API_KEY` is a required Cloudflare secret. It is never a normal variable, response field, or log value.
- `SPONSORED_AI_ENABLED` is the server-side kill switch. Any value other than `true` returns `410 sponsored_disabled` with BYOK guidance.
- `SPONSORED_RATE_LIMITER` allows 10 requests per connecting IP per minute. Shared IPs share that allowance; rotating IPs receive separate allowances. Cloudflare's limiter is intentionally eventually consistent.
- Requests are capped at 64 KiB, upstream responses at 128 KiB, and upstream inference at 20 seconds.
- The Worker has no KV, D1, R2, Durable Object, Analytics Engine, or prompt logging. It does not persist request or response content.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, replace the placeholder with a development OpenRouter key, then run:

```sh
pnpm dev:worker
```

The checked-in kill switch defaults to off. For a local enabled run:

```sh
pnpm exec wrangler dev --config worker/wrangler.jsonc --var SPONSORED_AI_ENABLED:true
```

Run the fake-upstream test suite and production bundle validation without a key:

```sh
pnpm test worker/src/index.test.ts
pnpm build:worker
```

## Explicit production deployment

Deployment is deliberately not part of ordinary CI or pull requests.

1. Confirm the `namespace_id` in `wrangler.jsonc` is unique within the Cloudflare account.
2. Authenticate Wrangler with the intended account.
3. Provision the encrypted secret interactively:

   ```sh
   pnpm exec wrangler secret put OPENROUTER_API_KEY --config worker/wrangler.jsonc
   ```

4. Deploy enabled sponsorship explicitly:

   ```sh
   pnpm exec wrangler deploy --config worker/wrangler.jsonc --var SPONSORED_AI_ENABLED:true
   ```

5. Set the desktop build's `RAWSENS_SPONSORED_AI_URL` to the deployed `/v1/infer` URL.

To disable sponsored inference immediately, deploy the same Worker with `SPONSORED_AI_ENABLED:false`. The desktop app keeps deterministic calibration available and directs users to BYOK.

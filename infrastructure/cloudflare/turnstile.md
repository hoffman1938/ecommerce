# Cloudflare Turnstile integration

Bot protection for registration, login, and forgot-password. The backend already ships a
`TurnstileCaptchaProvider` behind the `CaptchaProvider` interface (`packages/auth`); locally the
provider is `none` and every check passes.

## Enable on the API

```env
CAPTCHA_PROVIDER=turnstile
TURNSTILE_SECRET_KEY=<secret key from the Turnstile dashboard>
```

The auth endpoints call `captcha.verify(captchaToken, ip)`; with Turnstile enabled a missing or
invalid token is rejected with 400.

## Enable on the storefront

1. Create a Turnstile widget in the Cloudflare dashboard for the storefront domain; note the
   **site key** (public).
2. Expose it as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on the Pages project.
3. Render the widget on the register/login/forgot-password forms and pass the token in the
   existing optional `captchaToken` field of the request body. The Zod schemas already accept it,
   so no API contract change is needed. Example:

```tsx
// afterwards submit: api.post('/auth/login', { email, password, captchaToken })
<div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
```

Local development keeps `CAPTCHA_PROVIDER=none` — no widget, no external calls.

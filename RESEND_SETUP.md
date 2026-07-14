# Resend email delivery — setup steps (Frederick)

Goal: make TapOwner's 6-digit login codes actually email to anyone (right now they
only reach the one address that owns the Resend account, if any). This is the last
thing standing between "Claude reads my code off the server" and a real self-serve login.

The API key is already set on the server. What's left is **verifying tapowner.com inside
Resend** so emails can be sent *from* your own domain. Two people do two parts:
- **You:** add tapowner.com in Resend, copy the DNS records it gives you into your domain's
  DNS, click Verify.
- **Claude:** once it shows "Verified," set the app's sender address to your domain. (Ping me.)

---

## Part A — Add the domain in Resend (5 minutes)

1. Go to https://resend.com and log in (the account the API key belongs to).
2. Left sidebar → **Domains** → **Add Domain**.
3. Enter: `tapowner.com`  → **Add**.
4. Resend now shows you a list of **DNS records** (usually 3–4: one MX, one or two TXT
   for SPF, one TXT for DKIM). **Leave this page open** — you'll copy these exact values
   in Part B. Do NOT type them from memory; they're generated specifically for your domain.

---

## Part B — Add those records to your domain's DNS

This depends on **where tapowner.com is registered** (GoDaddy, Namecheap, Google/Squarespace,
Cloudflare, etc.). Tell Claude which one and you'll get exact click-by-click; the general
shape is the same everywhere:

1. Log into your domain registrar → find **DNS** / **DNS Management** / **DNS Records** for
   tapowner.com.
2. For **each** record Resend listed, click **Add Record** and copy it across exactly:
   - **Type** (MX or TXT) — match it.
   - **Name / Host** — copy exactly. Note: registrars often want just the subdomain part.
     If Resend says the name is `send.tapowner.com`, many registrars want you to enter only
     `send` (they append `.tapowner.com` automatically). If Resend says `resend._domainkey`,
     enter `resend._domainkey`. If it's the root, some registrars use `@`.
   - **Value / Points to** — copy exactly (the DKIM value is long — copy the whole thing,
     no line breaks, no trailing spaces).
   - **Priority** — only the MX record has one (usually `10`). TXT records have no priority.
   - **TTL** — leave default (or 3600).
3. Save each record.

> Tip: the #1 cause of "won't verify" is a trailing space, a missing character in the long
> DKIM value, or entering the full `send.tapowner.com` when the registrar wanted just `send`
> (which produces `send.tapowner.com.tapowner.com`). If it won't verify, that's where to look.

---

## Part C — Verify

1. Back on the Resend Domains page, click **Verify** (or **Verify DNS Records**).
2. DNS can take anywhere from 5 minutes to a couple hours to propagate — if it's not
   verified immediately, wait and click Verify again. Green "Verified" = done.
3. **Tell Claude it's verified.** Claude will then set `OTP_FROM_ADDRESS` on the server to
   `TapOwner <noreply@tapowner.com>` (sending-only — you don't need a real inbox for that
   address), and send a live test code to confirm real delivery to any email.

---

## What this does and doesn't do

- ✅ After this: login codes email to **any** founding agent, and to Apple's reviewer.
- ✅ You do NOT need a mailbox for `noreply@tapowner.com` — Resend only *sends* from it.
- ❌ This does NOT set up a **human inbox** like `fred@tapowner.com` (for reading mail /
  App Store support contact) — that's a separate product (Google Workspace / Zoho, ~$1–7/mo)
  and a separate DNS step. Not needed for login; needed later for the App Store listing.
- ❌ This does NOT point the **website** (tapowner.com) at the app — also separate DNS,
  also deferrable.

---

## Quick reference for Claude (after "Verified")

- Set on Railway api service: `OTP_FROM_ADDRESS = TapOwner <noreply@tapowner.com>`
- Confirm `RESEND_API_KEY` present (already set).
- Live-test: `POST /auth/otp/request` to a non-owner email, confirm it arrives.
- Note: `api/src/email/resend.ts` FROM defaults to the sandbox `onboarding@resend.dev`
  until `OTP_FROM_ADDRESS` is set — that's the switch that flips it to real delivery.

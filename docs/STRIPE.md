# Stripe (test mode, account acct_1N578JBkP5VKCzMY), created 5 Nov 2026 via the Stripe connector

Every object carries `metadata.app=stepclimb`; lookup keys are prefixed `stepclimb_`. Source of truth: `src/config/product.ts`. Re run is idempotent: `STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY_TEST npm run stripe:setup`.

| Lookup key | Amount | Billing | Price id | Product id |
|---|---|---|---|---|
| stepclimb_solo_annual | $49.00 per repo | year | price_1UYJYQBkP5VKCzMYfKEbdmPm | prod_VZSTsVfNI4EtAv |
| stepclimb_legacy_solo_semiannual | $74.00 per repo | every 6 months | price_1UYJYSBkP5VKCzMYFqTSTuTM | prod_VZSTxx6S9mnnHz |
| stepclimb_studio_annual | $449.00 | year | price_1UYJYUBkP5VKCzMYLvO5JKlJ | prod_VZSThAnKdWx8qk |
| stepclimb_legacy_studio_semiannual | $474.00 | every 6 months | price_1UYJYWBkP5VKCzMYzkjh0SdZ | prod_VZSTAP0wM617pK |
| stepclimb_agency_monthly | $99.00 | month | price_1UYJYYBkP5VKCzMYKIIAAJuG | prod_VZSTyNh5mBfycz |
| stepclimb_agency_annual | $999.00 | year | price_1UYJYZBkP5VKCzMY9SLJhfKQ | prod_VZSTyNh5mBfycz |
| stepclimb_credit_to_latest | $9.99 | one time | price_1UYJYbBkP5VKCzMYN1N0PNkR | prod_VZSTUNykhFKjcT |
| stepclimb_credit_to_previous | $14.99 | one time | price_1UYJYdBkP5VKCzMYmNJPxGk2 | prod_VZSTbyZ7JLDrDX |
| stepclimb_credit_older_hop | $19.99 | one time | price_1UYJYfBkP5VKCzMYPlllrVcu | prod_VZSTihqRZa4XeW |
| stepclimb_credit_side_task | $9.99 | one time | price_1UYJYhBkP5VKCzMYVsctnwUT | prod_VZSTHYIKJK2VEE |
| stepclimb_credit_small_converter | $4.99 | one time | price_1UYJYjBkP5VKCzMYSHartVgr | prod_VZSTwprwpM9blE |
| stepclimb_credit_extended_verify | $4.99 | one time | price_1UYJYkBkP5VKCzMYLJXKOAFc | prod_VZST2l3hROxaYD |

Free inspection has no Stripe object. Solo and Legacy Solo are per repo: Checkout uses an adjustable quantity (1 to 200) and the entitlement reads the subscription quantity as the repo limit.

## Still to do
- Webhook endpoint `<url>/api/stripe/webhook` (events listed in KIT_COPY.md section 3) after the first deploy; its `whsec_` goes into `STRIPE_WEBHOOK_SECRET`.
- Customer Portal (test mode) must be enabled once per account: https://dashboard.stripe.com/test/settings/billing/portal (manual, tracked in MANUAL_STEPS.md).
- Tax ID collection and own invoice PDFs (M4).

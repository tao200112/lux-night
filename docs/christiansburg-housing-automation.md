# Christiansburg Housing Automation

This repo now includes a cloud-scheduled housing digest for employee dorm candidates near Christiansburg, VA.

## What it does

- Runs daily in GitHub Actions.
- Uses the OpenAI Responses API with `web_search` to look up current listings.
- Applies the current filter set:
  - active listings only
  - no sold / pending / contingent
  - price cap 300k
  - 3+ bedrooms
  - 1600+ sqft
  - central AC required
  - prefer public water/sewer and newer HVAC / water heater / electrical
  - no drive time over 40 minutes to `1635 N Franklin St, Christiansburg, VA 24073`
- Compares each candidate against the current dorm baseline at `60 Second St SW, Christiansburg, VA 24073`.
- Sends the email digest to `ridiculouschickenblacksburg@gmail.com`.

## Files

- Workflow: [.github/workflows/christiansburg-housing.yml](/C:/Users/a2432/OneDrive/Documents/票务软件/lux-night/.github/workflows/christiansburg-housing.yml)
- Script: [scripts/christiansburg_housing_digest.py](/C:/Users/a2432/OneDrive/Documents/票务软件/lux-night/scripts/christiansburg_housing_digest.py)

## Required GitHub Secrets

Add these repository secrets before enabling the workflow:

- `OPENAI_API_KEY`
- `GMAIL_SMTP_USER`
- `GMAIL_SMTP_APP_PASSWORD`

## Gmail setup

Use a Gmail account that can send the digest. For Gmail SMTP, the safest path is:

1. Turn on 2-Step Verification for the sender account.
2. Create an App Password for Mail.
3. Store the full Gmail address in `GMAIL_SMTP_USER`.
4. Store the 16-character app password in `GMAIL_SMTP_APP_PASSWORD`.

## How to run immediately

After secrets are configured:

1. Open GitHub Actions.
2. Select `Christiansburg Housing Digest`.
3. Click `Run workflow`.

## Schedule

The workflow currently runs at `13:15 UTC` every day, which is `9:15 AM` during Eastern Daylight Time.

Adjust the cron expression in the workflow if you want a different send time.

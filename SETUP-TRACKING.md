# Dani Hill: enquiries, tracking and attribution setup

## 1. Enquiry storage (Google Sheet)
The forms post to `/api/enquiry`, which appends each enquiry to a Google Sheet.

1. Create a Google Sheet with three tabs named exactly **Wedding**, **Viewing**, **Stay**. Leave them empty; the header row is written on the first enquiry.
2. In Google Cloud, create a service account, enable the **Google Sheets API**, and create a JSON key.
3. Share the Sheet with the service account email (ends in `.iam.gserviceaccount.com`) as **Editor**.
4. In Vercel → Project → Settings → Environment Variables (Production and Preview), add:
   - `GOOGLE_CLIENT_EMAIL`: the `client_email` from the JSON key
   - `GOOGLE_PRIVATE_KEY`: the full `private_key` value, including the BEGIN/END lines
   - `GOOGLE_SHEET_ID`: the long ID in the Sheet URL
5. Redeploy, then send one test enquiry from each form and check that it appears in the Sheet.

Each row has a lead ID (e.g. `DH-WED-261016-A1B2`), the form fields, the campaign source and a set of
empty pipeline columns: `stage, qualified, viewing_scheduled, viewing_attended, proposal_sent,
booking_confirmed, booking_value, notes`. The team updates these as the lead progresses.

## 1b. Confirmation emails (optional, via Resend)
When set up, the person who enquired receives a confirmation email with their details and reference
number, and your team receives a copy of each new enquiry. Enquiries are still saved if email is not set up.

1. Sign up at **resend.com** (free tier covers a small venue's volume).
2. **Domains → Add domain** → `danihill.my`. Add the DNS records Resend shows (in Exabytes, where the
   domain is managed) and wait until the domain shows **Verified**.
3. **API Keys → Create API key** (sending access). Copy it.
4. In Vercel → Environment Variables, add:
   - `RESEND_API_KEY`: the key from step 3
   - `MAIL_FROM`: e.g. `Dani Hill <enquiries@danihill.my>`
   - `NOTIFY_EMAIL`: your team inbox (comma-separate several addresses)
5. Redeploy and send a test enquiry with your own email address.

Replies to the confirmation email go to the first `NOTIFY_EMAIL` address.

## 2. Analytics events (dataLayer)
`assets/site.js` pushes these events. None contain names, phone numbers, emails or messages.

| Event | When | Parameters |
|---|---|---|
| `cta_click` | Enquiry or viewing buttons clicked | cta_type, cta_location, cta_text, page |
| `enquiry_start` | First field touched in a form | form_type |
| `wedding_enquiry_submit` | Server confirmed the enquiry was saved | guest_band, event_month, stay_interest |
| `viewing_request_submit` | Server confirmed the request was saved | slot_type, attending |
| `stay_enquiry_submit` | Server confirmed the enquiry was saved | residence, purpose, guest_band |
| `whatsapp_click` | Any WhatsApp link clicked | cta_location, wa_type |
| `brochure_download` | Rates and packages link opened | file_name, cta_location |

Clicks, WhatsApp clicks and brochure opens are engagement signals only. A WhatsApp click does not mean
a conversation happened, and a viewing request is not an attended viewing.

## 3. Google Tag Manager
1. Clean the existing container (GTM-PSR5GD2Z) first. Remove or pause any conversion tags that fire on
   **page view** or **All Pages**; these caused the false conversions seen in the ads accounts.
2. Paste the container ID into `GTM_ID` at the top of `assets/site.js`.
3. Create a Custom Event trigger for each event name above, and a GA4 Event tag for each, passing the
   listed parameters as event parameters.
4. In GA4, mark only `wedding_enquiry_submit`, `viewing_request_submit` and `stay_enquiry_submit` as key events.
5. For Google Ads and Meta, fire their conversion/Lead tags only on the three submit events.
6. Consent Mode v2 defaults to denied. Tags should respect consent (GTM built-in consent checks).

## 4. Attribution
- UTM tags and Google/Meta click IDs (`gclid`, `gbraid`, `wbraid`, `fbclid`) are saved in the visitor's
  browser and sent with the enquiry into the Sheet, together with the landing page, referrer and first-touch source.
- WhatsApp messages carry a reference code such as `Ref: WED-INSTAGRAM` so chats can be labelled by source
  in WhatsApp Business without passing personal details.
- Use UTM tags on every ad and social link, e.g. `?utm_source=instagram&utm_medium=paid_social&utm_campaign=weddings_oct26`.

## 5. Closing the loop (CRM and offline conversions)
- Update the pipeline columns in the Sheet (or move to a CRM later, keeping the lead ID).
- When a booking is confirmed, upload it to Google Ads as an offline conversion using the `gclid` and the
  booking value, and to Meta using `fbclid` through Conversions API or offline events.
- Report bookings and booking value by source from the Sheet, not from analytics.

## 6. Testing after launch
Wedding traffic is low, so run one change at a time over several weeks and judge by submitted enquiries
and confirmed bookings. Candidate tests: hero image, button wording ("Check Availability" vs
"Book a Viewing"), and whether to show "from RM…" pricing. These measure what works; they do not
guarantee more bookings.

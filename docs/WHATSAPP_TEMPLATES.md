# WhatsApp templates (Utility)

> Generated from `server/src/lib/whatsappTemplates.ts` by `server/scripts/whatsapp-templates-doc.ts`. Do not edit by hand.

Every WhatsApp message SwiftLoan sends, written for Meta's **Utility** category: a factual message about a request or application the customer is already part of, with no promotion. Submit each one in English through the CPaaS (Vox Digitals) portal, or with Meta's message-templates API using the JSON under each template.

**Meta makes the final decision on category.** A reminder to finish an abandoned application can be re-categorised as marketing whatever it is submitted as. After approval, check the category Meta assigned. A template Meta treats as marketing is billed differently and is not covered by the utility rules.

## Where WhatsApp is used

| Sender | When it sends | Template |
|---|---|---|
| Stage nudge: lead captured | Confirms we received the loan request a visitor made on the website and where to continue it. | `lead_request_received` |
| Stage nudge: signed in | Tells a customer who signed in that their loan application is waiting to be started. | `signin_application_pending` |
| Website drop-off install reminders | Update that an application the customer started is incomplete, naming the step it stopped at. | `application_incomplete_update` |
| Stage nudge: eligibility done, offers viewed | Update that the eligibility check is complete and how many offers are waiting to be viewed. | `offers_available_update` |
| Stage nudge: KYC started | Asks the customer to complete a verification step needed for their application. | `document_request_update` |
| Stage nudge: rejected by lender | Update that a lender did not approve the application and where the other options are. It does not give the lender's reason. | `application_not_approved_update` |
| Lender-applied follow-up | Confirms an application was submitted to a lender and where to track it. | `loan_application_submitted` |
| After every conversation (call, in-app and website agents) | Recap of what was discussed with a SwiftLoan agent and the agreed next steps. | `conversation_summary` |
| Eligibility check returned no offers | Update that the eligibility check finished and no offers are available for the profile. | `no_offers_update` |
| Eligibility check failed with a technical fault | Update that the eligibility check could not finish because of a technical issue. | `eligibility_retry_update` |

Messages typed by an admin (Customers page) use whichever template the admin picks.

## Submission checklist

1. Create each template below in CPaaS (WhatsApp, Templates, Create Template): category **Utility**, language **English (en)**.
2. Paste the body exactly, add the footer, and enter the sample values in order. Meta requires a sample for every variable.
3. Wait for approval, then open the template in the portal and confirm the category is still Utility.
4. In **Admin, Configs, Stage outreach**, enter the approved name:
   - stage messages: open the stage and press "Use the utility template";
   - the three cards at the top (conversation recap, no offers, technical issue): press "Use catalogue template" and switch the card on;
   - install reminders and the lender-applied message: save `installWhatsapp` and `appliedWhatsapp` in Configs, WhatsApp (Vox) with the name and values listed below.
5. Switch the message on. Nothing is sent until you do.

## `lead_request_received`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Confirms we received the loan request a visitor made on the website and where to continue it.
- **Sent by:** Stage nudge: lead captured
- **Replaces:** `marketing_check_rate`

**Body**

```
Hi {{1}}, we have received your loan request on SwiftLoan and your details are saved. To continue your application, open the SwiftLoan app here: {{2}} This message is about the request you made on our website.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Link to open the app | https://www.swiftloan.ai/applink | `{siteUrl}/applink` |

**Preview with the sample values**

> Hi Priya, we have received your loan request on SwiftLoan and your details are saved. To continue your application, open the SwiftLoan app here: https://www.swiftloan.ai/applink This message is about the request you made on our website.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "lead_request_received",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, we have received your loan request on SwiftLoan and your details are saved. To continue your application, open the SwiftLoan app here: {{2}} This message is about the request you made on our website.",
      "example": {
        "body_text": [
          [
            "Priya",
            "https://www.swiftloan.ai/applink"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## `signin_application_pending`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Tells a customer who signed in that their loan application is waiting to be started.
- **Sent by:** Stage nudge: signed in
- **Replaces:** `marketing_check_rate`

**Body**

```
Hi {{1}}, you signed in to SwiftLoan and your loan application has not been started yet. Your account details are saved. You can start it here: {{2}} This message is an update about your SwiftLoan account.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Link to open the app | https://www.swiftloan.ai/applink | `{siteUrl}/applink` |

**Preview with the sample values**

> Hi Priya, you signed in to SwiftLoan and your loan application has not been started yet. Your account details are saved. You can start it here: https://www.swiftloan.ai/applink This message is an update about your SwiftLoan account.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "signin_application_pending",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, you signed in to SwiftLoan and your loan application has not been started yet. Your account details are saved. You can start it here: {{2}} This message is an update about your SwiftLoan account.",
      "example": {
        "body_text": [
          [
            "Priya",
            "https://www.swiftloan.ai/applink"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## `application_incomplete_update`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Update that an application the customer started is incomplete, naming the step it stopped at.
- **Sent by:** Website drop-off install reminders
- **Replaces:** `install_app_resume_step`

**Body**

```
Hi {{1}}, your SwiftLoan loan application is incomplete at {{2}}. Your saved details are available when you continue. Open the app to continue: {{3}} This is an update about your application.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Step the application stopped at | PAN verification | `{step}` |
| `{{3}}` | Personal link to continue | https://api.swiftloan.ai/dl?ref=AB12CD34 | `{link}` |

**Preview with the sample values**

> Hi Priya, your SwiftLoan loan application is incomplete at PAN verification. Your saved details are available when you continue. Open the app to continue: https://api.swiftloan.ai/dl?ref=AB12CD34 This is an update about your application.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "application_incomplete_update",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, your SwiftLoan loan application is incomplete at {{2}}. Your saved details are available when you continue. Open the app to continue: {{3}} This is an update about your application.",
      "example": {
        "body_text": [
          [
            "Priya",
            "PAN verification",
            "https://api.swiftloan.ai/dl?ref=AB12CD34"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## `offers_available_update`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Update that the eligibility check is complete and how many offers are waiting to be viewed.
- **Sent by:** Stage nudge: eligibility done, offers viewed
- **Replaces:** `offers_ready`

**Body**

```
Hi {{1}}, your loan eligibility check (Ref {{2}}) is complete and {{3}} offer(s) are available for your profile. You can view them here: {{4}} Please read the terms of each offer before you choose.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Application reference | SL-884021 | `{ref}` |
| `{{3}}` | Number of offers | 3 | `{offerCount}` |
| `{{4}}` | Link to the offers | https://www.swiftloan.ai/apply/offers | `{siteUrl}/apply/offers` |

**Preview with the sample values**

> Hi Priya, your loan eligibility check (Ref SL-884021) is complete and 3 offer(s) are available for your profile. You can view them here: https://www.swiftloan.ai/apply/offers Please read the terms of each offer before you choose.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "offers_available_update",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, your loan eligibility check (Ref {{2}}) is complete and {{3}} offer(s) are available for your profile. You can view them here: {{4}} Please read the terms of each offer before you choose.",
      "example": {
        "body_text": [
          [
            "Priya",
            "SL-884021",
            "3",
            "https://www.swiftloan.ai/apply/offers"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## `document_request_update`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Asks the customer to complete a verification step needed for their application.
- **Sent by:** Stage nudge: KYC started
- **Replaces:** `document_request`

**Body**

```
Hi {{1}}, to continue your application (Ref {{2}}) we need you to complete: {{3}}. You can do this here: {{4}} Your information is handled securely.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Application reference | SL-884021 | `{ref}` |
| `{{3}}` | What is needed | your KYC details | `your KYC details (PAN and Aadhaar eKYC)` |
| `{{4}}` | Link to continue | https://www.swiftloan.ai/apply | `{siteUrl}/apply` |

**Preview with the sample values**

> Hi Priya, to continue your application (Ref SL-884021) we need you to complete: your KYC details. You can do this here: https://www.swiftloan.ai/apply Your information is handled securely.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "document_request_update",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, to continue your application (Ref {{2}}) we need you to complete: {{3}}. You can do this here: {{4}} Your information is handled securely.",
      "example": {
        "body_text": [
          [
            "Priya",
            "SL-884021",
            "your KYC details",
            "https://www.swiftloan.ai/apply"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## `application_not_approved_update`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Update that a lender did not approve the application and where the other options are. It does not give the lender's reason.
- **Sent by:** Stage nudge: rejected by lender

**Body**

```
Hi {{1}}, your loan application (Ref {{2}}) was not approved by the lender. This does not affect your other options in the SwiftLoan app, which you can review here: {{3}} If you have questions, reply to this message.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Application reference | SL-884021 | `{ref}` |
| `{{3}}` | Link to review other options | https://www.swiftloan.ai/apply/offers | `{siteUrl}/apply/offers` |

**Preview with the sample values**

> Hi Priya, your loan application (Ref SL-884021) was not approved by the lender. This does not affect your other options in the SwiftLoan app, which you can review here: https://www.swiftloan.ai/apply/offers If you have questions, reply to this message.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "application_not_approved_update",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, your loan application (Ref {{2}}) was not approved by the lender. This does not affect your other options in the SwiftLoan app, which you can review here: {{3}} If you have questions, reply to this message.",
      "example": {
        "body_text": [
          [
            "Priya",
            "SL-884021",
            "https://www.swiftloan.ai/apply/offers"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## `loan_application_submitted`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Confirms an application was submitted to a lender and where to track it.
- **Sent by:** Lender-applied follow-up
- **Replaces:** `loan_applied_install_app`

**Body**

```
Hi {{1}}, your application to {{2}} has been submitted. You can track its status in the SwiftLoan app: {{3}} We will message you here when the status changes.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Lender name | Example Finance | `{lender}` |
| `{{3}}` | Link to track the application | https://api.swiftloan.ai/dl?ref=AB12CD34 | `{link}` |

**Preview with the sample values**

> Hi Priya, your application to Example Finance has been submitted. You can track its status in the SwiftLoan app: https://api.swiftloan.ai/dl?ref=AB12CD34 We will message you here when the status changes.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "loan_application_submitted",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, your application to {{2}} has been submitted. You can track its status in the SwiftLoan app: {{3}} We will message you here when the status changes.",
      "example": {
        "body_text": [
          [
            "Priya",
            "Example Finance",
            "https://api.swiftloan.ai/dl?ref=AB12CD34"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## `conversation_summary`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Recap of what was discussed with a SwiftLoan agent and the agreed next steps.
- **Sent by:** After every conversation (call, in-app and website agents)

**Body**

```
Hi {{1}}, thank you for speaking with SwiftLoan. Here is a summary of your conversation: {{2}} Next steps: {{3}} If anything above is incorrect, please reply to this message.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Summary of what was discussed | We discussed your request for a personal loan of Rs 3 lakh and your eligibility. | `{summary}` |
| `{{3}}` | Next steps | Open the SwiftLoan app to view your offers. | `{actionPlan}` |

**Preview with the sample values**

> Hi Priya, thank you for speaking with SwiftLoan. Here is a summary of your conversation: We discussed your request for a personal loan of Rs 3 lakh and your eligibility. Next steps: Open the SwiftLoan app to view your offers. If anything above is incorrect, please reply to this message.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "conversation_summary",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, thank you for speaking with SwiftLoan. Here is a summary of your conversation: {{2}} Next steps: {{3}} If anything above is incorrect, please reply to this message.",
      "example": {
        "body_text": [
          [
            "Priya",
            "We discussed your request for a personal loan of Rs 3 lakh and your eligibility.",
            "Open the SwiftLoan app to view your offers."
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## `no_offers_update`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Update that the eligibility check finished and no offers are available for the profile.
- **Sent by:** Eligibility check returned no offers

**Body**

```
Hi {{1}}, we have completed your loan eligibility check (Ref {{2}}). Based on the details provided, no loan offers are available for your profile right now. {{3}} If you have questions, reply to this message.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Application reference | SL-884021 | `{ref}` |
| `{{3}}` | What the customer can do next | You can review or update your details in the SwiftLoan app and check again. | `{guidance}` |

**Preview with the sample values**

> Hi Priya, we have completed your loan eligibility check (Ref SL-884021). Based on the details provided, no loan offers are available for your profile right now. You can review or update your details in the SwiftLoan app and check again. If you have questions, reply to this message.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "no_offers_update",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, we have completed your loan eligibility check (Ref {{2}}). Based on the details provided, no loan offers are available for your profile right now. {{3}} If you have questions, reply to this message.",
      "example": {
        "body_text": [
          [
            "Priya",
            "SL-884021",
            "You can review or update your details in the SwiftLoan app and check again."
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## `eligibility_retry_update`

- **Category:** UTILITY
- **Language:** en
- **Purpose:** Update that the eligibility check could not finish because of a technical issue.
- **Sent by:** Eligibility check failed with a technical fault

**Body**

```
Hi {{1}}, we could not complete your loan eligibility check (Ref {{2}}) because of a technical issue. Your details are saved. Please try again from the app: {{3}} We are sorry for the inconvenience.
```

**Footer:** SwiftLoan

| Variable | Holds | Sample value | Filled by the code with |
|---|---|---|---|
| `{{1}}` | First name | Priya | `{name}` |
| `{{2}}` | Application reference | SL-884021 | `{ref}` |
| `{{3}}` | Link to try again | https://www.swiftloan.ai/applink | `{link}` |

**Preview with the sample values**

> Hi Priya, we could not complete your loan eligibility check (Ref SL-884021) because of a technical issue. Your details are saved. Please try again from the app: https://www.swiftloan.ai/applink We are sorry for the inconvenience.

<details><summary>Meta API JSON</summary>

```json
{
  "name": "eligibility_retry_update",
  "language": "en",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, we could not complete your loan eligibility check (Ref {{2}}) because of a technical issue. Your details are saved. Please try again from the app: {{3}} We are sorry for the inconvenience.",
      "example": {
        "body_text": [
          [
            "Priya",
            "SL-884021",
            "https://www.swiftloan.ai/applink"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "SwiftLoan"
    }
  ]
}
```

</details>

## Older templates to retire

| Template | Why | Use instead |
|---|---|---|
| `marketing_check_rate` | Named and worded as marketing ("check your rate") | lead_request_received / signin_application_pending |
| `install_app_resume` | Submitted as MARKETING (see docs/JOURNEY_RESUME_TEMPLATES.md) | application_incomplete_update |
| `install_app_resume_step` | Submitted as MARKETING on 22 Oct | application_incomplete_update |
| `offers_ready` | Category not confirmed as utility; wording is promotional | offers_available_update |
| `document_request` | Category not confirmed as utility | document_request_update |
| `loan_applied_install_app` | Listed as "to be approved"; wording asks to install the app | loan_application_submitted |

Keep the old templates until the replacements are approved and switched on, then stop using them. Their category was set when they were submitted and cannot be changed.

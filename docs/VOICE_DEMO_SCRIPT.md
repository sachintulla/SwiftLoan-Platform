# SwiftLoan — Voice Agent Demo Script

Demo of Ruby (the in-app voice assistant) **spotlighting offers and figures** as she
talks, plus the **ambient no-call demo**, **anchored filter dropdowns**, and
**multi-language** (English / Hindi / Telugu / Tamil).

---

## 0. Before the demo (setup)

- [ ] App running on a device/simulator, signed in to an account that **has offers**
      (Home shows "N offers matched"). If not, run an application first or use a QA
      test number that already has offers.
- [ ] Voice configured (Ello assistant set to a **Gemini Live / Native Mode** voice;
      the updated Ruby prompt pasted in — includes Tamil).
- [ ] Quiet room / good mic. One person drives, one narrates.
- [ ] **Open the Compare screen first** (My Offers → "Compare all offers") — the most
      visual feature lands immediately.

**Golden rules while demoing**
- One ask at a time; pause ~1–2s after each so the scroll + zoom land.
- **Touching the screen pauses the ambient demo** for a few seconds — use that to tap
  things yourself without it fighting you.
- State facts from the screen; never promise approval or a rate.

---

## 1. Ambient demo — *no voice needed* (30s)

> "Even before anyone talks to Ruby, the app guides the eye on its own."

1. Open **Compare**. Point out, hands-off:
   - The **ranking filter auto-cycles** (Lowest total cost → Lowest EMI → Lowest rate → Least interest).
   - Each time, it **scrolls to the winning lender's column** and the matching number
     **zooms, then stays highlighted** (teal ring + fill) — "so the customer always sees
     the figure that matters for what they picked."
2. Open **My Offers**. Point out the card **ring sweeping through each offer** — "Ruby
   looks through the offers for you."

> Tap the screen once to show it **pauses** so the user is never fought.

---

## 2. Anchored filter dropdowns (15s)

> "Filters are now a clean dropdown right under the control, not a bottom sheet."

- On Compare, tap **"RANK BEST OFFER BY"** → popover opens **below** it; pick an option.
- Tap **"TENURE"** → same anchored popover. Selected option shown in teal with a check.

---

## 3. Voice on My Offers — spotlight an offer (45s)

> Start a call with Ruby (mic button). On the **My Offers** screen, say:

- "Which offer is best for me?"
- "Tell me about the **HDFC** offer." → watch it **scroll into view and ring**.
- "What about **Credit Sea**?"
- "Which lender gives the **most money**?"

> Each lender you name gets scrolled to and highlighted as she speaks about it.

---

## 4. Voice on Compare — spotlight a number (the headline, 60s)

> Go to **Compare** (or ask "compare my offers"). Say, one at a time:

**By metric** (she scrolls to the winner's column; the number zooms + stays lit):
- "Which one has the **lowest EMI**?"
- "Who has the **lowest interest rate**?"
- "Which has the **least total interest**?"
- "What's the **cheapest overall**?"
- "Which has the lowest **processing fee**?"

**By lender + metric** (points at one exact cell):
- "What's **HDFC's processing fee**?"
- "Show me **Credit Sea's monthly EMI**."

**Natural comparison:**
- "Why is this one recommended?"
- "Compare the EMI between HDFC and Axis."
- "If I take a longer tenure, who's cheapest?" → she changes tenure; the highlight follows.

> Call out: after the zoom, the number **stays highlighted** so the viewer keeps seeing it.

---

## 5. Multi-language (45s)

> Show Ruby switching language mid-call. She keeps **operating the app** the whole time.

- "**मुझसे हिंदी में बात करो**" (talk in Hindi) — she continues in Hinglish.
- "**తెలుగులో మాట్లాడండి**" (talk in Telugu) — continues in Tinglish.
- "**தமிழ்ல பேசுங்க**" (talk in Tamil) — continues in Tanglish.

Then repeat a Compare ask in that language, e.g. "**lowest EMI எது?**" — she answers in
Tamil **and** spotlights the cell.

> Note for the room: Hindi/Telugu persist to the account; **Tamil is for the current
> call** (voice only — screens stay in their language). That's expected.

---

## 6. Wrap (15s)

- "Ruby finds the offer, compares real numbers, highlights exactly what you asked about,
  and does it in your language — hands-free."
- Everything shown is **client-side agent choreography** — no new backend, no screen rewrites.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| No offers on the account | Apply first, or use a QA test number with offers. |
| Ambient demo fights your taps | Touch once — it pauses ~5s. Or just narrate it hands-off. |
| She won't switch to Tamil | Confirm the Gemini Live voice supports Tamil; say the request clearly ("talk in Tamil"). It's in-call only. |
| Highlight didn't move | Name the lender/metric clearly; pause 1–2s between asks. |
| Mic picks up UI sounds | UI sounds are low-volume; keep the device a little away from the mic. |

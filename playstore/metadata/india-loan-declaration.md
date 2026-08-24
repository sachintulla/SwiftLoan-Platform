# Play Console — India Personal Loan App declaration (SwiftLoan `ai.swiftloan.app`)

Where to fill: **App content → Financial features →** tick *"My app provides personal
loans or contains features that facilitate personal loans"* → then the **India** section.

Google **reviews this manually** and can reject/suspend the app if answers and the
uploaded documents don't match. **[confirm]** = you must supply the real value/document.

---

## 1. Loan type
- Does your app provide personal loans or facilitate access to personal loans?
  → **Facilitates access to personal loans** (SwiftLoan does not itself lend).

## 2. Are you the lender, or do you facilitate on behalf of registered lenders?
→ **I facilitate personal loans on behalf of registered NBFCs / banks.**

Suggested wording for the free-text / declaration:
```
SwiftLoan is a Lending Service Provider (LSP) operating a Digital Lending App (DLA).
It is a loan-comparison and referral platform and is NOT a lender. SwiftLoan does not
sanction, underwrite, price, or disburse any loan. All loans are provided by
RBI-regulated banks and NBFCs ("Lending Partners"), who make all credit decisions.
SwiftLoan operates in accordance with the RBI Digital Lending Guidelines, 2022.
```

## 3. Registered lending partners (RBI-regulated banks / NBFCs)
List every partner whose loans the app surfaces. **[confirm the final, exact legal
names + RBI registration/CoR numbers from your agreements]**. From the app's current
partner set, these appear (verify legal names before submitting):
- IDFC FIRST Bank Limited — [confirm RBI/bank licence ref]
- Prefr (loan facilitated via partner NBFC) — [confirm legal entity + CoR]
- Unity Small Finance Bank — [confirm]
- Freo / MoneyTap (partner NBFC) — [confirm legal entity + CoR]
- Herofin / Hero FinCorp — [confirm]
> Loans are routed via the Knight Fintech (Aurix) aggregation layer — list the actual
> RBI-registered lenders, not the aggregator.

## 4. Required documents to upload
Google asks for proof of the lending relationship. Prepare:
- **Declaration letter** (on Purpletalk India Private Limited letterhead) stating SwiftLoan
  is an LSP/DLA facilitating loans only for the named RBI-regulated partners, signed by an
  authorised signatory. **[you must produce & sign]**
- **Partnership / agreement evidence** with each Lending Partner (or the aggregator's
  agreement that names the underlying regulated lenders). **[confirm]**
- Optional but helps: link to the partner list on your site / privacy policy Section 7
  (already live at https://swiftloan.ai/privacypolicy).

## 5. Company / developer details
- Legal entity: **Purpletalk India Private Limited** **[confirm this is the Play developer account holder — must match]**
- Registered country: **India**
- Website: **https://swiftloan.ai**
- Support email: **support@swiftloan.ai** **[confirm]**
- Privacy policy: **https://swiftloan.ai/privacypolicy** ✅ live

## 6. Permissions justification (India loan-app policy)
Google's India personal-loan policy restricts access to sensitive data. Be ready to
confirm the app does **NOT** request:
- Contacts, Photos/Media, precise Location, SMS, or Call logs for underwriting.
→ SwiftLoan's declared permissions: **Microphone (optional voice assistant only)**,
  Internet/network. No contacts/SMS/photos/location. **[confirm against final manifest]**

Suggested wording:
```
SwiftLoan does not access a user's contacts, photos, media, SMS, call logs, or precise
location. The only sensitive runtime permission is optional microphone access for the
voice assistant, which the user can decline while retaining full app functionality.
```

## 7. Key financial disclosures (must be visible in-app / listing)
Confirm these are present (they are, per the app + privacy policy):
- App clearly states SwiftLoan is not the lender. ✅
- Interest rate, APR range, fees/processing charges shown on the offers screen. ✅
- Data-sharing with the lender happens only on explicit user consent. ✅
- Grievance/DPO contact available (grievance@swiftloan.ai). ✅

---

### What only you can complete
- The exact **legal names + RBI CoR/registration numbers** of every lending partner (#3).
- The signed **declaration letter** and **partner agreements** (#4).
- Confirm the **Play developer account** is Purpletalk India Private Limited (#5) — Google
  cross-checks the declared entity against the account holder.

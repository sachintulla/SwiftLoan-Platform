-- The only pre-application conversational field with no other natural home
-- (unlike loanPurpose/salaryMode/etc, already columns on User) - a real
-- LoanApplication row doesn't exist yet when the voice agent collects this.
-- Plain rupees, same convention as LoanApplication.amount (NOT paise).
ALTER TABLE "User" ADD COLUMN "draftLoanAmount" INTEGER;

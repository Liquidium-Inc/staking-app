# 🧪 Email Notification System Test Plan

## 📋 Overview

This document provides a comprehensive test plan for the Liquidium staking email notification system. The system allows users to opt-in to weekly email summaries of their staking activity.

## 🚀 Environment Setup

### Prerequisites

- Development server running: `pnpm dev`
- Database connection configured (Neon PostgreSQL)
- Resend API key configured in `.env.local`
- Redis connection available

### Environment Variables to Verify

```bash
# Check these variables in your .env.local
RESEND_API_KEY=your_resend_api_key
DATABASE_URL=your_neon_db_url
REDIS_URL=your_redis_url
NEXT_PUBLIC_NETWORK=testnet4  # or mainnet
CRON_SECRET=your_cron_secret
```

## 🎯 Phase 1: Basic Email Flow Testing

### 1.1 Email Subscription Flow

**Steps:**

1. Connect your wallet to the app
2. Click on your profile picture in the header
3. Toggle "Weekly Reports" switch to ON
4. Enter your email address (use a real email you can check)
5. Check the privacy policy checkbox ✅
6. Click the checkmark button to subscribe

**Expected Results:**

- ✅ Success message appears
- ✅ Verification email sent to your inbox
- ✅ UI shows "Verification email sent to [your-email]"

### 1.2 Email Verification Flow

**Steps:**

1. Check your email inbox for the verification email
2. Click the verification link in the email
3. You should be redirected to the website

**Expected Results:**

- ✅ Page loads successfully
- ✅ Weekly reports toggle shows ON state
- ✅ UI shows verified email with checkmark

### 1.3 Toggle Functionality Test (Fixed Issue)

**Steps:**

1. Toggle weekly reports OFF
2. Toggle weekly reports ON again
3. Enter email and subscribe again

**Expected Results:**

- ✅ No "Email already verified" error
- ✅ Can re-subscribe smoothly
- ✅ Immediate deletion on unsubscribe

## 🔧 Phase 2: Manual Cron Job Testing

### 2.1 Trigger Weekly Email Cron

**Command:**

```bash
curl -X GET "http://localhost:3000/api/cron/weekly-email" \
  -H "Authorization: Bearer 6UI5hnaZPF5jwIZWfTp3U5PIg4o7O0ACyClA6Ui/JiU=" \
  -H "Content-Type: application/json"
```

**Expected Response:**

```json
{
  "message": "Weekly emails sent successfully",
  "sent": 1,
  "skipped": 0
}
```

### 2.2 Verify Weekly Email Content

**Check your email for:**

- ✅ Your staking rewards earned this week
- ✅ Number of tokens staked
- ✅ Current staking APY
- ✅ Total rewards distributed this week
- ✅ Proper formatting and Liquidium branding
- ✅ Unsubscribe link at the bottom

## 🧪 Phase 3: Security & Edge Case Testing

### 3.1 Rate Limiting Test

**Test: Multiple subscription attempts**

```bash
# Try subscribing 6 times in a row (should fail on 6th)
for i in {1..6}; do
  curl -X POST "http://localhost:3000/api/email/subscribe" \
    -H "Content-Type: application/json" \
    -d '{
      "address": "bc1p86ccxlz2avzdld2q6x9s4crh6pkx7msgwlcxunvstymyn2sy2e3smcuy7s",
      "email": "test@example.com",
      "agreeToTerms": true
    }'
  echo ""
done
```

**Expected Results:**

- ✅ First 5 requests succeed
- ✅ 6th request fails with rate limit error

### 3.2 Email Validation Tests

**Test various email formats:**

| Email Format                    | Expected Result          |
| ------------------------------- | ------------------------ |
| `user@example.com`              | ✅ Success               |
| `user@`                         | ❌ Fail (invalid format) |
| `a...@example.com` (255+ chars) | ❌ Fail (too long)       |
| `user+tag@example.com`          | ✅ Success               |
| `user.name@example.co.uk`       | ✅ Success               |

### 3.3 Privacy Policy Requirement Test

**Steps:**

1. Try subscribing without checking the privacy policy checkbox
2. Try subscribing with empty email field
3. Try subscribing with invalid email format

**Expected Results:**

- ✅ Error message for missing privacy policy checkbox
- ✅ Error message for empty email
- ✅ Error message for invalid email format

### 3.4 Unsubscribe Tests

**Test 1: Via Email Link**

1. Click unsubscribe link in weekly email
2. Verify redirect to success page

**Test 2: Via UI Toggle**

1. Toggle weekly reports OFF in user menu
2. Try subscribing again with same email

**Expected Results:**

- ✅ Immediate email deletion from database
- ✅ Can re-subscribe without errors
- ✅ Toast message confirming unsubscribe

## 🗄️ Phase 4: Database Verification

### 4.1 Check Email Subscriptions Table

```sql
-- Connect to your database and verify records
SELECT * FROM email_subscriptions WHERE email = 'your-test-email@example.com';
```

**Expected Columns:**

- `id`, `address`, `email`, `is_verified`, `created_at`, `updated_at`

### 4.2 Check Verification Tokens

```sql
-- Check verification tokens were created and deleted
SELECT * FROM email_verifications WHERE email = 'your-test-email@example.com';
```

### 4.3 Verify Data Deletion

```sql
-- After unsubscribing, verify complete deletion
SELECT COUNT(*) FROM email_subscriptions WHERE email = 'your-test-email@example.com';
```

**Expected Result:** `0` (complete deletion)

## 🔍 Phase 5: Error Handling Tests

### 5.1 Invalid Wallet Address

```bash
curl -X POST "http://localhost:3000/api/email/subscribe" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "invalid-address",
    "email": "test@example.com",
    "agreeToTerms": true
  }'
```

**Expected Result:** ❌ 400 Bad Request

### 5.2 Missing Required Fields

**Test without:**

- `address` field
- `email` field
- `agreeToTerms` field

**Expected Result:** ❌ 400 Bad Request for each

### 5.3 Invalid Verification Token

```bash
curl -X POST "http://localhost:3000/api/email/verify" \
  -H "Content-Type: application/json" \
  -d '{"token": "invalid-token"}'
```

**Expected Result:** ❌ Error response

## 🚨 Phase 6: Security Tests

### 6.1 Cron Job Security

```bash
# Try without Bearer token (should fail)
curl -X GET "http://localhost:3000/api/cron/weekly-email"
```

**Expected Result:** ❌ 401 Unauthorized

### 6.2 Email Enumeration Prevention

Try verifying emails that don't exist:

```bash
curl -X POST "http://localhost:3000/api/email/verify" \
  -H "Content-Type: application/json" \
  -d '{"token": "nonexistent-token"}'
```

**Expected Result:** ❌ Generic error (no information leakage)

## 📊 Phase 7: Performance Tests

### 7.1 Multiple Users Test

**Steps:**

1. Subscribe 3-5 different email addresses
2. Trigger weekly email cron job
3. Verify all users receive emails

**Expected Results:**

- ✅ All subscribed users receive weekly emails
- ✅ No users are skipped
- ✅ Email content is personalized for each user

### 7.2 Data Accuracy Test

**Verify calculations in weekly email:**

- Staking rewards calculation accuracy
- APY calculation accuracy
- Total rewards distributed accuracy
- Token balance accuracy

## 🎯 Phase 8: User Experience Tests

### 8.1 Mobile Responsiveness

- ✅ Email subscription form works on mobile
- ✅ Toggle is touch-friendly
- ✅ Email input works properly on mobile keyboards

### 8.2 Accessibility

- ✅ Toggle is keyboard navigable
- ✅ Form has proper labels
- ✅ Screen reader friendly

### 8.3 Browser Compatibility

- ✅ Works in Chrome, Firefox, Safari
- ✅ Email links work in all major email clients

## 📋 Phase 9: Production Readiness Checklist

### 9.1 Core Functionality ✅

- [ ] Email subscription flow works end-to-end
- [ ] Email verification works automatically
- [ ] Weekly emails are sent with correct content
- [ ] Rate limiting prevents abuse
- [ ] Privacy policy checkbox is required
- [ ] Unsubscribe works and deletes data immediately
- [ ] Database records are created/updated correctly
- [ ] Error handling works properly
- [ ] Security measures are effective

### 9.2 Email Deliverability ✅

- [ ] Emails don't go to spam
- [ ] Email content renders properly in all clients
- [ ] Links in emails work correctly
- [ ] Unsubscribe links work
- [ ] Email branding is consistent

### 9.3 GDPR Compliance ✅

- [ ] Privacy policy checkbox is required
- [ ] Data is deleted immediately on unsubscribe
- [ ] Users can access their data
- [ ] No unnecessary data retention

### 9.4 Security ✅

- [ ] Rate limiting is effective
- [ ] Input validation works
- [ ] Cron endpoints are secured
- [ ] No information leakage in error messages

## 🚀 Quick Test Script

For fast testing of core functionality:

```bash
# 1. Start dev server
pnpm dev

# 2. Test subscription via UI (use browser)

# 3. Trigger weekly email
curl -X GET "http://localhost:3000/api/cron/weekly-email" \
  -H "Authorization: Bearer 6UI5hnaZPF5jwIZWfTp3U5PIg4o7O0ACyClA6Ui/JiU="

# 4. Check your email for the weekly report
```

## 📝 Test Results Template

Copy this template to track your test results:

```markdown
## Test Results

### Phase 1: Basic Email Flow

- [ ] Email subscription: ✅/❌
- [ ] Email verification: ✅/❌
- [ ] Toggle functionality: ✅/❌

### Phase 2: Cron Job

- [ ] Weekly email trigger: ✅/❌
- [ ] Email content accuracy: ✅/❌

### Phase 3: Security

- [ ] Rate limiting: ✅/❌
- [ ] Email validation: ✅/❌
- [ ] Privacy policy requirement: ✅/❌

### Phase 4: Database

- [ ] Data creation: ✅/❌
- [ ] Data deletion: ✅/❌

### Issues Found:

1. [Describe any issues found]
2. [Steps to reproduce]
3. [Expected vs actual behavior]

### Notes:

[Additional notes or observations]
```

## 🎉 Success Criteria

The email notification system is considered **production-ready** when:

1. ✅ All core functionality tests pass
2. ✅ Security measures are effective
3. ✅ Email deliverability is confirmed
4. ✅ GDPR compliance is verified
5. ✅ No critical bugs are found
6. ✅ User experience is smooth and intuitive

---

**Last Updated:** October 5, 2025  
**Version:** 1.0  
**Status:** Ready for Testing

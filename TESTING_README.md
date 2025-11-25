# Testing Guide: PayClearly Chrome Extension

This guide explains how to test the extension in your browser, including scenarios for template-based autofill and learning mode.

---

## Prerequisites

1. **Build the extension**:
   ```bash
   npm run build:test  # For test mode with mock data
   # OR
   npm run build:dev   # For development mode
   ```

2. **Load extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist/` directory

3. **Start test server** (for test pages):
   ```bash
   cd test-pages
   python3 -m http.server 8000
   ```

---

## Testing Scenarios

### Scenario 1: Template Exists - Automatic Form Filling

**Goal**: Test that the extension automatically fills forms when a template exists.

#### Setup

1. **Load extension** and sign in (test mode authenticates immediately)

2. **Get a payment**:
   - Click extension icon
   - Click "Sign In" (if not authenticated)
   - Click "Get Next Payment"
   - Payment summary should appear

3. **Navigate to payment form**:
   - Open `http://localhost:8000/payment.html` in Chrome
   - Extension should detect the portal automatically

#### Expected Behavior

1. **Portal Detection**:
   - Extension detects portal (check browser console for logs)
   - State badge in popup shows "ACTIVE"
   - Notification: "Portal detected"

2. **Template Retrieval**:
   - Extension fetches template from Portal Learning Service (or uses mock template in test mode)
   - If template exists and confidence >= 0.7, autofill triggers

3. **Automatic Form Filling**:
   - Form fields fill automatically:
     - Amount: `1234.56`
     - Invoice: `INV-TEST-001`
     - Card Number: `4111111111111111`
     - Expiry: `12/25`
     - CVV: `123`
   - Notification: "Form auto-filled. Click Submit."

4. **Verification**:
   - Check that all fields are filled correctly
   - Check that form validation passes (if portal has validation)
   - Check browser console for autofill logs

#### Testing Without Template (To Create One)

If you want to test the full flow including template creation:

1. **Clear template cache** (or use a payment/portal combination without a template)
2. Follow "Scenario 2: No Template - Learning Mode" first
3. Then follow this scenario to test autofill with the learned template

---

### Scenario 2: No Template - Learning Mode

**Goal**: Test that the extension learns form structure when no template exists.

#### Setup

1. **Ensure no template exists**:
   - Use a payment/portal combination that doesn't have a template
   - OR clear extension storage:
     - Open DevTools → Application → Storage → Extension
     - Clear `chrome.storage.local` and `chrome.storage.session`

2. **Load extension** and get a payment (same as Scenario 1)

3. **Navigate to payment form**:
   - Open `http://localhost:8000/payment.html`

#### Expected Behavior

1. **Portal Detection**:
   - Extension detects portal
   - State badge shows "ACTIVE" or "LEARNING"

2. **Learning Mode Activation**:
   - No template found → Learning mode activated
   - Notification: "Learning mode. Please fill form manually."
   - **Smart Autofill Overlay** appears when you focus on input fields:
     - Hover/focus on "Card Number" field
     - Context menu appears with suggested value
     - Click to fill the value

3. **Manual Form Filling** (with smart autofill assistance):
   - Focus on each field
   - Smart autofill overlay suggests values based on payment data
   - Click to fill, or type manually
   - Extension captures field mappings as you interact

4. **Template Submission**:
   - After filling form, click "Submit"
   - Navigate to `confirmation.html`
   - Extension detects confirmation page
   - Template is submitted to Portal Learning Service
   - Notification: "Template learned. Capturing evidence..."

5. **Evidence Capture**:
   - Screenshot captured (simulated in test mode)
   - Evidence uploaded to GCS (simulated in test mode)
   - Notification: "Evidence uploaded. Ready."

6. **Verification**:
   - Check browser console for learning submission logs
   - Check that template was created (query Portal Learning Service or check MongoDB)
   - Next time you use this portal, template should exist and autofill should work

---

### Scenario 3: Full Payment Flow

**Goal**: Test complete payment flow from start to finish.

#### Steps

1. **Sign In** → Extension popup → "Sign In"

2. **Get Next Payment** → Click "Get Next Payment"

3. **Navigate to Login** (if needed):
   - Open `http://localhost:8000/login.html`
   - Extension detects portal
   - Fill login form manually (or if portal has template, autofill)

4. **Navigate to Payment Form**:
   - Open `http://localhost:8000/payment.html`
   - **If template exists**: Form auto-fills
   - **If no template**: Learning mode activates, use smart autofill overlay

5. **Submit Payment**:
   - Click "Submit" button
   - Navigate to `confirmation.html`

6. **Confirmation & Evidence**:
   - Extension detects confirmation page
   - Screenshot captured
   - Evidence uploaded
   - Payment marked complete
   - Next payment fetched automatically (if auto-fetch enabled)

#### Expected Flow

```
IDLE → FETCHING → ACTIVE → (LEARNING if no template) → COMPLETING → IDLE/FETCHING
```

Check state badge in popup to verify state transitions.

---

## Testing Controls

### Reset State
- **Button**: "Reset State" in extension popup
- **Use When**: Stuck in a state, want to start fresh
- **Action**: Clears payment, template, and returns to IDLE

### Test Autofill
- **Button**: "Test Autofill" (appears when state is ACTIVE)
- **Use When**: Want to manually trigger autofill on current page
- **Action**: Triggers autofill even if already filled

### Toggle Auto-Fetch
- **Checkbox**: "Auto-fetch after completion"
- **Use When**: Want to control when next payment is fetched
- **Action**: Disables automatic payment fetching after completion

---

## Debugging Tips

### View Logs

1. **Background Service Worker**:
   - `chrome://extensions/` → Find extension → Click "service worker"
   - View all background logs and errors

2. **Content Script**:
   - Open DevTools on test page (F12)
   - Console tab shows content script logs

3. **Popup**:
   - Right-click extension icon → "Inspect popup"
   - View popup console logs

### Common Issues

#### Portal Not Detected
- **Check**: URL matches patterns in `src/shared/portalPatterns.ts`
- **Fix**: Add test portal patterns or fetch payment first (sets portalId in state)

#### Autofill Not Working
- **Check**: Template exists and confidence >= 0.7
- **Check**: Form fields match template selectors
- **Fix**: Use "Test Autofill" button or check console logs

#### Learning Mode Not Activating
- **Check**: No template exists for this portal/account/client/vendor combination
- **Check**: State is ACTIVE or LEARNING
- **Fix**: Clear template cache or use different payment

#### Smart Autofill Overlay Not Showing
- **Check**: Learning mode is active
- **Check**: Payment data is loaded
- **Check**: Field is empty (overlay only shows on empty fields)
- **Fix**: Focus on field, wait 200ms for overlay

#### State Stuck
- **Check**: Current state in popup badge
- **Fix**: Click "Reset State" button

---

## Test Data Reference

### Mock Payment Data
- **Vendor**: "Test Vendor Corp"
- **Amount**: $1,234.56
- **Invoices**: INV-TEST-001, INV-TEST-002
- **Card**: 4111111111111111
- **Expiry**: 12/25
- **CVV**: 123

### Test Pages
- **Login**: `http://localhost:8000/login.html`
- **Payment**: `http://localhost:8000/payment.html`
- **Confirmation**: `http://localhost:8000/confirmation.html`

### Field Mappings (for test payment page)
- Amount: `#amount-input`
- Invoice: `#invoice-input`
- Card Number: `[name="cardNumber"]`
- Expiry: `[name="expiry"]`
- CVV: `[name="cvv"]`

---

## Testing with Real Services

Once backend services are implemented:

1. **Disable test mode**:
   ```bash
   npm run build:dev  # or build:prod
   ```

2. **Set environment variables**:
   - Update `src/shared/config.ts` with real service URLs
   - Or set via webpack environment variables

3. **Test authentication**:
   - Sign in with real OAuth flow
   - Verify token refresh works

4. **Test payment fetching**:
   - Get real payment from queue
   - Verify payment data structure matches

5. **Test template operations**:
   - Create template via learning mode
   - Verify template stored in MongoDB
   - Test autofill with real template

6. **Test evidence upload**:
   - Verify screenshot captured
   - Verify upload to GCS bucket
   - Verify evidence URL stored

---

## Advanced Testing

### Test Multiple Payments in Sequence

1. Enable auto-fetch
2. Complete first payment
3. Extension automatically fetches next payment
4. Repeat

### Test Exception Creation

1. Get payment
2. Click "Create Exception" button
3. Enter reason
4. Verify exception created
5. Payment cleared from state

### Test State Persistence

1. Get payment
2. Close extension popup
3. Reload extension (`chrome://extensions/` → Reload)
4. Open popup
5. Verify state restored (payment still there)

### Test SPA Navigation

1. Navigate to payment page
2. Extension detects portal
3. Use JavaScript to navigate (SPA-style)
4. Extension should re-detect portal
5. Check console for navigation detection logs

---

## Checklist for Testing

### Template Exists Scenario
- [ ] Portal detected
- [ ] Template retrieved
- [ ] Form auto-filled correctly
- [ ] All fields match payment data
- [ ] Notification shown
- [ ] Form can be submitted

### Learning Mode Scenario
- [ ] Learning mode activated
- [ ] Smart autofill overlay appears
- [ ] Overlay suggests correct values
- [ ] Can fill fields via overlay
- [ ] Template submitted after confirmation
- [ ] Evidence captured
- [ ] Template stored in database

### Full Flow Scenario
- [ ] Sign in works
- [ ] Payment fetched
- [ ] Portal detected
- [ ] Form filled (auto or learning)
- [ ] Payment submitted
- [ ] Confirmation detected
- [ ] Evidence uploaded
- [ ] Payment marked complete
- [ ] Next payment fetched (if enabled)

---

## Next Steps

1. **Test with test mode** (current state) - Use this guide
2. **Implement backend services** - See `REMAINING_WORK_PLAN.md`
3. **Connect to real services** - Update config, disable test mode
4. **Test with real portals** - Use actual vendor portals
5. **Production testing** - Full end-to-end with real data

---

## Support

If you encounter issues:
1. Check browser console for errors
2. Check background service worker logs
3. Check extension state in popup
4. Review `TESTING_INSTRUCTIONS.md` for detailed steps
5. Review `TESTING_WORKFLOW.md` for workflow-specific guidance


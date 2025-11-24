# Testing Workflow

## Quick Start

1. **Start local test server:**
   ```bash
   cd test-pages
   python3 -m http.server 8000
   ```

2. **Load extension in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` directory

3. **Test the extension:**
   - Open `http://localhost:8000` in Chrome
   - Click extension icon → Sign In
   - Click "Get Next Payment"
   - Navigate through test pages

## Step-by-Step Testing

### 1. Authentication Test
- Click extension icon
- Should show "Sign In" button
- Click "Sign In"
- Should authenticate immediately (test mode)
- Popup should show main UI with state badge

### 2. Payment Fetch Test
- Click "Get Next Payment" button
- Should show "Fetching next payment..." notification
- After ~500ms, payment summary should appear:
  - Vendor: "Test Vendor Corp"
  - Amount: $1,234.56
  - Invoices: INV-TEST-001, INV-TEST-002

### 3. Portal Detection Test
- Navigate to `http://localhost:8000/login.html`
- Open extension popup
- Check state badge (should be "ACTIVE")
- Check browser console (F12) for portal detection logs
- Should see: "Portal detected" with portalId: "portal_test"

### 4. Form Autofill Test (With Template)
**First, ensure a template exists:**
- The mock template matches portal_test + test account/client/vendor
- If template exists, autofill should trigger automatically

**Test steps:**
- Navigate to `http://localhost:8000/payment.html`
- Extension should detect portal
- If template exists: Form should auto-fill
- Notification: "Form auto-filled. Click Submit."
- Verify fields are filled:
  - Amount: 1234.56
  - Invoice: INV-TEST-001
  - Card: 4111111111111111
  - Expiry: 12/25
  - CVV: 123

### 5. Learning Mode Test (No Template)
**To test learning mode, you may need to:**
- Clear template cache, OR
- Use different portalId/accountId combination

**Test steps:**
- Navigate to `http://localhost:8000/payment.html`
- Extension detects portal but no template
- Notification: "Learning mode. Please fill form manually."
- Fill form manually (extension captures field mappings)
- Click Submit
- Navigate to `confirmation.html`
- Extension submits learning payload
- Notification: "Template learned. Capturing evidence..."

### 6. Evidence Capture Test
- Complete payment flow (autofill or manual)
- Navigate to `http://localhost:8000/confirmation.html`
- Extension should detect confirmation page
- Notification: "Capturing screenshot..."
- Notification: "Uploading evidence..."
- Notification: "Evidence uploaded. Ready."
- Check browser console for evidence upload logs
- Payment should be marked complete
- "Get Next Payment" button should re-enable

### 7. Full Flow Test
1. Sign In → Get Next Payment
2. Navigate to login.html → Portal detected
3. Navigate to payment.html → Form auto-filled (or learning mode)
4. Click Submit
5. Navigate to confirmation.html → Evidence captured
6. Payment completed → Next payment fetched automatically

## Debugging Tips

### Check Extension State
- Open popup to see current state
- State badge shows: IDLE, FETCHING, ACTIVE, COMPLETING, etc.

### Check Logs
- **Background Service Worker:**
  - `chrome://extensions/` → Find extension → Click "service worker"
  - View all background logs

- **Content Script:**
  - Open DevTools on test page (F12)
  - Console tab shows content script logs

### Common Issues

**Portal not detected:**
- Check URL matches patterns in `portalPatterns.ts`
- Check browser console for detection logs
- Try fetching payment first (sets portalId in state)

**Autofill not working:**
- Check if template exists (browser console logs)
- Check template confidence (should be >= 0.7)
- Verify field selectors match form (check console)

**Evidence not captured:**
- Check confirmation detection (console logs)
- Verify screenshot capture (test mode simulates this)
- Check for errors in background service worker console

## Test Data Reference

**Mock Payment:**
- ID: `pay_test_123`
- Vendor: "Test Vendor Corp"
- Amount: $1,234.56
- Invoices: INV-TEST-001, INV-TEST-002
- Card: 4111111111111111
- Expiry: 12/25
- CVV: 123

**Mock Template:**
- Portal: `portal_test`
- Fields: amount-input, invoice-input, cardNumber, expiry, cvv
- Confidence: 0.87

## Next Steps

After testing basic flows:
1. Test error scenarios (network failures, invalid data)
2. Test state persistence (reload extension)
3. Test multiple payments in sequence
4. Test exception creation
5. Continue with PR5 (Obfuscation) and PR6 (Evidence Capture)


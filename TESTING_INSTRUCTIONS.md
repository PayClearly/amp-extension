# Testing Instructions

## Quick Setup

1. **Build extension with test mode:**
   ```bash
   npm run build:test
   ```

2. **Load extension in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist/` directory

3. **Start test server:**
   ```bash
   cd test-pages
   python3 -m http.server 8000
   ```

4. **Open test pages:**
   - Navigate to `http://localhost:8000` in Chrome

## Testing Workflow

### Initial Setup

1. **Sign In:**
   - Click extension icon
   - Click "Sign In" button
   - Should authenticate immediately (test mode)

2. **Disable Auto-Fetch (Recommended for Testing):**
   - In extension popup, uncheck "Auto-fetch after completion"
   - This prevents automatic payment fetching after completion
   - Allows you to manually control the flow

### Testing Form Autofill

**Option 1: Automatic Flow (With Template)**
1. Click "Get Next Payment"
2. Navigate to `http://localhost:8000/payment.html`
3. Extension should detect portal and auto-fill form
4. Check form fields are filled correctly
5. Click Submit
6. Navigate to `confirmation.html`
7. Extension captures evidence
8. Payment completes → State returns to IDLE

**Option 2: Manual Trigger (For Testing)**
1. Click "Get Next Payment"
2. Navigate to `http://localhost:8000/payment.html`
3. Wait for portal detection (check notifications)
4. Click "Test Autofill" button in extension popup
5. Form should fill immediately
6. Verify fields are correct

### Testing Learning Mode

1. **Reset state:**
   - Click "Reset State" button
   - Clears current payment and template

2. **Fetch payment:**
   - Click "Get Next Payment"

3. **Navigate to payment page:**
   - Go to `http://localhost:8000/payment.html`
   - Extension detects portal but no template exists
   - Notification: "Learning mode. Please fill form manually."

4. **Fill form manually:**
   - Extension captures field mappings as you type
   - Fill all fields (amount, invoice, card, expiry, CVV)

5. **Submit:**
   - Click Submit
   - Navigate to `confirmation.html`
   - Extension submits learned template
   - Evidence captured

6. **Test autofill with learned template:**
   - Reset state
   - Get next payment
   - Navigate to payment page
   - Form should auto-fill using learned template

### Testing State Management

**Reset State:**
- Use "Reset State" button to manually return to IDLE
- Useful when stuck in FETCHING, ACTIVE, or COMPLETING states
- Clears payment, template, and all state

**Stop Auto-Fetch:**
- Uncheck "Auto-fetch after completion"
- After payment completes, state returns to IDLE
- You can manually fetch next payment

**Get Next Payment:**
- Only enabled when state is IDLE
- If disabled, use "Reset State" first

### Debugging Tips

**Check Extension State:**
- Open popup to see current state badge
- States: IDLE, FETCHING, ACTIVE, LEARNING, COMPLETING, ERROR

**View Logs:**
- **Background Service Worker:**
  - `chrome://extensions/` → Find extension → Click "service worker"
  - View all background logs and errors

- **Content Script:**
  - Open DevTools on test page (F12)
  - Console tab shows content script logs

**Common Issues:**

1. **"Get Next Payment" button disabled:**
   - Check state badge (should be IDLE)
   - If not IDLE, click "Reset State"

2. **Autofill not working:**
   - Check if template exists (console logs)
   - Verify payment is loaded (popup shows payment summary)
   - Try "Test Autofill" button manually

3. **Portal not detected:**
   - Check URL matches patterns in `portalPatterns.ts`
   - Should match `localhost` or `127.0.0.1` with `/payment` path
   - Check browser console for detection logs

4. **State stuck:**
   - Use "Reset State" button
   - Reload extension if needed

## Test Data Reference

**Mock Payment:**
- Vendor: "Test Vendor Corp"
- Amount: $1,234.56
- Invoices: INV-TEST-001, INV-TEST-002
- Card: 4111111111111111
- Expiry: 12/25
- CVV: 123

**Test Pages:**
- `login.html` - Login form (portal detection)
- `payment.html` - Payment form (autofill/learning)
- `confirmation.html` - Confirmation page (evidence capture)

## Next Steps

After testing basic flows:
1. Test error scenarios (network failures, invalid data)
2. Test state persistence (reload extension)
3. Test multiple payments in sequence
4. Test exception creation
5. Continue with PR5 (Obfuscation) and PR6 (Evidence Capture)


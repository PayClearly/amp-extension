# Test Pages for Extension Testing

These test pages allow you to test the extension functionality without needing real vendor portals.

## How to Use

1. **Open test pages locally:**
   ```bash
   # Option 1: Use Python's HTTP server
   cd test-pages
   python3 -m http.server 8000
   # Then open http://localhost:8000 in Chrome

   # Option 2: Use Node.js http-server
   npx http-server test-pages -p 8000
   ```

2. **Test Flow:**
   - Open extension popup → Sign In (test mode)
   - Click "Get Next Payment" (returns mock payment)
   - Navigate to test pages:
     - `login.html` - Test portal detection
     - `payment.html` - Test form autofill/learning
     - `confirmation.html` - Test evidence capture

## Test Pages

### login.html
- Simple login form
- Tests portal detection
- Simulates navigation to payment page

### payment.html
- Payment form with fields matching mock data:
  - Payment Amount (id: `amount-input`)
  - Invoice Number (id: `invoice-input`)
  - Card Number (name: `cardNumber`)
  - Expiry Date (name: `expiry`)
  - CVV (name: `cvv`)
- Tests:
  - Form field detection
  - Autofill (if template exists)
  - Learning mode (if no template)
- Simulates navigation to confirmation

### confirmation.html
- Confirmation page with:
  - Confirmation Number: CONF-TEST-12345
  - Transaction ID: TXN-TEST-67890
  - Invoice Numbers: INV-TEST-001, INV-TEST-002
  - Amount: $1,234.56
- Tests:
  - Confirmation detection
  - Metadata scraping
  - Evidence capture trigger

## Expected Behavior

### With Template (First Run After Learning)
1. Navigate to `payment.html`
2. Extension detects portal
3. Extension finds template (if learned before)
4. Form auto-fills with test payment data
5. Notification: "Form auto-filled. Click Submit."
6. Click Submit
7. Navigate to `confirmation.html`
8. Extension detects confirmation
9. Evidence capture triggered
10. Payment marked complete

### Without Template (Learning Mode)
1. Navigate to `payment.html`
2. Extension detects portal
3. No template found → Learning mode activated
4. Fill form manually
5. Extension captures field selectors
6. Click Submit
7. Navigate to `confirmation.html`
8. Extension detects confirmation
9. Learning payload submitted
10. Evidence captured
11. Next time: Template exists, autofill works

## Debugging

- **Extension Popup:** Shows current state and notifications
- **Background Service Worker Console:**
  - Open `chrome://extensions/`
  - Find "PayClearly Payment Accelerator"
  - Click "service worker" link
  - View logs and errors
- **Content Script Console:**
  - Open DevTools on test page (F12)
  - Check Console tab for content script logs

## Portal Detection

To test portal detection, the extension looks for:
- URL patterns (configured in `src/shared/portalPatterns.ts`)
- DOM fingerprinting
- Payment portalId from state

For test pages, you may need to:
1. Add test portal patterns to `portalPatterns.ts`, OR
2. Fetch a payment first (which sets portalId in state), then navigate to test pages

## Notes

- Test pages use simple HTML/CSS/JS (no frameworks)
- Forms submit via JavaScript to simulate SPA navigation
- All test data matches mock data in extension (`src/shared/testData.ts`)
- Icons and styling are minimal for testing purposes


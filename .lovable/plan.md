

## Fix: "Approve USDC & Launch" button not clickable

### Root cause

The button has `disabled={!canLaunch}` where `canLaunch = Boolean(address && walletClient && factoryAddress && recipient)`. If the wallet is not connected, the button is correctly disabled — but it may also appear unclickable due to the disabled styling being too subtle in the current dark theme (50% opacity).

However, there may also be a **pointer-events or z-index issue**. The button uses `disabled:pointer-events-none` from the shadcn `Button` component, which is correct behavior. But if there's an overlapping element (like the `pre` status block or another component) covering the button, clicks won't reach it.

### Likely scenario

If the user's wallet IS connected and the form IS filled, the button should be enabled. Two possible fixes:

1. **If wallet is not connected**: The button is intentionally disabled. Add a visible helper message below the button explaining why it's disabled (e.g., "Connect your wallet and fill all fields to launch").

2. **If there's an overlay/z-index issue**: Add `relative z-10` to the button to ensure it's above any potential overlapping elements, and verify no parent has `pointer-events-none`.

### Changes

**`src/pages/Index.tsx`** — Two small edits in the Launch card:

1. Add a helper message when the button is disabled:
```tsx
<Button disabled={!canLaunch} onClick={handleLaunch} className="w-full">
  Approve USDC &amp; Launch
</Button>
{!canLaunch && (
  <p className="text-xs text-muted-foreground">
    Connect your wallet and fill in all fields above to enable this button.
  </p>
)}
```

2. Ensure the `&amp;` in the button text renders correctly — currently it shows the literal `&amp;` entity. Change to:
```tsx
<Button disabled={!canLaunch} onClick={handleLaunch} className="w-full">
  Approve USDC & Launch
</Button>
```

This is a minimal change — the button logic and contract interactions remain untouched.


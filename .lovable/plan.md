

## Upgrade the USDC Base Launcher Frontend

The current UI uses raw HTML elements with inline styles and minimal custom CSS classes. It looks functional but unstyled — plain inputs, no visual hierarchy, no card borders, and poor spacing. The reference screenshots show it should have proper card sections with borders, labeled form fields, and a polished dark-theme look.

### What will change

**1. Replace raw HTML/CSS with shadcn/ui components**
- Use `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` for each section (Wallet, Launch, Dashboard, Exchange, Verification)
- Use `Input` component for all text inputs
- Use `Button` component (with `variant` props) for all buttons
- Use `Label` for form field labels
- Use `Select` (shadcn) for the token dropdown
- Use `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` for the Exchange deposit/redeem/send mode switcher
- Use `Badge` for status indicators (connected/not connected, chain ID)

**2. Improve layout and spacing**
- Max-width container with consistent vertical spacing between cards
- Proper form field layout with `space-y-4` gaps
- Status messages displayed in a styled alert or monospace block
- Token grid cards with hover states and selected ring

**3. Remove App.css**
- Delete the legacy `App.css` import and file — all styling via Tailwind + shadcn components

**4. Keep all business logic untouched**
- The ABIs, contract addresses, state management, and handler functions remain identical
- Only the JSX return block and imports change

### Technical approach

The entire change is in `src/pages/Index.tsx` (JSX return section, lines ~519-687) and removing the `import "../App.css"` line. The file's logic (lines 1-518) stays the same. `src/App.css` will be cleaned up to remove unused styles.

Components to import: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` from `@/components/ui/card`; `Input` from `@/components/ui/input`; `Button` from `@/components/ui/button`; `Label` from `@/components/ui/label`; `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`; `Badge` from `@/components/ui/badge`.


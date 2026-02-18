# PartyTix / Ridiculous Chicken — Customer UI Redesign

**Goal**: 5-second ticket purchase, 3 taps max to Stripe.

**Implemented**: 2026-02-17

---

## Component Structure (Implemented)

```
app/
├── page.tsx              # Discover — auto-region if 1 city, EventCard list
├── events-v2/[id]/       # Purchase — date pills, collapsible details, sticky Buy bar
├── wallet/               # Tickets — glass cards, segmented (Active/Used/Refunded)
├── profile/              # Account — no borders, reordered, small Logout
└── ...

components/
├── discover/
│   └── EventCard.tsx     # Large cover, gradient overlay, price, Buy CTA
├── ui/
│   ├── TopBar.tsx        # Slim when 1 region; full when multi-city
│   └── BottomTabBar.tsx
├── AccountHeaderCard.tsx # No border, backdrop-blur
└── AccountListItem.tsx   # Spacing instead of borders
```

---

## Design Tokens (globals.css)

```css
--tap-scale: 0.98;
--transition-fast: 120ms;
--transition-normal: 180ms;
--blur-subtle: 12px;
--ease-out: cubic-bezier(0.33, 1, 0.68, 1);
```

---

## Flow: 3 taps to Stripe

1. **Discover** → See event card with price + Buy
2. **Tap Buy** (or tap card → Purchase screen) → Date preselected, quantity 1
3. **Tap Buy Now** → Stripe Checkout

Optional: Quick Buy Again (1 tap) for returning users.

# Billing — RevenueCat Integration & Tier Model

## Tier Model

| Tier | ID | Monthly Credits | Key Entitlements |
|---|---|---|---|
| Free | `free` | 100 | chat, build_day |
| Pro | `pro` | 500 | + weekly_review, weekly_plan, recover_day |
| Max | `max` | 2000 | All actions, highest quota |

Tier definitions are stored in `ai_plan_tiers` (seeded by migrations). `monthly_token_budget` and `tokens_per_credit` define the credit math.

---

## Credit System

Credits are the user-facing unit. The underlying system is token-based.

```
creditsUsed  = Σ ACTION_CREDIT_COSTS[action]   (for known actions)
             = ceil(total_tokens / tokens_per_credit)  (fallback for unknown)

creditsQuota = floor(monthly_token_budget / tokens_per_credit)
```

The quota is **enforced server-side** in `ai-chat` before calling Claude. The client displays usage via `useMonthlyUsage` hook but cannot bypass the server check.

---

## RevenueCat Integration

### SDK Setup (`src/services/purchaseService.ts`)

```typescript
// Mock mode — bypasses RC in development builds
const MOCK_MODE = process.env.EXPO_PUBLIC_RC_MOCK_MODE === 'true';
```

EAS `development` profile sets `EXPO_PUBLIC_RC_MOCK_MODE=true` so developers can test billing flows without real purchases.

### Purchase Flow

```
User taps "Upgrade" in upgrade.tsx
  │
  ├─ purchaseService.purchaseProduct(productId)
  │     → Calls Purchases.purchaseStoreProduct() (RevenueCat SDK)
  │
  ├─ On success: POST /functions/v1/activate-purchase
  │     { productId, purchaseToken }
  │     Authorization: Bearer <user JWT>
  │
  └─ activate-purchase Edge Function
       ├─ Validate with RC REST API
       ├─ Map productId → tierId
       └─ Upsert ai_user_tier (service role)
```

### Subscription Lifecycle (Webhook)

RevenueCat sends webhook events to `/functions/v1/rc-webhook`.

| Event | Action |
|---|---|
| `INITIAL_PURCHASE` | Upsert tier to pro/max, set period end |
| `RENEWAL` | Update `current_period_end` |
| `CANCELLATION` | Set `cancelled_at`, keep tier active until period end |
| `EXPIRATION` | Downgrade to free (if event is newer than stored `rc_event_at`) |

### Webhook Security

```typescript
// HMAC-SHA256 signature validation
const signature = req.headers.get('X-RevenueCat-Signature');
// Validated against RC_WEBHOOK_SECRET Supabase secret
```

---

## Entitlement Gating

### Server-side (`ai-chat/index.ts`)

```typescript
const PRO_ONLY_ACTIONS = new Set(['weekly_review', 'weekly_plan', 'recover_day']);

if (PRO_ONLY_ACTIONS.has(action) && tierId === 'free') {
  return new Response(JSON.stringify({ error: 'upgrade_required' }), { status: 403 });
}
```

### Client-side (`src/services/entitlementService.ts`)

```typescript
canUseFeature(action: string, tierId: string): boolean
```

Client-side gating is **UI-only** — it prevents unnecessary network calls and shows upgrade prompts. The server is the authoritative gate.

### Upgrade Screen (`app/upgrade.tsx`)

7-phase state machine:
1. `idle` → display plans
2. `loading` → fetching products from RC
3. `selecting` → user browsing plans
4. `purchasing` → RC purchase in progress
5. `activating` → calling activate-purchase
6. `success` → tier updated
7. `error` → display error with retry

---

## Restore Purchases

Available in `app/(tabs)/profile.tsx` → "Restore Purchases" button.

Calls `Purchases.restorePurchases()` (RevenueCat SDK), then re-runs `activate-purchase` with the restored entitlement. RC webhook will also fire a `RENEWAL` event which updates the tier independently.

---

## Database Columns (ai_user_tier)

| Column | Type | Description |
|---|---|---|
| `user_id` | uuid | FK to auth.users |
| `tier_id` | text | 'free' \| 'pro' \| 'max' |
| `rc_customer_id` | text | RevenueCat customer ID |
| `product_id` | text | Active product ID |
| `current_period_end` | timestamptz | Subscription expiry |
| `cancelled_at` | timestamptz | Cancellation timestamp |
| `rc_event_at` | timestamptz | Timestamp of last RC event processed |

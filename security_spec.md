# Security Specification — Hortimarket Delivery Firestore Rules

## 1. Data Invariants
1. **Default Deny**: All unspecified paths are denied (`match /{document=**} { allow read, write: if false; }`).
2. **PII Isolation**: Customer PII (`customerName`, `customerPhone`, `address`, `neighborhood`, `complement`, `notes`, `changeFor`) resides strictly in `/orders/{orderId}` and can ONLY be read (`get`, `list`) and updated/deleted by verified Admin (`isAdmin()`).
3. **Atomic Tracking Projection**: Creating `/orderTracking/{orderId}` (which contains NO PII) requires `existsAfter(/databases/$(database)/documents/orders/$(orderId))` so tracking docs cannot be orphaned. Public `list` on `/orderTracking` is forbidden (`allow list: if isAdmin()`).
4. **Initial Status Integrity**: Any new order created by a customer MUST have `status == 'novo'`, `createdAt == request.time`, `updatedAt == request.time`, and valid numeric totals.
5. **Catalog & Store Integrity**: Only `isAdmin()` can create, update, or delete `/storeConfig/{configId}` and `/products/{productId}`.
6. **Immutable Creation Timestamps**: On `/orders` and `/orderTracking` updates, `createdAt` and `code` must remain immutable (`incoming().createdAt == existing().createdAt`).
7. **Admin Verification**: `isAdmin()` requires `request.auth != null`, `request.auth.token.email_verified == true`, and either the store owner email (`hortimarketminimercado@gmail.com`) or existence in `/admins/$(request.auth.uid)`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Shadow Field Injection on Order Create**: `{ ..., isAdmin: true }` -> Rejected by `keys().hasOnly(...)`.
2. **Pre-approved Status Injection on Order Create**: `{ ..., status: 'concluido' }` -> Rejected by `incoming().status == 'novo'`.
3. **Forged Timestamp on Order Create**: `{ ..., createdAt: "2020-01-01T00:00:00Z" }` -> Rejected by `incoming().createdAt == request.time`.
4. **Oversized Document ID Poisoning**: `/orders/${"a".repeat(200)}` -> Rejected by `isValidId(orderId)`.
5. **Non-Admin Listing `/orders` (PII Leak)**: `getDocs(collection(db, 'orders'))` unauthenticated or non-admin -> Rejected by `allow list: if isAdmin()`.
6. **Non-Admin Reading `/orders/{id}` (PII Leak)**: `getDoc(doc(db, 'orders', 'ord-123'))` unauthenticated -> Rejected by `allow get: if isAdmin()`.
7. **Non-Admin Listing `/orderTracking`**: `getDocs(collection(db, 'orderTracking'))` unauthenticated -> Rejected by `allow list: if isAdmin()`.
8. **Orphaned `/orderTracking` Write Without `/orders` Batch**: `setDoc(doc(db, 'orderTracking', 'ord-fake'), ...)` -> Rejected by `existsAfter(...)`.
9. **Empty Order Items Array**: `/orders/ord-1` with `items: []` -> Rejected by `data.items.size() >= 1`.
10. **Non-Admin Modifying Product Price**: `updateDoc(doc(db, 'products', 'hm-01'), { price: 0.01 })` unauthenticated -> Rejected by `allow update: if isAdmin()`.
11. **Unverified Email Spoofing Admin**: `auth.token = { email: 'hortimarketminimercado@gmail.com', email_verified: false }` -> Rejected by `email_verified == true`.
12. **Self-Assigned Admin Escalation**: `setDoc(doc(db, 'admins', uid), { email: 'attacker@evil.com' })` -> Rejected by `allow write: if false`.

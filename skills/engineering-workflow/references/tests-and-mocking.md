# Tests and Mocking

What a good test is, where tests go, and when to mock. Adapted for Pi from mattpocock/skills (MIT).

## Good tests

**Integration-style**: test through real interfaces, not mocks of internal parts.

```typescript
// GOOD: Tests observable behavior
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Characteristics: tests behavior callers care about; uses public API only; survives internal refactors; describes WHAT, not HOW; one logical assertion per test.

## Bad tests

**Implementation-coupled** — mocks internal collaborators, tests private methods, asserts on call counts/order, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.

```typescript
// BAD: Bypasses interface to verify
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: Verifies through interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**Tautological** — the assertion recomputes the expected value the way the code does, so it passes by construction and can never disagree with the code.

```typescript
// BAD: Expected value recomputed like the implementation
const expected = items.reduce((sum, i) => sum + i.price, 0);
expect(calculateTotal(items)).toBe(expected);

// GOOD: Independent, known literal
expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
```

Expected values must come from an independent source of truth — a known-good literal, a worked example, the spec.

**Horizontal slicing** — writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior and go insensitive to real changes. Work in **vertical slices**: one test → one implementation → repeat, each test a tracer bullet responding to what the last cycle taught you.

## When to mock

Mock at **system boundaries** only: external APIs, databases (prefer a test DB when available), time/randomness, sometimes the filesystem (prefer temp dirs).

Don't mock: your own classes/modules, internal collaborators, anything you control.

## Designing for mockability

1. **Dependency injection** — pass external dependencies in rather than creating them internally.
2. **Prefer SDK-style interfaces over generic fetchers** — specific functions per external operation (`api.getUser(id)`, `api.createOrder(data)`) instead of one generic `api.fetch(endpoint, options)`. Each mock returns one specific shape; no conditional logic in test setup; easier to see which endpoints a test exercises.

## In this repo

Harness logic follows the pure-core pattern: logic in `.pi/lib/*.ts`, tests in `.pi/tests/*.test.ts` with `node:test` + `assert/strict`, run via `npm run test:harness`. The pure module's exported functions are the seam — extensions/UI shells stay thin and untested.

# Tests and Mocking

What a good test is, where tests go, and when to mock. Adapted for Pi from mattpocock/skills (MIT). `testing-strategy.md` owns selection/order/escalation and `implementation-tdd.md` owns the red/green implementation loop; this file owns guard quality and fidelity.

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

Characteristics: tests behavior callers care about; uses public API only; survives internal refactors; describes WHAT, not HOW; one logical assertion per test. A compiler/type assertion is a valid public seam when the application-owned contract is compile-time or type-level.

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

Expected values must come from an independent source of truth — a known-good literal, a worked example, the spec. See `evidence-binding.md` for the full bind-to-the-thing rule and cardinality/positive-control requirements a proof must satisfy.

**Horizontal slicing** — writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior and go insensitive to real changes. Work in **vertical slices**: one test → one implementation → repeat, each test a tracer bullet responding to what the last cycle taught you.

## When to mock

Mock at **system boundaries** only: external APIs, databases (prefer a test DB when available), time/randomness, sometimes the filesystem (prefer temp dirs).

Don't mock: your own classes/modules, internal collaborators, anything you control.

## Designing for mockability

1. **Dependency injection** — pass external dependencies in rather than creating them internally.
2. **Prefer SDK-style interfaces over generic fetchers** — specific functions per external operation (`api.getUser(id)`, `api.createOrder(data)`) instead of one generic `api.fetch(endpoint, options)`. Each mock returns one specific shape; no conditional logic in test setup; easier to see which endpoints a test exercises.

## Semantic fidelity of test doubles

A double that cannot disagree with its caller proves nothing. These three rules are normative here; `evidence-binding.md`, `code-review.md`, and `completion-evidence.md` cross-reference this section rather than restating it. For orchestrated runs, `lib/test-double-fidelity.ts` makes the claims executable as a fail-closed `DoubleFidelityPacket`: probes with replay commands and observed outcomes, refusal declarations, and explicit tier-blindness entries.

1. **Argument sensitivity.** A semantic argument must be recorded or enforced by the double; a no-op passthrough cannot prove behavior involving it. Observed failure shape: a chain-builder fake whose `.where`/`.orderBy` were no-op passthroughs — flipping the executed sort direction and the keyset tie-break each left every test green and typecheck clean while breaking real behavior. The standard instrument is an argument-recording fake or a rendered-output assertion, proven by a distinguishing probe: two semantically different inputs must produce observably different outcomes.

2. **Refusal capability.** If the real port can refuse, the double reproduces at least one applicable refusal path — or the test declares tier blindness naming the integration guard that owns the blind spot (`evidence-binding.md`). A fake standing in for an operation that can refuse, yet unable to reproduce any refusal, is not a double; it is a rubber stamp. One instance is the echo oracle: a fake that returns or reconciles from caller input defines whatever the caller sent as correct — one such fake accepted slugs where the real operation resolves ids, leaving the defect unimplementable on any real database while every test stayed green. Expected outcomes come from authority or a fixture literal, never from the double's own return value.

3. **Monotonic fidelity.** If making a double more faithful to its port turns a test red, the red is an implementation defect to fix; restoring green by weakening the double is never a valid disposition. Observed failure shape: an initially faithful double exposed a real defect, was deliberately made less faithful to restore green, and the defect survived seven green gates and four claimed mutation proofs — restoring the faithful behavior reddened the suite and proved the defect. "Faithful" means behaviorally faithful to the declared port, not identical internal state; a minimal double that claims no semantic behavior, argument sensitivity, or refusal coverage is not in scope of these rules.

## Harness modules

For Pi harness logic, prefer a pure core in the package's `lib/` or the project's documented `.pi/lib/`, with tests in the corresponding repository-native test location. The pure module's exported functions are the seam; extensions/UI shells stay thin. Discover the actual test command from the project/package contract rather than assuming `npm run test:harness`.

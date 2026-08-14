/**
 * Nominal identifier branding.
 *
 * Zero-dependency, compile-time-only nominal typing for opaque identifiers that cross
 * a state-file or protocol boundary. A brand is a phantom intersection type: it exists
 * only for the type checker and erases to a plain `string` at runtime, so serialization
 * output is byte-identical whether or not a slot is branded.
 *
 * Brand at the parse boundary (when a string from outside the system enters a slot),
 * erase with {@link unbrand} only at serialization or display boundaries. Internal
 * local variables stay plain `string`; branding applies where two different id families
 * could be confused by the compiler.
 */

/** A nominal string tag. `Tag` never exists at runtime. */
export type Branded<Tag extends string> = string & { readonly __tag: Tag };

/**
 * Nominalize a runtime string at a parse boundary. This is a type-level cast with zero
 * runtime cost; callers must have already validated the string's shape.
 */
export function brand<B extends Branded<string>>(value: string): B {
  return value as B;
}

/** Erase a brand at a serialization or display boundary. */
export function unbrand(value: Branded<string>): string {
  return value as string;
}

// --- Id families that cross state-file or protocol boundaries ---

/** Ticket identifier within a batch run (`T1`, `T2`, ...). */
export type TicketId = Branded<"TicketId">;

/** Batch identifier: the effort directory or source that owns a ticket set. */
export type BatchId = Branded<"BatchId">;

/** Exclusive writer-lease identifier. */
export type LeaseId = Branded<"LeaseId">;

/** Run-track event identifier (`evt_*` tokens). */
export type EventId = Branded<"EventId">;

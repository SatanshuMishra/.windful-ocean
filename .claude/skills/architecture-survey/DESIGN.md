# Design vocabulary

The words every candidate, report and question uses. Keep to them exactly: they make the report scannable and keep each survey consistent with the last.

## Terms

**Module**: anything with an interface and an implementation, at any scale: a function, a class, a package or a slice spanning tiers.

**Interface**: everything a caller must know to use the module correctly: the type signature, plus its invariants, ordering constraints, error modes, required configuration and performance characteristics.

**Implementation**: the code inside a module.

**Depth**: leverage at the interface, the behaviour a caller or test can exercise per unit of interface it has to learn. A module is **deep** when much behaviour sits behind a small interface, and **shallow** when the interface is nearly as complex as the implementation.

**Seam**: the place where a module's interface lives, where behaviour can be altered without editing in that place. Where the seam goes is its own decision, separate from what sits behind it.

**Adapter**: a concrete thing that satisfies an interface at a seam. The word names a role, not a size.

**Leverage**: what callers gain from depth: more capability per unit of interface learned, one implementation paying back across every call site and test.

**Locality**: what maintainers gain from depth: change, bugs, knowledge and verification concentrate in one module, so a fix lands once.

Say "seam" where other writing says boundary, "interface" where it says API or signature, and "module" where it says component, service, unit, layer or wrapper.

## Principles

- **Depth belongs to the interface.** A deep module can be built from small internal parts; they stay out of its interface. A module may have internal seams for its own tests alongside the external seam at its interface.
- **The deletion test.** Imagine deleting the module. When complexity vanishes, it was a pass-through. When complexity reappears across many callers, it was earning its keep.
- **The interface is the test surface.** Callers and tests cross the same seam. A test that needs to reach past the interface signals a module of the wrong shape.
- **Two adapters make a real seam.** A seam with one adapter is indirection; introduce one when something actually varies across it, typically production and test.

## Dependency categories

Classify each candidate's dependencies; the category decides how the deepened module is tested across its seam.

| Category | What it is | How the deepened module is tested |
|---|---|---|
| In-process | Pure computation and in-memory state, no I/O | Merge the modules and test through the new interface directly |
| Local-substitutable | Has a local stand-in, such as PGLite for Postgres or an in-memory filesystem | Run the stand-in inside the test suite; the seam stays internal |
| Remote but owned | The project's own services across a network | Define a port at the seam; production uses a network adapter, tests an in-memory one |
| True external | A third party the project does not control | Inject it as a port; tests supply a mock adapter |

## Testing a deepened module

Replace the old tests: tests written at the deepened module's interface supersede the unit tests on the shallow modules it absorbed, so those old tests are deleted. New tests assert observable outcomes through the interface and survive any rewrite of the implementation.

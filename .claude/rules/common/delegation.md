# Delegation

The main thread does the work. Delegation is the exception, and it needs a reason from this list:

1. A diff exists and needs review by something that did not write it.
2. A question needs external web research.
3. Exploration would read many files whose contents will never be referenced again.
4. A fully specified change touches enough files to flood this conversation, and no step of it depends on what an earlier step finds.

If none of those hold, do the work here.

Everything a dispatched agent needs must be addressable without this conversation: a path, a commit range, or a question. Work that can only be described by referring to what has already happened here is work that stays here.

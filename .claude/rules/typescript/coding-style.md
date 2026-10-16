---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript

- Validate input with a Zod schema.
- Log production code through the project's logging library; `console.log` belongs in scripts and tests.
- Where the project has no response convention of its own, shape API responses as `{ success: boolean; data?: T; error?: string; meta?: { total: number; page: number; limit: number } }`.
- Put data access behind a repository interface: `findAll(filters?)`, `findById(id)`, `create(data)`, `update(id, data)`, `delete(id)`.
- Write E2E tests for critical user flows in Playwright.

# Microservice Auth Target
A lightweight authentication, session management, and JWT token issuance microservice built with Node 22 native crypto.

## Known Refactoring Tasks
1. Refactor monolithic `auth.ts` by splitting `authenticateUser` into isolated `verifyPassword` and `issueSessionToken` primitives.
2. Add sliding-window rate limiting to the token refresh endpoint.
3. Optimize session revocation query in `session.ts`.

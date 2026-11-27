## Summary
<!-- Describe what changed and why. Link related issues or ADRs. -->

## Evaluation Checklist
- [ ] `npm run lint` passes with zero TypeScript errors and zero ESLint warnings
- [ ] `npm test -- --coverage` passes with >=90% statement/branch coverage
- [ ] `npm run build` and `npm run check:budget` pass
- [ ] All user-facing strings include both English and Hindi (Devanagari)
- [ ] Automated `axe-core` accessibility tests pass and keyboard focus behavior was checked
- [ ] No secrets, PII, or household attributes are logged or exposed to the client
- [ ] If health or safety copy changed, public-health review criteria in `docs/PUBLIC_HEALTH_METHODOLOGY.md` were followed

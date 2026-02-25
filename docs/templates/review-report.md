# Review Report: <Scope>

**Date**: YYYY-MM-DD
**Reviewer**: QA Reviewer Agent
**Scope**: <What was reviewed — feature, module, PR, etc.>

---

## Summary

_1-3 sentence overall assessment._

**Verdict**: ✅ Approved | ⚠️ Approved with comments | ❌ Changes requested

---

## Critical Issues

_Issues that MUST be fixed before shipping._

### CRIT-001: <Title>

- **Category**: Security | Bug | Performance | Data Loss
- **Location**: `<file>:<line>`
- **Description**: ...
- **Suggested Fix**: ...
- **Related Requirement**: REQ-<NNN>

---

## Warnings

_Issues that SHOULD be addressed._

### WARN-001: <Title>

- **Category**: Code Quality | Accessibility | Performance | UX
- **Location**: `<file>:<line>`
- **Description**: ...
- **Suggested Fix**: ...

---

## Observations

_Non-blocking suggestions for improvement._

### OBS-001: <Title>

- **Description**: ...
- **Suggestion**: ...

---

## Checklist Results

### Functional Correctness

- [ ] All acceptance criteria met
- [ ] Edge cases handled
- [ ] Error handling comprehensive

### Security

- [ ] Input validation present
- [ ] No hardcoded secrets
- [ ] Auth/authz enforced
- [ ] Dependencies free of known CVEs

### Performance

- [ ] No N+1 queries
- [ ] Proper pagination
- [ ] Assets optimized
- [ ] No memory leaks

### Code Quality

- [ ] DRY — no significant duplication
- [ ] Clear naming conventions
- [ ] No dead code
- [ ] Type safety enforced

### Test Coverage

- [ ] Critical paths tested
- [ ] Tests are deterministic
- [ ] Edge cases covered

### Accessibility (UI only)

- [ ] Semantic HTML
- [ ] ARIA labels present
- [ ] Color contrast sufficient
- [ ] Keyboard navigable

### Design Compliance (UI only)

- [ ] Matches design specs
- [ ] Design tokens used
- [ ] All states implemented
- [ ] Responsive behavior correct

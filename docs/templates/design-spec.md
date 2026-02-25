# Screen Spec: <Screen Name>

**Date**: YYYY-MM-DD
**Author**: UX/UI Designer Agent
**Status**: Draft | Review | Approved
**Implements**: REQ-<NNN>, REQ-<NNN>

---

## Purpose

_What is this screen for? What task does the user accomplish here?_

## Layout

### Desktop (≥ 1024px)

```
┌──────────────────────────────────────────┐
│  Header / Navigation                      │
├────────────┬─────────────────────────────┤
│  Sidebar   │  Main Content               │
│            │                             │
│            │  ┌─────────┐ ┌─────────┐   │
│            │  │ Card 1  │ │ Card 2  │   │
│            │  └─────────┘ └─────────┘   │
│            │                             │
├────────────┴─────────────────────────────┤
│  Footer                                   │
└──────────────────────────────────────────┘
```

### Tablet (768px – 1023px)

_Describe layout changes._

### Mobile (< 768px)

_Describe layout changes._

## Components Used

| Component | Variant | Props/State |
|-----------|---------|-------------|
| Button | Primary | label="Submit", disabled=false |
| Input | Default | placeholder="Enter email..." |
| Card | Elevated | ... |

## States

### Default

_Describe the default state of the screen._

### Loading

_Describe loading/skeleton states._

### Empty

_Describe empty state (no data)._

### Error

_Describe error states._

## Interactions

| Trigger | Action | Result |
|---------|--------|--------|
| Click "Submit" | Validate form, POST to API | Show success toast or inline errors |
| Scroll to bottom | Load next page | Append items, show spinner |

## Accessibility

- Tab order: ...
- ARIA roles: ...
- Focus management: ...
- Screen reader announcements: ...

## Animations

| Element | Trigger | Animation | Duration | Easing |
|---------|---------|-----------|----------|--------|
| Card | Enter viewport | Fade in + slide up | 300ms | ease-out |
| Modal | Open | Scale from 0.95 + fade | 200ms | ease-out |

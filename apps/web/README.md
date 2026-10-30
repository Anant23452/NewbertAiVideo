# Web application boundary

F2 selected Next.js App Router, React and TypeScript; the actual web package and screens begin in F4 after F3 identity integration. See `docs/decisions/ADR-001-IMPLEMENTATION-STACK.md`. Use the approved homepage and eleven product designs in `docs/ui/`; implement real reusable components rather than treating exported Stitch HTML as finished application code.

F1 does not start another UI prototype. Planned routes cover public homepage, identity entry/recovery, dashboard, projects, creation, storyboard, progress, preview, publishing and settings. Connect only implemented API contracts and retain honest loading, empty, paused, validation and access-error states.

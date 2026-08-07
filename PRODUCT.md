# Product

## Register

product

## Users

Digital-pathology labs and weakly-supervised MIL researchers who need a runnable,
cloud-native reference for whole-slide-image (WSI) feature extraction — plus the AI
coding agents and "vibe coders" who adapt it. They want raw slides, extracted patches,
and embedding tensors to live in cheap object storage (not on a local filesystem), with
a working tile → tissue-segment → embed pipeline they can point at their own cohort.

## Product Purpose

A computational-pathology sample (Next.js 16 + React 19 frontend, FastAPI backend) that
makes Backblaze B2 the storage layer for a CLAM-style WSI feature-extraction pipeline.
OpenSlide reads gigapixel slides, tissue is segmented on a downsampled thumbnail, a
patch grid is tiled over tissue, and a truncated ResNet50 produces a per-slide 1024-d
embedding bag — with raw slides, patches, and feature tensors all stored on B2 through
the S3-compatible API. Success = a user can ingest a slide, run extraction on CPU with
no second API key, and get a training-ready embedding bag on B2. Built on the B2
vibe-coding starter kit, so the UI kit, File Explorer, and Upload surfaces come for free.

## Maturity and Support Boundary

This is a maintained open-source template/sample, not a complete hosted SaaS product.
It is built with production-minded controls and can be adapted for production use with
caution, but adopters own product-specific validation, security, deployment, and
operations. Repository defects and feature requests go through the public GitHub issue
tracker; B2 account, billing, service, and API questions go through Backblaze Support.
The template/sample itself is not covered by the Backblaze service level agreement,
and no SLA is provided for the repository software.

## Brand Personality

Confident, precise, quietly professional. Voice is direct and free of hype ("Stop
wiring boilerplate and start building"). The interface should feel like a modern
developer tool — considered, calm, trustworthy — not a marketing showpiece. It is a
**neutral foundation** that others rebrand: the design carries craft through restraint,
not through a strong opinionated identity of its own.

## Anti-references

- **Generic AI/SaaS slop.** No gradient text, hero-metric templates, identical
  icon-card grids, tracked uppercase eyebrows, or decorative glassmorphism. These are
  the exact 2026 AI tells this kit exists to help builders avoid.
- **Over-branded / loud.** No heavy brand-color drenching, decorative motion, or flashy
  effects. It is scaffolding to be rebranded, not a hero page.
- **Toy / prototype feel.** No missing states, inconsistent components, or placeholder
  polish. Must read as polished, dependable scaffolding.
- **Enterprise-drab.** No Bootstrap-era gray boxes or dense-but-lifeless admin-panel
  look. Considered, like modern dev tools (Linear, GitHub Primer, Stripe).

## Design Principles

- **Practice what you preach.** The kit itself must model the engineering quality it
  asks agents to produce. Slop here propagates into every project built on it.
- **Neutral foundation, easy to rebrand.** Identity lives in tokens (`globals.css`) and
  one config file. Screens are built from the shared UI kit so a rebrand is a token
  swap, not a rewrite.
- **Earned familiarity over novelty.** Use standard, trusted affordances (top bar +
  side nav, command palette, data tables). The tool disappears into the task.
- **Every state is designed.** Default, hover, focus, active, disabled, loading (skeleton),
  empty (teaches the interface), and error (says what's wrong + offers retry) — never
  half-shipped.
- **Consistency is the feature.** One button vocabulary, one form-control set, one icon
  style across every screen. Divergence is a bug.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥ 4.5:1, large/bold text ≥ 3:1, visible focus
indicators on every interactive element, full keyboard navigation, correct semantic
landmarks and heading order, labelled form controls, and a `prefers-reduced-motion`
alternative for every animation. Full light and dark theme parity.

# Radix Options UI Migration Roadmap

## Status

Completed on `narumi/feat/radix-options-ui`; implementation, hardening, verification, review, and handoff evidence are recorded below.

## Vision

Replace the extension options page’s hand-built DOM and visual system with a React and Radix UI foundation that is accessible, extension-safe, visually consistent, and easier to evolve without changing what settings mean or how translation works.

## Scope Assumption

“Menu interface” means the extension options page at `src/options/index.html`.

## Objectives

- **Preserve functional behavior** — Success: every current setting loads, edits, validates, saves, reloads, resets, previews, and requests permission with the same stored schema and defaults.
- **Improve accessibility** — Success: tabs and controls expose correct semantics, support complete keyboard operation, retain visible focus, announce actionable status, and have no unresolved serious or critical automated accessibility findings.
- **Adopt one coherent design system** — Success: Radix Themes, Colors, Icons, and appropriate Primitives provide the options-page shell and interaction patterns in light and dark modes.
- **Reduce UI maintenance cost** — Success: the 2,097-line legacy options implementation is retired, responsibilities are split into focused files under 1,000 lines, and imperative DOM synchronization is replaced by explicit React state.
- **Remain safe for Manifest V3** — Success: the production artifact contains all runtime assets locally, adds no permission or remote-code requirement, and passes the existing artifact verification.
- **Protect responsiveness and performance** — Success: supported layouts and interactions meet an approved bundle and startup budget established from a measured pre-migration baseline.

## Pre-Migration Baseline

- The options page is the Manifest V3 `options_page` and is built from `src/options/index.html`.
- The implementation uses 412 lines of static HTML, 358 lines of imperative page logic, 336 lines of appearance-controller logic, and 991 lines of custom CSS.
- The page contains Setup, Appearance, Prompts, and Advanced tabs.
- Settings validation, normalization, migration, and persistence already live in framework-independent shared modules.
- Appearance presets, safe value normalization, contrast calculation, and translation rendering already live outside the options UI and should remain authoritative.
- The current tab buttons switch CSS classes but do not expose the complete ARIA tab pattern or arrow-key navigation.
- Existing CSS already covers light and dark color schemes, narrow layouts, focus styles in selected areas, and reduced motion for appearance previews.
- Existing smoke E2E covers settings loading, appearance presets, Custom state, contrast warnings, reset isolation, saving, and persistence.
- `docs/TESTING.md` defines 23 options-page manual checks that form the current compatibility baseline.
- The repository currently has no React or Radix dependency.
- Extension.js 4.0.32 declares first-class React, JSX, options-page HMR, and production bundling support.

## Execution Record

- Baseline production evidence was 285,583 unpacked bytes, 72,775 options bytes, 48.3 ms DOMContentLoaded, 60 ms first contentful paint, and a passing mock smoke E2E.
- The approved runtime package set is React 19.2.8, React DOM 19.2.8, Radix Themes 3.3.0, Radix UI 1.6.7, and Radix Icons 1.3.2.
- The approved test strategy uses Node unit tests for the draft and Chrome adapters, Playwright for the packaged extension, and axe plus Chrome accessibility-tree snapshots for automated accessibility evidence.
- The approved budgets are 950,000 options bytes, 1,175,000 unpacked extension bytes, and 500 ms each for DOMContentLoaded and first contentful paint in the local packaged-page regression.
- Importing Radix `tokens.css` and `components.css` instead of the aggregate `styles.css` excludes unused layout utilities and reduced the options artifact by about 179 KB.
- Production dependency audit reports zero known vulnerabilities; four high-severity findings remain in the pre-existing Extension.js development toolchain and are unchanged from `main`.
- The migration retains the manifest path, settings schema, defaults, permissions, and translation-runtime behavior.

## Parity Matrix

| Surface | Preserved contract | Verification |
|---|---|---|
| Setup | Target language, YouTube mode, API key, base URL, model, permission state, save, and connection testing | Dedicated options E2E, mock smoke, and Chrome accessibility tree |
| Appearance | Presets, Custom state, independent selection values, light/dark previews, contrast, reset isolation, boundaries, and persistence | Existing appearance smoke plus dedicated responsive and accessibility E2E |
| Prompts | Draft preservation, live previews, token estimates, lint warnings, independent resets, validation, and persistence | Dedicated options E2E and unit-tested prompt model |
| Advanced | Debug preference, disabled-domain normalization, draft state, save, and reload | Dedicated options E2E and existing settings tests |
| Global state | Loading, dirty, validation, saving, testing, success, failure, retry, duplicate-action prevention, and stale permission suppression | Draft/API unit tests and dedicated lifecycle E2E |
| Platform | Same `options_page`, permissions, CSP posture, local-only resources, package references, and rollback-compatible storage | Manifest baseline, artifact verifier, network assertions, and mock smoke |

## Capability Priorities

- **Primary** — Load settings, edit required values, understand validation, save safely, and see whether changes are unsaved.
- **Supporting** — Inspect API permission state and run a connection test with clear progress, success, and recovery states.
- **Contextual** — Preview prompts, inspect prompt warnings, preview appearance, and see contrast feedback near the affected controls.
- **Advanced** — Customize detailed typography, layout, colors, panel behavior, prompts, debug information, and disabled domains.
- **Safety and status** — Keep permission denial, validation failure, connection failure, low contrast, loading, saving, and unsaved-change status visible and actionable.

## Guiding Principles

- Preserve the current information architecture and setting semantics during the framework migration.
- Keep `src/shared/settings.js` and `src/shared/appearance.js` as the sources of truth instead of duplicating domain rules in React components.
- Use Radix components where they improve semantics, keyboard behavior, focus management, or design consistency.
- Keep native form semantics where Radix has no equivalent or where the browser control is clearer, especially color inputs and the form submit boundary.
- Use labels for meaning and treat icons as supporting cues rather than unlabeled controls.
- Keep all fonts, styles, icons, and scripts bundled with the extension.
- Derive dirty state from the saved baseline and current normalized draft instead of coordinating CSS classes manually.
- Preserve user drafts across tab changes, async permission checks, and connection tests.
- Do not release a mixed or partial migration as the production options page.

## Target Architecture

### Application Shell

- `src/options/index.html` becomes a minimal mount document while remaining the manifest entry path.
- A React entry module mounts one options application and owns its lifecycle.
- Radix Themes provides the top-level theme, component styling, density, radius, and light/dark integration.
- Radix Colors feeds semantic application tokens such as accent, surface, text, warning, success, and danger.
- Radix Icons replaces hand-authored decorative and action SVGs, with accessible names supplied by adjacent text or control labels.

### Interaction Components

- Radix Tabs owns section selection, ARIA relationships, focus movement, and keyboard navigation.
- Radix Themes form components and suitable Primitives own buttons, text fields, text areas, selects, radio groups, checkboxes, collapsible groups, status callouts, and tooltips where a tooltip has necessary supplemental meaning.
- Native `form`, `label`, validation attributes, color inputs, and browser permission gestures remain intact where they are the stronger semantic boundary.
- Portaled components are used only after their focus, layering, zoom, and extension-page behavior are verified in the packaged artifact.

### State and Domain Boundaries

- One normalized draft represents the complete settings form.
- One saved baseline determines dirty state without mutating persisted settings during preview.
- Separate UI state represents loading, validation, saving, permission checks, connection testing, banners, and active preview theme.
- Shared settings and appearance modules continue to normalize, validate, migrate, and persist values.
- Chrome permission and runtime-message calls stay in narrow adapters that can be tested without coupling them to visual components.
- React effects remain idempotent so development Strict Mode or reinjection cannot duplicate storage reads, permission prompts, or API tests.

### Styling Boundary

- Radix Themes and Colors own general typography, spacing, surfaces, control states, focus rings, and status colors.
- A small options-specific stylesheet owns only application layout, sticky save behavior, preview rendering, responsive constraints, and components not represented by Radix.
- User-configurable translation colors remain data rendered inside previews and are not replaced with Radix palette values.
- Theme behavior continues to follow the browser color scheme unless a future product decision explicitly adds an options-page theme preference.

### Verification Boundary

- Pure draft normalization, dirty-state comparison, status transitions, and appearance derivation remain unit-testable without a browser.
- Component behavior is verified through focused React tests if the Phase 1 test-tool decision approves them.
- Packaged extension behavior, Chrome APIs, permissions, persistence, keyboard flow, and computed styles remain covered by Playwright and manual QA.

## Roadmap

### Phase 1: Establish the Migration Contract

- [x] A production-build proof confirms that React and the selected Radix packages bundle under the current Extension.js and Manifest V3 configuration without remote code, new permissions, or artifact-verification failures.
- [x] A signed-off parity matrix maps every current field, default, setting key, preview, reset boundary, status, E2E selector, and manual QA expectation to the migrated UI.
- [x] Baseline evidence records options asset size, initial render behavior, supported viewport states, light/dark appearance, keyboard behavior, and known accessibility gaps.
- [x] Dependency, test-tool, browser-support, and performance-budget decisions are explicit before the production UI is replaced.

**Outcome:** The migration has a measurable compatibility contract and a proven technical path, which prevents framework adoption from silently redefining the product.

### Phase 2: Create the React and Radix Foundation

- [x] A non-production migration build renders the complete options shell with Radix Themes, semantic Radix Colors, Radix Icons, and keyboard-correct Radix Tabs.
- [x] Reusable page, section, field, action, status, and progressive-disclosure patterns cover all current options-page presentation needs without hiding primary actions or safety status.
- [x] The normalized draft, saved baseline, dirty-state derivation, and async operation model preserve edits across tab switches and expose deterministic loading, saving, testing, success, warning, and failure states.
- [x] Light mode, dark mode, visible focus, reduced motion, long labels, text scaling, and narrow-width behavior are viable before feature sections migrate.

**Outcome:** A stable design and state foundation exists before complex settings workflows are moved.

### Phase 3: Reach Core Settings and Permission Parity

- [x] The Setup and Advanced sections load and preserve target language, YouTube display mode, API credentials, base URL, model, selection-panel position, debug preference, and disabled domains without changing the storage schema.
- [x] Save validation, unsaved state, API-origin permission status, permission requests, and connection testing preserve the current user-gesture boundary and provide actionable recovery for denied, invalid, failed, and partial outcomes.
- [x] Radio groups, checkboxes, selects, credentials, and status regions have complete labels, descriptions, keyboard behavior, disabled states, and announcement behavior.
- [x] Save and connection-test operations cannot double-submit, lose a valid draft, or expose API credentials in logs, error boundaries, or test artifacts.

**Outcome:** The primary settings workflow is behaviorally equivalent and safer to operate with keyboard and assistive technology.

### Phase 4: Reach Prompt Workflow Parity

- [x] System and user prompt templates retain immediate previews, token estimates, lint warnings, required placeholders, and independent reset behavior.
- [x] Prompt edits remain unsaved until the user saves the complete form, and moving between tabs cannot reset draft content or previews.
- [x] Long prompts, validation failures, default restoration, and connection testing remain readable and operable at supported widths and text scaling.
- [x] Prompt previews and errors never include API credentials or unrelated persisted settings.

**Outcome:** Advanced prompt editing is migrated without weakening validation, draft safety, or scanability.

### Phase 5: Reach Appearance Workflow Parity

- [x] Calm Reading, Minimal, High Contrast, and Custom states produce the same normalized appearance values as the current UI.
- [x] Inline reading and selection-panel controls preserve independent typography, spacing, surface, opacity, radius, animation, position, and light/dark color values.
- [x] Live previews, language labels, preview-theme switching, WCAG contrast feedback, host-page contrast uncertainty, and reduced-motion behavior match the shared appearance rules.
- [x] Reset Appearance changes only the appearance draft, clearly remains unsaved until Save Settings, and cannot alter API, prompt, language, YouTube, debug, position, or disabled-domain values.
- [x] Saving and reloading every appearance boundary value preserves the normalized result and does not apply changes proactively to translations already rendered on web pages.

**Outcome:** The highest-complexity options workflow reaches full behavioral and visual parity on the React and Radix foundation.

### Phase 6: Harden Accessibility, Responsiveness, and Performance

- [x] Keyboard and focus review covers tab navigation, representative native and Radix form controls, progressive disclosure, reset, save, connection testing, and recovery without focus loss or keyboard traps.
- [x] Automated accessibility checks have no unresolved serious or critical findings, and Chrome accessibility-tree checks confirm labels, descriptions, grouping, selected state, live status, and error association for critical workflows.
- [x] Visual review passes in light and dark modes at 320 px, 390 px, the current 720 px content width, desktop width, 200% zoom, reduced motion, and relevant forced-color behavior without horizontal overflow or obscured actions.
- [x] The measured production bundle and initial options render meet the Phase 1 budget, with tree-shaken JavaScript and unused Radix layout-utility CSS excluded.
- [x] The packaged extension produces no duplicate storage, permission, or runtime-message effects in development or production.

**Outcome:** The migrated interface is demonstrably accessible, responsive, efficient, and stable rather than merely visually converted.

### Phase 7: Cut Over and Retire the Legacy UI

- [x] The React and Radix application becomes the sole production options UI while `manifest.json` retains the existing options-page contract and permissions.
- [x] Legacy imperative DOM controllers, obsolete markup, unused CSS tokens, dead selectors, and hand-authored replacement icons are removed without deleting shared domain behavior.
- [x] Existing options E2E is updated toward role- and label-based selectors while retaining stable identifiers only where external compatibility or precise value assertions require them.
- [x] `docs/TESTING.md`, `docs/E2E.md`, and configuration documentation describe the migrated controls, keyboard behavior, validation, permissions, previews, and recovery states.
- [x] `just check`, production artifact verification, dedicated options E2E, two mock smoke E2E runs with independent temporary profiles, and screenshot review pass with recorded evidence.
- [x] A rollback path is documented and remains storage-compatible because the migration introduces no settings-schema or permission change.

**Outcome:** The Radix interface ships as the only implementation, the legacy maintenance burden is removed, and rollback remains safe.

## Completion Evidence

- `just check` passes with 219 unit tests, module syntax checks, production build, and artifact verification.
- Dedicated packaged options E2E passes with all four tabs scanned by axe, Chrome accessibility-tree assertions, keyboard tab/radio/disclosure behavior, validation association, draft persistence, async edits, duplicate-action prevention, connection failure/retry, responsive checks, forced colors, reduced motion, and local-only resources.
- Final measured options-page timing is 19.3 ms DOMContentLoaded and 108 ms first contentful paint against the 500 ms budgets.
- Final artifact size is 1,115,880 unpacked bytes against 1,175,000 bytes, with the options artifact below its 950,000-byte budget.
- Mock production-artifact E2E passes twice with independent temporary profiles.
- Light desktop and dark 390 px screenshots were inspected and committed under `docs/images/`.
- Production dependency audit reports zero known vulnerabilities.
- The global `biome` binary reports only that its 2.5.2 schema expectation differs from the repository-pinned 2.4.9 schema; the required pinned `npx --no-install biome ci` check passes.
- Physical screen-reader speech output was unavailable in this environment, so reproducible axe and Chrome accessibility-tree evidence is paired with the retained manual screen-reader checklist.

## Rollback / Recovery

- Revert the migration commits and rebuild to restore the vanilla options implementation.
- Stored settings remain readable after rollback because the migration changes no storage key, schema, normalization, default, permission, or manifest options path.
- No runtime feature flag or data migration needs cleanup.

## Success Metrics

| Area | Completion evidence |
|---|---|
| Functional parity | All existing settings survive load, edit, save, reload, reset, preview, and migration checks with unchanged normalized values. |
| Existing regression coverage | Updated options smoke E2E and all 23 options-page checks in `docs/TESTING.md` pass. |
| Accessibility | Complete keyboard flow passes, critical status is announced, and no serious or critical automated finding remains unresolved. |
| Responsive behavior | Light/dark and required viewport, zoom, focus, long-content, and reduced-motion states pass without hidden actions or horizontal overflow. |
| Extension safety | No new permission, remote asset, runtime CDN, unsafe evaluation, secret-bearing log, or artifact verification failure is introduced. |
| Reliability | Saving, permission requests, connection tests, resets, and storage loading do not duplicate, race, or discard a valid draft. |
| Maintainability | No options source file exceeds 1,000 lines, domain rules remain shared, and the legacy DOM synchronization layer is removed. |
| Performance | Production asset and startup measurements satisfy the baseline-derived budget approved before cutover. |

## Risks and Dependencies

| Risk or dependency | Consequence | Mitigation or decision signal |
|---|---|---|
| React and Radix increase options bundle size. | Options may open more slowly for a mostly static form. | Measure the current artifact first, import only used packages and CSS, and block cutover until an explicit budget is met. |
| Radix package APIs and styling may not align across selected versions. | Themes, Primitives, Colors, or Icons may duplicate dependencies or produce inconsistent tokens. | Lock one compatible package set in Phase 1 and verify the actual dependency graph before section migration. |
| Portals and focus management behave differently inside an extension page. | Selects, dialogs, or tooltips may clip, mis-layer, or move focus unexpectedly. | Prefer non-portaled or native controls until packaged Chrome tests prove each portaled pattern. |
| Chrome permission requests depend on a user gesture. | Refactoring submit and test flows could cause permission prompts to fail silently. | Keep permission requests in the direct action chain and exercise grant and denial in the production artifact. |
| React development behavior can repeat effects. | Storage reads, messages, tests, or prompts could run twice. | Make effects idempotent and assert operation counts in tests before enabling development Strict Mode behavior. |
| Controlled form conversion can erase drafts during async updates. | Users may lose API credentials, prompts, or detailed appearance edits. | Separate the saved baseline from the draft and merge external results only through explicit state transitions. |
| Appearance controls encode the densest behavior. | A visual rewrite could alter normalized settings or reset unrelated values. | Migrate Appearance after the shared state model is proven and compare normalized payloads against current fixtures. |
| Radix theme tokens can conflict with user-selected preview colors. | Preview output may no longer represent saved translation appearance. | Keep application chrome tokens and translation appearance data in separate namespaces. |
| E2E currently relies on IDs and current DOM shape. | A framework rewrite could create false regression failures or lose useful coverage. | Preserve stable field IDs during parity work, then move interaction assertions to roles and labels intentionally. |
| Automated accessibility tooling is not yet selected. | Accessibility success cannot be reproduced consistently. | Choose and approve a packaged-page-compatible tool in Phase 1, with manual keyboard and assistive-technology checks retained. |
| Browser support beyond current Chrome production is not defined. | Cross-browser Radix behavior may expand scope unpredictably. | Treat current Chrome MV3 as required and record any Firefox requirement before dependency approval. |

## Non-Goals

- No change to setting names, defaults, normalization, migration, or storage format.
- No redesign of translation behavior, content-script UI, YouTube controls, or selection panels rendered on web pages.
- No new account, cloud sync, telemetry, analytics, or remote design asset.
- No new manifest permission, host permission, CSP relaxation, or remote executable code.
- No localization project or rewrite of the current English information architecture.
- No automatic application of saved appearance changes to translations that are already rendered.
- No replacement of a clear native control solely to claim complete Radix usage.
- No unrelated restructuring of background, content, or translation modules.

## Assumptions and Unknowns

- The intended migration target is only the extension options page.
- Chrome MV3 remains the required production platform unless browser scope is expanded explicitly.
- Full migration means React owns the complete options UI and Radix supplies its design system and appropriate interaction primitives, not that every HTML element must be a Radix component.
- The approved Radix and React package versions are recorded in the Execution Record and locked in `package-lock.json`.
- The baseline-derived package and startup budgets are recorded in the Execution Record and enforced by artifact verification plus options E2E.
- Component-level React test dependencies were rejected as unnecessary because pure state and Chrome adapters are covered by Node tests while packaged component behavior is covered by Playwright and axe.
- No delivery dates or staffing assumptions are implied by phase order.

## Decisions

- Use React only for the options surface and keep shared domain modules framework-independent.
- Preserve the existing Setup, Appearance, Prompts, and Advanced organization during migration.
- Use Radix Themes and Colors for application chrome, while preserving user-configured colors as settings data.
- Use Radix Icons only with visible labels or accessible names.
- Use Radix Primitives selectively according to semantic and accessibility value, with native form controls retained where stronger.
- Perform one production cutover only after all sections meet parity and hardening gates.
- Keep storage compatibility as the rollback mechanism instead of adding a permanent runtime feature flag.

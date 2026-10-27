# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (HTTPS via mkcert)
npm run build        # Production build (Vercel adapter)
npm run preview      # Preview production build
npm run check        # Type-check with svelte-check
npm run lint         # Prettier + ESLint check
npm run format       # Auto-format with Prettier
```

No test suite is configured.

## Stack

- **SvelteKit** with Svelte 5 runes (`$state`, `$derived`) — no traditional writable stores
- **Vercel adapter** with a hardcoded prerender list in `svelte.config.js`
- **Threlte** (`@threlte/core`, `@threlte/extras`) — Svelte bindings for Three.js
- **GSAP** — animation timelines and scroll-triggered transitions
- **Rive** (`@rive-app/canvas-advanced`) — vector animation state machines for category/intro transitions
- **Sanity CMS** — all project content, gallery, awards, and thumbnails
- **OpenAI Responses API** — streaming chat with tool-use (gpt-5-nano), exposed at `/api/chat`
- **Tailwind CSS** — selector-based dark mode (`[data-theme="dark"]`), custom palette (gold/silver/bronze/crystal/blue)

## Architecture

### Routing (`src/routes/`)

- **`+layout.server.ts`** — Fetches all Sanity data once at the root; passes projects, categories, and gallery to child routes via `data`
- **`+layout.svelte`** — Owns scroll mode switching (virtual on home, native on work routes), keyboard nav, video/thumbnail loading, GPT modal, and theme
- **`+page.svelte`** (home) — Intro scramble sequence, project carousel, GSAP timeline orchestration
- **`work/[slug]/+page.svelte`** — Work detail with next-project preview, scroll-driven animations, touch/pointer interactions
- **`api/chat/+server.ts`** — Streaming OpenAI endpoint with tools: `download_resume`, `go_to_about`, `random_project`, `to_project`, `send_a_message`

### State (`src/lib/stores/index.svelte.ts`)

All stores use Svelte 5 runes. Key stores:

| Store | Purpose |
|-------|---------|
| `countStore` | Virtual scroll index (`activeIndex` / `inertiaIndex`) with debounced snap and category tracking |
| `scrollStore` | Scroll position, velocity, and inertia decay |
| `animationStore` | Global `isAnimating` / `isTransitioning` flags; gates all scroll/nav interactions |
| `loadStore` | Page load progress, card loading, gallery transition state |
| `sharedCardTransitionStore` | Geometry snapshots for shared element transitions between home carousel and work detail |
| `workRouteReadyStore` | Async asset readiness gated by slug + key |
| `cursorStore` / `cursorSnapStore` | Custom cursor and magnetic snap state |
| `gptStore` | GPT modal visibility (Cmd+K / Ctrl+K) |
| `homeTransitionStore` | Preserves card index when navigating back to home |

Additional stores live in `src/lib/stores/`: `cardDimensions.svelte.ts`, `options.svelte.ts`, `threlteSize.ts`, `threlteCamera.ts`, `galleryScroll.ts`, `projectSection.ts`, `introSection.ts`, `projectListHost.ts`.

### 3D / WebGL

- **`Three.svelte`** — Canvas wrapper; delegates to scene managers
- **`ThreeScene.svelte`** — Main orchestrator: materials, geometries, camera, post-FX
- **`PostFXManager.svelte`** — Custom render pipeline with a ping-pong frame buffer ghosting effect. Each frame: renders the previous buffer's decayed texture onto `renderBufferA` via an orthographic fullscreen quad (creating persistence/ghosting), composites all registered 3D scenes on top, blits to screen, then swaps `renderBufferA` ↔ `renderBufferB`. Child scenes register themselves via Svelte context (`postfx`) rather than being hardcoded. Uniforms `rgbPersistFactor` and `alphaPersistFactor` (from `optionsStore`) control ghosting intensity in the GLSL fragment shader.
- **`PostFXScene.svelte`** — Registers with `PostFXManager` via context; handles scene-specific render callbacks
- **`RiveScene.svelte`** — Rive state machine for category transitions
- GLSL shaders are `.glsl` files with types declared in `src/glsl.d.ts`
- Three.js and `troika-three-text` are excluded from SSR in `svelte.config.js`
- **Custom `ShaderMaterial` color-space**: Three.js only applies output color-space conversion automatically for built-in materials. Any custom `ShaderMaterial` must handle this manually. In `glitchFragment.glsl` (and any new custom fragment shader), include Three's chunk and apply the conversion before final output:
  ```glsl
  #include <colorspace_pars_fragment>
  // ... at end of main():
  gl_FragColor = linearToOutputTexel(gl_FragColor);
  ```
  Do **not** add this to non-custom materials (e.g. `MeshStandardMaterial`, `MeshBasicMaterial`) — Three handles those internally and double-converting will break colors.

### Key Patterns

- **Virtual scroll on home**: `countStore.inertiaIndex` drives GSAP easing — no native scrollbar
- **Shared element transitions**: `sharedCardTransitionStore` snapshots card geometry before route change; work page reads the snapshot to animate from the card's last position
- **Dynamic ProjectList relocation**: `projectListHost.ts` holds a DOM node reference; `ProjectList.svelte` mounts itself into whichever host is active (home vs work route)
- **Safari video fallback**: Static thumbnails replace `<video>` autoplay on Safari
- **Rate limiting**: In-memory `rate-limiter-flexible` on the chat endpoint (30 req / 60s)

## Environment Variables

```
OPENAI_API_KEY
PROMPT_ID
SANITY_PROJECT_ID
SANITY_DATASET
GMAIL_SEND
GMAIL_PASSWORD
```

## Content

All project/gallery data comes from Sanity. Types are in `src/lib/types/index.ts`; the fetch query is in `src/lib/utils/sanityClient.ts`. Adding a new project requires a Sanity entry **and** adding the slug to the `prerender` list in `svelte.config.js`.

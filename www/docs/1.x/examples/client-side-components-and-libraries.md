---
description: |
  Client side components and libraries
---

Some components depend on client environments, browser-specific features, or
dynamic user interactions, making them incompatible or non-functional during
server-side rendering.

By employing conditional rendering and state management techniques, we can
ensure graceful handling of library or data loading, improving workflow and
usability of such components.

Let's explore an example utilizing this solution with Leaflet, a popular mapping
library, in a Fresh application. The objective is to ensure the proper rendering
of Leaflet components on the client side while gracefully handling them on the
server side.

The full code is available at the end of the page

## Explanation

The first step is creating the context variable to enhance usability across
various components within a Fresh application. By initializing these variables
with a null value and integrating type references, developers can streamline the
use of client side features while adapting to scenarios where server side
rendering might not be feasible.

> [warn]: Proper typing might not be easily available, so we might need to
> define our own types or not use types at all.

```ts context.ts
export const leafletContext = createContext<typeof Leaflet | null>(null);
```

Then, we should implement a Provider Component, this will handle loading and
passing down values to be used in other components, other than that, we also
need to handle the server side case as well.

In this example, for the server side we are simply rendering a placeholder in
place of our component tree. As for the context value, we are using html tags to
inject the library on the window and a onLoad callback to set the value of our
state, and this value will be handled/shared with our other components.

> [warn]: Be careful with providers, the manner in which they load/inject both
> script and css may cause issues. Leaflet, for instance, will throw errors if
> we try to load it again.

```tsx context.ts
function LeafletProvider(props: { children: ComponentChildren }) {
  if (!IS_BROWSER) {
    return (
      <p>Leaflet must be loaded on the client. No children will render</p>
    );
  }
  const value = useSignal<typeof Leaflet | null>(null)
  return (
    <>
      {/* Load Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossorigin=""
      />
      {/* Load Leaflet JS */}
      <script
        onLoad={() => value.value = window.L}
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossorigin=""
      />
      {/* Provide Leaflet context to children */}
      <leafletContext.Provider value={value}>
        {props.children}
      </LeafletContext.Provider>
    </>
  );
}
```

In order to utilize the context, call the useContext hook with the context
variable this will give us access to the value set in the Provider. Handling
cases where the context has not loaded values yet is a good practice as well, in
this way we can have a smooth integration and manipulation of client-side data
and logic on our server-side code.

```tsx component/Map.tsx
function MapComponent() {
  const leaf = useContext(leafletContext);
  if (!leaf) return <p>Context not ready. Component placeholder</p>;
  useEffect(() => {
    const map = leaf.map("map").setView(leaf.latLng(0, 0), 2);
    leaf
      .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      })
      .addTo(map);
  });
  return <div id="map" class="relative w-[80vw] h-[50vh]" />;
}
```

Here is an example island encapsulating both the provider and component in order
to demonstrate a simple usage. In real cases, it's usually better to add the
Provider directly to our Page and then use Components that depend on that
provider inside it.

```tsx islands/MapIsland.tsx
export default function MapIsland() {
  return (
    <LeafletProvider>
      <MapComponent />
    </LeafletProvider>
  );
}
```

## Full code:

```tsx islands/MapIsland.tsx
import * as Leaflet from "https://esm.sh/v135/@types/leaflet@1.9.4/index.d.ts";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { useContext, useEffect } from "preact/hooks";
import { ComponentChildren, createContext } from "preact";
import { useSignal } from "@preact/signals";

// Create a context to hold Leaflet data/functions
const LeafletContext = createContext<typeof Leaflet | null>(null);

// LeafletProvider component manages Leaflet loading and context
function LeafletProvider(props: { children: ComponentChildren }) {
  if (!IS_BROWSER) {
    return <p>Leaflet must be loaded on the client. No children will render</p>;
  }
  const value = useSignal<typeof Leaflet | null>(null);
  return (
    <>
      {/* Load Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossorigin=""
      />
      {/* Load Leaflet JS */}
      <script
        onLoad={() => (value.value = window.L)}
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossorigin=""
      />
      {/* Provide Leaflet context to children */}
      <LeafletContext.Provider value={value}>
        {props.children}
      </LeafletContext.Provider>
    </>
  );
}

// MapComponent utilizes Leaflet context for rendering the map
function MapComponent() {
  const leaf = useContext(LeafletContext);
  if (!leaf) return <div>Component placeholder</div>;
  useEffect(() => {
    const map = leaf.map("map").setView(leaf.latLng(0, 0), 2);
    leaf
      .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      })
      .addTo(map);
  });
  return <div id="map" class="relative w-[80vw] h-[50vh]" />;
}

// MapIsland is the parent component integrating LeafletProvider and MapComponent
export default function MapIsland() {
  return (
    <LeafletProvider>
      <MapComponent />
    </LeafletProvider>
  );
}
```

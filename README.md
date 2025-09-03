# VikCraft3DAnnotator

[VikCraft3A]: https://vikcraftpro.nitishsrivastava.com/datatable/index.html
For a demonstration, visit the [VikCraft Interactive 3D Model Annotator demo][VikCraft3A].
You can also find the full documentation on their [website][VikCraft3A].

---

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-3.8.0-blue.svg)](https://github.com/your-username/vikcraft-3d-annotator)
---
**VikCraft3DAnnotator** is a powerful, dependency-injected JavaScript library for viewing, annotating, and measuring 3D models directly in the browser. Built on top of the robust **Three.js** ecosystem, it provides a comprehensive toolkit for interactive 3D model inspection.

![VikCraft3DAnnotator Screenshot](https://i.imgur.com/gK5y4Pq.png)
*(This is a sample image. You can replace it with a screenshot or GIF of your application.)*
---
## ✨ Features

* **Interactive 3D Viewer:** Smooth pan, zoom, and rotate controls powered by `OrbitControls`.
* **Annotation Mode:** Click anywhere on the model to add text-based annotations.
* **Measurement Mode:** Easily measure the distance between any two points on the model or the grid.
* **Transform Mode:** Move, rotate, and scale your model with intuitive transform gizmos.
* **Multiple View Modes:** Switch between `Default`, `Wireframe`, and `X-Ray` views to inspect your model's topology and internal structure.
* **Model Explorer:** A hierarchical tree view of your model's scene graph, allowing you to select and highlight individual components.
* **Persistent Annotations:** Includes built-in API hooks (`onAnnotationAdded`, `onAnnotationUpdated`, `onAnnotationDeleted`) to easily connect to your backend for saving and loading annotation data.
* **Customizable UI:** A clean, modern UI that can be easily themed using CSS variables.
* **Dependency Injection:** No bundled dependencies. You provide the required Three.js modules, giving you full control over versions and optimizations.
---
## 🚀 Quick Start

### 1. File Structure

Organize your project files as follows:

```
/your-project
|-- /assets
|   |-- your-model.glb
|-- index.html
|-- vikcraft-3d-annotator.js
|-- vikcraft-3d-annotator.css
```

### 2. HTML Setup

Set up your `index.html` file. This example uses an `importmap` for easy, no-build-step integration with Three.js modules from a CDN.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VikCraft3DAnnotator</title>
    <style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
        #viewer-app { width: 100vw; height: 100vh; }
    </style>
    <link rel="stylesheet" href="vikcraft-3d-annotator.css">
</head>
<body>
    <div id="viewer-app"></div>

    <script type="importmap">
    {
        "imports": {
            "three": "[https://unpkg.com/three@0.160.0/build/three.module.js](https://unpkg.com/three@0.160.0/build/three.module.js)",
            "three/addons/": "[https://unpkg.com/three@0.160.0/examples/jsm/](https://unpkg.com/three@0.160.0/examples/jsm/)"
        }
    }
    </script>
    
    <script type="module" src="main.js"></script>
</body>
</html>
```

### 3. JavaScript Initialization

In your `main.js` file, import the necessary dependencies and initialize the annotator.

```javascript
// main.js

// Import all required dependencies from Three.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// Import the library
import { VikCraft3DAnnotator } from './vikcraft-3d-annotator.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Set up Loaders ---
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('[https://www.gstatic.com/draco/v1/decoders/](https://www.gstatic.com/draco/v1/decoders/)');
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    
    // --- 2. Initialize the Library ---
    const viewer = new VikCraft3DAnnotator('viewer-app', {
        // Provide all dependencies
        THREE,
        OrbitControls,
        gltfLoader,
        EffectComposer,
        RenderPass,
        OutlinePass,
        OutputPass,
        TransformControls,
        
        // --- Provide your model URL ---
        modelUrl: './assets/your-model.glb',
        
        // --- Optional: API Hooks for saving data ---
        onAnnotationAdded: (annotation) => {
            console.log('Annotation Added:', annotation);
            // Example: fetch('/api/annotations', { method: 'POST', body: JSON.stringify(annotation) });
        },
        onAnnotationUpdated: (annotation) => {
            console.log('Annotation Updated:', annotation);
            // Example: fetch(`/api/annotations/${annotation.id}`, { method: 'PUT', body: JSON.stringify(annotation) });
        },
        onAnnotationDeleted: (id) => {
            console.log('Annotation Deleted:', id);
            // Example: fetch(`/api/annotations/${id}`, { method: 'DELETE' });
        }
    });
});
```
---
## ⚙️ Configuration & API

### Constructor

`new VikCraft3DAnnotator(containerId, options)`

* `containerId` (String, required): The ID of the HTML element where the viewer will be rendered.
* `options` (Object, required): A configuration object.

### Options

| Option              | Type      | Required | Default         | Description                                                                                             |
| ------------------- | --------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `THREE`             | `Object`  | **Yes** | -               | The entire `three` module.                                                                              |
| `OrbitControls`     | `Class`   | **Yes** | -               | The `OrbitControls` class.                                                                              |
| `gltfLoader`        | `Object`  | **Yes** | -               | An instantiated `GLTFLoader`. Recommended to configure with `DRACOLoader`.                              |
| `EffectComposer`    | `Class`   | **Yes** | -               | The `EffectComposer` class for post-processing.                                                         |
| `RenderPass`        | `Class`   | **Yes** | -               | The `RenderPass` class.                                                                                 |
| `OutlinePass`       | `Class`   | **Yes** | -               | The `OutlinePass` class for highlighting objects.                                                       |
| `OutputPass`        | `Class`   | **Yes** | -               | The `OutputPass` class.                                                                                 |
| `TransformControls` | `Class`   | **Yes** | -               | The `TransformControls` class for model manipulation.                                                   |
| `modelUrl`          | `String`  | **Yes** | -               | The path to your 3D model file (`.glb`, `.gltf`).                                                       |
| `sceneUnitScale`    | `Number`  | No       | `1`             | A multiplier for measurements. If your scene units are in cm, set to `0.01` to display meters.          |
| `displayUnits`      | `String`  | No       | `'metric'`      | The display unit for measurements. Can be `'metric'` (meters) or `'imperial'` (feet & inches).            |
| `showGrid`          | `Boolean` | No       | `true`          | Whether the grid helper should be visible on initialization.                                            |

### API Hooks

The library provides callback functions to hook into user actions, allowing you to save, update, and delete annotation data with your own backend API.

* `onModelLoaded: () => {}`
    * Fired once the 3D model has been successfully loaded. This is the ideal place to call `viewer.loadAnnotations()` with data fetched from your server.
* `onAnnotationAdded: (annotation) => {}`
    * Fired when a user creates a new annotation.
    * Receives an `annotation` object: `{ id: String, position: {x, y, z}, text: String }`.
* `onAnnotationUpdated: (annotation) => {}`
    * Fired when a user edits an annotation's text.
    * Receives an `annotation` object: `{ id: String, text: String }`.
* `onAnnotationDeleted: (id) => {}`
    * Fired when a user deletes an annotation.
    * Receives the `id` (String) of the deleted annotation.

### Public Methods

* `loadAnnotations(annotationsData)`: Loads an array of annotation objects and displays them in the scene.
* `toggleGridVisibility()`: Toggles the visibility of the 3D grid.
* `clearAllMeasurements()`: Removes all measurement lines and markers from the scene.
* `setViewMode(mode)`: Programmatically sets the view mode. `mode` can be `'default'`, `'wireframe'`, or `'xray'`.
---
## 🎨 Customization

You can easily customize the look and feel of the UI by overriding the CSS variables defined at the top of `vikcraft-3d-annotator.css`.

```css
/* vikcraft-3d-annotator.css */
:root {
    --vikcraft-primary-color: #0099ff;
    --vikcraft-text-color: #e5e7eb;
    --vikcraft-background-color: rgba(31, 41, 55, 0.85);
    --vikcraft-sidebar-bg: #1f2937;
    --vikcraft-card-bg: #374151;
    --vikcraft-card-hover-bg: #4b5563;
    --vikcraft-border-color: #4b5563;
}
```
---
## 📜 License

TThis project is developed by **Nitish Srivastava** and open-source.
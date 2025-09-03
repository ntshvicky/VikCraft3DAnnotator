/**
 * VikCraft3DAnnotator
 * A comprehensive library to view, annotate, and measure 3D models with transform controls,
 * view modes, a model explorer, and improved camera controls.
 *
 * @version 3.8.0
 * @licence MIT
 */
export class VikCraft3DAnnotator {
    /**
     * Initializes the entire 3D viewer application inside a given container.
     * @param {string} containerId The ID of the HTML element to host the application.
     * @param {object} options Configuration options, including all THREE.js dependencies.
     */
    constructor(containerId, options = {}) {
        this.rootContainer = document.getElementById(containerId);
        if (!this.rootContainer) throw new Error(`Container with ID "${containerId}" not found.`);
        
        this._unpackDependencies(options);
        this.modelUrl = options.modelUrl;
        this.sceneUnitScale = options.sceneUnitScale || 1;
        this.displayUnits = options.displayUnits || 'metric';
        this.showGrid = options.showGrid !== false;
        
        this.onModelLoaded = options.onModelLoaded || null;
        this.onAnnotationAdded = options.onAnnotationAdded || null;
        this.onAnnotationUpdated = options.onAnnotationUpdated || null;
        this.onAnnotationDeleted = options.onAnnotationDeleted || null;
        
        // --- State ---
        this.currentMode = 'navigate'; this.viewMode = 'default';
        this.annotations = []; this.measurements = []; this.measureStartPoint = null;
        this.gridHelper = null; this.transformControls = null;
        this.liveMeasureVisuals = { line: null, label: null };
        this.mouse = new this.THREE.Vector2();
        this.dblClickTimeout = null;
        
        // --- Materials & Highlighting ---
        this.originalMaterials = new Map();
        this.wireframeMaterial = new this.THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
        this.xrayMaterial = new this.THREE.MeshStandardMaterial({ color: 0x00aaff, transparent: true, opacity: 0.3, depthWrite: false });

        this.scene = new this.THREE.Scene();
        this.camera = new this.THREE.PerspectiveCamera(75, 1, 0.1, 2000);
        this.renderer = new this.THREE.WebGLRenderer({ antialias: true, alpha: true });
        
        this._init();
    }

    _unpackDependencies(options) {
        const required = ['THREE', 'OrbitControls', 'gltfLoader', 'EffectComposer', 'RenderPass', 'OutlinePass', 'OutputPass', 'TransformControls'];
        required.forEach(dep => {
            if (!options[dep]) throw new Error(`Required dependency "${dep}" is missing from options.`);
            this[dep] = options[dep];
        });
    }

    _init() {
        this._createLayout();
        
        this.camera.aspect = this.viewerContainer.clientWidth / this.viewerContainer.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.viewerContainer.clientWidth, this.viewerContainer.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.viewerContainer.appendChild(this.renderer.domElement);
        this.scene.background = new this.THREE.Color(0x111827);

        this.controls = new this.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        
        this.scene.add(new this.THREE.AmbientLight(0xffffff, 0.7));
        const dirLight = new this.THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(10, 20, 5);
        this.scene.add(dirLight);
        
        this.gridHelper = new this.THREE.GridHelper(50, 50, 0x888888, 0x444444);
        this.gridHelper.visible = this.showGrid;
        this.scene.add(this.gridHelper);

        this._setupPostProcessing();
        this._setupTransformControls();
        this._createToolbar();
        
        if (this.modelUrl) this._loadModel(this.modelUrl);
        
        this._setupEventListeners();
        this._animate();
    }
    
    _setupTransformControls() {
        this.transformControls = new this.TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        this.transformControls.addEventListener('mouseUp', () => {
            this._updateCameraTarget();
        });
        this.transformControls.addEventListener('mode-change', () => {
            this._updateTransformButtonStates();
        });
        this.transformControls.enabled = false;
        this.transformControls.visible = false;
        this.scene.add(this.transformControls);
    }
    
    _setupEventListeners() {
        this.renderer.domElement.addEventListener('click', (event) => this._onClick(event));
        this.renderer.domElement.addEventListener('mousemove', (event) => this._onMouseMove(event));
        this.renderer.domElement.addEventListener('dblclick', (event) => this._onDoubleClick(event));
        window.addEventListener('resize', () => this._onWindowResize());
    }
    
    _onClick(event) {
        if (this.dblClickTimeout) return;
        if (this.currentMode === 'navigate' || this.currentMode === 'transform' || (!this.model && !this.gridHelper)) return;
        const mouse = new this.THREE.Vector2();
        const rect = this.renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new this.THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        const targets = [this.model, this.gridHelper].filter(Boolean);
        const intersects = raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            if (this.currentMode === 'annotate' && intersects[0].object !== this.gridHelper) {
                const text = prompt("Enter annotation text:");
                if (text) {
                    const id = `anno-${Date.now()}`;
                    this._createAnnotationFromData({ id, position: point, text }, true);
                    this._renderSidebar();
                    this._focusOnAnnotation(id);
                }
            } else if (this.currentMode === 'measure') {
                this._handleMeasureClick(point);
            }
        }
    }

    _onDoubleClick(event) {
        this.dblClickTimeout = setTimeout(() => { this.dblClickTimeout = null; }, 300);
        if (this.currentMode !== 'navigate' || !this.model) return;
        const mouse = new this.THREE.Vector2();
        const rect = this.renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new this.THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        const intersects = raycaster.intersectObject(this.model, true);
        if (intersects.length > 0) {
            this._refocusCamera(intersects[0].point);
        }
    }
    
    _refocusCamera(targetPoint) {
        this.controls.target.copy(targetPoint);
        this.controls.update();
    }
    
    _updateCameraTarget() {
        if (!this.model) return;
        const boundingBox = new this.THREE.Box3().setFromObject(this.model);
        const newCenter = new this.THREE.Vector3();
        boundingBox.getCenter(newCenter);
        this._refocusCamera(newCenter);
    }

    // --- All other private and public methods are included below without changes ---
    loadAnnotations(annotationsData) { if (!this.model) { console.error("Model not loaded yet. Use the onModelLoaded callback."); return; } annotationsData.forEach(data => this._createAnnotationFromData(data)); this._renderSidebar(); }
    toggleGridVisibility() { if (!this.gridHelper) return; this.gridHelper.visible = !this.gridHelper.visible; this.toolbar.querySelector('[data-control="grid"]')?.classList.toggle('active', this.gridHelper.visible); }
    clearAllMeasurements() { this.measurements.forEach(measure => { this.scene.remove(measure.line); this.scene.remove(measure.startMarker); this.scene.remove(measure.endMarker); measure.line.geometry.dispose(); measure.line.material.dispose(); measure.startMarker.geometry.dispose(); measure.startMarker.material.dispose(); measure.endMarker.geometry.dispose(); measure.endMarker.material.dispose(); this.viewerContainer.removeChild(measure.element); }); this.measurements = []; }
    setViewMode(mode) { this.viewMode = mode; this.model.traverse(child => { if (child.isMesh) { switch(mode) { case 'wireframe': child.material = this.wireframeMaterial; break; case 'xray': child.material = this.xrayMaterial; break; default: child.material = this.originalMaterials.get(child.uuid) || child.material; break; } } }); this.toolbar.querySelectorAll('[data-view-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.viewMode === mode)); }
    _setupPostProcessing() { this.composer = new this.EffectComposer(this.renderer); const renderPass = new this.RenderPass(this.scene, this.camera); this.composer.addPass(renderPass); this.outlinePass = new this.OutlinePass(new this.THREE.Vector2(this.viewerContainer.clientWidth, this.viewerContainer.clientHeight), this.scene, this.camera); this.outlinePass.edgeStrength = 5; this.outlinePass.edgeGlow = 0.5; this.outlinePass.edgeThickness = 1; this.outlinePass.visibleEdgeColor.set('#ffffff'); this.outlinePass.hiddenEdgeColor.set('#22aaff'); this.composer.addPass(this.outlinePass); const outputPass = new this.OutputPass(); this.composer.addPass(outputPass); }
    _createLayout() { this.rootContainer.innerHTML = ''; const wrapper = document.createElement('div'); wrapper.className = 'vikcraft-wrapper'; this.viewerContainer = document.createElement('div'); this.viewerContainer.className = 'vikcraft-viewer'; this.sidebarContainer = document.createElement('div'); this.sidebarContainer.className = 'vikcraft-sidebar'; this.sidebarContainer.innerHTML = `<div class="vikcraft-sidebar-tabs"><button class="vikcraft-tab-button active" data-tab="annotations">Annotations</button><button class="vikcraft-tab-button" data-tab="explorer">Explorer</button></div><div class="vikcraft-tab-content active" id="annotations-content"><div class="vikcraft-comment-list"></div></div><div class="vikcraft-tab-content" id="explorer-content"><ul class="vikcraft-model-tree"></ul></div>`; wrapper.appendChild(this.viewerContainer); wrapper.appendChild(this.sidebarContainer); this.rootContainer.appendChild(wrapper); this.commentListContainer = this.sidebarContainer.querySelector('.vikcraft-comment-list'); this.modelTreeContainer = this.sidebarContainer.querySelector('.vikcraft-model-tree'); this.sidebarContainer.querySelectorAll('.vikcraft-tab-button').forEach(button => { button.addEventListener('click', () => { const tabName = button.dataset.tab; this.sidebarContainer.querySelectorAll('.vikcraft-tab-button').forEach(btn => btn.classList.remove('active')); this.sidebarContainer.querySelectorAll('.vikcraft-tab-content').forEach(content => content.classList.remove('active')); button.classList.add('active'); this.sidebarContainer.querySelector(`#${tabName}-content`).classList.add('active'); }); }); }
    _createToolbar() { this.toolbar = document.createElement('div'); this.toolbar.className = 'vikcraft-toolbar'; const modes = { navigate: 'Navigate', transform: 'Transform', annotate: 'Annotate', measure: 'Measure' }; Object.entries(modes).forEach(([key, value]) => { const button = document.createElement('button'); button.className = 'vikcraft-button'; if (key === this.currentMode) button.classList.add('active'); button.textContent = value; button.dataset.mode = key; button.addEventListener('click', () => this._setMode(key)); this.toolbar.appendChild(button); }); this.transformModeContainer = document.createElement('div'); this.transformModeContainer.className = 'vikcraft-sub-toolbar'; this.transformModeContainer.style.display = 'none'; const transformModes = { translate: 'Move', rotate: 'Rotate', scale: 'Scale' }; Object.entries(transformModes).forEach(([key, value]) => { const button = document.createElement('button'); button.className = 'vikcraft-button-small'; button.textContent = value; button.dataset.transformMode = key; button.addEventListener('click', () => { this.transformControls.setMode(key); }); this.transformModeContainer.appendChild(button); }); this.toolbar.appendChild(this.transformModeContainer); const separator1 = document.createElement('div'); separator1.style.cssText = 'border-left: 1px solid #555; margin: 0 5px;'; this.toolbar.appendChild(separator1); const viewModes = { default: 'Default', wireframe: 'Wireframe', xray: 'X-Ray'}; Object.entries(viewModes).forEach(([key, value]) => { const button = document.createElement('button'); button.className = 'vikcraft-button'; button.textContent = value; button.dataset.viewMode = key; if (key === this.viewMode) button.classList.add('active'); button.addEventListener('click', () => this.setViewMode(key)); this.toolbar.appendChild(button); }); const separator2 = document.createElement('div'); separator2.style.cssText = 'border-left: 1px solid #555; margin: 0 5px;'; this.toolbar.appendChild(separator2); const gridButton = document.createElement('button'); gridButton.className = 'vikcraft-button'; gridButton.textContent = 'Grid'; gridButton.dataset.control = 'grid'; if (this.gridHelper.visible) gridButton.classList.add('active'); gridButton.addEventListener('click', () => this.toggleGridVisibility()); this.toolbar.appendChild(gridButton); this.clearMeasuresButton = document.createElement('button'); this.clearMeasuresButton.className = 'vikcraft-button'; this.clearMeasuresButton.textContent = 'Clear Measures'; this.clearMeasuresButton.style.display = 'none'; this.clearMeasuresButton.addEventListener('click', () => this.clearAllMeasurements()); this.toolbar.appendChild(this.clearMeasuresButton); this.viewerContainer.appendChild(this.toolbar); }
    _loadModel(url) { this.gltfLoader.load(url, (gltf) => { this.model = gltf.scene; this._storeOriginalMaterials(); const explorerData = this._buildExplorerData(this.model); const box = new this.THREE.Box3().setFromObject(this.model); const size = box.getSize(new this.THREE.Vector3()).length(); const center = box.getCenter(new this.THREE.Vector3()); this.model.position.sub(center); this.scene.add(this.model); this.transformControls.attach(this.model); this.camera.position.copy(center); this.camera.position.x += size; this.camera.position.y += size / 2; this.camera.position.z += size; this.camera.lookAt(center); this.controls.target.copy(center); this.modelTreeContainer.innerHTML = ''; this._renderModelExplorer(explorerData, this.modelTreeContainer); if (this.onModelLoaded) this.onModelLoaded(); }); }
    _storeOriginalMaterials() { this.originalMaterials.clear(); this.model.traverse(child => { if (child.isMesh) { this.originalMaterials.set(child.uuid, child.material); } }); }
    _animate() { requestAnimationFrame(() => this._animate()); this.controls.update(); this._updateLiveMeasurement(); this._updateLabels(); this.composer.render(); }
    _setMode(mode) { if (mode !== 'measure') this._clearLiveMeasurement(); this.currentMode = mode; this.measureStartPoint = null; this.toolbar.querySelectorAll('.vikcraft-button[data-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode)); const isTransform = mode === 'transform'; this.controls.enabled = !isTransform; this.transformControls.enabled = isTransform; this.transformControls.visible = isTransform; this.transformModeContainer.style.display = isTransform ? 'flex' : 'none'; if (isTransform) { this._updateTransformButtonStates(); } if (this.clearMeasuresButton) this.clearMeasuresButton.style.display = mode === 'measure' ? 'inline-block' : 'none'; }
    _onMouseMove(event) { const rect = this.renderer.domElement.getBoundingClientRect(); this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; }
    _createAnnotationFromData(data, isNew = false) { const { id, position, text } = data; const anchor = new this.THREE.Object3D(); this.model.add(anchor); const localPosition = isNew ? this.model.worldToLocal(position.clone()) : position; anchor.position.copy(localPosition); anchor.add(new this.THREE.Mesh(new this.THREE.SphereGeometry(0.05, 16, 16), new this.THREE.MeshBasicMaterial({ color: 0xff4444 }))); const label = document.createElement('div'); label.className = 'vikcraft-label'; label.textContent = text; this.viewerContainer.appendChild(label); this.annotations.push({ id, anchor, element: label, text }); if (isNew && this.onAnnotationAdded) this.onAnnotationAdded({ id, position: localPosition, text }); }
    _editAnnotation(id) { const annotation = this.annotations.find(a => a.id === id); if (!annotation) return; const newText = prompt("Edit annotation:", annotation.text); if (newText && newText !== annotation.text) { annotation.text = newText; annotation.element.textContent = newText; this._renderSidebar(); if (this.onAnnotationUpdated) this.onAnnotationUpdated({ id, text: newText }); } }
    _deleteAnnotation(id) { const index = this.annotations.findIndex(a => a.id === id); if (index === -1) return; if (this.onAnnotationDeleted) this.onAnnotationDeleted(id); const annotation = this.annotations[index]; this.model.remove(annotation.anchor); this.viewerContainer.removeChild(annotation.element); this.annotations.splice(index, 1); this._renderSidebar(); }
    _renderSidebar() { this.commentListContainer.innerHTML = ""; if (this.annotations.length === 0) { this.commentListContainer.innerHTML = '<p style="color: #6b7280; text-align: center;">No annotations yet.</p>'; } else { this.annotations.forEach(anno => this.commentListContainer.appendChild(this._createAnnotationCard(anno))); } }
    _createAnnotationCard(annotation) { const card = document.createElement('div'); card.className = 'vikcraft-card'; card.dataset.id = annotation.id; card.innerHTML = `<div class="vikcraft-card-text">${annotation.text}</div><div class="vikcraft-card-actions"><button class="vikcraft-action-button edit">Edit</button><button class="vikcraft-action-button delete">Delete</button></div>`; card.addEventListener('click', () => this._focusOnAnnotation(annotation.id)); card.querySelector('.edit').addEventListener('click', e => { e.stopPropagation(); this._editAnnotation(annotation.id); }); card.querySelector('.delete').addEventListener('click', e => { e.stopPropagation(); this._deleteAnnotation(annotation.id); }); return card; }
    _focusOnAnnotation(id) { const annotation = this.annotations.find(a => a.id === id); if (!annotation) return; this.sidebarContainer.querySelectorAll('.vikcraft-card').forEach(el => el.classList.toggle('active', el.dataset.id === id)); const targetPosition = new this.THREE.Vector3(); annotation.anchor.getWorldPosition(targetPosition); const offset = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(5); this.controls.target.copy(targetPosition); this.camera.position.copy(targetPosition.clone().add(offset)); }
    _handleMeasureClick(point) { if (!this.measureStartPoint) { this.measureStartPoint = point; const lineGeom = new this.THREE.BufferGeometry().setFromPoints([point, point]); this.liveMeasureVisuals.line = new this.THREE.Line(lineGeom, new this.THREE.LineBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.7 })); this.scene.add(this.liveMeasureVisuals.line); this.liveMeasureVisuals.label = document.createElement('div'); this.liveMeasureVisuals.label.className = 'vikcraft-label vikcraft-measure-label'; this.viewerContainer.appendChild(this.liveMeasureVisuals.label); } else { const endPoint = point; const distance = this.measureStartPoint.distanceTo(endPoint); this._createMeasurement(this.measureStartPoint, endPoint, distance); this._clearLiveMeasurement(); this.measureStartPoint = null; } }
    _createMeasurement(start, end, distance) { const realDistance = distance * this.sceneUnitScale; const text = this._formatDistance(realDistance); const line = new this.THREE.Line(new this.THREE.BufferGeometry().setFromPoints([start, end]), new this.THREE.LineBasicMaterial({ color: 0x00aaff, linewidth: 2 })); this.scene.add(line); const markerMat = new this.THREE.MeshBasicMaterial({ color: 0x00aaff }); const startMarker = new this.THREE.Mesh(new this.THREE.SphereGeometry(0.03, 16, 16), markerMat); startMarker.position.copy(start); this.scene.add(startMarker); const endMarker = new this.THREE.Mesh(new this.THREE.SphereGeometry(0.03, 16, 16), markerMat); endMarker.position.copy(end); this.scene.add(endMarker); const label = document.createElement('div'); label.className = 'vikcraft-label vikcraft-measure-label'; label.textContent = text; this.viewerContainer.appendChild(label); const midPoint = new this.THREE.Vector3().addVectors(start, end).multiplyScalar(0.5); this.measurements.push({ line, startMarker, endMarker, element: label, position: midPoint }); }
    _clearLiveMeasurement() { if (this.liveMeasureVisuals.line) { this.scene.remove(this.liveMeasureVisuals.line); this.liveMeasureVisuals.line.geometry.dispose(); this.liveMeasureVisuals.line.material.dispose(); } if (this.liveMeasureVisuals.label) this.viewerContainer.removeChild(this.liveMeasureVisuals.label); this.liveMeasureVisuals = { line: null, label: null }; }
    _formatDistance(distanceInMeters) { if (this.displayUnits === 'imperial') { const i = distanceInMeters * 39.3701, t = Math.floor(i / 12); return `${t}' ${(i % 12).toFixed(1)}"` } return `${distanceInMeters.toFixed(2)} m` }
    _updateLiveMeasurement() { if (this.currentMode !== 'measure' || !this.measureStartPoint || (!this.model && !this.gridHelper)) return; const raycaster = new this.THREE.Raycaster(); raycaster.setFromCamera(this.mouse, this.camera); const targets = [this.model, this.gridHelper].filter(Boolean); const intersects = raycaster.intersectObjects(targets, true); if (intersects.length > 0) { const currentPoint = intersects[0].point; const positions = this.liveMeasureVisuals.line.geometry.attributes.position; positions.setXYZ(1, currentPoint.x, currentPoint.y, currentPoint.z); positions.needsUpdate = true; const distance = this.measureStartPoint.distanceTo(currentPoint); this.liveMeasureVisuals.label.textContent = this._formatDistance(distance * this.sceneUnitScale); const midPoint = new this.THREE.Vector3().addVectors(this.measureStartPoint, currentPoint).multiplyScalar(0.5); this._updateSingleLabelPosition(this.liveMeasureVisuals.label, midPoint); } }
    _updateLabels() { if (!this.model && !this.gridHelper) return; [...this.annotations, ...this.measurements].forEach(item => { const worldPosition = new this.THREE.Vector3(); if (item.anchor) item.anchor.getWorldPosition(worldPosition); else worldPosition.copy(item.position); this._updateSingleLabelPosition(item.element, worldPosition); }); }
    _updateSingleLabelPosition(element, worldPosition) { const cameraPosition = this.camera.position; const raycaster = new this.THREE.Raycaster(); const direction = worldPosition.clone().sub(cameraPosition).normalize(); raycaster.set(cameraPosition, direction); const targets = [this.model].filter(Boolean); const intersects = raycaster.intersectObjects(targets, true); const itemDistance = cameraPosition.distanceTo(worldPosition); if (intersects.length > 0 && intersects[0].distance < itemDistance - 0.1) { element.style.display = 'none'; } else { element.style.display = 'block'; const screenPosition = worldPosition.clone().project(this.camera); const x = (screenPosition.x * 0.5 + 0.5) * this.viewerContainer.clientWidth; const y = (screenPosition.y * -0.5 + 0.5) * this.viewerContainer.clientHeight; element.style.transform = `translate(-50%, -120%) translate(${x}px, ${y}px)`; } }
    _onWindowResize() { if (!this.viewerContainer) return; this.camera.aspect = this.viewerContainer.clientWidth / this.viewerContainer.clientHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(this.viewerContainer.clientWidth, this.viewerContainer.clientHeight); this.composer.setSize(this.viewerContainer.clientWidth, this.viewerContainer.clientHeight); }
    _buildExplorerData(object) { if (!object.name && !object.isMesh) return null; const node = { name: object.name || `Mesh (${object.uuid.substring(0, 6)})`, uuid: object.uuid, children: [] }; if (object.children.length > 0) object.children.forEach(child => { const childNode = this._buildExplorerData(child); if (childNode) node.children.push(childNode); }); return node; }
    _renderModelExplorer(node, parentElement) { if (!node) return; const li = document.createElement('li'); li.className = 'vikcraft-model-tree-item'; li.textContent = node.name; li.dataset.uuid = node.uuid; li.addEventListener('click', (e) => { e.stopPropagation(); this._highlightObjectByUUID(node.uuid); }); parentElement.appendChild(li); if (node.children.length > 0) { const ul = document.createElement('ul'); parentElement.appendChild(ul); node.children.forEach(childNode => this._renderModelExplorer(childNode, ul)); } }
    _highlightObjectByUUID(uuid) { const objectToHighlight = this.model.getObjectByProperty('uuid', uuid); if (objectToHighlight) { this.outlinePass.selectedObjects = [objectToHighlight]; this.modelTreeContainer.querySelectorAll('.vikcraft-model-tree-item').forEach(item => item.classList.toggle('selected', item.dataset.uuid === uuid)); } }
    _updateTransformButtonStates() { const currentTransformMode = this.transformControls.getMode(); this.transformModeContainer.querySelectorAll('[data-transform-mode]').forEach(btn => { btn.classList.toggle('active', btn.dataset.transformMode === currentTransformMode); }); }
}
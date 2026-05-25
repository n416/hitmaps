document.addEventListener('DOMContentLoaded', () => {
    const scene = document.getElementById('scene');
    const camera = document.getElementById('camera');
    const mapImage = document.getElementById('map-image');
    const mapContainer = document.getElementById('map-container');
    const arrowLayer = document.getElementById('arrow-layer');

    // UI Buttons (Camera)
    const btnTopdown = document.getElementById('btn-topdown');
    const btnBirdseye = document.getElementById('btn-birdseye');
    const btnHuman = document.getElementById('btn-human');
    const btnReset = document.getElementById('btn-reset');
    const allModeBtns = [btnTopdown, btnBirdseye, btnHuman];

    // UI Buttons (Tools)
    const btnToolMove = document.getElementById('tool-move');
    const btnToolPin = document.getElementById('tool-pin');
    const btnToolArrow = document.getElementById('tool-arrow');
    const btnToolClear = document.getElementById('tool-clear');
    const toolBtns = [btnToolMove, btnToolPin, btnToolArrow];

    const btnShare = document.getElementById('btn-share');
    const toast = document.getElementById('toast');

    // Modal
    const pinModal = document.getElementById('pin-modal');
    const pinText = document.getElementById('pin-text');
    const btnPinSave = document.getElementById('btn-pin-save');
    const btnPinDelete = document.getElementById('btn-pin-delete');
    const btnPinCancel = document.getElementById('btn-pin-cancel');
    const modalTitle = document.getElementById('modal-title');

    // Camera state
    let state = {
        x: 0, y: 0, z: 0,
        rotateX: 70, rotateZ: 0, scale: 1.0
    };

    // App state
    let currentTool = 'move'; // 'move', 'pin', 'arrow'
    const DEFAULT_PINS = [
        { id: 'own_left', text: '自陣左', y: 73, x: 42, isFlat: false },
        { id: 'own_right', text: '自陣右', y: 73, x: 58, isFlat: false },
        { id: 'enemy_left', text: '敵陣左', y: 27, x: 32, isFlat: false },
        { id: 'enemy_right', text: '敵陣右', y: 27, x: 68, isFlat: false },
        { id: 'center_left', text: '中央左', y: 50, x: 36, isFlat: false },
        { id: 'center', text: 'ボス', y: 50, x: 50, isFlat: false },
        { id: 'center_right', text: '中央右', y: 50, x: 64, isFlat: false }
    ];
    let customPins = JSON.parse(JSON.stringify(DEFAULT_PINS));
    let arrows = [];
    let selectedObject = null; // { type: 'arrow'|'pin', id: string|number }
    let tempPinCircle = null;
    let tempArrowCircle = null;
    let arrowStartPoint = null; // {x, y}
    let tempArrowEndCircle = null;
    let arrowEndPoint = null; // {x, y}
    let tempArrowPreview = null;

    const PRESETS = {
        topdown: { rotateX: 0, rotateZ: 0, scale: 1.0, x: 0, y: 0, z: -2500 },
        birdseye: { rotateX: 45, rotateZ: 45, scale: 1.0, x: 0, y: 0, z: -1800 },
        human: { rotateX: 70, rotateZ: 0, scale: 1.0, x: 0, y: 100, z: -1000 }
    };

    // --- Data Management ---
    function loadData() {
        let loaded = false;
        if (window.location.hash) {
            try {
                const encoded = window.location.hash.substring(1);
                const data = JSON.parse(decodeURIComponent(atob(encoded)));
                if (data.state) state = { ...state, ...data.state };
                if (data.pins) customPins = data.pins;
                if (data.arrows) arrows = data.arrows;
                loaded = true;
                allModeBtns.forEach(b => b.classList.remove('active'));
            } catch(e) { console.error("URL Load failed", e); }
        }
        
        if (!loaded) {
            try {
                const saved = localStorage.getItem('hit2_map_data');
                if (saved) {
                    const data = JSON.parse(saved);
                    if (data.pins) customPins = data.pins;
                    if (data.arrows) arrows = data.arrows;
                }
            } catch(e) {}
        }
    }

    function saveData() {
        const data = { pins: customPins, arrows };
        localStorage.setItem('hit2_map_data', JSON.stringify(data));
    }

    // --- Toast ---
    let toastTimer;
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
    }

    function renderCustomPins() {
        document.querySelectorAll('.custom-marker').forEach(m => m.remove());
        customPins.forEach(p => {
            const el = document.createElement('div');
            el.className = 'marker custom-marker';
            if (p.isFlat) el.classList.add('is-flat');
            el.textContent = p.text;
            el.style.top = `${p.y}%`;
            el.style.left = `${p.x}%`;
            
            const isSelected = (selectedObject && selectedObject.type === 'pin' && selectedObject.id === p.id);
            if (isSelected) {
                el.classList.add('selected');
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'pin-actions';
                
                const editBtn = document.createElement('div');
                editBtn.className = 'pin-action-btn';
                editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
                editBtn.title = '編集';
                editBtn.addEventListener('mousedown', (de) => {
                    de.stopPropagation();
                    openPinModal(p.id);
                });

                const delBtn = document.createElement('div');
                delBtn.className = 'pin-action-btn delete';
                delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
                delBtn.title = '削除';
                delBtn.addEventListener('mousedown', (de) => {
                    de.stopPropagation();
                    customPins = customPins.filter(pin => pin.id !== p.id);
                    selectedObject = null;
                    saveData();
                    renderCustomPins();
                    renderArrows(); // Update arrows connected to this pin if any
                });

                actionsDiv.appendChild(editBtn);
                actionsDiv.appendChild(delBtn);
                el.appendChild(actionsDiv);
            }

            el.addEventListener('mousedown', (e) => {
                let toolChanged = false;
                if (currentTool !== 'move') {
                    selectTool('move');
                    toolChanged = true;
                }
                
                e.stopPropagation();

                let wasSelected = isSelected && !toolChanged;
                if (!wasSelected) {
                    selectedObject = { type: 'pin', id: p.id };
                    renderCustomPins();
                    renderArrows();
                }

                let startX = e.clientX, startY = e.clientY;
                let startLeft = p.x, startTop = p.y;
                let isDragged = false;

                const onMove = (me) => {
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragged = true;

                    const apparentScale = 1200 / Math.max(100, (1200 - state.z));
                    const moveXPct = dx / (mapContainer.offsetWidth * apparentScale) * 100;
                    const moveYPct = dy / (mapContainer.offsetHeight * apparentScale) * 100;
                    
                    const rad = state.rotateZ * Math.PI / 180;
                    const tiltCorrection = Math.max(1, Math.cos(state.rotateX * Math.PI / 180));

                    const rx = moveXPct * Math.cos(rad) + (moveYPct / tiltCorrection) * Math.sin(rad);
                    const ry = -moveXPct * Math.sin(rad) + (moveYPct / tiltCorrection) * Math.cos(rad);

                    p.x = startLeft + rx;
                    p.y = startTop + ry;
                    
                    el.style.left = `${p.x}%`;
                    el.style.top = `${p.y}%`;
                    // パフォーマンス改善のため、ここで毎フレームrenderArrows()を呼ぶのを廃止
                };
                
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    
                    if (!isDragged && wasSelected) {
                        // 既に選択済みの状態でのクリック時のみ、垂直・水平をトグルする
                        p.isFlat = !p.isFlat;
                        renderCustomPins();
                    }
                    saveData();
                };
                
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
            mapContainer.appendChild(el);
        });
        applyState(); 
    }

    function renderArrows() {
        arrowLayer.innerHTML = `
            <defs>
                <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
                    <polygon points="0 0, 12 4, 0 8" fill="rgba(0, 210, 255, 0.9)" />
                </marker>
                <marker id="arrowhead-selected" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
                    <polygon points="0 0, 12 4, 0 8" fill="#ffb703" />
                </marker>
                <marker id="arrowhead-hit" markerWidth="24" markerHeight="24" refX="12" refY="12" orient="auto">
                    <rect x="0" y="0" width="24" height="24" fill="transparent" pointer-events="all" />
                </marker>
            </defs>
        `;
        document.querySelectorAll('.arrow-anchor').forEach(el => el.remove());

        const w = mapContainer.offsetWidth;
        const h = mapContainer.offsetHeight;

        arrows.forEach((arr, idx) => {
            if (arr.cx === undefined || isNaN(arr.cx) || arr.cx === null) {
                const dx = arr.ex - arr.sx;
                const dy = arr.ey - arr.sy;
                const dist = Math.sqrt(dx*dx + dy*dy);
                let nx = 0, ny = 0;
                if (dist > 0) {
                    nx = -dy / dist;
                    ny = dx / dist;
                }
                arr.cx = arr.sx + dx * 0.5 + nx * dist * 0.2;
                arr.cy = arr.sy + dy * 0.5 + ny * dist * 0.2;
            }

            const getPathD = (a) => {
                const sX = (a.sx / 100) * w;
                const sY = (a.sy / 100) * h;
                const eX = (a.ex / 100) * w;
                const eY = (a.ey / 100) * h;
                const cX = (a.cx / 100) * w;
                const cY = (a.cy / 100) * h;
                return `M ${sX} ${sY} Q ${cX} ${cY} ${eX} ${eY}`;
            };

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            
            const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hitPath.setAttribute('d', getPathD(arr));
            hitPath.setAttribute('class', 'arrow-hit-area');
            
            const headHitCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            headHitCircle.setAttribute('cx', (arr.ex / 100) * w);
            headHitCircle.setAttribute('cy', (arr.ey / 100) * h);
            headHitCircle.setAttribute('r', '24');
            headHitCircle.setAttribute('fill', 'transparent');
            // 'all' ensures the entire area (fill and stroke) is clickable
            headHitCircle.setAttribute('pointer-events', 'all');
            headHitCircle.style.cursor = 'grab';
            
            const isSelected = (selectedObject && selectedObject.type === 'arrow' && selectedObject.id === idx);
            const visualPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            visualPath.setAttribute('d', getPathD(arr));
            visualPath.setAttribute('class', `arrow-path ${isSelected ? 'selected' : ''}`);
            visualPath.setAttribute('marker-end', isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead)');
            
            g.appendChild(hitPath);
            g.appendChild(headHitCircle);
            g.appendChild(visualPath);

            if (isSelected) {
                // バウンディングボックスの描画
                const xs = [(arr.sx/100)*w, (arr.ex/100)*w, (arr.cx/100)*w];
                const ys = [(arr.sy/100)*h, (arr.ey/100)*h, (arr.cy/100)*h];
                const minX = Math.min(...xs) - 20;
                const maxX = Math.max(...xs) + 20;
                const minY = Math.min(...ys) - 20;
                const maxY = Math.max(...ys) + 20;
                const bbox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bbox.setAttribute('x', minX);
                bbox.setAttribute('y', minY);
                bbox.setAttribute('width', maxX - minX);
                bbox.setAttribute('height', maxY - minY);
                bbox.setAttribute('class', 'arrow-bounding-box');
                g.insertBefore(bbox, visualPath); // パスの裏に配置
            }
            
            g.addEventListener('mousedown', (e) => {
                let toolChanged = false;
                if (currentTool !== 'move') {
                    selectTool('move');
                    toolChanged = true;
                }
                
                e.stopPropagation();
                
                let wasSelected = isSelected && !toolChanged;
                if (!wasSelected) {
                    selectedObject = { type: 'arrow', id: idx };
                    renderCustomPins();
                    renderArrows();
                    return; // 初回クリック時は選択のみ行う
                }
                
                // すでに選択されている場合、線全体をドラッグ移動する
                let dragStartX = e.clientX, dragStartY = e.clientY;
                let startSx = arr.sx, startSy = arr.sy;
                let startEx = arr.ex, startEy = arr.ey;
                let startCx = arr.cx, startCy = arr.cy;
                
                const onMove = (me) => {
                    const mdx = me.clientX - dragStartX;
                    const mdy = me.clientY - dragStartY;

                    const apparentScale = 1200 / Math.max(100, (1200 - state.z));
                    const moveXPct = mdx / (mapContainer.offsetWidth * apparentScale) * 100;
                    const moveYPct = mdy / (mapContainer.offsetHeight * apparentScale) * 100;
                    
                    const rad = state.rotateZ * Math.PI / 180;
                    const tiltCorrection = Math.max(1, Math.cos(state.rotateX * Math.PI / 180));

                    const rx = moveXPct * Math.cos(rad) + (moveYPct / tiltCorrection) * Math.sin(rad);
                    const ry = -moveXPct * Math.sin(rad) + (moveYPct / tiltCorrection) * Math.cos(rad);

                    arr.sx = startSx + rx; arr.sy = startSy + ry;
                    arr.ex = startEx + rx; arr.ey = startEy + ry;
                    arr.cx = startCx + rx; arr.cy = startCy + ry;
                    
                    const newD = getPathD(arr);
                    hitPath.setAttribute('d', newD);
                    visualPath.setAttribute('d', newD);
                    
                    headHitCircle.setAttribute('cx', (arr.ex / 100) * w);
                    headHitCircle.setAttribute('cy', (arr.ey / 100) * h);
                    
                    // バウンディングボックスの追従
                    const bbox = g.querySelector('.arrow-bounding-box');
                    if (bbox) {
                        const xs = [(arr.sx/100)*w, (arr.ex/100)*w, (arr.cx/100)*w];
                        const ys = [(arr.sy/100)*h, (arr.ey/100)*h, (arr.cy/100)*h];
                        const minX = Math.min(...xs) - 20;
                        const maxX = Math.max(...xs) + 20;
                        const minY = Math.min(...ys) - 20;
                        const maxY = Math.max(...ys) + 20;
                        bbox.setAttribute('x', minX);
                        bbox.setAttribute('y', minY);
                        bbox.setAttribute('width', maxX - minX);
                        bbox.setAttribute('height', maxY - minY);
                    }
                    
                    // アンカー（ハンドル）の位置も同期して動かす
                    document.querySelectorAll('.arrow-anchor').forEach(el => {
                        if (el.classList.contains('start')) { el.style.left = `${arr.sx}%`; el.style.top = `${arr.sy}%`; }
                        if (el.classList.contains('end')) { el.style.left = `${arr.ex}%`; el.style.top = `${arr.ey}%`; }
                        if (el.classList.contains('bezier')) { el.style.left = `${arr.cx}%`; el.style.top = `${arr.cy}%`; }
                    });
                };
                
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    saveData();
                };
                
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
            arrowLayer.appendChild(g);

            // 選択された矢印のみ、編集用アンカーを表示する
            if (isSelected) {
                const createHandle = (type, pctX, pctY) => {
                    const handle = document.createElement('div');
                    handle.className = `arrow-anchor ${type}`;
                    handle.style.left = `${pctX}%`;
                    handle.style.top = `${pctY}%`;
                    
                    if (type === 'bezier') {
                        const delBtn = document.createElement('div');
                        delBtn.className = 'arrow-delete-btn';
                        delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
                        delBtn.title = '矢印を削除';
                        delBtn.addEventListener('mousedown', (de) => {
                            de.stopPropagation();
                            arrows.splice(idx, 1);
                            selectedObject = null;
                            saveData();
                            renderArrows();
                        });
                        handle.appendChild(delBtn);
                    }
                    
                    handle.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        let dragStartX = e.clientX, dragStartY = e.clientY;
                        let start_pctX = pctX, start_pctY = pctY;
                        
                        const onMove = (me) => {
                            const mdx = me.clientX - dragStartX;
                            const mdy = me.clientY - dragStartY;

                            const apparentScale = 1200 / Math.max(100, (1200 - state.z));
                            const moveXPct = mdx / (mapContainer.offsetWidth * apparentScale) * 100;
                            const moveYPct = mdy / (mapContainer.offsetHeight * apparentScale) * 100;
                            
                            const rad = state.rotateZ * Math.PI / 180;
                            const tiltCorrection = Math.max(1, Math.cos(state.rotateX * Math.PI / 180));

                            const rx = moveXPct * Math.cos(rad) + (moveYPct / tiltCorrection) * Math.sin(rad);
                            const ry = -moveXPct * Math.sin(rad) + (moveYPct / tiltCorrection) * Math.cos(rad);

                            const newX = start_pctX + rx;
                            const newY = start_pctY + ry;
                            
                            if (type === 'start') { arr.sx = newX; arr.sy = newY; }
                            else if (type === 'end') { arr.ex = newX; arr.ey = newY; }
                            else if (type === 'bezier') { arr.cx = newX; arr.cy = newY; }
                            
                            handle.style.left = `${newX}%`;
                            handle.style.top = `${newY}%`;
                            
                            const newD = getPathD(arr);
                            hitPath.setAttribute('d', newD);
                            visualPath.setAttribute('d', newD);
                            
                            const bbox = g.querySelector('.arrow-bounding-box');
                            if (bbox) {
                                const xs = [(arr.sx/100)*w, (arr.ex/100)*w, (arr.cx/100)*w];
                                const ys = [(arr.sy/100)*h, (arr.ey/100)*h, (arr.cy/100)*h];
                                const minX = Math.min(...xs) - 20;
                                const maxX = Math.max(...xs) + 20;
                                const minY = Math.min(...ys) - 20;
                                const maxY = Math.max(...ys) + 20;
                                bbox.setAttribute('x', minX);
                                bbox.setAttribute('y', minY);
                                bbox.setAttribute('width', maxX - minX);
                                bbox.setAttribute('height', maxY - minY);
                            }
                        };
                        
                        const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                            saveData();
                            renderArrows();
                        };
                        
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                    });
                    mapContainer.appendChild(handle);
                };

                createHandle('start', arr.sx, arr.sy);
                createHandle('end', arr.ex, arr.ey);
                createHandle('bezier', arr.cx, arr.cy);
            }
        });
        applyState();
    }

    function initMap() {
        // 高DPIディスプレイ環境（Retina等）で画像がぼやけたり座標計算が狂うのを防ぐため、
        // 物理ピクセル数（naturalWidth）をdevicePixelRatioで割った「正しいCSSピクセルサイズ」でコンテナを初期化します。
        const ratio = window.devicePixelRatio || 1;
        const w = mapImage.naturalWidth / ratio;
        const h = mapImage.naturalHeight / ratio;

        if (w === 0) return;

        mapContainer.style.width = `${w}px`;
        mapContainer.style.height = `${h}px`;
        mapContainer.style.left = `-${w / 2}px`;
        mapContainer.style.top = `-${h / 2}px`;

        mapImage.style.pointerEvents = 'auto'; 
        mapImage.draggable = false;
        
        renderCustomPins();
        renderArrows();

        applyState();
    }

    // mapImageのロード判定は初期化シーケンスの最後に移動しました

    // --- State Management ---
    function applyState(animate = false) {
        if (animate) {
            camera.classList.add('animating');
            setTimeout(() => camera.classList.remove('animating'), 800);
        }

        camera.style.transform = `
            translateZ(${state.z}px)
            rotateX(${state.rotateX}deg)
            rotateZ(${state.rotateZ}deg)
            translate3d(${state.x}px, ${state.y}px, 0)
            scale3d(${state.scale}, ${state.scale}, ${state.scale})
        `;

        const apparentScale = 1200 / Math.max(100, (1200 - state.z));
        const inverseScale = 1 / apparentScale;
        const radZ = state.rotateZ;
        const radX = state.rotateX;

        const markers = document.querySelectorAll('.marker, .temp-circle, .arrow-anchor');
        markers.forEach(el => {
            let zOffset = 40;
            let currentScale = 1;
            if (el.classList.contains('temp-circle')) {
                zOffset = 10;
                currentScale = inverseScale;
            }
            if (el.classList.contains('arrow-anchor')) {
                zOffset = 25;
                currentScale = inverseScale;
            }

            if (el.classList.contains('is-flat')) {
                // 水平（マップ平面にべったり）
                el.style.transform = `translate(-50%, -50%) translateZ(${zOffset}px)`;
            } else {
                // 垂直（カメラ正対のビルボード）
                el.style.transform = `translate(-50%, -50%) translateZ(${zOffset}px) rotateZ(${-radZ}deg) rotateX(${-radX}deg) scale(${currentScale})`;
            }
        });
    }

    function setCameraBtn(activeBtn) {
        allModeBtns.forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    function loadPreset(presetKey, btn) {
        const p = PRESETS[presetKey];
        state = { ...state, ...p };
        setCameraBtn(btn);
        applyState(true);
    }

    // --- Input Handling ---
    let isDragging = false;
    let dragMode = null; 
    let startX, startY;
    let startStateX, startStateY, startStateRotZ, startStateRotX;

    scene.addEventListener('contextmenu', e => e.preventDefault());

    scene.addEventListener('mousedown', (e) => {
        if (currentTool !== 'move') return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        if (e.button === 0 || e.button === 1) dragMode = 'pan';
        else if (e.button === 2) dragMode = 'rotate';

        startStateX = state.x;
        startStateY = state.y;
        startStateRotZ = state.rotateZ;
        startStateRotX = state.rotateX;
        camera.classList.remove('animating');
        
        // Deselect object if dragging map
        if (selectedObject !== null) {
            selectedObject = null;
            renderCustomPins();
            renderArrows();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (dragMode === 'pan') {
            const rad = state.rotateZ * Math.PI / 180;
            const apparentScale = 1200 / Math.max(100, (1200 - state.z));
            // マウス移動量とマップ移動量を1:1に近づけるため1.0に変更
            const panSpeed = 1.0 / apparentScale;

            const moveX = (deltaX * Math.cos(-rad) - deltaY * Math.sin(-rad)) * panSpeed;
            const moveY = (deltaX * Math.sin(-rad) + deltaY * Math.cos(-rad)) * panSpeed;
            const tiltCorrection = Math.max(1, Math.cos(state.rotateX * Math.PI / 180));

            state.x = startStateX + moveX;
            state.y = startStateY + (moveY / tiltCorrection);
            allModeBtns.forEach(b => b.classList.remove('active'));
        } else if (dragMode === 'rotate') {
            const rotSpeed = 0.5;
            state.rotateZ = startStateRotZ + (deltaX * rotSpeed);
            let newRotX = startStateRotX - (deltaY * rotSpeed);
            newRotX = Math.max(0, Math.min(85, newRotX));
            state.rotateX = newRotX;
            allModeBtns.forEach(b => b.classList.remove('active'));
        }
        applyState();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        dragMode = null;
    });

    window.addEventListener('mouseleave', () => {
        isDragging = false;
        dragMode = null;
    });

    scene.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 150;
        const direction = e.deltaY > 0 ? -1 : 1;
        let newZ = state.z + (direction * zoomSpeed);
        newZ = Math.max(-4000, Math.min(1000, newZ));
        state.z = newZ;
        allModeBtns.forEach(b => b.classList.remove('active'));
        applyState();
    }, { passive: false });

    // Map Click Handling for Tools
    mapImage.addEventListener('mousedown', (e) => {
        // Deselect object
        if (selectedObject !== null) {
            selectedObject = null;
            renderCustomPins();
            renderArrows();
        }

        if (currentTool === 'move') return; 
        if (e.button !== 0) return; 

        e.stopPropagation(); 
        const px = (e.offsetX / mapImage.offsetWidth) * 100;
        const py = (e.offsetY / mapImage.offsetHeight) * 100;

        if (currentTool === 'pin') {
            if (!tempPinCircle) {
                tempPinCircle = document.createElement('div');
                tempPinCircle.className = 'temp-circle';
                tempPinCircle.style.left = `${px}%`;
                tempPinCircle.style.top = `${py}%`;
                mapContainer.appendChild(tempPinCircle);
                applyState();
                
                tempPinCircle.addEventListener('mousedown', (ce) => {
                    ce.stopPropagation();
                    openPinModal(null, px, py);
                });
            } else {
                tempPinCircle.style.left = `${px}%`;
                tempPinCircle.style.top = `${py}%`;
                applyState();
            }
        } else if (currentTool === 'arrow') {
            const makePreviewDraggable = (circleElem, isStartPoint) => {
                circleElem.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    let dragStartX = e.clientX, dragStartY = e.clientY;
                    let startPx = isStartPoint ? arrowStartPoint.x : arrowEndPoint.x;
                    let startPy = isStartPoint ? arrowStartPoint.y : arrowEndPoint.y;
                    
                    const onMove = (me) => {
                        const mdx = me.clientX - dragStartX;
                        const mdy = me.clientY - dragStartY;
                        const apparentScale = 1200 / Math.max(100, (1200 - state.z));
                        const moveXPct = mdx / (mapContainer.offsetWidth * apparentScale) * 100;
                        const moveYPct = mdy / (mapContainer.offsetHeight * apparentScale) * 100;
                        const rad = state.rotateZ * Math.PI / 180;
                        const tiltCorrection = Math.max(1, Math.cos(state.rotateX * Math.PI / 180));
                        const rx = moveXPct * Math.cos(rad) + (moveYPct / tiltCorrection) * Math.sin(rad);
                        const ry = -moveXPct * Math.sin(rad) + (moveYPct / tiltCorrection) * Math.cos(rad);

                        const newX = startPx + rx;
                        const newY = startPy + ry;
                        if (isStartPoint) {
                            arrowStartPoint.x = newX;
                            arrowStartPoint.y = newY;
                        } else {
                            arrowEndPoint.x = newX;
                            arrowEndPoint.y = newY;
                        }
                        circleElem.style.left = `${newX}%`;
                        circleElem.style.top = `${newY}%`;
                        
                        if (arrowStartPoint && arrowEndPoint && tempArrowPreview) {
                            const w = mapContainer.offsetWidth;
                            const h = mapContainer.offsetHeight;
                            const sX = (arrowStartPoint.x / 100) * w;
                            const sY = (arrowStartPoint.y / 100) * h;
                            const eX = (arrowEndPoint.x / 100) * w;
                            const eY = (arrowEndPoint.y / 100) * h;
                            const dx2 = eX - sX;
                            const dy2 = eY - sY;
                            const dist2 = Math.sqrt(dx2*dx2 + dy2*dy2);
                            let nx2 = 0, ny2 = 0;
                            if (dist2 > 0) { nx2 = -dy2 / dist2; ny2 = dx2 / dist2; }
                            const cX = sX + dx2 * 0.5 + nx2 * dist2 * 0.2;
                            const cY = sY + dy2 * 0.5 + ny2 * dist2 * 0.2;
                            tempArrowPreview.setAttribute('d', `M ${sX} ${sY} Q ${cX} ${cY} ${eX} ${eY}`);
                        }
                    };
                    const onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                });
            };

            if (!arrowStartPoint) {
                arrowStartPoint = { x: px, y: py };
                showToast('終点をクリックしてください（ゴミ箱でキャンセル可）');
                
                tempArrowCircle = document.createElement('div');
                tempArrowCircle.className = 'temp-circle';
                tempArrowCircle.style.left = `${px}%`;
                tempArrowCircle.style.top = `${py}%`;
                
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'pin-actions';
                
                const delBtn = document.createElement('div');
                delBtn.className = 'pin-action-btn delete';
                delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
                delBtn.title = '始点をキャンセル';
                delBtn.addEventListener('mousedown', (de) => {
                    de.stopPropagation();
                    if (tempArrowCircle) { tempArrowCircle.remove(); tempArrowCircle = null; }
                    arrowStartPoint = null;
                });
                actionsDiv.appendChild(delBtn);
                tempArrowCircle.appendChild(actionsDiv);
                makePreviewDraggable(tempArrowCircle, true);
                
                mapContainer.appendChild(tempArrowCircle);
                applyState();
            } else if (!arrowEndPoint) {
                arrowEndPoint = { x: px, y: py };
                
                if (tempArrowCircle) {
                    const startActions = tempArrowCircle.querySelector('.pin-actions');
                    if (startActions) startActions.style.display = 'none';
                }
                
                tempArrowEndCircle = document.createElement('div');
                tempArrowEndCircle.className = 'temp-circle';
                tempArrowEndCircle.style.left = `${px}%`;
                tempArrowEndCircle.style.top = `${py}%`;
                
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'pin-actions';
                
                const okBtn = document.createElement('div');
                okBtn.className = 'pin-action-btn success';
                okBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                okBtn.title = '確定';
                okBtn.addEventListener('mousedown', (de) => {
                    de.stopPropagation();
                    const dx = arrowEndPoint.x - arrowStartPoint.x;
                    const dy = arrowEndPoint.y - arrowStartPoint.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    let nx = 0, ny = 0;
                    if (dist > 0) { nx = -dy / dist; ny = dx / dist; }
                    const cx = arrowStartPoint.x + dx * 0.5 + nx * dist * 0.2;
                    const cy = arrowStartPoint.y + dy * 0.5 + ny * dist * 0.2;

                    arrows.push({ sx: arrowStartPoint.x, sy: arrowStartPoint.y, ex: arrowEndPoint.x, ey: arrowEndPoint.y, cx, cy });
                    
                    if (tempArrowCircle) { tempArrowCircle.remove(); tempArrowCircle = null; }
                    if (tempArrowEndCircle) { tempArrowEndCircle.remove(); tempArrowEndCircle = null; }
                    if (tempArrowPreview) { tempArrowPreview.remove(); tempArrowPreview = null; }
                    arrowStartPoint = null;
                    arrowEndPoint = null;
                    
                    selectedObject = { type: 'arrow', id: arrows.length - 1 };
                    saveData();
                    renderArrows();
                });
                
                const delBtn = document.createElement('div');
                delBtn.className = 'pin-action-btn delete';
                delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
                delBtn.title = '終点をキャンセル';
                delBtn.addEventListener('mousedown', (de) => {
                    de.stopPropagation();
                    if (tempArrowEndCircle) { tempArrowEndCircle.remove(); tempArrowEndCircle = null; }
                    if (tempArrowPreview) { tempArrowPreview.remove(); tempArrowPreview = null; }
                    arrowEndPoint = null;
                    
                    if (tempArrowCircle) {
                        const startActions = tempArrowCircle.querySelector('.pin-actions');
                        if (startActions) startActions.style.display = '';
                    }
                });
                
                actionsDiv.appendChild(okBtn);
                actionsDiv.appendChild(delBtn);
                tempArrowEndCircle.appendChild(actionsDiv);
                makePreviewDraggable(tempArrowEndCircle, false);
                
                mapContainer.appendChild(tempArrowEndCircle);
                
                // プレビュー描画
                const w = mapContainer.offsetWidth;
                const h = mapContainer.offsetHeight;
                const sX = (arrowStartPoint.x / 100) * w;
                const sY = (arrowStartPoint.y / 100) * h;
                const eX = (arrowEndPoint.x / 100) * w;
                const eY = (arrowEndPoint.y / 100) * h;
                
                const dx2 = eX - sX;
                const dy2 = eY - sY;
                const dist2 = Math.sqrt(dx2*dx2 + dy2*dy2);
                let nx2 = 0, ny2 = 0;
                if (dist2 > 0) { nx2 = -dy2 / dist2; ny2 = dx2 / dist2; }
                const cX = sX + dx2 * 0.5 + nx2 * dist2 * 0.2;
                const cY = sY + dy2 * 0.5 + ny2 * dist2 * 0.2;
                
                tempArrowPreview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                tempArrowPreview.setAttribute('d', `M ${sX} ${sY} Q ${cX} ${cY} ${eX} ${eY}`);
                tempArrowPreview.setAttribute('class', 'arrow-preview-path');
                tempArrowPreview.setAttribute('marker-end', 'url(#arrowhead-selected)');
                arrowLayer.appendChild(tempArrowPreview);
                
                applyState();
            } else {
                arrowEndPoint = { x: px, y: py };
                tempArrowEndCircle.style.left = `${px}%`;
                tempArrowEndCircle.style.top = `${py}%`;
                
                const w = mapContainer.offsetWidth;
                const h = mapContainer.offsetHeight;
                const sX = (arrowStartPoint.x / 100) * w;
                const sY = (arrowStartPoint.y / 100) * h;
                const eX = (arrowEndPoint.x / 100) * w;
                const eY = (arrowEndPoint.y / 100) * h;
                const dx2 = eX - sX;
                const dy2 = eY - sY;
                const dist2 = Math.sqrt(dx2*dx2 + dy2*dy2);
                let nx2 = 0, ny2 = 0;
                if (dist2 > 0) { nx2 = -dy2 / dist2; ny2 = dx2 / dist2; }
                const cX = sX + dx2 * 0.5 + nx2 * dist2 * 0.2;
                const cY = sY + dy2 * 0.5 + ny2 * dist2 * 0.2;
                
                if (tempArrowPreview) {
                    tempArrowPreview.setAttribute('d', `M ${sX} ${sY} Q ${cX} ${cY} ${eX} ${eY}`);
                }
                applyState();
            }
        }
    });

    // --- Modal Logic ---
    function openPinModal(id = null, x = 0, y = 0) {
        editingPinId = id;
        editingPinCoords = { x, y };
        
        if (id !== null) {
            const pin = customPins.find(p => p.id === id);
            pinText.value = pin ? pin.text : '';
            modalTitle.textContent = 'ピンの編集';
            btnPinDelete.style.display = 'block';
        } else {
            pinText.value = '';
            modalTitle.textContent = '新規ピン追加';
            btnPinDelete.style.display = 'none';
        }
        
        pinModal.classList.remove('hidden');
        setTimeout(() => pinText.focus(), 100);
    }

    function closePinModal() {
        pinModal.classList.add('hidden');
        if (tempPinCircle) {
            tempPinCircle.remove();
            tempPinCircle = null;
        }
    }

    btnPinSave.addEventListener('click', () => {
        const text = pinText.value.trim();
        if (!text) return;

        if (editingPinId !== null) {
            const pin = customPins.find(p => p.id === editingPinId);
            if (pin) pin.text = text;
        } else {
            const id = Date.now();
            customPins.push({
                id,
                x: editingPinCoords.x,
                y: editingPinCoords.y,
                text
            });
        }
        
        saveData();
        renderCustomPins();
        closePinModal();
    });

    btnPinDelete.addEventListener('click', () => {
        if (editingPinId !== null) {
            customPins = customPins.filter(p => p.id !== editingPinId);
            // Delete related arrows
            arrows = arrows.filter(a => !(a.sx === editingPinCoords.x && a.sy === editingPinCoords.y) && !(a.ex === editingPinCoords.x && a.ey === editingPinCoords.y));
            saveData();
            renderCustomPins();
            renderArrows();
        }
        closePinModal();
    });

    btnPinCancel.addEventListener('click', closePinModal);

    // Enter key support for modal
    pinText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnPinSave.click();
        }
    });

    // Global ESC key support
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (currentTool === 'arrow') {
                if (arrowEndPoint) {
                    // 終点をキャンセル
                    if (tempArrowEndCircle) { tempArrowEndCircle.remove(); tempArrowEndCircle = null; }
                    if (tempArrowPreview) { tempArrowPreview.remove(); tempArrowPreview = null; }
                    arrowEndPoint = null;
                    
                    if (tempArrowCircle) {
                        const startActions = tempArrowCircle.querySelector('.pin-actions');
                        if (startActions) startActions.style.display = '';
                    }
                } else if (arrowStartPoint) {
                    // 始点をキャンセル
                    if (tempArrowCircle) { tempArrowCircle.remove(); tempArrowCircle = null; }
                    arrowStartPoint = null;
                }
            }
            // ピン編集モーダルが開いている場合は閉じる（ついでにUX向上）
            if (!pinModal.classList.contains('hidden')) {
                closePinModal();
            }
        }
    });

    // --- Tool Selection ---
    function selectTool(tool) {
        currentTool = tool;
        toolBtns.forEach(b => b.classList.remove('active'));
        if (tool === 'move') btnToolMove.classList.add('active');
        if (tool === 'pin') btnToolPin.classList.add('active');
        if (tool === 'arrow') btnToolArrow.classList.add('active');

        if (tempPinCircle) {
            tempPinCircle.remove();
            tempPinCircle = null;
        }
        if (tempArrowCircle) {
            tempArrowCircle.remove();
            tempArrowCircle = null;
        }
        if (tempArrowEndCircle) {
            tempArrowEndCircle.remove();
            tempArrowEndCircle = null;
        }
        if (tempArrowPreview) {
            tempArrowPreview.remove();
            tempArrowPreview = null;
        }
        arrowStartPoint = null;
        arrowEndPoint = null;
        
        // ツール切り替え時に選択解除
        selectedObject = null;
        renderArrows();
        
        scene.style.cursor = tool === 'move' ? 'grab' : 'crosshair';
    }

    btnToolMove.addEventListener('click', () => selectTool('move'));
    btnToolPin.addEventListener('click', () => selectTool('pin'));
    btnToolArrow.addEventListener('click', () => selectTool('arrow'));

    // --- Buttons ---
    btnTopdown.addEventListener('click', () => loadPreset('topdown', btnTopdown));
    btnBirdseye.addEventListener('click', () => loadPreset('birdseye', btnBirdseye));
    btnHuman.addEventListener('click', () => loadPreset('human', btnHuman));
    
    btnReset.addEventListener('click', () => {
        const active = allModeBtns.find(b => b.classList.contains('active'));
        if (active === btnTopdown) loadPreset('topdown', btnTopdown);
        else if (active === btnBirdseye) loadPreset('birdseye', btnBirdseye);
        else loadPreset('human', btnHuman);
    });

    btnShare.addEventListener('click', () => {
        const data = {
            state: state,
            pins: customPins,
            arrows: arrows
        };
        const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
        const url = new URL(window.location.href);
        url.hash = encoded;
        
        navigator.clipboard.writeText(url.toString()).then(() => {
            showToast('共有URLをコピーしました！');
        }).catch(err => {
            console.error(err);
            showToast('コピーに失敗しました');
        });
    });

    let clearTimer;
    let isClearConfirm = false;
    btnToolClear.addEventListener('click', () => {
        if (isClearConfirm) {
            customPins = JSON.parse(JSON.stringify(DEFAULT_PINS));
            arrows = [];
            selectedObject = null;
            saveData();
            history.replaceState(null, null, window.location.pathname); // URLを完全にクリアする
            renderCustomPins();
            renderArrows();
            isClearConfirm = false;
            btnToolClear.style.color = '';
            showToast('すべて消去しました');
        } else {
            isClearConfirm = true;
            btnToolClear.style.color = '#ff4646'; // 赤色にして警告
            showToast('もう一度クリックですべて消去します');
            clearTimeout(clearTimer);
            clearTimer = setTimeout(() => {
                isClearConfirm = false;
                btnToolClear.style.color = '';
            }, 3000);
        }
    });

    // Initialize
    loadData();
    if (!window.location.hash) {
        loadPreset('human', btnHuman);
    }

    // データロード後にマップの初期化とレンダリングを行う
    if (mapImage.complete) {
        initMap();
    } else {
        mapImage.addEventListener('load', initMap);
    }
});

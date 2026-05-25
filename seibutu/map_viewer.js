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
    async function loadData() {
        let loaded = false;
        if (window.location.hash) {
            try {
                let encoded = window.location.hash.substring(1);
                let data;
                if (encoded.startsWith('v3_')) {
                    encoded = encoded.substring(3);
                    const binary = atob(encoded);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    const stream = new Blob([bytes]).stream();
                    const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
                    const decompressedBytes = await new Response(decompressedStream).arrayBuffer();
                    data = JSON.parse(new TextDecoder().decode(decompressedBytes));
                } else if (encoded.startsWith('v2_')) {
                    encoded = encoded.substring(3);
                    const binary = atob(encoded);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    data = JSON.parse(new TextDecoder().decode(bytes));
                } else {
                    data = JSON.parse(decodeURIComponent(atob(encoded)));
                }

                // Restore old format or new short format
                if (data.state) state = { ...state, ...data.state };
                else if (data.s) {
                    state.x = data.s[0]; state.y = data.s[1]; state.z = data.s[2];
                    state.rotateX = data.s[3]; state.rotateZ = data.s[4]; state.scale = data.s[5];
                }

                if (data.pins) customPins = data.pins;
                else if (data.p) {
                    customPins = data.p.map(p => ({ id: p[0], text: p[1], x: p[2], y: p[3], isFlat: !!p[4] }));
                }

                if (data.arrows) arrows = data.arrows;
                else if (data.a) {
                    arrows = data.a.map(a => ({ sx: a[0], sy: a[1], ex: a[2], ey: a[3], cx: a[4], cy: a[5] }));
                }

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
        pushHistory();
    }

    let historyStack = [];
    let historyIndex = -1;
    let isRestoringHistory = false;

    function pushHistory() {
        if (isRestoringHistory) return;
        historyStack.length = historyIndex + 1;
        historyStack.push({
            pins: JSON.stringify(customPins),
            arrows: JSON.stringify(arrows),
            selectedObject: JSON.stringify(selectedObject)
        });
        if (historyStack.length > 50) {
            historyStack.shift();
        } else {
            historyIndex++;
        }
    }

    function cancelTempUI() {
        let canceled = false;
        if (tempArrowCircle) { tempArrowCircle.remove(); tempArrowCircle = null; canceled = true; }
        if (tempArrowEndCircle) { tempArrowEndCircle.remove(); tempArrowEndCircle = null; canceled = true; }
        if (tempArrowPreview) { tempArrowPreview.remove(); tempArrowPreview = null; canceled = true; }
        if (arrowStartPoint || arrowEndPoint) {
            arrowStartPoint = null;
            arrowEndPoint = null;
            canceled = true;
        }
        if (tempPinCircle) { tempPinCircle.remove(); tempPinCircle = null; canceled = true; }
        return canceled;
    }

    function undo() {
        if (cancelTempUI()) return; // 作成中ならキャンセルのみ行う

        if (historyIndex > 0) {
            historyIndex--;
            restoreHistory();
        }
    }

    function redo() {
        if (cancelTempUI()) return; // 作成中ならキャンセルのみ行う

        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            restoreHistory();
        }
    }

    function restoreHistory() {
        isRestoringHistory = true;

        cancelTempUI(); // 安全のためのクリア

        const state = historyStack[historyIndex];
        customPins = JSON.parse(state.pins);
        arrows = JSON.parse(state.arrows);
        selectedObject = JSON.parse(state.selectedObject);
        saveData();
        renderCustomPins();
        renderArrows();
        isRestoringHistory = false;
    }

    function saveData() {
        const data = { pins: customPins, arrows };
        localStorage.setItem('hit2_map_data', JSON.stringify(data));
        pushHistory();
    }

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedObject) {
                if (selectedObject.type === 'pin') {
                    customPins = customPins.filter(p => p.id !== selectedObject.id);
                } else if (selectedObject.type === 'arrow') {
                    arrows.splice(selectedObject.id, 1);
                }
                selectedObject = null;
                saveData();
                renderCustomPins();
                renderArrows();
            }
        } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undo();
        } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo();
        }
    });

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
                editBtn.addEventListener('pointerdown', (de) => {
                    de.stopPropagation();
                    openPinModal(p.id);
                });

                const delBtn = document.createElement('div');
                delBtn.className = 'pin-action-btn delete';
                delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
                delBtn.title = '削除';
                delBtn.addEventListener('pointerdown', (de) => {
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

            el.addEventListener('pointerdown', (e) => {
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
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    
                    if (!isDragged && wasSelected) {
                        // 既に選択済みの状態でのクリック時のみ、垂直・水平をトグルする
                        p.isFlat = !p.isFlat;
                        renderCustomPins();
                    }
                    saveData();
                };
                
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
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
            
            g.addEventListener('pointerdown', (e) => {
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
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    saveData();
                };
                
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
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
                        delBtn.addEventListener('pointerdown', (de) => {
                            de.stopPropagation();
                            arrows.splice(idx, 1);
                            selectedObject = null;
                            saveData();
                            renderArrows();
                        });
                        handle.appendChild(delBtn);
                    }
                    
                    handle.addEventListener('pointerdown', (e) => {
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
                            window.removeEventListener('pointermove', onMove);
                            window.removeEventListener('pointerup', onUp);
                            saveData();
                            renderArrows();
                        };
                        
                        window.addEventListener('pointermove', onMove);
                        window.addEventListener('pointerup', onUp);
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
    const activePointers = new Map();
    let dragMode = null; 
    let startStateX, startStateY, startStateRotZ, startStateRotX, startStateZ;
    let initialPinchDist = null;
    let initialPinchAngle = null;
    let initialPanX = null, initialPanY = null;

    scene.addEventListener('contextmenu', e => e.preventDefault());

    scene.addEventListener('pointerdown', (e) => {
        if (currentTool !== 'move') return;

        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 1) {
            // 単一タップ（パン操作、または右クリック回転）
            if (e.pointerType === 'mouse' && e.button === 2) {
                dragMode = 'rotate';
            } else {
                dragMode = 'pan';
            }
            initialPanX = e.clientX;
            initialPanY = e.clientY;
            
            startStateX = state.x;
            startStateY = state.y;
            startStateRotZ = state.rotateZ;
            startStateRotX = state.rotateX;
            
        } else if (activePointers.size === 2) {
            // 2本指タップ（ピンチズーム・回転・パン）
            dragMode = 'pinch';
            const pts = Array.from(activePointers.values());
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            initialPinchDist = Math.sqrt(dx*dx + dy*dy);
            initialPinchAngle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            initialPanX = (pts[0].x + pts[1].x) / 2;
            initialPanY = (pts[0].y + pts[1].y) / 2;

            startStateX = state.x;
            startStateY = state.y;
            startStateZ = state.z;
            startStateRotZ = state.rotateZ;
        }

        camera.classList.remove('animating');
        
        // Deselect object if dragging map
        if (selectedObject !== null) {
            selectedObject = null;
            renderCustomPins();
            renderArrows();
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 1 && (dragMode === 'pan' || dragMode === 'rotate')) {
            const deltaX = e.clientX - initialPanX;
            const deltaY = e.clientY - initialPanY;

            if (dragMode === 'pan') {
                const rad = state.rotateZ * Math.PI / 180;
                const apparentScale = 1200 / Math.max(100, (1200 - state.z));
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
            
        } else if (activePointers.size === 2 && dragMode === 'pinch') {
            const pts = Array.from(activePointers.values());
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            // ピンチズーム
            if (initialPinchDist > 0) {
                const scaleDiff = dist / initialPinchDist;
                let newZ = 1200 - (1200 - startStateZ) / scaleDiff;
                newZ = Math.max(-4000, Math.min(1000, newZ));
                state.z = newZ;
            }

            // 回転
            let angleDiff = angle - initialPinchAngle;
            if (angleDiff > 180) angleDiff -= 360;
            if (angleDiff < -180) angleDiff += 360;
            state.rotateZ = startStateRotZ + angleDiff;

            // パン処理（2本指の中心の移動量）
            const currentPanX = (pts[0].x + pts[1].x) / 2;
            const currentPanY = (pts[0].y + pts[1].y) / 2;
            const deltaX = currentPanX - initialPanX;
            const deltaY = currentPanY - initialPanY;
            
            const rad = state.rotateZ * Math.PI / 180;
            const apparentScale = 1200 / Math.max(100, (1200 - state.z));
            const panSpeed = 1.0 / apparentScale;
            const moveX = (deltaX * Math.cos(-rad) - deltaY * Math.sin(-rad)) * panSpeed;
            const moveY = (deltaX * Math.sin(-rad) + deltaY * Math.cos(-rad)) * panSpeed;
            const tiltCorrection = Math.max(1, Math.cos(state.rotateX * Math.PI / 180));

            state.x = startStateX + moveX;
            state.y = startStateY + (moveY / tiltCorrection);

            allModeBtns.forEach(b => b.classList.remove('active'));
            applyState();
        }
    });

    const pointerEnd = (e) => {
        activePointers.delete(e.pointerId);
        if (activePointers.size === 0) {
            dragMode = null;
        } else if (activePointers.size === 1) {
            const pts = Array.from(activePointers.values());
            initialPanX = pts[0].x;
            initialPanY = pts[0].y;
            startStateX = state.x;
            startStateY = state.y;
            dragMode = 'pan';
        }
    };

    window.addEventListener('pointerup', pointerEnd);
    window.addEventListener('pointercancel', pointerEnd);
    window.addEventListener('pointerleave', pointerEnd);

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
    mapImage.addEventListener('pointerdown', (e) => {
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
                
                tempPinCircle.addEventListener('pointerdown', (ce) => {
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
                circleElem.addEventListener('pointerdown', (e) => {
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
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                    };
                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
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
                delBtn.addEventListener('pointerdown', (de) => {
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
                okBtn.addEventListener('pointerdown', (de) => {
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
                delBtn.addEventListener('pointerdown', (de) => {
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

    btnShare.addEventListener('click', async () => {
        const shortData = {
            s: [Math.round(state.x), Math.round(state.y), Math.round(state.z), Math.round(state.rotateX), Math.round(state.rotateZ), state.scale],
            p: customPins.map(p => [p.id, p.text, Math.round(p.x*10)/10, Math.round(p.y*10)/10, p.isFlat ? 1 : 0]),
            a: arrows.map(a => [Math.round(a.sx*10)/10, Math.round(a.sy*10)/10, Math.round(a.ex*10)/10, Math.round(a.ey*10)/10, Math.round(a.cx*10)/10, Math.round(a.cy*10)/10])
        };
        const jsonStr = JSON.stringify(shortData);
        
        const stream = new Blob([jsonStr]).stream();
        const compressedStream = stream.pipeThrough(new CompressionStream('deflate-raw'));
        const compressedBytes = new Uint8Array(await new Response(compressedStream).arrayBuffer());
        
        let binary = '';
        for (let i = 0; i < compressedBytes.length; i++) binary += String.fromCharCode(compressedBytes[i]);
        const encoded = 'v3_' + btoa(binary);

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
    async function init() {
        await loadData();
        if (!window.location.hash) {
            loadPreset('human', btnHuman);
        }

        // データロード後にマップの初期化とレンダリングを行う
        if (mapImage.complete) {
            initMap();
        } else {
            mapImage.addEventListener('load', initMap);
        }
    }
    
    init();
});

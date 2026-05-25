document.addEventListener('DOMContentLoaded', () => {
    const scene = document.getElementById('scene');
    const camera = document.getElementById('camera');
    const mapImage = document.getElementById('map-image');
    const mapContainer = document.getElementById('map-container');

    // UI Buttons
    const btnTopdown = document.getElementById('btn-topdown');
    const btnBirdseye = document.getElementById('btn-birdseye');
    const btnHuman = document.getElementById('btn-human');
    const btnReset = document.getElementById('btn-reset');
    const allModeBtns = [btnTopdown, btnBirdseye, btnHuman];

    // Camera state
    let state = {
        x: 0,           // Translate X (Pan)
        y: 0,           // Translate Y (Pan)
        z: 0,           // Translate Z (Zoom offset)
        rotateX: 70,    // Tilt (0 = topdown, 70 = human)
        rotateZ: 0,     // Rotation around Z axis
        scale: 1.0      // Zoom scale
    };

    // Preset configurations
    // ※scale()を使うとブラウザのCSS3D計算でビルボードが歪むバグがあるため、
    // ズームはZ軸の移動(z)で表現し、scaleは常に1.0に固定します。
    const PRESETS = {
        topdown: { rotateX: 0, rotateZ: 0, scale: 1.0, x: 0, y: 0, z: -2500 },
        birdseye: { rotateX: 45, rotateZ: 45, scale: 1.0, x: 0, y: 0, z: -1800 },
        human: { rotateX: 70, rotateZ: 0, scale: 1.0, x: 0, y: 100, z: -1000 } // 手前から奥を見る
    };

    // マーカーの配置設定 (パーセンテージ)
    // 画像の実際の拠点位置に合わせて、数値を変更することで簡単に微調整できます
    const MARKERS = [
        { id: 'own_left', label: '自陣左', top: 73, left: 42 },
        { id: 'own_right', label: '自陣右', top: 73, left: 58 },
        { id: 'enemy_left', label: '敵陣左', top: 27, left: 32 },
        { id: 'enemy_right', label: '敵陣右', top: 27, left: 68 },
        { id: 'center_left', label: '中央左', top: 50, left: 36 },
        { id: 'center', label: '中央', top: 50, left: 50 },
        { id: 'center_right', label: '中央右', top: 50, left: 64 }
    ];

    // マーカーの生成
    function createMarkers() {
        MARKERS.forEach(m => {
            const el = document.createElement('div');
            el.className = 'marker';
            el.id = `marker-${m.id}`;
            el.textContent = m.label;
            el.style.top = `${m.top}%`;
            el.style.left = `${m.left}%`;
            mapContainer.appendChild(el);
        });
    }

    // 初期化処理（画像サイズ合わせとマーカー生成）
    function initMap() {
        const w = mapImage.naturalWidth;
        const h = mapImage.naturalHeight;

        // naturalWidthが0の場合はまだロードされていない
        if (w === 0) return;

        mapContainer.style.width = `${w}px`;
        mapContainer.style.height = `${h}px`;
        mapContainer.style.left = `-${w / 2}px`;
        mapContainer.style.top = `-${h / 2}px`;

        // マーカーの生成（重複生成を防ぐために一度コンテナ内をクリアする、画像以外）
        const existingMarkers = mapContainer.querySelectorAll('.marker');
        existingMarkers.forEach(m => m.remove());
        createMarkers();

        // 初期状態の適用
        applyState(true);
    }

    // 画像がロードされたら初期化
    if (mapImage.complete) {
        initMap();
    } else {
        mapImage.addEventListener('load', initMap);
    }

    // --- State Management ---
    function applyState(animate = false) {
        if (animate) {
            camera.classList.add('animating');
            setTimeout(() => camera.classList.remove('animating'), 800);
        }

        // CSS Transformの組み立て
        // 1. Z軸平行移動(ズーム) 2. X軸回転(傾き) 3. Z軸回転(旋回) 4. XY平行移動(パン) 5. スケール
        // ※scaleではなくscale3dを使うことで、Z軸も均等にスケールされマーカーの縦伸び(歪み)を防ぐ
        camera.style.transform = `
            translateZ(${state.z}px)
            rotateX(${state.rotateX}deg)
            rotateZ(${state.rotateZ}deg)
            translate3d(${state.x}px, ${state.y}px, 0)
            scale3d(${state.scale}, ${state.scale}, ${state.scale})
        `;

        // マーカーを常に正面（画面と平行）に向けるビルボード処理
        // カメラの回転 (rotateX -> rotateZ) を完全に打ち消すため、逆順で逆回転 (rotateZ -> rotateX) をかけます
        const markers = document.querySelectorAll('.marker');
        markers.forEach(m => {
            // 中心をアンカー( -50%, -50% )にしつつ、Z方向に40px浮かせることで地面へのめり込みを防ぐ
            m.style.transform = `translate(-50%, -50%) translateZ(40px) rotateZ(${-state.rotateZ}deg) rotateX(${-state.rotateX}deg)`;
        });
    }

    function setActiveBtn(activeBtn) {
        allModeBtns.forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    function loadPreset(presetKey, btn) {
        const p = PRESETS[presetKey];
        state = { ...state, ...p };
        setActiveBtn(btn);
        applyState(true);
    }

    // --- Input Handling ---
    let isDragging = false;
    let dragMode = null; // 'pan' (left) or 'rotate' (right)
    let startX, startY;
    let startStateX, startStateY, startStateRotZ, startStateRotX;

    // 右クリックメニューを無効化
    scene.addEventListener('contextmenu', e => e.preventDefault());

    scene.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        // 左クリック = 0, 右クリック = 2, 中クリック = 1
        if (e.button === 0 || e.button === 1) {
            dragMode = 'pan';
        } else if (e.button === 2) {
            dragMode = 'rotate';
        }

        startStateX = state.x;
        startStateY = state.y;
        startStateRotZ = state.rotateZ;
        startStateRotX = state.rotateX;

        // アニメーション中なら強制解除して即時反映させる
        camera.classList.remove('animating');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (dragMode === 'pan') {
            // 回転角に応じてパンの方向を補正する
            const rad = state.rotateZ * Math.PI / 180;

            // パンの速度係数（Z軸距離による見かけのスケールに応じて調整）
            const apparentScale = 1200 / Math.max(100, (1200 - state.z));
            const panSpeed = 1.5 / apparentScale;

            // 回転を考慮した移動量の計算
            const moveX = (deltaX * Math.cos(-rad) - deltaY * Math.sin(-rad)) * panSpeed;
            const moveY = (deltaX * Math.sin(-rad) + deltaY * Math.cos(-rad)) * panSpeed;

            // X軸の傾き（rotateX）が強いとY軸のパンが画面上で遅く感じるため補正
            const tiltCorrection = Math.max(1, Math.cos(state.rotateX * Math.PI / 180));

            state.x = startStateX + moveX;
            state.y = startStateY + (moveY / tiltCorrection);

            // マニュアル操作したのでボタンのアクティブ状態を外す
            allModeBtns.forEach(b => b.classList.remove('active'));

        } else if (dragMode === 'rotate') {
            const rotSpeed = 0.5;
            state.rotateZ = startStateRotZ + (deltaX * rotSpeed);

            // X軸回転（傾き）の制限 0〜85度
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

    // マウスが画面外に出た時の処理
    window.addEventListener('mouseleave', () => {
        isDragging = false;
        dragMode = null;
    });

    // ズーム（ホイール）
    scene.addEventListener('wheel', (e) => {
        e.preventDefault();

        const zoomSpeed = 150; // Z軸の移動量
        const direction = e.deltaY > 0 ? -1 : 1;

        // scaleの代わりにZ軸を前後させてズームを表現
        let newZ = state.z + (direction * zoomSpeed);

        // 制限（遠すぎず、カメラを突き抜けないように）
        newZ = Math.max(-4000, Math.min(1000, newZ));
        state.z = newZ;

        allModeBtns.forEach(b => b.classList.remove('active'));
        applyState();
    }, { passive: false });


    // --- Button Event Listeners ---
    btnTopdown.addEventListener('click', () => loadPreset('topdown', btnTopdown));
    btnBirdseye.addEventListener('click', () => loadPreset('birdseye', btnBirdseye));
    btnHuman.addEventListener('click', () => loadPreset('human', btnHuman));
    btnReset.addEventListener('click', () => {
        // 現在アクティブなモードがあればそれをリセット、なければ人間目線
        const active = allModeBtns.find(b => b.classList.contains('active'));
        if (active === btnTopdown) loadPreset('topdown', btnTopdown);
        else if (active === btnBirdseye) loadPreset('birdseye', btnBirdseye);
        else loadPreset('human', btnHuman);
    });

    // Initialize (Start with Human view)
    loadPreset('human', btnHuman);
});

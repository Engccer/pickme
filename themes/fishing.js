// 낚시 테마 - 3D 낚시 애니메이션

async function runFishingAnimation(canvas, selectedStudents, addPickedStudent) {
    return new Promise((resolve) => {
        // Three.js 씬 설정
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e3a8a);
        scene.fog = new THREE.Fog(0x1e3a8a, 10, 50);

        const camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.set(0, 8, 15);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;

        // 조명
        const ambientLight = new THREE.AmbientLight(0x4a90e2, 0.6);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(10, 20, 5);
        sunLight.castShadow = true;
        scene.add(sunLight);

        const waterLight = new THREE.PointLight(0x00ffff, 0.5);
        waterLight.position.set(0, -5, 0);
        scene.add(waterLight);

        // 물 표면
        const waterGeometry = new THREE.PlaneGeometry(50, 50, 50, 50);
        const waterMaterial = new THREE.MeshPhongMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.7,
            shininess: 100,
            side: THREE.DoubleSide
        });
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0;
        water.receiveShadow = true;
        scene.add(water);

        // 물결 효과를 위한 정점 저장
        const waterVertices = waterGeometry.attributes.position;

        // 바닥 (모래)
        const sandGeometry = new THREE.PlaneGeometry(50, 50);
        const sandMaterial = new THREE.MeshPhongMaterial({
            color: 0xc2b280
        });
        const sand = new THREE.Mesh(sandGeometry, sandMaterial);
        sand.rotation.x = -Math.PI / 2;
        sand.position.y = -8;
        sand.receiveShadow = true;
        scene.add(sand);

        // 낚싯대
        const rodGroup = new THREE.Group();

        // 낚싯대 막대
        const rodGeometry = new THREE.CylinderGeometry(0.1, 0.15, 8, 8);
        const rodMaterial = new THREE.MeshPhongMaterial({
            color: 0x8b4513
        });
        const rod = new THREE.Mesh(rodGeometry, rodMaterial);
        rod.position.y = 10;
        rod.rotation.z = Math.PI / 6;
        rodGroup.add(rod);

        // 낚싯줄
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 2
        });
        const lineGeometry = new THREE.BufferGeometry();
        const linePositions = new Float32Array([
            2, 14, 0,  // 낚싯대 끝
            0, 0, 0    // 미끼 위치
        ]);
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        const line = new THREE.Line(lineGeometry, lineMaterial);
        rodGroup.add(line);

        // 미끼/낚시바늘
        const hookGeometry = new THREE.SphereGeometry(0.2, 16, 16);
        const hookMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });
        const hook = new THREE.Mesh(hookGeometry, hookMaterial);
        hook.position.set(0, 2, 0);
        rodGroup.add(hook);

        scene.add(rodGroup);

        // 물고기들 생성
        const fishes = [];
        const fishColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0xa8e6cf, 0xff8b94, 0xffd3b6];

        for (let i = 0; i < 25; i++) {
            const fishGroup = new THREE.Group();

            // 물고기 몸체
            const bodyGeometry = new THREE.SphereGeometry(0.4, 16, 16);
            bodyGeometry.scale(1.5, 1, 0.8);
            const bodyMaterial = new THREE.MeshPhongMaterial({
                color: fishColors[i % fishColors.length],
                shininess: 80
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            fishGroup.add(body);

            // 꼬리
            const tailGeometry = new THREE.ConeGeometry(0.3, 0.6, 8);
            const tailMaterial = new THREE.MeshPhongMaterial({
                color: fishColors[i % fishColors.length],
                shininess: 80
            });
            const tail = new THREE.Mesh(tailGeometry, tailMaterial);
            tail.rotation.z = Math.PI / 2;
            tail.position.x = -0.7;
            fishGroup.add(tail);

            // 초기 위치 (물속 랜덤 배치)
            fishGroup.position.x = (Math.random() - 0.5) * 20;
            fishGroup.position.y = -Math.random() * 6 - 1;
            fishGroup.position.z = (Math.random() - 0.5) * 20;

            fishGroup.userData.speed = Math.random() * 0.02 + 0.01;
            fishGroup.userData.direction = Math.random() * Math.PI * 2;
            fishGroup.userData.tailSwing = 0;

            scene.add(fishGroup);
            fishes.push(fishGroup);
        }

        // 애니메이션 상태
        let hookY = 2;
        let hookTargetY = 2;
        let isCasting = false;
        let isReeling = false;
        let caughtFish = null;
        let currentPickIndex = 0;
        let waitTime = 0;
        let cycleTime = 0; // 전체 사이클 경과 시간
        const maxCycleTime = 360; // 약 6초 (60fps 기준)

        let messageElement = document.querySelector('.animation-message');

        // 메시지 업데이트
        function updateMessage(message) {
            if (messageElement) {
                messageElement.textContent = message;
            }
        }

        updateMessage('낚시를 시작합니다...');

        // 물결 애니메이션
        function animateWater(time) {
            for (let i = 0; i < waterVertices.count; i++) {
                const x = waterVertices.getX(i);
                const z = waterVertices.getZ(i);
                const y = Math.sin(x * 0.5 + time * 0.001) * 0.3 +
                         Math.cos(z * 0.5 + time * 0.0015) * 0.2;
                waterVertices.setY(i, y);
            }
            waterVertices.needsUpdate = true;
        }

        // 물고기 헤엄치기
        function animateFishes() {
            fishes.forEach(fish => {
                if (fish === caughtFish) return;

                // 이동
                fish.position.x += Math.cos(fish.userData.direction) * fish.userData.speed;
                fish.position.z += Math.sin(fish.userData.direction) * fish.userData.speed;

                // 경계에 닿으면 방향 전환
                if (Math.abs(fish.position.x) > 10 || Math.abs(fish.position.z) > 10) {
                    fish.userData.direction += Math.PI + (Math.random() - 0.5) * 0.5;
                }

                // 랜덤 방향 변경
                if (Math.random() < 0.01) {
                    fish.userData.direction += (Math.random() - 0.5) * 0.5;
                }

                // 회전 (헤엄치는 방향)
                fish.rotation.y = -fish.userData.direction + Math.PI / 2;

                // 꼬리 흔들기
                fish.userData.tailSwing += 0.1;
                if (fish.children[1]) {
                    fish.children[1].rotation.y = Math.sin(fish.userData.tailSwing) * 0.3;
                }

                // 위아래 움직임
                fish.position.y += Math.sin(fish.userData.tailSwing * 0.5) * 0.005;
            });
        }

        // 낚시 로직
        function castHook() {
            isCasting = true;
            hookTargetY = -Math.random() * 4 - 1;
            updateMessage('낚시대를 던졌습니다...');
        }

        function checkCatch() {
            // 가까운 물고기 찾기
            let closestFish = null;
            let closestDistance = Infinity;

            fishes.forEach(fish => {
                if (fish === caughtFish) return;

                const distance = hook.position.distanceTo(fish.position);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestFish = fish;
                }
            });

            // 5초 경과하거나 물고기가 가까이 있으면 잡기
            const shouldCatch = closestFish && (
                cycleTime >= maxCycleTime - 60 || // 5초 경과 시 강제 잡기
                (closestDistance < 1.5 && Math.random() < 0.2)
            );

            if (shouldCatch) {
                caughtFish = closestFish;
                isReeling = true;
                isCasting = false;

                const student = selectedStudents[currentPickIndex];
                updateMessage(`${student.name} 학생을 선발했습니다!`);

                // 실시간 학생 표시
                if (addPickedStudent) {
                    addPickedStudent(student);
                }

                soundManager.playFishingCatch();

                // 물고기 색상 변경 (반짝임)
                caughtFish.children[0].material.emissive.setHex(0xffff00);
                caughtFish.children[0].material.emissiveIntensity = 0.5;
            }
        }

        function updateHook() {
            // 미끼 위치 업데이트
            if (isCasting) {
                hookY += (hookTargetY - hookY) * 0.08;

                if (Math.abs(hookY - hookTargetY) < 0.1) {
                    isCasting = false;
                }
            }

            if (isReeling) {
                hookY += (10 - hookY) * 0.06;

                if (hookY > 9) {
                    // 물고기 잡기 완료
                    scene.remove(caughtFish);
                    caughtFish = null;
                    isReeling = false;
                    currentPickIndex++;

                    if (currentPickIndex >= selectedStudents.length) {
                        // 모든 선발 완료
                        updateMessage('선발 완료!');
                        setTimeout(() => {
                            cleanup();
                            resolve();
                        }, 2000);
                    } else {
                        // 다음 낚시
                        waitTime = 0;
                        cycleTime = 0; // 사이클 타이머 리셋
                    }
                }
            }

            hook.position.y = hookY;

            // 미끼 흔들림
            hook.position.x = Math.sin(Date.now() * 0.005) * 0.3;
            hook.position.z = Math.cos(Date.now() * 0.005) * 0.3;

            // 낚싯줄 업데이트
            const linePos = line.geometry.attributes.position;
            linePos.setXYZ(0, 2, 14, 0);
            linePos.setXYZ(1, hook.position.x, hook.position.y, hook.position.z);
            linePos.needsUpdate = true;
        }

        function updateCaughtFish() {
            if (caughtFish) {
                // 잡힌 물고기는 미끼를 따라감
                caughtFish.position.lerp(hook.position, 0.1);

                // 회전
                caughtFish.rotation.x += 0.05;
                caughtFish.rotation.z += 0.03;
            }
        }

        // 애니메이션 루프
        function animate() {
            const time = Date.now();

            animateWater(time);
            animateFishes();
            updateHook();
            updateCaughtFish();

            // 일시 중지 확인
            if (window.AppState && window.AppState.isPaused) {
                requestAnimationFrame(animate);
                return;
            }

            // 강제 중지 확인
            if (window.AppState && window.AppState.shouldStop) {
                cleanup();
                resolve();
                return;
            }

            // 사이클 타이머 증가
            cycleTime++;

            // 6초 경과 시 강제로 물고기 잡기
            if (cycleTime >= maxCycleTime && !caughtFish && !isReeling) {
                // 가장 가까운 물고기 강제 잡기
                let closestFish = null;
                let closestDistance = Infinity;
                fishes.forEach(fish => {
                    const dist = hook.position.distanceTo(fish.position);
                    if (dist < closestDistance) {
                        closestDistance = dist;
                        closestFish = fish;
                    }
                });

                if (closestFish) {
                    caughtFish = closestFish;
                    isReeling = true;
                    isCasting = false;

                    const student = selectedStudents[currentPickIndex];
                    updateMessage(`${student.name} 학생을 선발했습니다!`);

                    if (addPickedStudent) {
                        addPickedStudent(student);
                    }

                    soundManager.playFishingCatch();
                    caughtFish.children[0].material.emissive.setHex(0xffff00);
                    caughtFish.children[0].material.emissiveIntensity = 0.5;
                }
            }

            // 낚시 상태 관리
            if (!isCasting && !isReeling && !caughtFish) {
                waitTime++;

                if (waitTime > 30) { // 약 0.5초 대기
                    castHook();
                    waitTime = 0;
                }
            }

            if (!isReeling && hookY < 0) {
                checkCatch();
            }

            // 조명 효과
            waterLight.intensity = 0.5 + Math.sin(time * 0.002) * 0.2;

            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        }

        // 정리 함수
        function cleanup() {
            scene.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            renderer.dispose();
        }

        // 창 크기 조절
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);

            // 모바일 반응형: 화면 크기에 따라 카메라 위치 조정
            if (window.innerWidth <= 768) {
                camera.position.set(0, 10, 18);  // 더 멀리서, 더 높이서 보기
            } else {
                camera.position.set(0, 8, 15);   // 기본 위치
            }
            camera.lookAt(0, 0, 0);
        }
        window.addEventListener('resize', onWindowResize);

        // 초기 카메라 위치 설정
        onWindowResize();

        // 애니메이션 시작
        animate();
    });
}

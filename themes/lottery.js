// 로또 테마 - 3D 공이 튀어나오는 애니메이션

async function runLotteryAnimation(canvas, selectedStudents, addPickedStudent) {
    return new Promise((resolve) => {
        // Three.js 씬 설정
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0f172a);

        const camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.set(0, 5, 12);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;

        // 조명
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);

        const spotLight = new THREE.SpotLight(0xffffff, 1.5);
        spotLight.position.set(0, 15, 10);
        spotLight.castShadow = true;
        spotLight.angle = Math.PI / 4;
        scene.add(spotLight);

        const pointLight1 = new THREE.PointLight(0x00ffff, 1);
        pointLight1.position.set(-10, 5, 5);
        scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xff00ff, 1);
        pointLight2.position.set(10, 5, 5);
        scene.add(pointLight2);

        // 로또 기계 (투명 구)
        const machineGroup = new THREE.Group();

        // 바닥
        const baseGeometry = new THREE.CylinderGeometry(3, 3.5, 0.5, 32);
        const baseMaterial = new THREE.MeshPhongMaterial({
            color: 0x1e293b,
            shininess: 100
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = -2;
        base.receiveShadow = true;
        machineGroup.add(base);

        // 투명 돔
        const domeGeometry = new THREE.SphereGeometry(4, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.2,
            shininess: 100,
            side: THREE.DoubleSide
        });
        const dome = new THREE.Mesh(domeGeometry, domeMaterial);
        dome.position.y = -2;
        machineGroup.add(dome);

        // 출구 튜브
        const tubeGeometry = new THREE.CylinderGeometry(0.8, 0.8, 3, 32);
        const tubeMaterial = new THREE.MeshPhongMaterial({
            color: 0x334155,
            transparent: true,
            opacity: 0.7
        });
        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
        tube.position.set(4, 0, 0);
        tube.rotation.z = Math.PI / 6;
        machineGroup.add(tube);

        scene.add(machineGroup);

        // 공들 생성
        const balls = [];
        const ballColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0xa8e6cf, 0xff8b94, 0xffd3b6, 0xc7ceea, 0xb8e994];

        for (let i = 0; i < 30; i++) {
            const ballGeometry = new THREE.SphereGeometry(0.4, 32, 32);
            const ballMaterial = new THREE.MeshPhongMaterial({
                color: ballColors[i % ballColors.length],
                shininess: 100
            });
            const ball = new THREE.Mesh(ballGeometry, ballMaterial);

            // 초기 위치 (돔 안에 랜덤 배치)
            const radius = Math.random() * 2.5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI / 2;

            ball.position.x = radius * Math.sin(phi) * Math.cos(theta);
            ball.position.y = -2 + radius * Math.cos(phi);
            ball.position.z = radius * Math.sin(phi) * Math.sin(theta);

            ball.castShadow = true;
            ball.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                Math.random() * 0.1,
                (Math.random() - 0.5) * 0.2
            );

            machineGroup.add(ball);
            balls.push(ball);
        }

        // 선택된 공들
        const selectedBalls = [];
        let currentPickIndex = 0;
        let mixingTime = 0;
        const mixingDuration = 3000; // 3초간 섞기
        let isPicking = false;
        let pickingStartTime = 0;

        let messageElement = document.querySelector('.animation-message');

        // 메시지 업데이트
        function updateMessage(message) {
            if (messageElement) {
                messageElement.textContent = message;
            }
        }

        updateMessage('공을 섞는 중...');

        // 공 섞기 물리 시뮬레이션
        function mixBalls() {
            balls.forEach(ball => {
                // 중력
                ball.userData.velocity.y -= 0.005;

                // 위치 업데이트
                ball.position.add(ball.userData.velocity);

                // 바닥 충돌
                if (ball.position.y < -1.6) {
                    ball.position.y = -1.6;
                    ball.userData.velocity.y *= -0.7;
                    ball.userData.velocity.x *= 0.95;
                    ball.userData.velocity.z *= 0.95;
                }

                // 벽 충돌 (구형 경계)
                const distance = Math.sqrt(
                    ball.position.x ** 2 +
                    (ball.position.y + 2) ** 2 +
                    ball.position.z ** 2
                );

                if (distance > 3.5) {
                    const normal = new THREE.Vector3(
                        ball.position.x,
                        ball.position.y + 2,
                        ball.position.z
                    ).normalize();

                    ball.userData.velocity.reflect(normal).multiplyScalar(0.7);

                    // 위치 보정
                    ball.position.copy(normal.multiplyScalar(3.5).sub(new THREE.Vector3(0, 2, 0)));
                }

                // 랜덤 힘 추가 (섞기 효과)
                if (Math.random() < 0.05) {
                    ball.userData.velocity.x += (Math.random() - 0.5) * 0.1;
                    ball.userData.velocity.y += Math.random() * 0.15;
                    ball.userData.velocity.z += (Math.random() - 0.5) * 0.1;
                }

                // 회전
                ball.rotation.x += ball.userData.velocity.y * 0.1;
                ball.rotation.z += ball.userData.velocity.x * 0.1;
            });
        }

        // 공 선택 및 발사
        function pickBall() {
            if (balls.length === 0) return null;

            const index = Math.floor(Math.random() * balls.length);
            const ball = balls.splice(index, 1)[0];

            // 발사 애니메이션
            ball.userData.isPicked = true;
            ball.userData.targetPosition = new THREE.Vector3(
                6 + selectedBalls.length * 1.5,
                2,
                0
            );
            ball.userData.launchVelocity = new THREE.Vector3(0.3, 0.4, 0);

            selectedBalls.push(ball);
            return ball;
        }

        // 선택된 공 애니메이션
        function animateSelectedBalls() {
            selectedBalls.forEach((ball, index) => {
                if (ball.userData.isPicked) {
                    // 목표 위치로 이동
                    const target = ball.userData.targetPosition;
                    const current = ball.position;

                    if (current.distanceTo(target) > 0.1) {
                        ball.userData.launchVelocity.y -= 0.02; // 중력
                        ball.position.add(ball.userData.launchVelocity);

                        // 목표에 가까워지면 속도 감소
                        if (current.distanceTo(target) < 2) {
                            ball.userData.launchVelocity.multiplyScalar(0.95);
                        }
                    } else {
                        ball.position.copy(target);
                        ball.userData.isPicked = false;
                    }

                    // 회전
                    ball.rotation.x += 0.1;
                    ball.rotation.y += 0.05;
                }

                // 떠있는 효과
                ball.position.y += Math.sin(Date.now() * 0.003 + index) * 0.005;
            });
        }

        // 애니메이션 루프
        function animate() {
            const currentTime = Date.now();

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

            // 1단계: 공 섞기
            if (mixingTime < mixingDuration) {
                mixBalls();
                mixingTime += 16; // ~60fps
                requestAnimationFrame(animate);
                return;
            }

            // 2단계: 공 선택
            if (!isPicking) {
                isPicking = true;
                pickingStartTime = currentTime;
                updateMessage(`${currentPickIndex + 1}/${selectedStudents.length} 선발 중...`);
            }

            if (isPicking) {
                mixBalls(); // 계속 섞기

                // 6초마다 공 선택
                if (currentTime - pickingStartTime > 6000) {
                    pickBall();

                    const student = selectedStudents[currentPickIndex];
                    updateMessage(`${student.name} 학생을 선발했습니다!`);

                    // 실시간 학생 표시
                    if (addPickedStudent) {
                        addPickedStudent(student);
                    }

                    soundManager.playLotteryPick();

                    currentPickIndex++;

                    if (currentPickIndex >= selectedStudents.length) {
                        // 선발 완료
                        isPicking = false;
                        updateMessage('선발 완료!');

                        setTimeout(() => {
                            cleanup();
                            resolve();
                        }, 3000);
                    } else {
                        pickingStartTime = currentTime;
                        updateMessage(`${currentPickIndex + 1}/${selectedStudents.length} 선발 중...`);
                    }
                }
            }

            animateSelectedBalls();

            // 조명 효과
            pointLight1.position.x = Math.sin(currentTime * 0.001) * 10;
            pointLight2.position.x = Math.cos(currentTime * 0.001) * 10;

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
                camera.position.set(0, 6, 15);  // 더 멀리서 보기
            } else {
                camera.position.set(0, 5, 12);  // 기본 위치
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

// 룰렛 테마 - 3D 회전 룰렛 애니메이션

async function runRouletteAnimation(canvas, selectedStudents, addPickedStudent) {
    return new Promise((resolve) => {
        // Three.js 씬 설정
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        const camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.z = 8;
        camera.position.y = 2;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);

        // 조명
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const pointLight1 = new THREE.PointLight(0xffffff, 1);
        pointLight1.position.set(5, 5, 5);
        scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xff00ff, 0.8);
        pointLight2.position.set(-5, 3, -5);
        scene.add(pointLight2);

        // 룰렛 휠 생성
        const segments = 20; // 룰렛 세그먼트 수
        const wheelRadius = 4;
        const wheelThickness = 0.5;

        const wheelGroup = new THREE.Group();

        // 룰렛 베이스 (원반)
        const wheelGeometry = new THREE.CylinderGeometry(
            wheelRadius,
            wheelRadius,
            wheelThickness,
            segments,
            1
        );
        const wheelMaterial = new THREE.MeshPhongMaterial({
            color: 0x2d2d44,
            shininess: 100
        });
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.x = Math.PI / 2;
        wheelGroup.add(wheel);

        // 룰렛 세그먼트 색상
        const colors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0xa8e6cf, 0xff8b94, 0xffd3b6];

        // 각 세그먼트에 색상 추가
        for (let i = 0; i < segments; i++) {
            const angle = (Math.PI * 2 * i) / segments;
            const nextAngle = (Math.PI * 2 * (i + 1)) / segments;

            // 세그먼트 형태
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            shape.arc(0, 0, wheelRadius - 0.1, angle, nextAngle, false);
            shape.lineTo(0, 0);

            const geometry = new THREE.ShapeGeometry(shape);
            const material = new THREE.MeshPhongMaterial({
                color: colors[i % colors.length],
                side: THREE.DoubleSide
            });
            const segment = new THREE.Mesh(geometry, material);
            segment.position.z = wheelThickness / 2 + 0.01;
            wheelGroup.add(segment);
        }

        // 룰렛 테두리
        const edgeGeometry = new THREE.TorusGeometry(wheelRadius, 0.15, 16, 100);
        const edgeMaterial = new THREE.MeshPhongMaterial({
            color: 0xffd700,
            shininess: 100
        });
        const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edge.rotation.x = Math.PI / 2;
        wheelGroup.add(edge);

        // 중앙 장식
        const centerGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.8, 32);
        const centerMaterial = new THREE.MeshPhongMaterial({
            color: 0xffd700,
            shininess: 100
        });
        const center = new THREE.Mesh(centerGeometry, centerMaterial);
        center.rotation.x = Math.PI / 2;
        wheelGroup.add(center);

        scene.add(wheelGroup);

        // 포인터 (화살표)
        const pointerGroup = new THREE.Group();

        const pointerGeometry = new THREE.ConeGeometry(0.3, 1, 4);
        const pointerMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });
        const pointer = new THREE.Mesh(pointerGeometry, pointerMaterial);
        pointer.rotation.z = -Math.PI / 2;
        pointer.position.set(wheelRadius + 0.5, 0, 0);
        pointerGroup.add(pointer);

        scene.add(pointerGroup);

        // 파티클 효과
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 200;
        const positions = new Float32Array(particlesCount * 3);

        for (let i = 0; i < particlesCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 20;
            positions[i + 1] = (Math.random() - 0.5) * 20;
            positions[i + 2] = (Math.random() - 0.5) * 20;
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const particlesMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.05,
            transparent: true,
            opacity: 0.6
        });
        const particles = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particles);

        // 애니메이션 변수
        let rotation = 0;
        let rotationSpeed = 0.3;
        let decelerationRate = 0.985;
        let isSpinning = true;
        let currentPickIndex = 0;
        let messageElement = document.querySelector('.animation-message');

        // 메시지 업데이트
        function updateMessage(message) {
            if (messageElement) {
                messageElement.textContent = message;
            }
        }

        updateMessage('룰렛을 돌리는 중...');

        // 애니메이션 루프
        function animate() {
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

            if (!isSpinning && rotationSpeed < 0.001) {
                // 현재 학생 선발
                const student = selectedStudents[currentPickIndex];
                updateMessage(`${student.name} 학생을 선발했습니다!`);

                // 실시간 학생 표시
                if (addPickedStudent) {
                    addPickedStudent(student);
                }

                // 애니메이션 종료
                if (currentPickIndex < selectedStudents.length - 1) {
                    // 다음 학생 선발
                    currentPickIndex++;
                    rotationSpeed = 0.3;
                    isSpinning = true;
                    requestAnimationFrame(animate);
                } else {
                    // 모든 선발 완료
                    updateMessage('선발 완료!');
                    setTimeout(() => {
                        cleanup();
                        resolve();
                    }, 2000);
                }
                return;
            }

            // 룰렛 회전
            rotation += rotationSpeed;
            wheelGroup.rotation.z = rotation;

            // 감속
            if (isSpinning && rotationSpeed > 0.02) {
                rotationSpeed *= decelerationRate;
            } else {
                isSpinning = false;
                rotationSpeed *= 0.93; // 더 빠른 감속
            }

            // 파티클 회전
            particles.rotation.y += 0.001;
            particles.rotation.x += 0.002;

            // 포인터 애니메이션 (펄스 효과)
            pointer.scale.x = 1 + Math.sin(Date.now() * 0.01) * 0.1;
            pointer.scale.y = 1 + Math.sin(Date.now() * 0.01) * 0.1;

            // 조명 효과
            pointLight2.intensity = 0.8 + Math.sin(Date.now() * 0.005) * 0.3;

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

        // 창 크기 조절 처리
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);

            // 모바일 반응형: 화면 크기에 따라 카메라 위치 조정
            if (window.innerWidth <= 768) {
                camera.position.z = 10;  // 더 멀리서 보기
                camera.position.y = 3;
            } else {
                camera.position.z = 8;   // 기본 위치
                camera.position.y = 2;
            }
        }
        window.addEventListener('resize', onWindowResize);

        // 초기 카메라 위치 설정
        onWindowResize();

        // 애니메이션 시작
        animate();
    });
}

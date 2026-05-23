// MetaMask Integration Variables
        let web3;
        let userAccount = null;
        let userBestScore = 0;
        let currentNetwork = '';
        let metaMaskDetected = false;
        let detectionAttempts = 0;
        const MAX_DETECTION_ATTEMPTS = 10;
        
        // Contract ABI (Minimal for score storage)
        const contractABI = [
            {
                "anonymous": false,
                "inputs": [
                    {"indexed": true, "name": "player", "type": "address"},
                    {"indexed": false, "name": "score", "type": "uint256"},
                    {"indexed": false, "name": "timestamp", "type": "uint256"}
                ],
                "name": "ScoreSaved",
                "type": "event"
            },
            {
                "constant": true,
                "inputs": [{"name": "_player", "type": "address"}],
                "name": "getBestScore",
                "outputs": [{"name": "", "type": "uint256"}],
                "payable": false,
                "stateMutability": "view",
                "type": "function"
            }
        ];
        
        // Contract address (Example - replace with actual deployed contract)
        const CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';
        
        // Enhanced MetaMask Detection with Retry Logic
        function detectMetaMask() {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    detectionAttempts++;
                    
                    // Check multiple possible locations where MetaMask might inject
                    if (window.ethereum) {
                        clearInterval(checkInterval);
                        metaMaskDetected = true;
                        resolve(true);
                        return;
                    }
                    
                    // Check for legacy web3
                    if (window.web3 && window.web3.currentProvider) {
                        window.ethereum = window.web3.currentProvider;
                        clearInterval(checkInterval);
                        metaMaskDetected = true;
                        resolve(true);
                        return;
                    }
                    
                    // Check if MetaMask is available but not injected yet
                    if (detectionAttempts >= MAX_DETECTION_ATTEMPTS) {
                        clearInterval(checkInterval);
                        resolve(false);
                    }
                }, 100); // Check every 100ms
            });
        }
        
        // Initialize MetaMask detection when page loads
        window.addEventListener('load', async () => {
            document.getElementById('detectingStatus').style.display = 'flex';
            
            const detected = await detectMetaMask();
            
            document.getElementById('detectingStatus').style.display = 'none';
            
            if (!detected) {
                console.log('MetaMask not detected automatically');
                document.getElementById('skipOption').style.display = 'block';
                
                // One final check after a longer delay (for slow extensions)
                setTimeout(() => {
                    if (window.ethereum) {
                        metaMaskDetected = true;
                        document.getElementById('skipOption').style.display = 'none';
                        console.log('MetaMask detected on final check');
                    }
                }, 2000);
            } else {
                document.getElementById('skipOption').style.display = 'none';
            }
        });
        
        // Alternative: Check immediately in case already loaded
        if (window.ethereum) {
            metaMaskDetected = true;
        }
        
        // Check if MetaMask is installed with multiple methods
        function checkMetaMask() {
            // Method 1: Direct ethereum object
            if (typeof window.ethereum !== 'undefined') {
                return true;
            }
            
            // Method 2: Check for MetaMask specifically
            if (window.ethereum && window.ethereum.isMetaMask) {
                return true;
            }
            
            // Method 3: Check for any web3 provider
            if (window.web3 && window.web3.currentProvider) {
                window.ethereum = window.web3.currentProvider;
                return true;
            }
            
            return false;
        }
        
        // Connect to MetaMask with enhanced error handling
        async function connectMetaMask() {
            const btn = document.getElementById('connectWalletBtn');
            const errorDiv = document.getElementById('walletError');
            
            btn.innerHTML = 'Checking... <span class="loading-spinner"></span>';
            btn.disabled = true;
            errorDiv.style.display = 'none';
            
            // Force re-check
            const isInstalled = checkMetaMask();
            
            if (!isInstalled) {
                // Try one more time with delay
                await new Promise(resolve => setTimeout(resolve, 500));
                
                if (!checkMetaMask()) {
                    errorDiv.innerHTML = `
                        <strong>MetaMask not detected!</strong><br>
                        Please make sure:<br>
                        1. MetaMask extension is installed<br>
                        2. It's enabled in Chrome extensions<br>
                        3. You're not in Incognito mode<br>
                        4. Refresh the page after installing
                    `;
                    errorDiv.style.display = 'block';
                    btn.innerHTML = 'Retry Connection';
                    btn.disabled = false;
                    document.getElementById('skipOption').style.display = 'block';
                    return;
                }
            }
            
            btn.innerHTML = 'Connecting... <span class="loading-spinner"></span>';
            
            try {
                // Initialize Web3 with the detected provider
                web3 = new Web3(window.ethereum);
                
                // Request account access - this will trigger MetaMask popup
                const accounts = await window.ethereum.request({ 
                    method: 'eth_requestAccounts' 
                });
                
                if (!accounts || accounts.length === 0) {
                    throw new Error('No accounts found. Please unlock MetaMask.');
                }
                
                userAccount = accounts[0];
                
                // Get network info
                const chainId = await web3.eth.getChainId();
                updateNetworkName(chainId);
                
                // Get best score
                await fetchBestScore();
                
                // Update UI
                document.getElementById('walletAddress').textContent = 
                    userAccount.substring(0, 6) + '...' + userAccount.substring(38);
                document.getElementById('walletNotConnected').style.display = 'none';
                document.getElementById('walletConnected').style.display = 'block';
                document.getElementById('skipOption').style.display = 'none';
                
                // Setup event listeners
                setupMetaMaskListeners();
                
            } catch (error) {
                console.error('MetaMask connection error:', error);
                
                let errorMsg = 'Connection failed: ';
                if (error.code === 4001) {
                    errorMsg += 'User rejected the request';
                } else if (error.code === -32002) {
                    errorMsg += 'MetaMask is already processing a request. Check the extension!';
                } else {
                    errorMsg += error.message || 'Unknown error';
                }
                
                errorDiv.textContent = errorMsg;
                errorDiv.style.display = 'block';
                btn.innerHTML = 'Connect MetaMask';
                btn.disabled = false;
            }
        }
        
        function setupMetaMaskListeners() {
            if (!window.ethereum) return;
            
            // Account changes
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    disconnectWallet();
                } else {
                    userAccount = accounts[0];
                    document.getElementById('walletAddress').textContent = 
                        userAccount.substring(0, 6) + '...' + userAccount.substring(38);
                    fetchBestScore();
                }
            });
            
            // Chain changes
            window.ethereum.on('chainChanged', (chainId) => {
                window.location.reload();
            });
            
            // Disconnect
            window.ethereum.on('disconnect', (error) => {
                console.log('MetaMask disconnected:', error);
                disconnectWallet();
            });
        }
        
        function updateNetworkName(chainId) {
            const networks = {
                1: 'Ethereum Mainnet',
                5: 'Goerli Testnet',
                11155111: 'Sepolia Testnet',
                137: 'Polygon Mainnet',
                80001: 'Mumbai Testnet',
                56: 'BSC Mainnet',
                97: 'BSC Testnet',
                1337: 'Localhost',
                31337: 'Hardhat Network'
            };
            currentNetwork = networks[chainId] || `Chain ID: ${chainId}`;
            document.getElementById('networkName').textContent = currentNetwork;
        }
        
        async function fetchBestScore() {
            if (!userAccount) return;
            
            try {
                // Simulated blockchain fetch
                const savedScores = JSON.parse(localStorage.getItem('wilsonBlockchainScores') || '{}');
                userBestScore = savedScores[userAccount] || 0;
                document.getElementById('bestScore').textContent = userBestScore;
            } catch (error) {
                console.error('Error fetching score:', error);
            }
        }
        
        function disconnectWallet() {
            userAccount = null;
            web3 = null;
            document.getElementById('walletNotConnected').style.display = 'block';
            document.getElementById('walletConnected').style.display = 'none';
            document.getElementById('connectWalletBtn').innerHTML = 'Connect MetaMask';
            document.getElementById('connectWalletBtn').disabled = false;
        }
        
        function skipMetaMask() {
            document.getElementById('metamaskScreen').style.display = 'none';
            startGame();
        }
        
        function showMetaMaskScreen() {
            document.getElementById('startScreen').style.display = 'none';
            document.getElementById('metamaskScreen').style.display = 'flex';
            
            // Re-check MetaMask status when showing screen
            if (window.ethereum) {
                document.getElementById('skipOption').style.display = 'none';
            }
        }
        
        function proceedToGame() {
            document.getElementById('metamaskScreen').style.display = 'none';
            startGame();
        }
        
        async function saveScoreToBlockchain(score) {
            if (!userAccount || !web3) return;
            
            try {
                // Simulate blockchain transaction
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Save to localStorage as simulation
                const savedScores = JSON.parse(localStorage.getItem('wilsonBlockchainScores') || '{}');
                if (score > (savedScores[userAccount] || 0)) {
                    savedScores[userAccount] = score;
                    localStorage.setItem('wilsonBlockchainScores', JSON.stringify(savedScores));
                }
                
                // Show success
                const txHash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
                document.getElementById('blockchainSaveStatus').style.display = 'block';
                document.getElementById('txHash').textContent = 'TX: ' + txHash.substring(0, 20) + '...';
                
            } catch (error) {
                console.error('Failed to save to blockchain:', error);
            }
        }
        
        let scene, camera, renderer;
        let wilsons = [];
        let particles = [];
        let mountains = [];
        let score = 0;
        let timeLeft = 30;
        let gameActive = false;
        let isPaused = false;
        let combo = 0;
        let lastSaveTime = 0;
        let spawnInterval;
        let timerInterval;
        
        let pitch = 0;
        let yaw = 0;
        let keys = { w: false, a: false, s: false, d: false };
        const moveSpeed = 0.4;
        const mouseSensitivity = 0.002;
        
        let rope = null;
        let hook = null;
        let ropeState = 'ready';
        let caughtWilson = null;
        let ropeProgress = 0;
        let ropeDirection = new THREE.Vector3();
        const ROPE_SPEED = 1.5;
        const ROPE_MAX_DIST = 50;
        
        let leaderboard = JSON.parse(localStorage.getItem('saveWilsonLeaderboard')) || [];
        
        function init() {
            scene = new THREE.Scene();
            scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
            scene.background = new THREE.Color(0x87CEEB);
            
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 20, 40);
            
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambientLight);
            
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
            dirLight.position.set(50, 100, 50);
            dirLight.castShadow = true;
            dirLight.shadow.camera.left = -100;
            dirLight.shadow.camera.right = 100;
            dirLight.shadow.camera.top = 100;
            dirLight.shadow.camera.bottom = -100;
            dirLight.shadow.mapSize.width = 4096;
            dirLight.shadow.mapSize.height = 4096;
            dirLight.shadow.camera.far = 500;
            scene.add(dirLight);
            
            createWater();
            createMountains();
            createSky();
            createRopeSystem();
            
            window.addEventListener('resize', onWindowResize, false);
            document.addEventListener('keydown', onKeyDown, false);
            document.addEventListener('keyup', onKeyUp, false);
            document.addEventListener('mousemove', onMouseMove, false);
            document.addEventListener('mousedown', onMouseDown, false);
            document.addEventListener('pointerlockchange', onPointerLockChange, false);
            
            updateLeaderboardDisplay();
            animate();
        }
        
        function createWater() {
            const geometry = new THREE.PlaneGeometry(400, 400, 128, 128);
            const material = new THREE.MeshPhongMaterial({
                color: 0x006994,
                transparent: true,
                opacity: 0.75,
                shininess: 120,
                specular: 0x444444
            });
            const water = new THREE.Mesh(geometry, material);
            water.rotation.x = -Math.PI / 2;
            water.position.y = -3;
            water.receiveShadow = true;
            water.userData.originalPositions = geometry.attributes.position.array.slice();
            water.userData.water = true;
            scene.add(water);
        }
        
        function createMountains() {
            function createMountain(x, z, height, radius) {
                const geometry = new THREE.ConeGeometry(radius, height, 8);
                const material = new THREE.MeshPhongMaterial({
                    color: 0x4a4a4a,
                    flatShading: true,
                    roughness: 0.9
                });
                const mountain = new THREE.Mesh(geometry, material);
                mountain.position.set(x, height / 2 - 3, z);
                mountain.castShadow = true;
                mountain.receiveShadow = true;
                
                const snowGeo = new THREE.ConeGeometry(radius * 0.4, height * 0.25, 8);
                const snowMat = new THREE.MeshPhongMaterial({
                    color: 0xffffff,
                    flatShading: true
                });
                const snow = new THREE.Mesh(snowGeo, snowMat);
                snow.position.y = height * 0.375;
                mountain.add(snow);
                
                const treeCount = Math.floor(Math.random() * 8) + 5;
                for (let i = 0; i < treeCount; i++) {
                    const tree = createTree();
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * radius * 0.8 + radius * 0.3;
                    const tx = Math.cos(angle) * dist;
                    const tz = Math.sin(angle) * dist;
                    const ty = height / 2 - (dist / radius) * (height / 2) - 3;
                    
                    if (ty > -2) {
                        tree.position.set(tx, ty, tz);
                        const scale = Math.random() * 0.5 + 0.5;
                        tree.scale.set(scale, scale, scale);
                        mountain.add(tree);
                    }
                }
                
                scene.add(mountain);
                mountains.push(mountain);
            }
            
            const mountainPositions = [
                [80, 80, 60, 25], [-80, 80, 70, 30], [80, -80, 55, 22], [-80, -80, 65, 28],
                [120, 0, 50, 20], [-120, 0, 55, 24], [0, 120, 45, 18], [0, -120, 52, 21],
                [60, 100, 40, 15], [-60, -100, 42, 16], [100, -60, 38, 14], [-100, 60, 44, 17],
                [150, 50, 35, 12], [-150, -50, 37, 13], [50, 150, 33, 11], [-50, -150, 36, 12]
            ];
            
            mountainPositions.forEach(pos => {
                createMountain(pos[0], pos[1], pos[2], pos[3]);
            });
            
            for (let i = 0; i < 15; i++) {
                const rockGeo = new THREE.DodecahedronGeometry(Math.random() * 3 + 2, 0);
                const rockMat = new THREE.MeshPhongMaterial({
                    color: 0x666666,
                    flatShading: true
                });
                const rock = new THREE.Mesh(rockGeo, rockMat);
                
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 60 + 20;
                rock.position.set(
                    Math.cos(angle) * dist,
                    -2,
                    Math.sin(angle) * dist
                );
                rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                rock.castShadow = true;
                rock.receiveShadow = true;
                scene.add(rock);
            }
        }
        
        function createTree() {
            const group = new THREE.Group();
            
            const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 2, 6);
            const trunkMat = new THREE.MeshPhongMaterial({ color: 0x4a3728 });
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 1;
            trunk.castShadow = true;
            group.add(trunk);
            
            const leafColors = [0x1a5c1a, 0x2d7a2d, 0x3d8b3d];
            for (let i = 0; i < 3; i++) {
                const coneGeo = new THREE.ConeGeometry(1.5 - i * 0.3, 2, 8);
                const coneMat = new THREE.MeshPhongMaterial({
                    color: leafColors[i],
                    flatShading: true
                });
                const cone = new THREE.Mesh(coneGeo, coneMat);
                cone.position.y = 2.5 + i * 1.2;
                cone.castShadow = true;
                group.add(cone);
            }
            
            return group;
        }
        
        function createSky() {
            const skyGeo = new THREE.SphereGeometry(500, 32, 32);
            
            const vertexShader = `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `;
            
            const fragmentShader = `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `;
            
            const uniforms = {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            };
            
            const skyMat = new THREE.ShaderMaterial({
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                uniforms: uniforms,
                side: THREE.BackSide
            });
            
            const sky = new THREE.Mesh(skyGeo, skyMat);
            scene.add(sky);
            
            for (let i = 0; i < 25; i++) {
                const cloud = new THREE.Group();
                const chunks = Math.floor(Math.random() * 5) + 3;
                
                for (let j = 0; j < chunks; j++) {
                    const geo = new THREE.SphereGeometry(Math.random() * 6 + 4, 8, 8);
                    const mat = new THREE.MeshBasicMaterial({ 
                        color: 0xffffff, 
                        transparent: true, 
                        opacity: 0.7 
                    });
                    const chunk = new THREE.Mesh(geo, mat);
                    chunk.position.set(
                        (Math.random() - 0.5) * 12,
                        (Math.random() - 0.5) * 5,
                        (Math.random() - 0.5) * 8
                    );
                    cloud.add(chunk);
                }
                
                cloud.position.set(
                    (Math.random() - 0.5) * 300,
                    Math.random() * 40 + 60,
                    (Math.random() - 0.5) * 300
                );
                scene.add(cloud);
            }
        }
        
        function createRopeSystem() {
            const ropeGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
            ropeGeo.translate(0, 0.5, 0);
            const ropeMat = new THREE.MeshPhongMaterial({ 
                color: 0x8B4513,
                roughness: 0.9 
            });
            rope = new THREE.Mesh(ropeGeo, ropeMat);
            rope.castShadow = true;
            rope.visible = false;
            scene.add(rope);
            
            const hookGroup = new THREE.Group();
            
            const hookBodyGeo = new THREE.ConeGeometry(0.3, 1, 8);
            const hookMat = new THREE.MeshStandardMaterial({ 
                color: 0x888888,
                metalness: 0.9,
                roughness: 0.2
            });
            const hookBody = new THREE.Mesh(hookBodyGeo, hookMat);
            hookBody.rotation.x = Math.PI;
            hookGroup.add(hookBody);
            
            const hookTipGeo = new THREE.TorusGeometry(0.3, 0.08, 6, 12, Math.PI);
            const hookTip = new THREE.Mesh(hookTipGeo, hookMat);
            hookTip.position.y = -0.5;
            hookTip.rotation.z = Math.PI;
            hookGroup.add(hookTip);
            
            const light = new THREE.PointLight(0x00ff00, 1.5, 6);
            light.position.y = -0.4;
            hookGroup.add(light);
            
            hook = hookGroup;
            hook.visible = false;
            scene.add(hook);
        }
        
        function createWilson() {
            const group = new THREE.Group();
            
            // WOODEN PALLET (instead of log)
            const palletGroup = new THREE.Group();
            
            // Main deck boards (3 planks)
            const plankWidth = 1.2;
            const plankLength = 4;
            const plankHeight = 0.25;
            const plankGap = 0.3;
            
            const woodMat = new THREE.MeshPhongMaterial({ 
                color: 0xDEB887,
                roughness: 0.8,
                map: createWoodTexture()
            });
            
            const darkWoodMat = new THREE.MeshPhongMaterial({ 
                color: 0x8B7355,
                roughness: 0.9
            });
            
            // Top planks
            for (let i = -1; i <= 1; i++) {
                const plankGeo = new THREE.BoxGeometry(plankLength, plankHeight, plankWidth);
                const plank = new THREE.Mesh(plankGeo, woodMat);
                plank.position.set(0, 0, i * (plankWidth + plankGap));
                plank.castShadow = true;
                plank.receiveShadow = true;
                palletGroup.add(plank);
                
                // Nail details
                for (let j = -1; j <= 1; j += 2) {
                    const nailGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6);
                    const nailMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 });
                    const nail = new THREE.Mesh(nailGeo, nailMat);
                    nail.position.set(j * 1.5, plankHeight/2 + 0.03, i * (plankWidth + plankGap));
                    palletGroup.add(nail);
                }
            }
            
            // Bottom support blocks (3 blocks)
            const blockWidth = 0.8;
            const blockHeight = 0.6;
            const blockLength = 1;
            
            for (let i = -1; i <= 1; i++) {
                const blockGeo = new THREE.BoxGeometry(blockLength, blockHeight, blockWidth);
                const block = new THREE.Mesh(blockGeo, darkWoodMat);
                block.position.set(i * 1.2, -blockHeight/2 - plankHeight/2, 0);
                block.castShadow = true;
                palletGroup.add(block);
            }
            
            // Side boards (connecting blocks)
            const sideBoardGeo = new THREE.BoxGeometry(0.3, 0.15, 3.8);
            for (let i = -1; i <= 1; i++) {
                const sideBoard = new THREE.Mesh(sideBoardGeo, darkWoodMat);
                sideBoard.position.set(i * 1.2, -0.4, 0);
                palletGroup.add(sideBoard);
            }
            
            group.add(palletGroup);
            
            // WILSON (Realistic Rooster)
            const wilsonGroup = new THREE.Group();
            wilsonGroup.position.set(0, 0.5, 0);
            
            // Legs
            const legGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.7, 6);
            const legMat = new THREE.MeshPhongMaterial({ color: 0xFFA500 });
            
            const leftLeg = new THREE.Mesh(legGeo, legMat);
            leftLeg.position.set(-0.25, -0.35, 0.1);
            leftLeg.rotation.z = 0.1;
            wilsonGroup.add(leftLeg);
            
            const rightLeg = new THREE.Mesh(legGeo, legMat);
            rightLeg.position.set(0.25, -0.35, -0.1);
            rightLeg.rotation.z = -0.1;
            wilsonGroup.add(rightLeg);
            
            // Claws
            const clawGeo = new THREE.BoxGeometry(0.08, 0.05, 0.12);
            const clawMat = new THREE.MeshPhongMaterial({ color: 0xFF8C00 });
            
            const leftClaw = new THREE.Mesh(clawGeo, clawMat);
            leftClaw.position.set(-0.28, -0.7, 0.1);
            wilsonGroup.add(leftClaw);
            
            const rightClaw = new THREE.Mesh(clawGeo, clawMat);
            rightClaw.position.set(0.28, -0.7, -0.1);
            wilsonGroup.add(rightClaw);
            
            // Body
            const bodyGroup = new THREE.Group();
            
            const chestGeo = new THREE.SphereGeometry(0.65, 16, 16);
            const bodyMat = new THREE.MeshPhongMaterial({ 
                color: 0xCC0000,
                roughness: 0.6
            });
            const chest = new THREE.Mesh(chestGeo, bodyMat);
            chest.scale.set(1, 1.1, 0.9);
            chest.castShadow = true;
            bodyGroup.add(chest);
            
            const bellyGeo = new THREE.SphereGeometry(0.5, 12, 12);
            const bellyMat = new THREE.MeshPhongMaterial({ color: 0xFF4444 });
            const belly = new THREE.Mesh(bellyGeo, bellyMat);
            belly.position.set(0, -0.3, 0.2);
            belly.scale.set(1, 1.2, 0.8);
            bodyGroup.add(belly);
            
            wilsonGroup.add(bodyGroup);
            
            // Neck
            const neckGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.5, 8);
            const neckMat = new THREE.MeshPhongMaterial({ color: 0xFF0000 });
            const neck = new THREE.Mesh(neckGeo, neckMat);
            neck.position.y = 0.7;
            wilsonGroup.add(neck);
            
            // Head
            const headGroup = new THREE.Group();
            headGroup.position.y = 1.1;
            
            const headGeo = new THREE.SphereGeometry(0.42, 16, 16);
            const headMat = new THREE.MeshPhongMaterial({ color: 0xFF3333 });
            const head = new THREE.Mesh(headGeo, headMat);
            head.scale.set(1, 0.9, 1.1);
            head.castShadow = true;
            headGroup.add(head);
            
            // Beak
            const beakGroup = new THREE.Group();
            beakGroup.position.set(0, 0, 0.45);
            
            const upperBeakGeo = new THREE.ConeGeometry(0.12, 0.5, 8);
            const beakMat = new THREE.MeshPhongMaterial({ 
                color: 0xFFD700,
                shininess: 100
            });
            const upperBeak = new THREE.Mesh(upperBeakGeo, beakMat);
            upperBeak.rotation.x = Math.PI / 2;
            upperBeak.position.y = 0.05;
            beakGroup.add(upperBeak);
            
            const lowerBeakGeo = new THREE.ConeGeometry(0.1, 0.3, 8);
            const lowerBeak = new THREE.Mesh(lowerBeakGeo, beakMat);
            lowerBeak.rotation.x = Math.PI / 2;
            lowerBeak.position.y = -0.1;
            beakGroup.add(lowerBeak);
            
            headGroup.add(beakGroup);
            
            // Comb
            const combGroup = new THREE.Group();
            combGroup.position.set(0, 0.35, 0);
            
            const combBaseGeo = new THREE.BoxGeometry(0.35, 0.15, 0.15);
            const combMat = new THREE.MeshPhongMaterial({ color: 0xAA0000 });
            const combBase = new THREE.Mesh(combBaseGeo, combMat);
            combGroup.add(combBase);
            
            const combTipGeo = new THREE.ConeGeometry(0.1, 0.25, 4);
            const combTip = new THREE.Mesh(combTipGeo, combMat);
            combTip.position.set(0, 0.2, 0);
            combGroup.add(combTip);
            
            headGroup.add(combGroup);
            
            // Eyes
            const eyeGroup = new THREE.Group();
            
            const eyeWhiteGeo = new THREE.SphereGeometry(0.14, 12, 12);
            const eyeWhiteMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
            
            const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
            leftEyeWhite.position.set(-0.22, 0.1, 0.35);
            eyeGroup.add(leftEyeWhite);
            
            const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
            rightEyeWhite.position.set(0.22, 0.1, 0.35);
            eyeGroup.add(rightEyeWhite);
            
            const irisGeo = new THREE.SphereGeometry(0.09, 10, 10);
            const irisMat = new THREE.MeshPhongMaterial({ color: 0xFFD700 });
            
            const leftIris = new THREE.Mesh(irisGeo, irisMat);
            leftIris.position.set(-0.22, 0.1, 0.42);
            eyeGroup.add(leftIris);
            
            const rightIris = new THREE.Mesh(irisGeo, irisMat);
            rightIris.position.set(0.22, 0.1, 0.42);
            eyeGroup.add(rightIris);
            
            const pupilGeo = new THREE.SphereGeometry(0.05, 8, 8);
            const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            
            const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
            leftPupil.position.set(-0.22, 0.1, 0.48);
            eyeGroup.add(leftPupil);
            
            const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
            rightPupil.position.set(0.22, 0.1, 0.48);
            eyeGroup.add(rightPupil);
            
            const browGeo = new THREE.BoxGeometry(0.15, 0.04, 0.08);
            const browMat = new THREE.MeshPhongMaterial({ color: 0x8B0000 });
            
            const leftBrow = new THREE.Mesh(browGeo, browMat);
            leftBrow.position.set(-0.22, 0.28, 0.4);
            leftBrow.rotation.z = 0.3;
            leftBrow.rotation.y = -0.2;
            eyeGroup.add(leftBrow);
            
            const rightBrow = new THREE.Mesh(browGeo, browMat);
            rightBrow.position.set(0.22, 0.28, 0.4);
            rightBrow.rotation.z = -0.3;
            rightBrow.rotation.y = 0.2;
            eyeGroup.add(rightBrow);
            
            headGroup.add(eyeGroup);
            
            // Wattle
            const wattleGeo = new THREE.SphereGeometry(0.12, 8, 8);
            const wattleMat = new THREE.MeshPhongMaterial({ color: 0xCC0000 });
            const wattle = new THREE.Mesh(wattleGeo, wattleMat);
            wattle.position.set(0, -0.25, 0.35);
            wattle.scale.set(1, 1.5, 0.8);
            headGroup.add(wattle);
            
            wilsonGroup.add(headGroup);
            
            // Wings
            const wingGroup = new THREE.Group();
            
            const leftWingGroup = new THREE.Group();
            leftWingGroup.position.set(-0.6, 0.2, 0);
            
            const wingTopGeo = new THREE.SphereGeometry(0.5, 10, 10);
            const wingMat = new THREE.MeshPhongMaterial({ 
                color: 0xAA0000,
                roughness: 0.7
            });
            const leftWingTop = new THREE.Mesh(wingTopGeo, wingMat);
            leftWingTop.scale.set(0.3, 0.9, 0.5);
            leftWingTop.position.set(-0.2, 0.2, 0);
            leftWingGroup.add(leftWingTop);
            
            const wingBottomGeo = new THREE.SphereGeometry(0.4, 8, 8);
            const wingBottomMat = new THREE.MeshPhongMaterial({ color: 0x880000 });
            const leftWingBottom = new THREE.Mesh(wingBottomGeo, wingBottomMat);
            leftWingBottom.scale.set(0.25, 0.8, 0.4);
            leftWingBottom.position.set(-0.25, -0.3, 0.1);
            leftWingGroup.add(leftWingBottom);
            
            wingGroup.add(leftWingGroup);
            
            const rightWingGroup = new THREE.Group();
            rightWingGroup.position.set(0.6, 0.2, 0);
            
            const rightWingTop = new THREE.Mesh(wingTopGeo, wingMat);
            rightWingTop.scale.set(0.3, 0.9, 0.5);
            rightWingTop.position.set(0.2, 0.2, 0);
            rightWingGroup.add(rightWingTop);
            
            const rightWingBottom = new THREE.Mesh(wingBottomGeo, wingBottomMat);
            rightWingBottom.scale.set(0.25, 0.8, 0.4);
            rightWingBottom.position.set(0.25, -0.3, 0.1);
            rightWingGroup.add(rightWingBottom);
            
            wingGroup.add(rightWingGroup);
            
            wilsonGroup.add(wingGroup);
            
            // Tail
            const tailGroup = new THREE.Group();
            tailGroup.position.set(0, 0.1, -0.7);
            
            const tailFeathers = 5;
            for (let i = 0; i < tailFeathers; i++) {
                const featherGeo = new THREE.ConeGeometry(0.08, 0.8, 4);
                const featherMat = new THREE.MeshPhongMaterial({ 
                    color: i % 2 === 0 ? 0x006400 : 0x004d00
                });
                const feather = new THREE.Mesh(featherGeo, featherMat);
                feather.rotation.x = -Math.PI / 2.5;
                feather.rotation.z = (i - 2) * 0.3;
                feather.rotation.y = (i - 2) * 0.2;
                feather.position.set((i - 2) * 0.12, 0, -0.1);
                tailGroup.add(feather);
            }
            
            wilsonGroup.add(tailGroup);
            
            group.add(wilsonGroup);
            
            // Random position
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 50 + 15;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            group.position.set(x, -1.5, z);
            group.rotation.y = Math.random() * Math.PI * 2;
            
            group.userData = {
                active: true,
                createdAt: Date.now(),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.025,
                    0,
                    (Math.random() - 0.5) * 0.025
                ),
                rotationSpeed: (Math.random() - 0.5) * 0.003,
                offset: Math.random() * 100,
                caught: false,
                wilsonModel: wilsonGroup,
                head: headGroup,
                leftWing: leftWingGroup,
                rightWing: rightWingGroup,
                tail: tailGroup,
                beak: beakGroup
            };
            
            scene.add(group);
            wilsons.push(group);
            
            setTimeout(() => {
                if (group.userData.active && !group.userData.caught) {
                    removeWilson(group, false);
                }
            }, 8000);
        }
        
        function createWoodTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            
            ctx.fillStyle = '#DEB887';
            ctx.fillRect(0, 0, 256, 256);
            
            for (let i = 0; i < 50; i++) {
                ctx.strokeStyle = `rgba(139, 69, 19, ${Math.random() * 0.3 + 0.1})`;
                ctx.lineWidth = Math.random() * 3 + 1;
                ctx.beginPath();
                const y = Math.random() * 256;
                ctx.moveTo(0, y);
                ctx.bezierCurveTo(85, y + Math.random() * 20 - 10, 170, y + Math.random() * 20 - 10, 256, y);
                ctx.stroke();
            }
            
            const texture = new THREE.CanvasTexture(canvas);
            return texture;
        }
        
        function updateRope() {
            if (!gameActive || isPaused) return;
            
            const statusDiv = document.getElementById('status');
            const warningDiv = document.getElementById('warning');
            
            if (ropeState === 'ready') {
                rope.visible = false;
                hook.visible = false;
                statusDiv.className = 'ready';
                statusDiv.textContent = 'ROPE READY - LEFT CLICK';
                warningDiv.style.opacity = 0;
                
            } else if (ropeState === 'shooting') {
                rope.visible = true;
                hook.visible = true;
                statusDiv.className = '';
                statusDiv.style.opacity = 0;
                
                ropeProgress += ROPE_SPEED;
                
                const startPos = camera.position.clone();
                const endPos = startPos.clone().add(ropeDirection.clone().multiplyScalar(ROPE_MAX_DIST));
                const currentPos = new THREE.Vector3().lerpVectors(startPos, endPos, ropeProgress / ROPE_MAX_DIST);
                
                hook.position.copy(currentPos);
                
                rope.position.copy(startPos);
                rope.lookAt(currentPos);
                rope.scale.set(1, startPos.distanceTo(currentPos), 1);
                
                if (ropeProgress >= 5) {
                    for (let wilson of wilsons) {
                        if (!wilson.userData.active || wilson.userData.caught) continue;
                        
                        const dist = currentPos.distanceTo(wilson.position);
                        if (dist < 4) {
                            caughtWilson = wilson;
                            wilson.userData.caught = true;
                            ropeState = 'hooked';
                            hook.children[2].color.setHex(0xff0000);
                            break;
                        }
                    }
                }
                
                if (ropeProgress >= ROPE_MAX_DIST && ropeState === 'shooting') {
                    ropeState = 'pulling';
                }
                
            } else if (ropeState === 'hooked') {
                warningDiv.style.opacity = 1;
                statusDiv.className = 'hooked';
                statusDiv.textContent = 'HOOKED! PULL!';
                statusDiv.style.opacity = 1;
                
                if (caughtWilson) {
                    const swing = new THREE.Vector3(
                        Math.sin(Date.now() * 0.008) * 0.6,
                        Math.cos(Date.now() * 0.006) * 0.4,
                        0
                    );
                    
                    const idealPos = camera.position.clone().add(ropeDirection.clone().multiplyScalar(6));
                    caughtWilson.position.lerp(idealPos, 0.08);
                    caughtWilson.position.add(swing);
                    caughtWilson.position.y = Math.max(caughtWilson.position.y, 3);
                    
                    hook.position.copy(caughtWilson.position).add(new THREE.Vector3(0, 1.2, 0));
                    
                    rope.position.copy(camera.position);
                    rope.lookAt(hook.position);
                    rope.scale.set(1, camera.position.distanceTo(hook.position), 1);
                    
                    caughtWilson.userData.leftWing.rotation.z = Math.sin(Date.now() * 0.03) * 0.9;
                    caughtWilson.userData.rightWing.rotation.z = -Math.sin(Date.now() * 0.03) * 0.9;
                    caughtWilson.userData.head.rotation.z = Math.sin(Date.now() * 0.02) * 0.3;
                    caughtWilson.userData.tail.rotation.x = Math.sin(Date.now() * 0.025) * 0.5;
                    caughtWilson.rotation.y += 0.15;
                }
                
            } else if (ropeState === 'pulling') {
                warningDiv.style.opacity = 0;
                statusDiv.style.opacity = 0;
                
                ropeProgress -= ROPE_SPEED * 2;
                
                const startPos = camera.position.clone();
                const endPos = startPos.clone().add(ropeDirection.clone().multiplyScalar(ROPE_MAX_DIST));
                const currentPos = new THREE.Vector3().lerpVectors(startPos, endPos, ropeProgress / ROPE_MAX_DIST);
                
                hook.position.copy(currentPos);
                
                rope.position.copy(startPos);
                rope.lookAt(currentPos);
                rope.scale.set(1, startPos.distanceTo(currentPos), 1);
                
                if (caughtWilson) {
                    caughtWilson.position.copy(currentPos);
                    caughtWilson.position.y -= 1.8;
                    caughtWilson.rotation.y += 0.15;
                    caughtWilson.userData.head.rotation.x = -0.5;
                }
                
                if (ropeProgress <= 0) {
                    if (caughtWilson) {
                        removeWilson(caughtWilson, true);
                        caughtWilson = null;
                    }
                    ropeState = 'ready';
                    hook.children[2].color.setHex(0x00ff00);
                }
            }
        }
        
        function onMouseMove(e) {
            if (!gameActive || isPaused || document.pointerLockElement !== renderer.domElement) return;
            
            yaw -= e.movementX * mouseSensitivity;
            pitch -= e.movementY * mouseSensitivity;
            pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
            
            updateCameraRotation();
        }
        
        function updateCameraRotation() {
            const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
            camera.quaternion.setFromEuler(euler);
        }
        
        function updateMovement() {
            if (!gameActive || isPaused) return;
            
            const direction = new THREE.Vector3();
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0;
            forward.normalize();
            
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            right.y = 0;
            right.normalize();
            
            if (keys.w) direction.add(forward);
            if (keys.s) direction.sub(forward);
            if (keys.d) direction.add(right);
            if (keys.a) direction.sub(right);
            
            if (direction.length() > 0) {
                direction.normalize();
                camera.position.add(direction.multiplyScalar(moveSpeed));
            }
            
            const distFromCenter = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
            if (distFromCenter > 90) {
                const angle = Math.atan2(camera.position.z, camera.position.x);
                camera.position.x = Math.cos(angle) * 90;
                camera.position.z = Math.sin(angle) * 90;
            }
            
            camera.position.y = Math.max(5, Math.min(camera.position.y, 60));
        }
        
        function onMouseDown(e) {
            if (!gameActive || isPaused || e.button !== 0) return;
            
            if (ropeState === 'ready') {
                ropeState = 'shooting';
                ropeProgress = 0;
                ropeDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                
            } else if (ropeState === 'hooked') {
                ropeState = 'pulling';
            }
        }
        
        function onKeyDown(e) {
            const key = e.key.toLowerCase();
            if (keys.hasOwnProperty(key)) keys[key] = true;
            if (e.code === 'Escape') togglePause();
        }
        
        function onKeyUp(e) {
            const key = e.key.toLowerCase();
            if (keys.hasOwnProperty(key)) keys[key] = false;
        }
        
        function onPointerLockChange() {
            if (document.pointerLockElement === renderer.domElement) {
                isPaused = false;
                document.getElementById('pauseScreen').style.display = 'none';
            } else if (gameActive) {
                isPaused = true;
                document.getElementById('pauseScreen').style.display = 'flex';
            }
        }
        
        function togglePause() {
            if (!gameActive) return;
            if (isPaused) {
                renderer.domElement.requestPointerLock();
            } else {
                document.exitPointerLock();
            }
        }
        
        function createSplash(x, y, z, count = 25) {
            for (let i = 0; i < count; i++) {
                const geo = new THREE.SphereGeometry(0.25, 6, 6);
                const mat = new THREE.MeshBasicMaterial({ 
                    color: 0x87CEEB,
                    transparent: true,
                    opacity: 0.9
                });
                const p = new THREE.Mesh(geo, mat);
                p.position.set(x, y, z);
                
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 0.8 + 0.4;
                
                p.userData = {
                    velocity: new THREE.Vector3(
                        Math.cos(angle) * speed,
                        Math.random() * 1.2 + 0.8,
                        Math.sin(angle) * speed
                    ),
                    life: 1.0
                };
                
                scene.add(p);
                particles.push(p);
            }
        }
        
        function createScorePopup(x, y, z, points) {
            const div = document.createElement('div');
            div.style.cssText = `
                position: absolute;
                color: #FFD700;
                font-size: 52px;
                font-weight: bold;
                text-shadow: 4px 4px 8px rgba(0,0,0,1);
                pointer-events: none;
                left: 50%;
                top: 50%;
            `;
            div.textContent = '+' + points;
            document.body.appendChild(div);
            
            const vector = new THREE.Vector3(x, y, z);
            vector.project(camera);
            
            const sx = (vector.x * .5 + .5) * window.innerWidth;
            const sy = (-(vector.y * .5) + .5) * window.innerHeight;
            
            div.style.left = sx + 'px';
            div.style.top = sy + 'px';
            
            let opacity = 1;
            let posY = sy;
            const anim = setInterval(() => {
                opacity -= 0.02;
                posY -= 6;
                div.style.opacity = opacity;
                div.style.top = posY + 'px';
                
                if (opacity <= 0) {
                    clearInterval(anim);
                    div.remove();
                }
            }, 20);
        }
        
        function removeWilson(wilson, saved) {
            wilson.userData.active = false;
            
            if (saved) {
                createSplash(wilson.position.x, wilson.position.y, wilson.position.z, 35);
                
                const now = Date.now();
                if (now - lastSaveTime < 2500) {
                    combo++;
                } else {
                    combo = 1;
                }
                lastSaveTime = now;
                
                const points = 10 * combo;
                score += points;
                
                createScorePopup(wilson.position.x, wilson.position.y + 5, wilson.position.z, points);
                
                if (combo > 1) {
                    const comboDiv = document.getElementById('combo');
                    comboDiv.textContent = combo + 'x COMBO!';
                    comboDiv.style.opacity = 1;
                    setTimeout(() => comboDiv.style.opacity = 0, 1500);
                }
            } else {
                combo = 0;
            }
            
            scene.remove(wilson);
            wilsons = wilsons.filter(w => w !== wilson);
            updateUI();
        }
        
        function startGame() {
            document.getElementById('startScreen').style.display = 'none';
            document.getElementById('crosshair').style.display = 'block';
            gameActive = true;
            isPaused = false;
            score = 0;
            timeLeft = 30;
            combo = 0;
            ropeState = 'ready';
            
            renderer.domElement.requestPointerLock();
            
            updateUI();
            
            spawnInterval = setInterval(() => {
                if (gameActive && !isPaused) {
                    createWilson();
                    if (timeLeft < 20) createWilson();
                    if (timeLeft < 10) {
                        createWilson();
                        createWilson();
                    }
                }
            }, 2200);
            
            timerInterval = setInterval(() => {
                if (!isPaused) {
                    timeLeft--;
                    updateUI();
                    if (timeLeft <= 0) endGame();
                }
            }, 1000);
        }
        
        function endGame() {
            gameActive = false;
            document.exitPointerLock();
            clearInterval(spawnInterval);
            clearInterval(timerInterval);
            
            wilsons.forEach(w => scene.remove(w));
            wilsons = [];
            caughtWilson = null;
            rope.visible = false;
            hook.visible = false;
            
            document.getElementById('crosshair').style.display = 'none';
            document.getElementById('status').style.opacity = 0;
            document.getElementById('warning').style.opacity = 0;
            
            saveScore(score);
            document.getElementById('finalScore').textContent = score;
            document.getElementById('gameOverScreen').style.display = 'flex';
            updateGameOverLeaderboard();
            
            // Save to blockchain if connected
            if (userAccount && score > 0) {
                saveScoreToBlockchain(score);
            }
        }
        
        function restartGame() {
            document.getElementById('gameOverScreen').style.display = 'none';
            document.getElementById('blockchainSaveStatus').style.display = 'none';
            
            camera.position.set(0, 20, 40);
            pitch = 0;
            yaw = 0;
            updateCameraRotation();
            
            startGame();
        }
        
        function saveScore(newScore) {
            const playerName = userAccount ? 
                userAccount.substring(0, 6) + '...' + userAccount.substring(38) : 
                'Rescuer ' + Math.floor(Math.random() * 1000);
            leaderboard.push({ name: playerName, score: newScore, date: new Date(), isBlockchain: !!userAccount });
            leaderboard.sort((a, b) => b.score - a.score);
            leaderboard = leaderboard.slice(0, 10);
            localStorage.setItem('saveWilsonLeaderboard', JSON.stringify(leaderboard));
            updateLeaderboardDisplay();
        }
        
        function updateLeaderboardDisplay() {
            const list = document.getElementById('leaderboardList');
            list.innerHTML = leaderboard.slice(0, 5).map((entry, index) => `
                <div class="score-entry">
                    <span>${index + 1}. ${entry.name} ${entry.isBlockchain ? '🔗' : ''}</span>
                    <span style="color: #FFD700;">${entry.score}</span>
                </div>
            `).join('');
        }
        
        function updateGameOverLeaderboard() {
            const container = document.getElementById('gameOverLeaderboard');
            container.innerHTML = '<div style="margin-top: 20px; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 10px;">' +
                '<h3 style="color: #FFD700; margin-bottom: 10px;">🏆 Top Rescuers</h3>' +
                leaderboard.slice(0, 5).map((entry, index) => `
                    <div class="score-entry" style="font-size: 16px;">
                        <span>${index + 1}. ${entry.name} ${entry.isBlockchain ? '🔗' : ''}</span>
                        <span style="color: #4ECDC4;">${entry.score}</span>
                    </div>
                `).join('') +
                '</div>';
        }
        
        function updateUI() {
            document.getElementById('score').textContent = 'SCORE: ' + score;
            document.getElementById('timer').textContent = timeLeft;
            document.getElementById('timer').style.color = timeLeft <= 5 ? '#FF0000' : '#FF6B6B';
        }
        
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        
        function animate() {
            requestAnimationFrame(animate);
            
            const time = Date.now() * 0.001;
            
            updateMovement();
            updateRope();
            
            scene.traverse((obj) => {
                if (obj.userData.water) {
                    const positions = obj.geometry.attributes.position;
                    const original = obj.userData.originalPositions;
                    for (let i = 0; i < positions.count; i++) {
                        const x = original[i * 3];
                        const y = original[i * 3 + 1];
                        const wave1 = Math.sin(x * 0.12 + time * 0.5) * 0.8;
                        const wave2 = Math.sin(y * 0.1 + time * 0.35) * 0.7;
                        const wave3 = Math.sin((x + y) * 0.05 + time * 0.2) * 0.6;
                        positions.setZ(i, wave1 + wave2 + wave3);
                    }
                    positions.needsUpdate = true;
                }
            });
            
            wilsons.forEach((wilson) => {
                if (wilson.userData.active && !wilson.userData.caught) {
                    wilson.position.add(wilson.userData.velocity);
                    wilson.rotation.y += wilson.userData.rotationSpeed;
                    
                    const dist = Math.sqrt(wilson.position.x ** 2 + wilson.position.z ** 2);
                    if (dist > 70) {
                        wilson.userData.velocity.multiplyScalar(-1);
                        wilson.rotation.y += Math.PI;
                    }
                    
                    const bobOffset = Math.sin(time + wilson.userData.offset) * 0.6;
                    const rockOffset = Math.sin(time * 0.6 + wilson.userData.offset) * 0.15;
                    wilson.position.y = -1.5 + bobOffset;
                    wilson.rotation.z = rockOffset;
                    wilson.rotation.x = Math.sin(time * 0.8) * 0.1;
                    
                    const age = Date.now() - wilson.userData.createdAt;
                    const panicIntensity = Math.min(age / 5000, 1) * 0.9 + 0.1;
                    
                    wilson.userData.leftWing.rotation.z = Math.sin(time * 12) * panicIntensity;
                    wilson.userData.rightWing.rotation.z = -Math.sin(time * 12) * panicIntensity;
                    wilson.userData.head.rotation.z = Math.sin(time * 8) * 0.2 * panicIntensity;
                    wilson.userData.head.rotation.x = -0.2 - Math.sin(time * 6) * 0.1;
                    wilson.userData.tail.rotation.x = Math.sin(time * 10) * 0.3 * panicIntensity;
                    wilson.userData.beak.rotation.x = Math.sin(time * 15) * 0.1 * panicIntensity;
                    
                    if (age > 6500) {
                        wilson.position.x += (Math.random() - 0.5) * 0.25;
                        wilson.rotation.z += (Math.random() - 0.5) * 0.3;
                    }
                }
            });
            
            particles = particles.filter(p => {
                p.userData.life -= 0.012;
                p.position.add(p.userData.velocity);
                p.userData.velocity.y -= 0.035;
                p.material.opacity = p.userData.life;
                
                if (p.userData.life <= 0) {
                    scene.remove(p);
                    return false;
                }
                return true;
            });
            
            renderer.render(scene, camera);
        }
        
        init();
    

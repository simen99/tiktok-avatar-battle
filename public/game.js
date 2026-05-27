const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

const width = canvas.width;
const height = canvas.height;

let killsGirl = 0; // Rusia
let killsBoy = 0;  // NATO
let roundTime = "00:00";

let avatars = []; 
let bullets = []; 
let particles = []; 
const userDeathTimes = {}; 
const activeUsernames = new Set(); // Mencegah duplikasi pemain ganda secara mutlak

// Audio Setup menggunakan Web Audio API
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playKillSound() {
    initAudio();
    if (!audioCtx) return;

    try {
        const now = audioCtx.currentTime;
        
        const oscLaser = audioCtx.createOscillator();
        const gainLaser = audioCtx.createGain();
        oscLaser.connect(gainLaser);
        gainLaser.connect(audioCtx.destination);
        
        oscLaser.type = 'triangle';
        oscLaser.frequency.setValueAtTime(900, now);
        oscLaser.frequency.exponentialRampToValueAtTime(180, now + 0.15);
        
        gainLaser.gain.setValueAtTime(0.12, now);
        gainLaser.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        
        oscLaser.start(now);
        oscLaser.stop(now + 0.15);

        const oscBass = audioCtx.createOscillator();
        const gainBass = audioCtx.createGain();
        oscBass.connect(gainBass);
        gainBass.connect(audioCtx.destination);

        oscBass.type = 'sawtooth';
        oscBass.frequency.setValueAtTime(140, now);
        oscBass.frequency.linearRampToValueAtTime(30, now + 0.25);

        gainBass.gain.setValueAtTime(0.18, now);
        gainBass.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        oscBass.start(now);
        oscBass.stop(now + 0.25);
    } catch (e) {
        console.error("Gagal memutar audio:", e);
    }
}

// UI Admin Panel & Draggable Logic
const streamerUsernameInput = document.getElementById('streamerUsername');
const connectBtn = document.getElementById('connectBtn');
const statusDiv = document.getElementById('status');
const adminPanel = document.getElementById('admin-panel');
const adminHeader = document.getElementById('admin-header');

connectBtn.addEventListener('click', () => {
    initAudio(); 
    const username = streamerUsernameInput.value.replace('@', '').trim();
    if (username) {
        statusDiv.innerText = "Menghubungkan...";
        socket.emit('connectToStreamer', username);
    }
});

socket.on('connectionStatus', (data) => {
    statusDiv.innerText = data.message;
    statusDiv.style.color = data.success ? '#2ecc71' : '#e74c3c';
});

// Sistem Drag and Drop Panel Admin (PC & HP)
let isDragging = false;
let startX, startY;

const dragStart = (e) => {
    initAudio(); 
    isDragging = true;
    
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
    
    const rect = adminPanel.getBoundingClientRect();
    startX = clientX - rect.left;
    startY = clientY - rect.top;
};

const dragMove = (e) => {
    if (!isDragging) return;
    
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
    
    const containerRect = document.getElementById('game-container').getBoundingClientRect();
    
    let left = clientX - containerRect.left - startX;
    let top = clientY - containerRect.top - startY;
    
    const maxLeft = containerRect.width - adminPanel.offsetWidth;
    const maxTop = containerRect.height - adminPanel.offsetHeight;
    
    if (left < 0) left = 0;
    if (left > maxLeft) left = maxLeft;
    if (top < 0) top = 0;
    if (top > maxTop) top = maxTop;
    
    adminPanel.style.left = left + 'px';
    adminPanel.style.top = top + 'px';
};

const dragEnd = () => {
    isDragging = false;
};

adminHeader.addEventListener('mousedown', dragStart);
document.addEventListener('mousemove', dragMove);
document.addEventListener('mouseup', dragEnd);

adminHeader.addEventListener('touchstart', dragStart, { passive: true });
document.addEventListener('touchmove', dragMove, { passive: false });
document.addEventListener('touchend', dragEnd);

const defaultAvatar = new Image();
defaultAvatar.src = 'https://www.w3schools.com/howto/img_avatar.png';

// ==========================================
// CLASS PELURU (BULLET)
// ==========================================
class Bullet {
    constructor(startX, startY, target, team, damage, color) {
        this.x = startX;
        this.y = startY;
        this.team = team;
        this.damage = damage;
        this.color = color;
        this.radius = 4;
        this.active = true;

        const dx = target.x - startX;
        const dy = target.y - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        this.speed = 7;
        this.vx = (dx / distance) * this.speed;
        this.vy = (dy / distance) * this.speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        for (let other of avatars) {
            if (other.team !== this.team && other.hp > 0) {
                const dx = other.x - this.x;
                const dy = other.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < other.radius + this.radius) {
                    other.hp -= this.damage;
                    createParticles(other.x, other.y, this.color);
                    this.active = false; 

                    if (other.hp <= 0) {
                        userDeathTimes[other.username] = Date.now();
                        playKillSound(); 
                        
                        if (this.team === 'girl') {
                            killsGirl++;
                        } else {
                            killsBoy++;
                        }
                    }
                    break;
                }
            }
        }

        if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
            this.active = false;
        }
    }

    draw() {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
    }
}

// ==========================================
// CLASS AVATAR (RUSIA vs NATO)
// ==========================================
class Avatar {
    constructor(username, avatarUrl, team) {
        this.username = username;
        this.team = team;
        this.radius = 24;
        this.hp = 100;
        this.maxHp = 100;
        
        if (team === 'girl') {
            this.x = 50 + Math.random() * 50;
            this.color = '#3498db'; 
        } else {
            this.x = width - 50 - Math.random() * 50;
            this.color = '#e74c3c'; 
        }
        this.y = 150 + Math.random() * (height - 300);
        
        this.speed = 1.0 + Math.random() * 0.8;
        
        this.img = new Image();
        this.img.crossOrigin = "anonymous"; 
        this.img.src = avatarUrl || defaultAvatar.src;
        this.imgLoaded = false;
        this.img.onload = () => { this.imgLoaded = true; };
        this.img.onerror = () => { this.img.src = defaultAvatar.src; };

        this.target = null;
        this.lastAttack = 0;
        this.attackCooldown = 1200; 
    }

    update() {
        if (!this.target || this.target.hp <= 0) {
            this.target = this.findClosestOpponent();
        }

        if (this.target) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 180) {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
            } else {
                this.y += (Math.random() - 0.5) * this.speed;
            }

            if (distance < 450) {
                const now = Date.now();
                if (now - this.lastAttack > this.attackCooldown) {
                    this.attack(this.target);
                    this.lastAttack = now;
                }
            }
        } else {
            const targetX = this.team === 'girl' ? (width / 2) - 60 : (width / 2) + 60;
            const dx = targetX - this.x;
            if (Math.abs(dx) > 5) {
                this.x += Math.sign(dx) * 0.5;
            }
        }

        if (this.team === 'girl') {
            if (this.x < 30) this.x = 30;
            if (this.x > (width / 2) - 40) this.x = (width / 2) - 40; 
        } else {
            if (this.x > width - 30) this.x = width - 30;
            if (this.x < (width / 2) + 40) this.x = (width / 2) + 40; 
        }

        if (this.y < 130) this.y = 130; 
        if (this.y > height - 120) this.y = height - 120;
    }

    findClosestOpponent() {
        let closest = null;
        let minDist = Infinity;

        for (let other of avatars) {
            if (other.team !== this.team && other.hp > 0) {
                const dx = other.x - this.x;
                const dy = other.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closest = other;
                }
            }
        }
        return closest;
    }

    attack(target) {
        const damage = 8 + Math.floor(Math.random() * 8);
        bullets.push(new Bullet(this.x, this.y, target, this.team, damage, this.color));
    }

    draw() {
        ctx.save();
        
        const barWidth = 40;
        const barHeight = 4;
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, barWidth, barHeight);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, barWidth * (this.hp / this.maxHp), barHeight);

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius - 3, 0, Math.PI * 2);
        ctx.clip();

        if (this.imgLoaded) {
            ctx.drawImage(this.img, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        } else {
            ctx.fillStyle = '#fff';
            ctx.fill();
        }

        ctx.restore();

        ctx.font = 'bold 9px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(this.username, this.x, this.y + this.radius + 12);
    }
}

function createParticles(x, y, color) {
    for (let i = 0; i < 4; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            alpha: 1,
            color: color
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.05;
        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// Menangani permintaan spawn avatar dengan pengunci duplikasi mutlak
socket.on('spawnAvatar', (data) => {
    // 1. Cek apakah username sudah ada di list aktif
    if (activeUsernames.has(data.username)) {
        return; // Batalkan instan jika user ini sudah ada di game dan belum mati
    }

    const lastDeathTime = userDeathTimes[data.username] || 0;

    // 2. Batalkan jika chat dikirim sebelum waktu kematian terakhir
    if (data.timestamp < lastDeathTime) {
        return; 
    }

    // 3. Batalkan jika belum melewati batas cooldown 3 detik pasca-mati
    const now = Date.now();
    if (now - lastDeathTime < 3000) {
        return; 
    }

    if (avatars.length < 120) {
        avatars.push(new Avatar(data.username, data.avatarUrl, data.team));
        activeUsernames.add(data.username); // Masukkan ke daftar kunci aktif
    }
});

socket.on('specialAttack', (data) => {
    for (let i = 0; i < 3; i++) {
        const spawnName = data.username + `_SP${i+1}`;
        if (!activeUsernames.has(spawnName)) {
            const teamAssigned = Math.random() > 0.5 ? 'girl' : 'boy';
            avatars.push(new Avatar(spawnName, data.avatarUrl, teamAssigned));
            activeUsernames.add(spawnName);
        }
    }
});

let seconds = 0;
setInterval(() => {
    seconds++;
    let mins = Math.floor(seconds / 60);
    let secs = seconds % 60;
    roundTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}, 1000);

function gameLoop() {
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, width, height);

    // Background Bendera Rusia
    ctx.save();
    ctx.globalAlpha = 0.35; 
    const leftW = width / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, leftW, height / 3);
    ctx.fillStyle = '#0039a6';
    ctx.fillRect(0, height / 3, leftW, height / 3);
    ctx.fillStyle = '#d52b1e';
    ctx.fillRect(0, (2 * height) / 3, leftW, height / 3);
    ctx.restore();

    // Background Logo NATO
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#002451';
    ctx.fillRect(width / 2, 0, width / 2, height);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    const cx = (3 * width) / 4;
    const cy = height / 2;
    
    ctx.beginPath();
    ctx.arc(cx, cy, 65, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 90);
    ctx.quadraticCurveTo(cx + 15, cy - 15, cx + 90, cy);
    ctx.quadraticCurveTo(cx + 15, cy + 15, cx, cy + 90);
    ctx.quadraticCurveTo(cx - 15, cy + 15, cx - 90, cy);
    ctx.quadraticCurveTo(cx - 15, cy - 15, cx, cy - 90);
    ctx.fill();
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(cx, cy - 130); ctx.lineTo(cx, cy + 130);
    ctx.moveTo(cx - 130, cy); ctx.lineTo(cx + 130, cy);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    const vignette = ctx.createRadialGradient(width/2, height/2, 120, width/2, height/2, width);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // ==========================================
    // 5. GAMBAR TEMBOK ENERGI PENUH (0 s.d HEIGHT)
    // ==========================================
    ctx.save();
    const midX = width / 2;
    const barrierTop = 0;      // Diubah menjadi 0 (Full dari Atas)
    const barrierBottom = height; // Diubah menjadi height (Full sampai Bawah)
    const barrierHeight = barrierBottom - barrierTop;
    
    const energyGrad = ctx.createLinearGradient(midX - 15, barrierTop, midX + 15, barrierTop);
    energyGrad.addColorStop(0, 'rgba(52, 152, 219, 0)');
    energyGrad.addColorStop(0.3, 'rgba(52, 152, 219, 0.7)');
    energyGrad.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
    energyGrad.addColorStop(0.7, 'rgba(231, 76, 60, 0.7)');
    energyGrad.addColorStop(1, 'rgba(231, 76, 60, 0)');
    ctx.fillStyle = energyGrad;
    ctx.fillRect(midX - 15, barrierTop, 30, barrierHeight);
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#f1c40f';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(midX, barrierTop);
    ctx.lineTo(midX, barrierBottom);
    ctx.stroke();
    ctx.restore();

    bullets = bullets.filter(b => b.active);
    bullets.forEach(bullet => {
        bullet.update();
        bullet.draw();
    });

    // Menyaring avatar mati dan menghapus kunci nama mereka agar bisa bermain lagi
    avatars = avatars.filter(a => {
        if (a.hp <= 0) {
            activeUsernames.delete(a.username); // Bebaskan username jika kalah
            return false;
        }
        return true;
    });

    avatars.forEach(avatar => {
        avatar.update();
        avatar.draw();
    });

    updateParticles();
    drawParticles();

    // Papan Skor Atas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, width, 110); 

    ctx.fillStyle = '#f1c40f'; 
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CHAT 1', 20, 32);

    ctx.fillStyle = '#ffffff'; 
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('TEAM RUSIA', 20, 56);

    ctx.fillStyle = '#e74c3c'; 
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`${killsGirl} KILLS`, 20, 86);

    ctx.fillStyle = '#f1c40f'; 
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('CHAT 2', width - 20, 32);

    ctx.fillStyle = '#ffffff'; 
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('TEAM NATO', width - 20, 56);

    ctx.fillStyle = '#e74c3c'; 
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`${killsBoy} KILLS`, width - 20, 86);

    ctx.fillStyle = '#bdc3c7';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROUND TIME', width / 2, 40);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(roundTime, width / 2, 75);

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(width - 160, height - 180, 150, 160);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(width - 160, height - 180, 150, 160);

    ctx.fillStyle = '#fff';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    let startY = height - 160;
    const triggers = [
        "🎁 MISSILE",
        "🎁 LEISURE",
        "🎁 BULLET STORM",
        "🎁 TORNADO",
        "🎁 FIRE LOTUS",
        "🎁 DRAGON PALM",
        "🎁 ALL COMBO"
    ];
    triggers.forEach(trigger => {
        ctx.fillText(trigger, width - 150, startY);
        startY += 20;
    });

    requestAnimationFrame(gameLoop);
}

const toggleAdminBtn = document.getElementById('toggleAdminBtn');
const adminContent = document.getElementById('admin-content');

toggleAdminBtn.addEventListener('click', () => {
    initAudio(); 
    if (adminContent.style.display === 'none') {
        adminContent.style.display = 'block';
        toggleAdminBtn.innerText = 'Sembunyikan Panel';
        adminPanel.style.background = 'rgba(10, 10, 10, 0.95)';
    } else {
        adminContent.style.display = 'none';
        toggleAdminBtn.innerText = 'Tampilkan';
        adminPanel.style.background = 'rgba(10, 10, 10, 0.4)';
    }
});

gameLoop();

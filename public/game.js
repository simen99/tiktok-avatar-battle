const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

const width = canvas.width;
const height = canvas.height;

let killsGirl = 0;
let killsBoy = 0;
let roundTime = "00:00";

let avatars = []; 
let bullets = []; // Array untuk menampung semua peluru yang aktif
let particles = []; 
const userDeathTimes = {}; 

// UI Admin Panel
const streamerUsernameInput = document.getElementById('streamerUsername');
const connectBtn = document.getElementById('connectBtn');
const statusDiv = document.getElementById('status');

connectBtn.addEventListener('click', () => {
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

        // Hitung arah dan sudut tembakan menuju target
        const dx = target.x - startX;
        const dy = target.y - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        this.speed = 7; // Kecepatan terbang peluru
        this.vx = (dx / distance) * this.speed;
        this.vy = (dy / distance) * this.speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Periksa tabrakan dengan semua avatar musuh
        for (let other of avatars) {
            if (other.team !== this.team && other.hp > 0) {
                const dx = other.x - this.x;
                const dy = other.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Jika peluru mengenai radius tubuh musuh
                if (dist < other.radius + this.radius) {
                    other.hp -= this.damage;
                    createParticles(other.x, other.y, this.color);
                    this.active = false; // Hancurkan peluru

                    // Jika musuh mati akibat peluru ini
                    if (other.hp <= 0) {
                        userDeathTimes[other.username] = Date.now();
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

        // Hancurkan peluru jika keluar batas layar
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
        ctx.shadowBlur = 10; // Efek peluru bercahaya (glow)
        ctx.fill();
        ctx.restore();
    }
}

// ==========================================
// CLASS AVATAR (PEMAIN)
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
        this.attackCooldown = 1200; // Jeda waktu menembak (1.2 detik)
    }

    update() {
        if (!this.target || this.target.hp <= 0) {
            this.target = this.findClosestOpponent();
        }

        if (this.target) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Pergerakan taktis: Dekati jika terlalu jauh, tapi batasi agar tidak lewat tengah
            if (distance > 180) {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
            } else {
                // Menghindar menyamping sedikit atau bergerak ke atas/bawah untuk mencari celah tembak
                this.y += (Math.random() - 0.5) * this.speed;
            }

            // Menembakkan peluru jika cooldown selesai dan musuh berada dalam jangkauan pandang
            if (distance < 450) {
                const now = Date.now();
                if (now - this.lastAttack > this.attackCooldown) {
                    this.attack(this.target);
                    this.lastAttack = now;
                }
            }
        } else {
            // Jika tidak ada musuh, berbaris mendekati garis batas masing-masing
            const targetX = this.team === 'girl' ? (width / 2) - 60 : (width / 2) + 60;
            const dx = targetX - this.x;
            if (Math.abs(dx) > 5) {
                this.x += Math.sign(dx) * 0.5;
            }
        }

        // ==========================================
        // VALIDASI PEMBATAS GARIS TENGAH (Mencegah Lewat Batas)
        // ==========================================
        if (this.team === 'girl') {
            if (this.x < 30) this.x = 30;
            if (this.x > (width / 2) - 40) this.x = (width / 2) - 40; // Batas kiri tidak boleh lewati garis tengah
        } else {
            if (this.x > width - 30) this.x = width - 30;
            if (this.x < (width / 2) + 40) this.x = (width / 2) + 40; // Batas kanan tidak boleh lewati garis tengah
        }

        // Batasi gerakan vertikal arena
        if (this.y < 120) this.y = 120;
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
        // Meluncurkan objek Bullet baru, bukan mengurangi HP secara instan
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

// Menangani permintaan spawn avatar dengan validasi ketat
socket.on('spawnAvatar', (data) => {
    const isAlreadyAlive = avatars.some(a => a.username === data.username && a.hp > 0);
    if (isAlreadyAlive) {
        return; 
    }

    const lastDeathTime = userDeathTimes[data.username] || 0;

    if (data.timestamp < lastDeathTime) {
        return; 
    }

    const now = Date.now();
    if (now - lastDeathTime < 3000) {
        return; 
    }

    if (avatars.length < 120) {
        avatars.push(new Avatar(data.username, data.avatarUrl, data.team));
    }
});

socket.on('specialAttack', (data) => {
    for (let i = 0; i < 3; i++) {
        const teamAssigned = Math.random() > 0.5 ? 'girl' : 'boy';
        avatars.push(new Avatar(data.username + `_SP${i+1}`, data.avatarUrl, teamAssigned));
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
    // Latar Belakang Lapangan Hijau
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(0, 0, width, height);

    // Garis Batas Tengah
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(width / 2, 100);
    ctx.lineTo(width / 2, height - 100);
    ctx.stroke();
    ctx.setLineDash([]);

    // Update & Menggambar Peluru
    bullets = bullets.filter(b => b.active);
    bullets.forEach(bullet => {
        bullet.update();
        bullet.draw();
    });

    // Update & Menggambar Avatar
    avatars = avatars.filter(a => a.hp > 0);
    avatars.forEach(avatar => {
        avatar.update();
        avatar.draw();
    });

    updateParticles();
    drawParticles();

    // Gambar Header Hitam Overlay
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, width, 100);

    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CHAT 1 JOIN GIRL', 20, 30);

    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('CHAT 2 JOIN BOY', width - 20, 30);

    ctx.fillStyle = '#bdc3c7';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TEAM GIRL', 20, 50);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${killsGirl} KILLS`, 20, 75);

    ctx.fillStyle = '#bdc3c7';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('TEAM BOY', width - 20, 50);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${killsBoy} KILLS`, width - 20, 75);

    ctx.fillStyle = '#e67e22';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROUND TIME', width / 2, 35);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(roundTime, width / 2, 65);

    // Keterangan Daftar Triggers
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

// Logika Sembunyikan Panel
const toggleAdminBtn = document.getElementById('toggleAdminBtn');
const adminContent = document.getElementById('admin-content');
const adminPanel = document.getElementById('admin-panel');

toggleAdminBtn.addEventListener('click', () => {
    if (adminContent.style.display === 'none') {
        adminContent.style.display = 'block';
        toggleAdminBtn.innerText = 'Sembunyikan Panel';
        adminPanel.style.background = 'rgba(0, 0, 0, 0.9)';
    } else {
        adminContent.style.display = 'none';
        toggleAdminBtn.innerText = 'Tampilkan';
        adminPanel.style.background = 'rgba(0, 0, 0, 0.3)';
    }
});

gameLoop();

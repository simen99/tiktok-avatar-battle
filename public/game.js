const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

const width = canvas.width;
const height = canvas.height;

let killsGirl = 0;
let killsBoy = 0;
let roundTime = "00:00";

let avatars = []; 
let particles = []; 

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

// Gambar default jika foto profil TikTok gagal diunduh
const defaultAvatar = new Image();
defaultAvatar.src = 'https://www.w3schools.com/howto/img_avatar.png';

class Avatar {
    constructor(username, avatarUrl, team) {
        this.username = username;
        this.team = team;
        this.radius = 24;
        this.hp = 100;
        this.maxHp = 100;
        
        if (team === 'girl') {
            this.x = 50 + Math.random() * 50;
            this.color = '#3498db'; // Biru untuk Girl
        } else {
            this.x = width - 50 - Math.random() * 50;
            this.color = '#e74c3c'; // Merah untuk Boy
        }
        this.y = 150 + Math.random() * (height - 300);
        
        this.speed = 1.2 + Math.random() * 0.8;
        
        this.img = new Image();
        this.img.crossOrigin = "anonymous"; 
        this.img.src = avatarUrl || defaultAvatar.src;
        this.imgLoaded = false;
        this.img.onload = () => { this.imgLoaded = true; };
        this.img.onerror = () => { this.img.src = defaultAvatar.src; };

        this.target = null;
        this.lastAttack = 0;
        this.attackCooldown = 800; // ms
    }

    update() {
        if (!this.target || this.target.hp <= 0) {
            this.target = this.findClosestOpponent();
        }

        if (this.target) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Jika masih jauh, dekati musuh
            if (distance > 35) {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
            } else {
                // Jika sudah dekat, serang musuh
                const now = Date.now();
                if (now - this.lastAttack > this.attackCooldown) {
                    this.attack(this.target);
                    this.lastAttack = now;
                }
            }
        } else {
            // Bergerak perlahan ke arah garis tengah jika tidak ada musuh
            const targetX = this.team === 'girl' ? (width / 2) - 40 : (width / 2) + 40;
            const dx = targetX - this.x;
            if (Math.abs(dx) > 5) {
                this.x += Math.sign(dx) * 0.5;
            }
        }

        // Batasi gerakan agar tidak keluar batas vertikal canvas
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
        const damage = 8 + Math.floor(Math.random() * 8);
        target.hp -= damage;

        // Efek visual ketukan/hit
        createParticles(target.x, target.y, this.color);

        if (target.hp <= 0) {
            if (this.team === 'girl') {
                killsGirl++;
            } else {
                killsBoy++;
            }
        }
    }

    draw() {
        ctx.save();
        
        // Menggambar bar nyawa (HP)
        const barWidth = 40;
        const barHeight = 4;
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, barWidth, barHeight);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, barWidth * (this.hp / this.maxHp), barHeight);

        // Bingkai dan efek cahaya avatar
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Membuat bentuk lingkaran masker foto avatar
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

        // Nama pengguna di bawah lingkaran avatar
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

// Menerima event dari WebSocket server
socket.on('spawnAvatar', (data) => {
    // Membatasi tumpukan avatar agar browser tidak lambat
    if (avatars.length < 120) {
        avatars.push(new Avatar(data.username, data.avatarUrl, data.team));
    }
});

socket.on('specialAttack', (data) => {
    // Munculkan 3 avatar sekaligus jika penonton mengirim gift
    for (let i = 0; i < 3; i++) {
        const teamAssigned = Math.random() > 0.5 ? 'girl' : 'boy';
        avatars.push(new Avatar(data.username + `_SP${i+1}`, data.avatarUrl, teamAssigned));
    }
});

// Penghitung waktu perputaran
let seconds = 0;
setInterval(() => {
    seconds++;
    let mins = Math.floor(seconds / 60);
    let secs = seconds % 60;
    roundTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}, 1000);

// Utama Game Loop
function gameLoop() {
    // Latar Belakang Lapangan Hijau
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(0, 0, width, height);

    // Garis Batas Tengah
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(width / 2, 100);
    ctx.lineTo(width / 2, height - 100);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Memperbarui dan Menggambar Avatar
    avatars = avatars.filter(a => a.hp > 0);
    avatars.forEach(avatar => {
        avatar.update();
        avatar.draw();
    });

    updateParticles();
    drawParticles();

    // Gambar Header Hitam Overlay (Skor & Waktu)
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, width, 100);

    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CHAT G JOIN GIRL', 20, 30);

    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('CHAT B JOIN BOY', width - 20, 30);

    // Statistik Tim Kills
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

    // Desain Waktu Putaran Tengah
    ctx.fillStyle = '#e67e22';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROUND TIME', width / 2, 35);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(roundTime, width / 2, 65);

    // Keterangan Daftar Triggers di Kanan Bawah
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

gameLoop();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

let tiktokConnection = null;

// Menyimpan tim pengguna berdasarkan aktivitas chat terakhir {"username": "girl" / "boy"}
const userTeams = {}; 

function connectToTikTok(username) {
    if (tiktokConnection) {
        try {
            tiktokConnection.disconnect();
            console.log("Koneksi lama ditutup.");
        } catch (e) {
            console.error("Gagal menutup koneksi lama:", e);
        }
    }

    tiktokConnection = new WebcastPushConnection(username);

    tiktokConnection.connect()
        .then(state => {
            console.info(`Berhasil terhubung ke live room ID: ${state.roomId}`);
            io.emit('connectionStatus', { success: true, message: `Terhubung ke @${username}` });
        })
        .catch(err => {
            console.error('Gagal menghubungkan ke TikTok Live:', err);
            io.emit('connectionStatus', { success: false, message: `Gagal: ${err.message || err.toString()}` });
        });

    tiktokConnection.on('chat', (data) => {
        const comment = data.comment.trim();
        let team = null;

        if (comment === '1') {
            team = 'girl';
        } else if (comment === '2') {
            team = 'boy';
        }

        if (team) {
            // Simpan tim pengguna agar bisa dirujuk saat mereka mengirim gift
            userTeams[data.uniqueId] = team;

            io.emit('spawnAvatar', {
                team: team,
                username: data.uniqueId,
                avatarUrl: data.profilePictureUrl,
                timestamp: Date.now() 
            });
        }

        // Kirim aktivitas untuk memperbarui timer keaktifan avatar di game
        io.emit('userActivity', { username: data.uniqueId });
    });

    tiktokConnection.on('gift', (data) => {
        const giftName = data.giftName;
        const username = data.uniqueId;
        const avatarUrl = data.profilePictureUrl;
        
        // Cari tim pengguna. Jika belum pernah chat 1 atau 2, pilih tim secara acak
        const team = userTeams[username] || (Math.random() > 0.5 ? 'girl' : 'boy');

        let actionType = null;

        // Pemetaan nama gift TikTok ke aksi game. 
        if (giftName === 'Rose' || giftName === 'Mawar') {
            actionType = 'ROCKET';
        } else if (giftName === 'Toy' || giftName === 'Teddy Bear' || giftName === 'Boneka') {
            actionType = 'BIG_HEALTH';
        } else if (giftName === 'Finger Heart' || giftName === 'Missile' || giftName === 'Kembang Api') {
            actionType = 'MISSILE';
        } else if (giftName === 'Doughnut' || giftName === 'Donut') {
            actionType = 'KILL_ALL';
        }

        if (actionType) {
            // Kirim event khusus untuk gift terdaftar
            io.emit('specialGiftAction', {
                action: actionType,
                username: username,
                avatarUrl: avatarUrl,
                team: team
            });
        } else {
            // Event fallback default jika gift lain dikirim
            io.emit('specialAttack', {
                username: username,
                giftName: giftName,
                avatarUrl: avatarUrl
            });
        }

        // Kirim aktivitas untuk memperbarui timer keaktifan avatar di game
        io.emit('userActivity', { username: data.uniqueId });
    });

    // Tambahkan pelacakan "LIKE" dari penonton agar tetap dianggap aktif saat mengetuk layar
    tiktokConnection.on('like', (data) => {
        io.emit('userActivity', { username: data.uniqueId });
    });

    tiktokConnection.on('disconnected', () => {
        console.log('Koneksi TikTok terputus.');
        io.emit('connectionStatus', { success: false, message: 'Koneksi terputus dari TikTok' });
    });
}

io.on('connection', (socket) => {
    console.log(`Klien web terhubung: ${socket.id}`);

    socket.on('connectToStreamer', (username) => {
        console.log(`Meminta koneksi ke streamer: ${username}`);
        connectToTikTok(username);
    });

    socket.on('disconnect', () => {
        console.log(`Klien web terputus: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di port http://localhost:${PORT}`);
});

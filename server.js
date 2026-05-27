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

// Menyajikan folder 'public' secara statis ke browser
app.use(express.static('public'));

let tiktokConnection = null;

function connectToTikTok(username) {
    // Jika koneksi sebelumnya aktif, tutup terlebih dahulu
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
            io.emit('connectionStatus', { success: false, message: `Gagal menghubungkan: ${err.message || err.toString()}` });
        });

    // Menangani chat masuk
    tiktokConnection.on('chat', (data) => {
        const comment = data.comment.toLowerCase().trim();
        let team = null;

        // "g" atau "girl" untuk tim perempuan, "b" atau "boy" untuk tim laki-laki
        if (comment === '1' || comment.includes('girl')) {
            team = 'girl';
        } else if (comment === '2' || comment.includes('boy')) {
            team = 'boy';
        }

        if (team) {
            io.emit('spawnAvatar', {
                team: team,
                username: data.uniqueId,
                avatarUrl: data.profilePictureUrl
            });
        }
    });

    // Menangani gift masuk untuk serangan spesial
    tiktokConnection.on('gift', (data) => {
        io.emit('specialAttack', {
            username: data.uniqueId,
            giftName: data.giftName,
            avatarUrl: data.profilePictureUrl
        });
    });

    tiktokConnection.on('disconnected', () => {
        console.log('Koneksi TikTok terputus.');
        io.emit('connectionStatus', { success: false, message: 'Koneksi terputus dari TikTok' });
    });
}

// Koneksi WebSocket ke browser game
io.on('connection', (socket) => {
    console.log(`Klien web terhubung: ${socket.id}`);

    socket.on('connectToStreamer', (username) => {
        console.log(`Meminta koneksi ke akun TikTok: ${username}`);
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

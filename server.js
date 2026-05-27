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
            io.emit('spawnAvatar', {
                team: team,
                username: data.uniqueId,
                avatarUrl: data.profilePictureUrl,
                timestamp: Date.now() // Menambahkan timestamp waktu chat diterima server
            });
        }
    });

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

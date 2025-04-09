const cluster = require('cluster');
const os = require('os');
const process = require('process');

const CPUS = os.cpus();
const numCPUs = CPUS.length;

// Master process: quản lý các worker processes
if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);
    console.log(`Starting ${numCPUs} workers...`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Xử lý khi worker kết thúc
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        // Khởi động lại worker mới nếu một worker gặp sự cố
        cluster.fork();
    });

    // Xử lý khi master process kết thúc
    process.on('SIGTERM', () => {
        console.log('SIGTERM received, shutting down gracefully...');

        // Lần lượt tắt từng worker process
        for (const worker of Object.values(cluster.workers)) {
            worker.kill();
        }

        // Tắt master process sau khi đã tắt tất cả worker
        process.exit(0);
    });
} else {
    // Worker processes: chạy Express app
    console.log(`Worker ${process.pid} started`);
    require('./index');
}

// Log thông tin hệ thống để theo dõi hiệu suất
const logSystemInfo = () => {
    const totalMem = os.totalmem() / (1024 * 1024 * 1024); // GB
    const freeMem = os.freemem() / (1024 * 1024 * 1024); // GB
    const usedMem = totalMem - freeMem;
    const memUsagePercent = (usedMem / totalMem) * 100;

    console.log(`---------- System Info ----------`);
    console.log(`CPU: ${numCPUs} cores`);
    console.log(`Memory: ${usedMem.toFixed(2)}GB / ${totalMem.toFixed(2)}GB (${memUsagePercent.toFixed(2)}%)`);
    console.log(`Uptime: ${(os.uptime() / 3600).toFixed(2)} hours`);
    console.log(`Load Average: ${os.loadavg().map(load => load.toFixed(2))}`);
    console.log(`--------------------------------`);
};

// Ghi log thông tin hệ thống mỗi giờ nếu là primary process
if (cluster.isPrimary) {
    // Log ngay khi khởi động
    logSystemInfo();

    // Và sau đó cứ mỗi giờ
    setInterval(logSystemInfo, 60 * 60 * 1000);
} 
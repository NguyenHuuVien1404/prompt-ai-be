const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

// Tạo một worker mới cho tác vụ nặng
const createWorker = (taskFile, data) => {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, '..', 'workers', taskFile), {
            workerData: data
        });

        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
};

// Phân phối tác vụ cho worker
const runTask = async (taskFile, data) => {
    try {
        return await createWorker(taskFile, data);
    } catch (error) {
        console.error(`Error running worker task ${taskFile}:`, error);
        throw error;
    }
};

module.exports = {
    runTask
}; 
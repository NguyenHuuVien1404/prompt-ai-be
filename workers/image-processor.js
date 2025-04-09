const { parentPort, workerData } = require('worker_threads');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

async function processImages(filePaths, protocol, host) {
    try {
        const results = [];

        for (const filePath of filePaths) {
            const filename = path.basename(filePath);
            const ext = path.extname(filename);
            const name = path.basename(filename, ext);

            // Tạo tên file mới (thêm suffix _optimized)
            const optimizedFilename = `${name}_optimized${ext}`;
            const outputPath = path.join('uploads', optimizedFilename);

            // Đọc thông tin về file ảnh
            const metadata = await sharp(filePath).metadata();

            // Tối ưu hóa ảnh
            let sharpInstance = sharp(filePath);

            // Nếu ảnh quá lớn, resize xuống kích thước hợp lý
            if (metadata.width > 1920 || metadata.height > 1080) {
                sharpInstance = sharpInstance.resize({
                    width: Math.min(metadata.width, 1920),
                    height: Math.min(metadata.height, 1080),
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // Tùy chỉnh chất lượng dựa trên định dạng file
            if (ext.toLowerCase() === '.jpg' || ext.toLowerCase() === '.jpeg') {
                sharpInstance = sharpInstance.jpeg({ quality: 85 });
            } else if (ext.toLowerCase() === '.png') {
                sharpInstance = sharpInstance.png({ quality: 85 });
            } else if (ext.toLowerCase() === '.webp') {
                sharpInstance = sharpInstance.webp({ quality: 85 });
            }

            // Lưu file đã tối ưu hóa
            await sharpInstance.toFile(outputPath);

            // Tạo URL đầy đủ
            const imageUrl = `${protocol}://${host}/${outputPath}`;
            results.push(imageUrl);
        }

        parentPort.postMessage({
            success: true,
            imageUrls: results
        });
    } catch (error) {
        parentPort.postMessage({
            success: false,
            error: error.message
        });
    }
}

// Bắt đầu xử lý
processImages(
    workerData.filePaths,
    workerData.protocol,
    workerData.host
); 
-- Script SQL để tạo bảng feedbacks
-- Chạy script này trong MySQL/MariaDB để tạo bảng feedbacks

-- Kiểm tra và xóa bảng nếu đã tồn tại (uncomment nếu cần)
-- DROP TABLE IF EXISTS feedbacks;

CREATE TABLE IF NOT EXISTS feedbacks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    email VARCHAR(100) NOT NULL,
    full_name VARCHAR(100) NULL,
    phone VARCHAR(15) NOT NULL,
    feedback_name VARCHAR(100) NOT NULL COMMENT 'Tên người gửi feedback',
    message TEXT NULL,
    status INT NOT NULL DEFAULT 1 COMMENT '1 - Chưa xử lý, 2 - Đã xử lý',
    reply TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_feedback_user_id (user_id),
    INDEX idx_feedback_status (status),
    INDEX idx_feedback_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Bảng lưu trữ feedback từ người dùng';

-- Hiển thị kết quả
SELECT 'Table feedbacks created successfully!' AS message;


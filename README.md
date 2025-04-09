# Prompt AI - Tối Ưu Hóa Cho 10,000 Người Dùng

Dự án Prompt AI được tối ưu hóa để phục vụ 10,000 người dùng đồng thời với hiệu suất cao, khả năng mở rộng, và tính ổn định.

## Các Tính Năng Tối Ưu

- **Redis Cache**: Giảm tải cho database và tăng tốc độ response
- **Connection Pooling**: Quản lý kết nối database hiệu quả
- **Worker Threads**: Xử lý bất đồng bộ các tác vụ nặng
- **Rate Limiting**: Bảo vệ hệ thống khỏi quá tải
- **Clustering**: Tận dụng đa lõi CPU
- **Load Balancing**: Phân phối tải qua Nginx
- **Image Optimization**: Giảm kích thước ảnh và tăng tốc độ tải
- **Monitoring**: Theo dõi hiệu suất qua Prometheus và Grafana

## Yêu Cầu Hệ Thống

- Node.js v16+
- MySQL 8.0+
- Redis 6.0+
- Nginx
- Docker & Docker Compose (cho môi trường production)

## Cài Đặt và Chạy

### Môi Trường Development

```bash
# Clone repository
git clone https://github.com/yourusername/prompt-ai.git
cd prompt-ai

# Cài đặt dependencies
npm install

# Khởi tạo .env (sao chép từ .env.example)
cp .env.example .env

# Chỉnh sửa file .env để cấu hình database, Redis và các biến môi trường khác

# Khởi động server ở chế độ development
npm run dev

# Hoặc sử dụng script khởi động tự động
./start.sh dev
```

### Môi Trường Production

```bash
# Triển khai với Docker Compose
./start.sh prod
```

## Kiến Trúc Hệ Thống

```
Client -> Nginx (Load Balancer) -> Node.js Cluster -> Redis Cache -> MySQL
                                                   -> Worker Threads
```

## Redis Cache

Chúng tôi sử dụng Redis để cache dữ liệu phổ biến:

- Danh sách prompts, categories
- Chi tiết của prompts
- Kết quả thanh toán
- Rate limiting
- Session

## Tối Ưu Database

- Connection Pool (tối đa 20 connections)
- Query caching
- Indexes
- Phân trang

## Xử Lý Bất Đồng Bộ

- Worker threads cho xử lý ảnh
- Xử lý uploads file Excel/Word
- Thanh toán

## Rate Limiting

- API: 60 requests/phút
- Auth: 20 requests/phút
- Upload: 10 requests/phút
- Payment: 30 requests/phút

## Monitoring và Logging

- Prometheus: Thu thập metrics
- Grafana: Hiển thị dashboard
- Centralized Logging

## Scaling

### Vertical Scaling

- Tăng cấu hình server

### Horizontal Scaling

- Thêm Node.js instances
- Add thêm Redis replicas
- MySQL replication

## License

MIT

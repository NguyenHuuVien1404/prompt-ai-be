# Scripts để Fix Duplicate UserSubs

## Mô tả

Các script này được tạo để xử lý vấn đề users có nhiều hơn 1 UserSub active (status = 1) trên production.

## Scripts có sẵn

### 1. `duplicates.js` - Script tổng hợp (Khuyến nghị)

Script đơn giản và dễ sử dụng nhất để quản lý duplicate subscriptions.

```bash
# Hiển thị help
node scripts/duplicates.js

# Kiểm tra users có duplicate subscriptions
node scripts/duplicates.js check

# Fix user cụ thể
node scripts/duplicates.js fix-user 2012

# Dry run để xem sẽ fix gì
node scripts/duplicates.js dry-run
```

**Tính năng:**

- Interface đơn giản và dễ sử dụng
- Tích hợp tất cả chức năng cần thiết
- Error handling tốt
- Logging rõ ràng

### 2. `check-duplicate-usersubs.js` - Kiểm tra

Script để kiểm tra và hiển thị users có duplicate subscriptions mà không thay đổi gì.

```bash
node scripts/check-duplicate-usersubs.js
```

**Output:**

- Danh sách users có duplicate subscriptions
- Chi tiết từng subscription (ID, tên, type, token)
- Gợi ý subscription nào sẽ được giữ lại

### 2. `fix-usersubs-simple.js` - Fix đơn giản

Script để fix duplicate subscriptions một cách đơn giản và nhanh chóng.

```bash
node scripts/fix-usersubs-simple.js
```

**Logic:**

- Giữ lại subscription có ID cao nhất (mới nhất)
- Vô hiệu hóa các subscription cũ hơn (status = 0)
- Logging chi tiết quá trình fix

### 3. `fix-specific-user.js` - Fix user cụ thể

Script để fix duplicate subscriptions cho một user cụ thể.

```bash
node scripts/fix-specific-user.js 2012
```

**Tính năng:**

- Fix user cụ thể theo ID
- Hiển thị chi tiết subscriptions
- Confirmation trước khi thực hiện
- Transaction safety

### 4. `fix-all-usersubs.js` - Fix tất cả users

Script để fix tất cả users có duplicate subscriptions.

```bash
node scripts/fix-all-usersubs.js
```

**Tính năng:**

- Fix tất cả users cùng lúc
- Summary trước khi thực hiện
- Transaction safety cho từng user
- Verification sau khi fix
- Error handling

### 5. `fix-duplicate-usersubs.js` - Fix nâng cao

Script đầy đủ tính năng với nhiều tùy chọn.

```bash
# Dry run (không thay đổi gì, chỉ xem)
node scripts/fix-duplicate-usersubs.js --dry-run

# Fix tất cả users
node scripts/fix-duplicate-usersubs.js

# Fix user cụ thể
node scripts/fix-duplicate-usersubs.js --user-id=123

# Dry run cho user cụ thể
node scripts/fix-duplicate-usersubs.js --user-id=123 --dry-run
```

**Tính năng:**

- Dry run mode
- Fix user cụ thể
- Logging chi tiết với màu sắc
- Báo cáo JSON chi tiết
- Transaction safety
- Error handling

## Cách sử dụng trên Production

### Bước 1: Kiểm tra (Khuyến nghị sử dụng script tổng hợp)

```bash
node scripts/duplicates.js check
```

### Bước 2: Dry run để xem sẽ fix gì

```bash
node scripts/duplicates.js dry-run
```

### Bước 3: Thực hiện fix

**Option 1: Fix từng user một (an toàn nhất)**

```bash
node scripts/duplicates.js fix-user 2012
node scripts/duplicates.js fix-user 11
# ... tiếp tục với các user khác
```

**Option 2: Fix tất cả cùng lúc**

```bash
node scripts/fix-all-usersubs.js
```

**Option 3: Script đơn giản**

```bash
node scripts/fix-usersubs-simple.js
```

**Option 4: Script nâng cao**

```bash
node scripts/fix-duplicate-usersubs.js
```

## Logic Fix

### Quy tắc giữ lại subscription:

1. **Sắp xếp theo ID giảm dần** (ID cao nhất = mới nhất)
2. **Giữ lại subscription có ID cao nhất**
3. **Vô hiệu hóa các subscription cũ hơn** (status = 0)

### Ví dụ:

```
User 2012 có 2 subscriptions active:
- ID 1886 (Free, cũ hơn) → ❌ DEACTIVATE
- ID 1882 (Free, mới hơn) → ✅ KEEP
```

## Safety Features

### 1. Transaction Safety

- Tất cả thay đổi được wrap trong transaction
- Rollback nếu có lỗi

### 2. Dry Run Mode

- Kiểm tra trước khi thay đổi
- Không có rủi ro trên production

### 3. Detailed Logging

- Log mọi thay đổi
- Báo cáo chi tiết
- Lưu report vào file JSON

### 4. Error Handling

- Xử lý lỗi gracefully
- Không crash script
- Log lỗi chi tiết

## Output Files

### Logs được lưu trong:

- `logs/fix-duplicate-usersubs-{timestamp}.json`

### Nội dung log:

```json
{
  "executionTime": {
    "start": "2025-01-26T...",
    "end": "2025-01-26T...",
    "duration": "5 seconds"
  },
  "statistics": {
    "totalUsersChecked": 1000,
    "usersWithDuplicates": 5,
    "subscriptionsFixed": 5,
    "subscriptionsDeactivated": 8,
    "errors": 0
  },
  "results": [...],
  "isDryRun": false
}
```

## Troubleshooting

### Lỗi kết nối database:

```bash
# Kiểm tra .env file
cat .env | grep DB_

# Test kết nối
node -e "require('dotenv').config(); const sequelize = require('./config/database'); sequelize.authenticate().then(() => console.log('OK')).catch(console.error);"
```

### Lỗi import models:

```bash
# Kiểm tra models
node -e "const { User, UserSub, Subscription } = require('./models'); console.log('Models loaded successfully');"
```

## Monitoring

### Sau khi chạy script:

1. Kiểm tra logs trong `logs/` directory
2. Verify trong database:
   ```sql
   SELECT user_id, COUNT(*) as active_subs
   FROM UserSubs
   WHERE status = 1
   GROUP BY user_id
   HAVING COUNT(*) > 1;
   ```
3. Kiểm tra API response của users

## Rollback (nếu cần)

Nếu cần rollback, có thể kích hoạt lại subscriptions:

```sql
UPDATE UserSubs
SET status = 1
WHERE id IN (1886, 1887, 1888); -- IDs đã bị deactivate
```

**⚠️ Lưu ý:** Chỉ rollback nếu thực sự cần thiết và đã kiểm tra kỹ.

## Test Results

### Đã test thành công:

- ✅ **Script tổng hợp `duplicates.js`**: Hoạt động hoàn hảo với interface đơn giản
- ✅ **User 2012**: Fixed từ 2 subscriptions xuống 1
- ✅ **Scripts hoạt động với raw SQL queries**: Tránh được lỗi Sequelize ORM
- ✅ **Transaction safety**: Được đảm bảo trong tất cả scripts
- ✅ **Error handling**: Hoạt động tốt với logging chi tiết

### Current Status:

- 📊 **Found 18 users with duplicate subscriptions** (sau khi fix User 2012)
- 🎯 **Ready for production deployment**
- 🚀 **Script tổng hợp `duplicates.js` được khuyến nghị sử dụng**

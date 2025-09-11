const sequelize = require("../config/database");

async function runIndustriesMigration() {
  try {
    console.log(
      "Starting migration: Adding industries and category_industries tables..."
    );

    // Tạo bảng industries
    await sequelize.query(`
      CREATE TABLE industries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log("Table 'industries' created successfully!");

    // Tạo bảng category_industries
    await sequelize.query(`
      CREATE TABLE category_industries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        industry_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (industry_id) REFERENCES industries(id) ON UPDATE CASCADE ON DELETE CASCADE,
        
        UNIQUE KEY unique_category_industry (category_id, industry_id)
      )
    `);

    console.log("Table 'category_industries' created successfully!");

    // Thêm indexes để tối ưu performance
    await sequelize.query(`
      CREATE INDEX idx_category_industries_category_id ON category_industries(category_id)
    `);

    await sequelize.query(`
      CREATE INDEX idx_category_industries_industry_id ON category_industries(industry_id)
    `);

    await sequelize.query(`
      CREATE INDEX idx_industries_name ON industries(name)
    `);

    console.log("Indexes created successfully!");

    // Thêm một số dữ liệu mẫu cho industries
    await sequelize.query(`
      INSERT INTO industries (name, description) VALUES
      ('Technology', 'Technology and software development industry'),
      ('Healthcare', 'Healthcare and medical services industry'),
      ('Finance', 'Financial services and banking industry'),
      ('Education', 'Education and training industry'),
      ('E-commerce', 'Online retail and e-commerce industry'),
      ('Manufacturing', 'Manufacturing and production industry'),
      ('Marketing', 'Marketing and advertising industry'),
      ('Real Estate', 'Real estate and property industry'),
      ('Food & Beverage', 'Food and beverage industry'),
      ('Travel & Tourism', 'Travel and tourism industry')
    `);

    console.log("Sample industries data inserted successfully!");

    console.log("Migration completed successfully!");
    console.log(
      "Tables 'industries' and 'category_industries' have been created with proper relationships"
    );
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Chạy migration nếu file được gọi trực tiếp
if (require.main === module) {
  runIndustriesMigration()
    .then(() => {
      console.log("Industries migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Industries migration script failed:", error);
      process.exit(1);
    });
}

module.exports = runIndustriesMigration;

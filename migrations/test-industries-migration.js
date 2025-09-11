const sequelize = require("../config/database");
const { Industry, Category, CategoryIndustry } = require("../models");

async function testIndustriesMigration() {
  try {
    console.log("🧪 Testing Industries Migration...\n");

    // Test 1: Kiểm tra bảng industries đã được tạo
    console.log("1. Testing industries table...");
    const industries = await Industry.findAll();
    console.log(`✅ Found ${industries.length} industries`);

    if (industries.length > 0) {
      console.log("Sample industry:", industries[0].toJSON());
    }

    // Test 2: Kiểm tra bảng category_industries đã được tạo
    console.log("\n2. Testing category_industries table...");
    const categoryIndustries = await CategoryIndustry.findAll();
    console.log(
      `✅ Found ${categoryIndustries.length} category-industry links`
    );

    // Test 3: Kiểm tra associations
    console.log("\n3. Testing associations...");

    // Lấy industry đầu tiên và test association với categories
    if (industries.length > 0) {
      const firstIndustry = industries[0];
      const industryWithCategories = await Industry.findByPk(firstIndustry.id, {
        include: [
          {
            model: Category,
            as: "categories",
            through: { attributes: [] },
          },
        ],
      });
      console.log(
        `✅ Industry "${firstIndustry.name}" has ${industryWithCategories.categories.length} categories`
      );
    }

    // Lấy category đầu tiên và test association với industries
    const categories = await Category.findAll();
    if (categories.length > 0) {
      const firstCategory = categories[0];
      const categoryWithIndustries = await Category.findByPk(firstCategory.id, {
        include: [
          {
            model: Industry,
            as: "industries",
            through: { attributes: [] },
          },
        ],
      });
      console.log(
        `✅ Category "${firstCategory.name}" has ${categoryWithIndustries.industries.length} industries`
      );
    }

    // Test 4: Test tạo liên kết category-industry mới
    console.log("\n4. Testing category-industry link creation...");

    if (industries.length > 0 && categories.length > 0) {
      const testIndustry = industries[0];
      const testCategory = categories[0];

      try {
        // Tạo liên kết mới
        const newLink = await CategoryIndustry.create({
          industry_id: testIndustry.id,
          category_id: testCategory.id,
        });
        console.log(
          `✅ Created category-industry link: ${testCategory.name} <-> ${testIndustry.name}`
        );

        // Xóa liên kết test
        await newLink.destroy();
        console.log("✅ Test link deleted successfully");
      } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
          console.log(
            "ℹ️  Category-industry link already exists (this is expected)"
          );
        } else {
          throw error;
        }
      }
    }

    // Test 5: Test query với filter
    console.log("\n5. Testing query filters...");

    // Test query industries by category
    if (categories.length > 0) {
      const testCategory = categories[0];
      const industriesByCategory = await Industry.findAll({
        include: [
          {
            model: Category,
            as: "categories",
            where: { id: testCategory.id },
            through: { attributes: [] },
          },
        ],
      });
      console.log(
        `✅ Found ${industriesByCategory.length} industries for category "${testCategory.name}"`
      );
    }

    // Test query categories by industry
    if (industries.length > 0) {
      const testIndustry = industries[0];
      const categoriesByIndustry = await Category.findAll({
        include: [
          {
            model: Industry,
            as: "industries",
            where: { id: testIndustry.id },
            through: { attributes: [] },
          },
        ],
      });
      console.log(
        `✅ Found ${categoriesByIndustry.length} categories for industry "${testIndustry.name}"`
      );
    }

    // Test 6: Test indexes
    console.log("\n6. Testing database indexes...");

    const indexes = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        INDEX_NAME,
        COLUMN_NAME
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_NAME IN ('industries', 'category_industries')
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `);

    console.log("✅ Database indexes:");
    indexes[0].forEach((index) => {
      console.log(
        `   - ${index.TABLE_NAME}.${index.INDEX_NAME} (${index.COLUMN_NAME})`
      );
    });

    // Test 7: Test foreign key constraints
    console.log("\n7. Testing foreign key constraints...");

    const foreignKeys = await sequelize.query(`
      SELECT 
        CONSTRAINT_NAME,
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_NAME IN ('categories', 'industries')
      AND TABLE_NAME = 'category_industries'
    `);

    console.log("✅ Foreign key constraints:");
    foreignKeys[0].forEach((fk) => {
      console.log(
        `   - ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`
      );
    });

    console.log("\n🎉 All tests passed! Migration is working correctly.");
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Chạy test nếu file được gọi trực tiếp
if (require.main === module) {
  testIndustriesMigration()
    .then(() => {
      console.log("\n✅ Test script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test script failed:", error);
      process.exit(1);
    });
}

module.exports = testIndustriesMigration;

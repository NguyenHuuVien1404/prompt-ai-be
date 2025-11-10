const sequelize = require("../config/database");

const COLUMN_IS_ACTIVE = "is_active";
const COLUMN_DISPLAY_ORDER = "display_order";
const TABLE_NAME = "subscriptions";

const columnExists = async (columnName) => {
  const [results] = await sequelize.query(
    `SHOW COLUMNS FROM \`${TABLE_NAME}\` LIKE :columnName`,
    { replacements: { columnName } }
  );
  return results.length > 0;
};

const addColumnIfMissing = async () => {
  const hasIsActive = await columnExists(COLUMN_IS_ACTIVE);
  if (!hasIsActive) {
    await sequelize.query(
      `ALTER TABLE \`${TABLE_NAME}\` ADD COLUMN \`${COLUMN_IS_ACTIVE}\` TINYINT(1) NOT NULL DEFAULT 1 AFTER \`is_popular\``
    );
  }
  const hasDisplayOrder = await columnExists(COLUMN_DISPLAY_ORDER);
  if (!hasDisplayOrder) {
    await sequelize.query(
      `ALTER TABLE \`${TABLE_NAME}\` ADD COLUMN \`${COLUMN_DISPLAY_ORDER}\` INT NOT NULL DEFAULT 0 AFTER \`${COLUMN_IS_ACTIVE}\``
    );
  }
};

const backfillColumnValues = async () => {
  await sequelize.query(
    `UPDATE \`${TABLE_NAME}\` SET \`${COLUMN_IS_ACTIVE}\` = 1 WHERE \`${COLUMN_IS_ACTIVE}\` IS NULL`
  );
  await sequelize.query(
    `UPDATE \`${TABLE_NAME}\` SET \`${COLUMN_DISPLAY_ORDER}\` = 0 WHERE \`${COLUMN_DISPLAY_ORDER}\` IS NULL`
  );
};

const execute = async () => {
  try {
    console.log("Connecting to database...");
    await sequelize.authenticate();
    console.log("Database connected.");
    await addColumnIfMissing();
    await backfillColumnValues();
    console.log("Subscription columns ensured successfully.");
  } catch (error) {
    console.error("Failed to update subscription columns:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

execute();


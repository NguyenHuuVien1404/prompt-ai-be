const { Op } = require("sequelize");

const buildPromptWhereClause = (query) => {
  const where = {};

  if (query.categoryIds || query.categoryId || query.category_id) {
    const categoryIds =
      query.categoryIds || query.categoryId || query.category_id;
    const categoryArray = Array.isArray(categoryIds)
      ? categoryIds
      : [categoryIds];
    const validCategoryIds = categoryArray
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id) && id > 0);
    if (validCategoryIds.length > 0) {
      where.category_id =
        validCategoryIds.length === 1
          ? validCategoryIds[0]
          : { [Op.in]: validCategoryIds };
    }
  }

  if (query.isTypeIds || query.isType || query.is_type) {
    const isTypes = query.isTypeIds || query.isType || query.is_type;
    const isTypeArray = Array.isArray(isTypes) ? isTypes : [isTypes];
    const validIsTypes = isTypeArray
      .map((type) => parseInt(type))
      .filter((type) => !isNaN(type) && type > 0);
    if (validIsTypes.length > 0) {
      where.is_type =
        validIsTypes.length === 1 ? validIsTypes[0] : { [Op.in]: validIsTypes };
    }
  }

  if (
    (!!query.subType && Number(query.subType) !== 0) ||
    (!!query.sub_type && Number(query.sub_type) !== 0)
  ) {
    where.sub_type = query.subType || query.sub_type;
  }

  if (query.topicId !== undefined || query.topic_id !== undefined) {
    where.topic_id = query.topicId || query.topic_id;
  }

  if (query.dateFrom || query.dateTo) {
    where.created_at = {};
    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);
      if (!isNaN(dateFrom.getTime())) {
        dateFrom.setHours(0, 0, 0, 0);
        where.created_at[Op.gte] = dateFrom;
      }
    }
    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      if (!isNaN(dateTo.getTime())) {
        dateTo.setHours(23, 59, 59, 999);
        where.created_at[Op.lte] = dateTo;
      }
    }
  }

  const searchQuery =
    query.search || query.searchTerm || query.searchText || query.search_text;
  if (searchQuery) {
    const searchTerm = `%${searchQuery}%`;
    where[Op.or] = [
      { title: { [Op.like]: searchTerm } },
      { content: { [Op.like]: searchTerm } },
      { short_description: { [Op.like]: searchTerm } },
      { what: { [Op.like]: searchTerm } },
      { tips: { [Op.like]: searchTerm } },
      { text: { [Op.like]: searchTerm } },
      { how: { [Op.like]: searchTerm } },
      { optimizationGuide: { [Op.like]: searchTerm } },
    ];
  }

  return where;
};

const buildIndustryFilterIds = (query) => {
  if (query.industryIds || query.industryId || query.industry_id) {
    const industryIds =
      query.industryIds || query.industryId || query.industry_id;
    const industryArray = Array.isArray(industryIds)
      ? industryIds
      : [industryIds];
    const validIndustryIds = industryArray
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id) && id > 0);
    return validIndustryIds.length > 0 ? validIndustryIds : null;
  }
  return null;
};

const buildPromptIncludeArray = (industryFilterIds, models) => {
  const { Category, Section, Topic, Industry } = models;
  const includeArray = [
    {
      model: Category,
      attributes: ["id", "name", "image", "image_card", "section_id"],
      include: [{ model: Section, attributes: ["id", "name", "description"] }],
    },
    { model: Topic, as: "topic", attributes: ["id", "name"] },
    {
      model: Industry,
      as: "promptIndustries",
      attributes: ["id", "name", "description"],
      through: { attributes: [] },
    },
  ];

  if (industryFilterIds) {
    includeArray[2] = {
      model: Industry,
      as: "promptIndustries",
      where:
        industryFilterIds.length === 1
          ? { id: industryFilterIds[0] }
          : { id: { [Op.in]: industryFilterIds } },
      attributes: ["id", "name", "description"],
      through: { attributes: [] },
      required: true,
    };
  }

  return includeArray;
};

module.exports = {
  buildPromptWhereClause,
  buildIndustryFilterIds,
  buildPromptIncludeArray,
};

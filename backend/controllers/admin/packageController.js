// backend/controllers/admin/packageController.js
// V2025.V16.2 - 管理端終極穩定版：強化統計邏輯與資料標準化

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const { buildPackageWhereClause } = require("../../utils/adminHelpers.js");

const getAllPackages = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const { status, search, filter } = req.query;

    let where = buildPackageWhereClause(status, search);

    if (filter === "UNCLAIMED") {
      where.user = {
        email: { in: ["unclaimed@runpiggy.com", "admin@runpiggy.com"] },
      };
    } else if (filter === "CLAIM_REVIEW") {
      where.claimProof = { not: null };
    }

    // 執行資料庫事務
    const [total, packages, statusGroups] = await prisma.$transaction([
      prisma.package.count({ where }),
      prisma.package.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      }),
      // 統計使用最基本的 where 條件
      prisma.package.groupBy({
        by: ["status"],
        where: buildPackageWhereClause(undefined, search),
        _count: { status: true },
      }),
    ]);

    const statusCounts = { ALL: 0 };
    statusGroups.forEach((g) => {
      statusCounts[g.status] = g._count.status;
      statusCounts.ALL += g._count.status;
    });

    const processed = packages.map((pkg) => ({
      ...pkg,
      productImages: Array.isArray(pkg.productImages) ? pkg.productImages : [],
      warehouseImages: Array.isArray(pkg.warehouseImages)
        ? pkg.warehouseImages
        : [],
      arrivedBoxesJson: Array.isArray(pkg.arrivedBoxesJson)
        ? pkg.arrivedBoxesJson
        : [],
    }));

    res.status(200).json({
      success: true,
      packages: processed,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      statusCounts,
    });
  } catch (error) {
    console.error("Admin GetAllPackages Error:", error.message);
    res.status(500).json({ success: false, message: "讀取包裹清單失敗" });
  }
};

module.exports = { ...require("./packageController"), getAllPackages };

// backend/controllers/recipientController.js
// V2026.1.2 - 強化身分證字號校驗與系統審計版

const prisma = require("../config/db.js");
const createLog = require("../utils/createLog.js"); // 引入日誌工具

/**
 * @description 輔助函式：驗證台灣身分證字號格式
 * 規則：第一個字母為大寫英文 + 9位數字，且數字第一位必須是 1 或 2
 */
const validateIdNumber = (id) => {
  const idRegex = /^[A-Z][12]\d{8}$/;
  return idRegex.test(id);
};

/**
 * @description 取得我的所有常用收件人
 * @route GET /api/recipients
 */
const getMyRecipients = async (req, res) => {
  try {
    const userId = req.user.id;
    const recipients = await prisma.recipient.findMany({
      where: { userId: userId },
      orderBy: [
        { isDefault: "desc" }, // 預設的排在最前面
        { createdAt: "desc" },
      ],
    });

    res.status(200).json({ success: true, recipients });
  } catch (error) {
    console.error("取得常用收件人失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 新增常用收件人
 * @route POST /api/recipients
 */
const createRecipient = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, address, idNumber, isDefault } = req.body;

    // 1. 基礎完整性檢查
    if (!name || !phone || !address || !idNumber) {
      return res
        .status(400)
        .json({ success: false, message: "請填寫完整資訊" });
    }

    // 2. [優化新增] 身分證字號格式嚴格校驗
    if (!validateIdNumber(idNumber)) {
      return res.status(400).json({
        success: false,
        message: "身分證字號格式錯誤 (需大寫英文開頭，且第一位數字為1或2)",
      });
    }

    // 3. 如果設為預設，需先將其他收件人取消預設
    if (isDefault) {
      await prisma.recipient.updateMany({
        where: { userId: userId },
        data: { isDefault: false },
      });
    }

    const newRecipient = await prisma.recipient.create({
      data: {
        userId,
        name,
        phone,
        address,
        idNumber,
        isDefault: isDefault || false,
      },
    });

    // 紀錄操作日誌
    await createLog(
      userId,
      "CREATE_RECIPIENT",
      newRecipient.id,
      `會員新增常用收件人: ${name} (${phone})`
    );

    res.status(201).json({
      success: true,
      message: "新增成功",
      recipient: newRecipient,
    });
  } catch (error) {
    console.error("新增收件人失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 修改常用收件人
 * @route PUT /api/recipients/:id
 */
const updateRecipient = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, phone, address, idNumber, isDefault } = req.body;

    const recipient = await prisma.recipient.findFirst({
      where: { id, userId },
    });

    if (!recipient) {
      return res
        .status(404)
        .json({ success: false, message: "找不到此收件人" });
    }

    // 1. [優化新增] 若有修改身分證字號，執行格式校驗
    if (idNumber && !validateIdNumber(idNumber)) {
      return res.status(400).json({
        success: false,
        message: "身分證字號格式錯誤 (需大寫英文開頭，且第一位數字為1或2)",
      });
    }

    // 2. 如果設為預設，需先將其他收件人取消預設
    if (isDefault) {
      await prisma.recipient.updateMany({
        where: { userId: userId, id: { not: id } }, // 排除自己
        data: { isDefault: false },
      });
    }

    const updatedRecipient = await prisma.recipient.update({
      where: { id },
      data: {
        name,
        phone,
        address,
        idNumber,
        isDefault,
      },
    });

    // 紀錄操作日誌
    await createLog(
      userId,
      "UPDATE_RECIPIENT",
      id,
      `會員更新常用收件人: ${name}`
    );

    res.status(200).json({
      success: true,
      message: "更新成功",
      recipient: updatedRecipient,
    });
  } catch (error) {
    console.error("更新收件人失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 刪除常用收件人
 * @route DELETE /api/recipients/:id
 */
const deleteRecipient = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const recipient = await prisma.recipient.findFirst({
      where: { id, userId },
    });

    if (!recipient) {
      return res
        .status(404)
        .json({ success: false, message: "找不到此收件人" });
    }

    const recipientName = recipient.name; // 刪除前先保留姓名用於日誌
    await prisma.recipient.delete({ where: { id } });

    // 紀錄操作日誌
    await createLog(
      userId,
      "DELETE_RECIPIENT",
      id,
      `會員刪除常用收件人: ${recipientName}`
    );

    res.status(200).json({ success: true, message: "刪除成功" });
  } catch (error) {
    console.error("刪除收件人失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  getMyRecipients,
  createRecipient,
  updateRecipient,
  deleteRecipient,
};

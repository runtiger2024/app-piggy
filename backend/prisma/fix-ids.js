const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function fixPiggyIds() {
  console.log("開始修復舊會員編號...");

  // 找出所有沒有 piggyId 的會員，按註冊時間排序
  const users = await prisma.user.findMany({
    where: { piggyId: null },
    orderBy: { createdAt: "asc" },
  });

  console.log(`共發現 ${users.length} 位舊會員。`);

  let startNumber = 1; // 舊會員從 RP0000001 開始編號

  for (const user of users) {
    const newId = "RP" + String(startNumber).padStart(7, "0");
    await prisma.user.update({
      where: { id: user.id },
      data: { piggyId: newId },
    });
    console.log(`用戶 ${user.email} 已更新為 ${newId}`);
    startNumber++;
  }

  console.log("✅ 舊會員編號修復完成！");
  await prisma.$disconnect();
}

fixPiggyIds().catch((e) => {
  console.error(e);
  process.exit(1);
});

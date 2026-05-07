const prisma = require("../lib/prisma");

async function isOwner(req, res, next) {
  const qId = Number(req.params.qId);

  const question = await prisma.question.findUnique({
    where: { id: qId },
    include: {
      keywords: true,
      user: true,
      attempts: {
        where: { userId: req.user.userId }
      }
    }
  });

  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  if (question.userId !== req.user.userId) {
    return res.status(403).json({
      error: "You can only modify your own questions"
    });
  }

  req.question = question;
  next();
}

module.exports = isOwner;
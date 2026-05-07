const express = require("express");
const multer = require("multer");
const path = require("path");

const router = express.Router();
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const isOwner = require("../middleware/isOwner");

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "..", "public", "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

function parseKeywords(keywords) {
  if (Array.isArray(keywords)) return keywords;

  if (typeof keywords === "string") {
    return keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  return [];
}

function formatQuestion(question) {
  const solved =
    question.attempts?.some((attempt) => attempt.correct === true) ?? false;

  return {
    ...question,
    keywords: question.keywords?.map((k) => k.name) ?? [],
    userName: question.user?.name || null,
    solved,
    user: undefined,
    attempts: undefined
  };
}

// Apply authentication to all question routes
router.use(authenticate);

// GET /questions
// List questions with pagination and optional keyword search
router.get("/", async (req, res, next) => {
  try {
    const { keyword } = req.query;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 5));
    const skip = (page - 1) * limit;

    const where = keyword
      ? {
          keywords: {
            some: { name: keyword }
          }
        }
      : {};

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: {
          keywords: true,
          user: true,
          attempts: {
            where: { userId: req.user.userId }
          }
        },
        orderBy: { id: "asc" },
        skip,
        take: limit
      }),
      prisma.question.count({ where })
    ]);

    res.json({
      data: questions.map(formatQuestion),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
});

// GET /questions/:qId
// Show a specific question
router.get("/:qId", async (req, res, next) => {
  try {
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

    res.json(formatQuestion(question));
  } catch (err) {
    next(err);
  }
});

// POST /questions
// Create a new question
router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    const { question, answer, keywords } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        message: "question and answer are required"
      });
    }

    const keywordsArray = parseKeywords(keywords);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const newQuestion = await prisma.question.create({
      data: {
        question,
        answer,
        imageUrl,
        userId: req.user.userId,
        keywords: {
          connectOrCreate: keywordsArray.map((kw) => ({
            where: { name: kw },
            create: { name: kw }
          }))
        }
      },
      include: {
        keywords: true,
        user: true,
        attempts: {
          where: { userId: req.user.userId }
        }
      }
    });

    res.status(201).json(formatQuestion(newQuestion));
  } catch (err) {
    next(err);
  }
});

// POST /questions/:qId/play
// Submit an answer attempt
router.post("/:qId/play", async (req, res, next) => {
  try {
    const qId = Number(req.params.qId);
    const { answer } = req.body;

    if (!answer) {
      return res.status(400).json({ message: "answer is required" });
    }

    const question = await prisma.question.findUnique({
      where: { id: qId }
    });

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    const correct =
      answer.trim().toLowerCase() === question.answer.trim().toLowerCase();

    const attempt = await prisma.attempt.create({
      data: {
        questionId: qId,
        userId: req.user.userId,
        submittedAnswer: answer,
        correct
      }
    });

    res.status(201).json({
      id: attempt.id,
      correct: attempt.correct,
      submittedAnswer: attempt.submittedAnswer,
      correctAnswer: question.answer,
      createdAt: attempt.createdAt
    });
  } catch (err) {
    next(err);
  }
});

// PUT /questions/:qId
// Edit a question
router.put("/:qId", upload.single("image"), isOwner, async (req, res, next) => {
  try {
    const qId = Number(req.params.qId);
    const { question, answer, keywords } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        message: "question and answer are required"
      });
    }

    const keywordsArray = parseKeywords(keywords);

    const data = {
      question,
      answer,
      keywords: {
        set: [],
        connectOrCreate: keywordsArray.map((kw) => ({
          where: { name: kw },
          create: { name: kw }
        }))
      }
    };

    if (req.file) {
      data.imageUrl = `/uploads/${req.file.filename}`;
    }

    const updatedQuestion = await prisma.question.update({
      where: { id: qId },
      data,
      include: {
        keywords: true,
        user: true,
        attempts: {
          where: { userId: req.user.userId }
        }
      }
    });

    res.json(formatQuestion(updatedQuestion));
  } catch (err) {
    next(err);
  }
});

// DELETE /questions/:qId
// Delete a question
router.delete("/:qId", isOwner, async (req, res, next) => {
  try {
    const qId = Number(req.params.qId);

    await prisma.attempt.deleteMany({
      where: { questionId: qId }
    });

    await prisma.question.delete({
      where: { id: qId }
    });

    res.json({
      message: "Question deleted successfully",
      question: formatQuestion(req.question)
    });
  } catch (err) {
    next(err);
  }
});

// Multer errors as JSON
router.use((err, req, res, next) => {
  if (
    err instanceof multer.MulterError ||
    err?.message === "Only image files are allowed"
  ) {
    return res.status(400).json({ msg: err.message });
  }

  next(err);
});

module.exports = router;